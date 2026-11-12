import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { WargaModule } from './warga/warga.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { PetugasModule } from './petugas/petugas.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WargaModule,
    AdminModule,
    AuthModule,
    PetugasModule,
    MaintenanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
