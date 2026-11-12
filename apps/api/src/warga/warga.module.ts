import { Module } from '@nestjs/common';
import { WargaService } from './warga.service.js';
import { WargaController } from './warga.controller.js';
import { PrismaService } from '../prisma.service.js';
import { EmailModule } from '../email.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [EmailModule, AuthModule],
  controllers: [WargaController],
  providers: [WargaService, PrismaService],
})
export class WargaModule {}
