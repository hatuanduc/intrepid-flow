import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SETTINGS_ID = 'default';

@Injectable()
export class SystemSettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings() {
    const s = await this.prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
    return {
      hasServiceKey: !!s?.googleServiceKeyJson,
      updatedAt: s?.updatedAt ?? null,
    };
  }

  async updateServiceAccount(serviceKeyJson: string | null) {
    const s = await this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, googleServiceKeyJson: serviceKeyJson },
      update: { googleServiceKeyJson: serviceKeyJson },
    });
    return {
      hasServiceKey: !!s.googleServiceKeyJson,
      updatedAt: s.updatedAt,
    };
  }

  async getServiceKeyJson(): Promise<string | null> {
    const s = await this.prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
    return s?.googleServiceKeyJson ?? null;
  }
}
