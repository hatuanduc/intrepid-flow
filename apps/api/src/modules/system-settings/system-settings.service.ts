import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobSchedulerService } from '../../common/job-scheduler.service';
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
    this.jobScheduler.sync('currency-rates', `0 9 ${day} * *`, true, async () => { await this.refreshCurrencyRates(); });
  }

  // ─── Google Service Account ───────────────────────────────────────────────────

  async getSettings() {
    const s = await this.prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
    return this._toSettingsDto(s);
  }

  async getServiceAccountStatus() {
    const { hasServiceKey, clientEmail } = await this.getSettings();
    return { hasServiceKey, clientEmail };
  }

  async updateServiceAccount(serviceKeyJson: string | null) {
    const s = await this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, googleServiceKeyJson: serviceKeyJson },
      update: { googleServiceKeyJson: serviceKeyJson },
    });
    return this._toSettingsDto(s);
  }

  private _toSettingsDto(s: { googleServiceKeyJson: string | null; updatedAt: Date } | null) {
    let clientEmail: string | null = null;
    if (s?.googleServiceKeyJson) {
      try {
        const parsed = JSON.parse(s.googleServiceKeyJson) as Record<string, unknown>;
        if (typeof parsed.client_email === 'string') clientEmail = parsed.client_email;
      } catch {}
    }
    return {
      hasServiceKey: !!s?.googleServiceKeyJson,
      updatedAt: s?.updatedAt ?? null,
      serviceKeyJson: s?.googleServiceKeyJson ?? null,
      clientEmail,
    };
  }

  async getServiceKeyJson(): Promise<string | null> {
    const s = await this.prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
    return s?.googleServiceKeyJson ?? null;
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
    const [bankAccounts, existingRates] = await Promise.all([
      this.prisma.bankAccount.findMany({ distinct: ['currency'], select: { currency: true } }),
      this.prisma.currencyRate.findMany({ select: { currency: true } }),
    ]);
    const currencies = [...new Set([
      ...bankAccounts.map(a => a.currency),
      ...existingRates.map(r => r.currency),
      'USD',
    ])];

    await Promise.all(currencies.map(c => this._fetchAndUpsertRate(c)));

    await this.prisma.currencySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, lastUpdatedAt: new Date() },
      update: { lastUpdatedAt: new Date() },
    });

    this.logger.log(`Currency rates refreshed: ${currencies.join(', ')}`);
    return this.getCurrencyData();
  }

  async addCurrencyRate(currency: string) {
    await this._fetchAndUpsertRate(currency.toUpperCase());
    return this.getCurrencyData();
  }

  async deleteCurrencyRate(currency: string) {
    await this.prisma.currencyRate.deleteMany({ where: { currency: currency.toUpperCase() } });
    return this.getCurrencyData();
  }

  async updateCurrencySettings(dto: UpdateCurrencySettingsDto) {
    const next = this._calcNextUpdateAt(dto.autoUpdateDay);
    const settings = await this.prisma.currencySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, autoUpdateDay: dto.autoUpdateDay, nextUpdateAt: next },
      update: { autoUpdateDay: dto.autoUpdateDay, nextUpdateAt: next },
    });
    this.jobScheduler.sync('currency-rates', `0 9 ${dto.autoUpdateDay} * *`, true, async () => { await this.refreshCurrencyRates(); });
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
