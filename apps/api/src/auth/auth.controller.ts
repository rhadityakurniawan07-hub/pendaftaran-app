import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './roles.decorator.js';
import { JwtPayload } from './jwt.service.js';

@Controller('api/auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('petugas', 'super_admin')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Endpoint ini hanya melaporkan status login, bukan data sensitif.
   * 401 di sini = belum login, 200 + authenticated:false = sesi sudah dicabut.
   * `mustChangeSecret: true` = akun masih pakai kredensial awal hasil seed.
   */
  @Get('me')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async me(@Req() req: any) {
    const user = req.user as JwtPayload;
    if (!user) return { authenticated: false };

    if (user.actorType === 'admin') {
      const admin = await this.prisma.admin.findUnique({
        where: { id: user.sub },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePwd: true,
        },
      });
      if (!admin?.isActive) return { authenticated: false };
      return {
        authenticated: true,
        actorType: 'admin',
        id: admin.id,
        nama: admin.username,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        mustChangeSecret: admin.mustChangePwd,
      };
    }

    const petugas = await this.prisma.petugas.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePin: true,
        lastLoginAt: true,
      },
    });
    if (!petugas?.isActive) return { authenticated: false };
    return {
      authenticated: true,
      actorType: 'petugas',
      id: petugas.id,
      nama: petugas.nama,
      email: petugas.email,
      role: petugas.role,
      mustChangeSecret: petugas.mustChangePin,
      lastLoginAt: petugas.lastLoginAt,
    };
  }
}
