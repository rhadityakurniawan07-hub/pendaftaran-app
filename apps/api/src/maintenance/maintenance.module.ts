import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MaintenanceService } from './maintenance.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
