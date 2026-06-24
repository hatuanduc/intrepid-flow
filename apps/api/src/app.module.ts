import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { WorkflowModulesModule } from './modules/workflow-modules/workflow-modules.module';
import { BankStatementModule } from './modules/bank-statement/bank-statement.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule.forRoot(), CommonModule, AuthModule, UsersModule, RolesModule, PermissionsModule, WorkflowModulesModule, BankStatementModule],
  controllers: [HealthController],
})
export class AppModule {}
