import { Body, Controller, Get, Put, Param, UseGuards } from '@nestjs/common';
import { WorkflowModulesService } from './workflow-modules.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('management')
@UseGuards(JwtAuthGuard)
export class WorkflowModulesController {
  constructor(private modules: WorkflowModulesService) {}

  @Get('modules')
  async getModules() {
    const items = await this.modules.listModules();
    return { items };
  }

  @Put('modules/:key')
  async putModule(@Param('key') key: string, @Body() body: any) {
    const { isEnabled } = body;
    const item = await this.modules.updateModule(key, { isEnabled });
    return { item };
  }
}
