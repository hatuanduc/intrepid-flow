import { ConflictException, Injectable, Logger, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateArSettingsDto } from './dto/update-settings.dto';
import { CreateArGsheetConfigDto, UpdateArGsheetConfigDto } from './dto/upsert-gsheet-config.dto';

const SETTINGS_ID = 'default';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ArSummary = {
  totalAR: number;
  unbilled: number;
  underTerm: number;
  overdue: number;
};

export type ArBrandRow = {
  brand: string;
  totalLeadtime: number;
  unbilledDays: number;
  overdueDays: number;
  underTermDays: number;
};

export type ArDetailRow = {
  period: string;
  brand: string;
  bizClass: string;
  amount: number;
  status: string;
};

export type ArDataResponse = {
  summary: ArSummary;
  byBrand: ArBrandRow[];
  unbilledRows: ArDetailRow[];
  overdueRows: ArDetailRow[];
  bizClasses: string[];
};

// ─── Sheet parsing helpers ────────────────────────────────────────────────────

const STATUS_UNDER_TERM = 'Pending collection under credit term';
const STATUS_OVERDUE    = 'Pending collection over due';

const MONTHS_MAP: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4,
  May: 5, June: 6, July: 7, August: 8,
  September: 9, October: 10, November: 11, December: 12,
};

function isValidDateCell(val: string | undefined): boolean {
  if (!val) return false;
  const s = val.trim();
  return s !== '' && s !== '0' && s !== 'false' && s !== '#DIV/0!';
}

