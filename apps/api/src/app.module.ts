import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { BankStatementModule } from './modules/bank-statement/bank-statement.module';
import { ReportArModule } from './modules/report-ar/report-ar.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReconcileModule } from './modules/reconcile/reconcile.module';
import { GasLinksModule } from './modules/gas-links/gas-links.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule.forRoot(), CommonModule, AuthModule, UsersModule, RolesModule, PermissionsModule, BankStatementModule, ReportArModule, SystemSettingsModule, NotificationsModule, ReconcileModule, GasLinksModule],
  controllers: [HealthController],
})
export class AppModule {}
