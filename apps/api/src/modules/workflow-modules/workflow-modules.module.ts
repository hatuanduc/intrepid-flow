import { Module } from '@nestjs/common';
import { WorkflowModulesController } from './workflow-modules.controller';
import { WorkflowModulesService } from './workflow-modules.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [WorkflowModulesController],
  providers: [WorkflowModulesService],
})
export class WorkflowModulesModule {}
