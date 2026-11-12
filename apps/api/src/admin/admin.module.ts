import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { PrismaService } from '../prisma.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, PrismaService],
})
export class AdminModule {}