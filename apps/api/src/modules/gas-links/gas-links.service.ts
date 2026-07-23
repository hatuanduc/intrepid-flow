import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGasLinkDto } from './dto/create-gas-link.dto';
import { UpdateGasLinkDto } from './dto/update-gas-link.dto';

const withCreatedBy = {
  include: { createdBy: { select: { id: true, name: true, email: true } } },
} as const;

@Injectable()
export class GasLinksService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.gasLink.findMany({
      ...withCreatedBy,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(body: CreateGasLinkDto, createdById: number) {
    return this.prisma.gasLink.create({
      data: { ...body, createdById },
      ...withCreatedBy,
    });
  }

  async update(id: number, body: UpdateGasLinkDto) {
    await this.findOrThrow(id);
    return this.prisma.gasLink.update({
      where: { id },
      data: body,
      ...withCreatedBy,
    });
  }

  async delete(id: number) {
    await this.findOrThrow(id);
    await this.prisma.gasLink.delete({ where: { id } });
    return { ok: true };
  }

  private async findOrThrow(id: number) {
    const link = await this.prisma.gasLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('GAS_LINK_NOT_FOUND');
    return link;
  }
}
