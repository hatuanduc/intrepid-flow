import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { GasLinksService } from './gas-links.service';
import { CreateGasLinkDto } from './dto/create-gas-link.dto';
import { UpdateGasLinkDto } from './dto/update-gas-link.dto';

@ApiTags('GAS Links')
@ApiBearerAuth()
@Controller('management/gas-links')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class GasLinksController {
  constructor(private gasLinksService: GasLinksService) {}

  @Get()
  @HasPermission('gas_links:view')
  @ApiOperation({ summary: 'List GAS links' })
  async list() {
    const items = await this.gasLinksService.list();
    return { items };
  }

  @Post()
  @HasPermission('gas_links:create')
  @ApiOperation({ summary: 'Create GAS link' })
  async create(@Body() body: CreateGasLinkDto, @Req() req: any) {
    const item = await this.gasLinksService.create(body, req.authUser.id);
    return { item };
  }

  @Put(':id')
  @HasPermission('gas_links:edit')
  @ApiOperation({ summary: 'Update GAS link' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateGasLinkDto) {
    const item = await this.gasLinksService.update(id, body);
    return { item };
  }

  @Delete(':id')
  @HasPermission('gas_links:delete')
  @ApiOperation({ summary: 'Delete GAS link' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.gasLinksService.delete(id);
  }
}
