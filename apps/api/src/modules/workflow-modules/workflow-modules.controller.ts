import { Body, Controller, Get, Put, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { WorkflowModulesService } from './workflow-modules.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { UpdateWorkflowModuleDto } from './dto/update-workflow-module.dto';
import { WorkflowModuleResponseDto } from './dto/workflow-module-response.dto';

@ApiTags('Workflow Modules')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WorkflowModulesController {
  constructor(private modules: WorkflowModulesService) {}

  @Get('modules')
  @HasPermission('modules:view')
  @ApiOperation({ summary: 'Danh sách workflow modules' })
  @ApiResponse({ status: 200, type: WorkflowModuleResponseDto, isArray: true })
  async getModules() {
    const items = await this.modules.listModules();
    return { items };
  }

  @Put('modules/:key')
  @HasPermission('modules:manage')
  @ApiOperation({ summary: 'Bật/tắt workflow module' })
  @ApiResponse({ status: 200, type: WorkflowModuleResponseDto })
  async putModule(@Param('key') key: string, @Body() body: UpdateWorkflowModuleDto) {
    const item = await this.modules.updateModule(key, body);
    return { item };
  }
}
