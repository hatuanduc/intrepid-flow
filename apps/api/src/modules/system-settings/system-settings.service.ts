import { Injectable, OnModuleInit, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobSchedulerService } from '../../common/job-scheduler.service';
import { CreateCountryDto, UpdateCountryDto } from './dto/country.dto';
import { UpdateCurrencySettingsDto } from './dto/currency.dto';

const SETTINGS_ID = 'default';

@Injectable()
export class SystemSettingsService implements OnModuleInit {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobScheduler: JobSchedulerService,
  ) {}

  async onModuleInit() {
    const settings = await this.prisma.currencySettings.findUnique({ where: { id: SETTINGS_ID } });
    const day = settings?.autoUpdateDay ?? 1;
    this.jobScheduler.sync('currency-rates', `0 9 ${day} * *`, true, () => this.refreshCurrencyRates());
  }

  // ─── Google Service Account ───────────────────────────────────────────────────

  async getSettings() {
    const s = await this.prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
    return { hasServiceKey: !!s?.googleServiceKeyJson, updatedAt: s?.updatedAt ?? null };
  }

  async updateServiceAccount(serviceKeyJson: string | null) {
    const s = await this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, googleServiceKeyJson: serviceKeyJson },
      update: { googleServiceKeyJson: serviceKeyJson },
    });
    return { hasServiceKey: !!s.googleServiceKeyJson, updatedAt: s.updatedAt };
  }

  async getServiceKeyJson(): Promise<string | null> {
    const s = await this.prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
    return s?.googleServiceKeyJson ?? null;
  }

  // ─── Countries ────────────────────────────────────────────────────────────────

  async listCountries() {
    return this.prisma.country.findMany({ orderBy: { code: 'asc' } });
  }

  async createCountry(dto: CreateCountryDto) {
    const code = dto.code.toUpperCase();
    const existing = await this.prisma.country.findUnique({ where: { code } });
    if (existing) throw new ConflictException('COUNTRY_EXISTS');
    const created = await this.prisma.country.create({
      data: { code, name: dto.name, currency: dto.currency.toUpperCase() },
    });
    // Auto-fetch rate for the new currency
    await this._fetchAndUpsertRate(created.currency);
    return created;
  }

  async updateCountry(code: string, dto: UpdateCountryDto) {
    const upper = code.toUpperCase();
    const existing = await this.prisma.country.findUnique({ where: { code: upper } });
    if (!existing) throw new NotFoundException('COUNTRY_NOT_FOUND');
    return this.prisma.country.update({
      where: { code: upper },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.currency !== undefined && { currency: dto.currency.toUpperCase() }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deleteCountry(code: string) {
    const upper = code.toUpperCase();
    const existing = await this.prisma.country.findUnique({ where: { code: upper } });
    if (!existing) throw new NotFoundException('COUNTRY_NOT_FOUND');
    await this.prisma.country.delete({ where: { code: upper } });
    return { ok: true };
  }

  // ─── Currency Rates ───────────────────────────────────────────────────────────

  async getCurrencyData() {
    const [rates, settings] = await Promise.all([
      this.prisma.currencyRate.findMany({ orderBy: { currency: 'asc' } }),
      this.prisma.currencySettings.findUnique({ where: { id: SETTINGS_ID } }),
    ]);
    return { rates, settings };
  }

  async refreshCurrencyRates() {
    const countries = await this.prisma.country.findMany({ where: { isActive: true } });
    const currencies = [...new Set(countries.map(c => c.currency))];

    await Promise.all(currencies.map(c => this._fetchAndUpsertRate(c)));

    await this.prisma.currencySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, lastUpdatedAt: new Date() },
      update: { lastUpdatedAt: new Date() },
    });

    this.logger.log(`Currency rates refreshed: ${currencies.join(', ')}`);
    return this.getCurrencyData();
  }

  async updateCurrencySettings(dto: UpdateCurrencySettingsDto) {
    const next = this._calcNextUpdateAt(dto.autoUpdateDay);
    const settings = await this.prisma.currencySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, autoUpdateDay: dto.autoUpdateDay, nextUpdateAt: next },
      update: { autoUpdateDay: dto.autoUpdateDay, nextUpdateAt: next },
    });
    this.jobScheduler.sync('currency-rates', `0 9 ${dto.autoUpdateDay} * *`, true, () => this.refreshCurrencyRates());
    return settings;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async _fetchAndUpsertRate(currency: string) {
    if (currency === 'USD') {
      await this.prisma.currencyRate.upsert({
        where: { currency: 'USD' },
        create: { currency: 'USD', rateToUsd: 1 },
        update: { rateToUsd: 1 },
      });
      return;
    }
    try {
      const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=USD`);
      if (!res.ok) { this.logger.warn(`Rate fetch failed for ${currency}: ${res.status}`); return; }
      const data = await res.json() as { rates: { USD: number } };
      const rate = data.rates?.USD;
      if (!rate) { this.logger.warn(`No USD rate in response for ${currency}`); return; }
      await this.prisma.currencyRate.upsert({
        where: { currency },
        create: { currency, rateToUsd: rate },
        update: { rateToUsd: rate },
      });
    } catch (err) {
      this.logger.error(`Error fetching rate for ${currency}: ${(err as Error).message}`);
    }
  }

  private _calcNextUpdateAt(day: number): Date {
    const now = new Date();
    let next = new Date(now.getFullYear(), now.getMonth(), day, 9, 0, 0, 0);
    if (next <= now) {
      next = new Date(now.getFullYear(), now.getMonth() + 1, day, 9, 0, 0, 0);
    }
    return next;
  }
}
