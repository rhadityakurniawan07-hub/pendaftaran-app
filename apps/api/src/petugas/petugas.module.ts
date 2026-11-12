import { Module } from '@nestjs/common';
import { PetugasController } from './petugas.controller.js';
import { PetugasService } from './petugas.service.js';
import { PrismaService } from '../prisma.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [PetugasController],
  providers: [PetugasService, PrismaService],
  exports: [PetugasService],
})
export class PetugasModule {}