import { Module } from '@nestjs/common';
import { WorkflowModulesController } from './workflow-modules.controller';
import { WorkflowModulesService } from './workflow-modules.service';

@Module({
  controllers: [WorkflowModulesController],
  providers: [WorkflowModulesService],
})
export class WorkflowModulesModule {}