function parseAmount(val: string | undefined): number {
  if (!val || val === '#DIV/0!') return 0;
  const n = parseFloat(String(val).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parsePeriod(raw: string): { display: string; sortKey: number } {
  const parts = (raw ?? '').trim().split(' ');
  if (parts.length === 2) {
    // "Dec 2025" format (MMM YYYY)
    const monthFromFirst = MONTHS_MAP[parts[0]];
    const yearFromSecond = parseInt(parts[1]);
    if (monthFromFirst && !isNaN(yearFromSecond)) {
      return { display: raw.trim(), sortKey: yearFromSecond * 100 + monthFromFirst };
    }
  }
  return { display: raw ?? '', sortKey: 0 };
}

function processRows(rawRows: string[][], bizClassFilter?: string): ArDataResponse {
  const summary: ArSummary = { totalAR: 0, unbilled: 0, underTerm: 0, overdue: 0 };
  // brand → { unbilledDays, overdueDays, underTermDays }
  const brandMap = new Map<string, { unbilledDays: number; overdueDays: number; underTermDays: number }>();
  const unbilledRows: (ArDetailRow & { sortKey: number })[] = [];
  const overdueRows:  (ArDetailRow & { sortKey: number })[] = [];
  const bizClassSet = new Set<string>();

  for (const row of rawRows) {
    if (!row || row.length === 0) continue;

    // Column mapping for TH_Filter sheet (A=0, C=2, E=4, G=6, M=12, N=13, O=14, AA=26)
    const bizClass  = (row[2]  ?? '').trim();  // C: Type
    const periodRaw = (row[4]  ?? '').trim();  // E: Period Incurred
    const brand     = (row[6]  ?? '').trim();  // G: Brand_ONLY
    const status    = (row[26] ?? '').trim();  // AA: Group Status

    if (!brand) continue;
    if (bizClass) bizClassSet.add(bizClass);
    if (bizClassFilter && bizClass !== bizClassFilter) continue;

    const isIssued    = isValidDateCell(row[12]); // M: 6. Issued invoice date
    const isCollected = isValidDateCell(row[13]); // N: 7. Collected date

    if (isCollected) continue;

    const amount = parseAmount(row[14]); // O: Latest amount USD
    const { display: periodDisplay, sortKey: periodSort } = parsePeriod(periodRaw);

    // Summary
    summary.totalAR += amount;
    if (!isIssued) {
      summary.unbilled += amount;
    } else if (status === STATUS_UNDER_TERM) {
      summary.underTerm += amount;
    } else if (status === STATUS_OVERDUE) {
      summary.overdue += amount;
    }

    // By Brand leadtime per status group
    const leadtime = parseAmount(row[17]); // R: Total leadtime (days)
    if (!brandMap.has(brand)) brandMap.set(brand, { unbilledDays: 0, overdueDays: 0, underTermDays: 0 });
    const b = brandMap.get(brand)!;
    if (!isIssued)                          b.unbilledDays  += leadtime;
    else if (status === STATUS_OVERDUE)     b.overdueDays   += leadtime;
    else if (status === STATUS_UNDER_TERM)  b.underTermDays += leadtime;

    // Detail rows
    const detailRow = { period: periodDisplay, brand, bizClass, amount, status, sortKey: periodSort };
    if (!isIssued) {
      unbilledRows.push(detailRow);
    } else if (status === STATUS_OVERDUE) {
      overdueRows.push(detailRow);
    }
  }

  const byBrand: ArBrandRow[] = Array.from(brandMap.entries())
    .map(([brand, days]) => ({
      brand,
      totalLeadtime: days.unbilledDays + days.overdueDays + days.underTermDays,
      ...days,
    }))
    .sort((a, b) => b.totalLeadtime - a.totalLeadtime);

  const sortDetail = (a: { sortKey: number; brand: string }, b: { sortKey: number; brand: string }) =>
    b.sortKey !== a.sortKey ? b.sortKey - a.sortKey : a.brand.localeCompare(b.brand);

  unbilledRows.sort(sortDetail);
  overdueRows.sort(sortDetail);

  return {
    summary,
    byBrand,
    unbilledRows: unbilledRows.map(({ sortKey: _sk, ...r }) => r),
    overdueRows:  overdueRows.map(({ sortKey: _sk, ...r }) => r),
    bizClasses: Array.from(bizClassSet).sort(),
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportArService {
  private readonly logger = new Logger(ReportArService.name);

  constructor(private prisma: PrismaService) {}

  // ── Settings ──────────────────────────────────────────────────────────────

  async getSettings() {
    const s = await this.prisma.arReportSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!s) return { id: SETTINGS_ID, hasServiceKey: false, updatedAt: new Date() };
    return { id: s.id, hasServiceKey: !!s.googleServiceKeyJson, updatedAt: s.updatedAt };
  }

  async updateSettings(dto: UpdateArSettingsDto) {
    const s = await this.prisma.arReportSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, googleServiceKeyJson: dto.googleServiceKeyJson ?? null },
      update: { googleServiceKeyJson: dto.googleServiceKeyJson === undefined ? undefined : (dto.googleServiceKeyJson ?? null) },
    });
    return { id: s.id, hasServiceKey: !!s.googleServiceKeyJson, updatedAt: s.updatedAt };
  }

  // ── GSheet Configs ────────────────────────────────────────────────────────

  async listGsheets() {
    const configs = await this.prisma.arGsheetConfig.findMany({ orderBy: { countryCode: 'asc' } });
    return configs.map(c => ({
      id: c.id,
      countryCode: c.countryCode,
      spreadsheetId: c.spreadsheetId,
      sheetName: c.sheetName,
      spreadsheetUrl: c.spreadsheetUrl,
      isActive: c.isActive,
      updatedAt: c.updatedAt,
    }));
  }

  async createGsheet(dto: CreateArGsheetConfigDto) {
    const countryCode = dto.countryCode.trim().toUpperCase();
    const existing = await this.prisma.arGsheetConfig.findUnique({ where: { countryCode } });
    if (existing) throw new ConflictException('COUNTRY_CODE_EXISTS');

    const c = await this.prisma.arGsheetConfig.create({
      data: {
        countryCode,
        spreadsheetId: dto.spreadsheetId,
        sheetName: dto.sheetName,
        spreadsheetUrl: dto.spreadsheetUrl ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    return {
      id: c.id,
      countryCode: c.countryCode,
      spreadsheetId: c.spreadsheetId,
      sheetName: c.sheetName,
      spreadsheetUrl: c.spreadsheetUrl,
      isActive: c.isActive,
      updatedAt: c.updatedAt,
    };
  }

  async updateGsheet(id: number, dto: UpdateArGsheetConfigDto) {
    const existing = await this.prisma.arGsheetConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('GSHEET_CONFIG_NOT_FOUND');

    let countryCode = existing.countryCode;
    if (dto.countryCode) {
      countryCode = dto.countryCode.trim().toUpperCase();
      if (countryCode !== existing.countryCode) {
        const dup = await this.prisma.arGsheetConfig.findUnique({ where: { countryCode } });
        if (dup) throw new ConflictException('COUNTRY_CODE_EXISTS');
      }
    }

    const c = await this.prisma.arGsheetConfig.update({
      where: { id },
      data: {
        countryCode,
        spreadsheetId: dto.spreadsheetId,
        sheetName: dto.sheetName,
        spreadsheetUrl: dto.spreadsheetUrl ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    return {
      id: c.id,
      countryCode: c.countryCode,
      spreadsheetId: c.spreadsheetId,
      sheetName: c.sheetName,
      spreadsheetUrl: c.spreadsheetUrl,
      isActive: c.isActive,
      updatedAt: c.updatedAt,
    };
  }

  // ── Data Fetch ────────────────────────────────────────────────────────────

  async getData(country: string, bizClassFilter?: string): Promise<ArDataResponse> {
    const config = await this.prisma.arGsheetConfig.findUnique({ where: { countryCode: country } });
    if (!config || !config.isActive) {
      throw new NotFoundException('GSHEET_CONFIG_NOT_FOUND');
    }

    // Use global service account (SystemSettings) first, fall back to module-specific
    const [globalSettings, moduleSettings] = await Promise.all([
      this.prisma.systemSettings.findUnique({ where: { id: 'default' } }),
      this.prisma.arReportSettings.findUnique({ where: { id: SETTINGS_ID } }),
    ]);
    const serviceKeyJson = globalSettings?.googleServiceKeyJson ?? moduleSettings?.googleServiceKeyJson ?? null;
    if (!serviceKeyJson) {
      throw new NotFoundException('SERVICE_KEY_NOT_CONFIGURED');
    }

    let rawRows: string[][];
    try {
      // Dynamic import to avoid requiring googleapis at module load time
      const { google } = await import('googleapis');
      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(serviceKeyJson) as Record<string, unknown>,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const range = `${config.sheetName}!A10:AA`; // row 9 = headers, data from row 10
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range,
        valueRenderOption: 'FORMATTED_VALUE',
      });
      rawRows = (resp.data.values ?? []) as string[][];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sheets read failed [${country}]: ${msg}`);
      throw new InternalServerErrorException('SHEETS_READ_FAILED');
    }

    return processRows(rawRows, bizClassFilter);
  }
}
