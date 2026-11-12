import { Controller, Post, Body, HttpCode, HttpStatus, Get, Ip, Headers, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminService } from './admin.service.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { clearAuthCookies } from '../auth/clear-cookies.js';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: AdminLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.adminService.login(dto, { ipAddress: ip, userAgent });
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles('super_admin')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    return this.adminService.changePassword(
      req.user.sub,
      dto.currentPassword,
      dto.newPassword,
      dto.newPasswordConfirm,
      { ipAddress: ip, actorEmail: req.user?.email, actorRole: req.user?.role, actorId: req.user?.sub },
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async logout(@Req() req: any, @Ip() ip: string, @Res({ passthrough: true }) res: any) {
    const result = await this.adminService.logout(req.user?.sid, {
      ipAddress: ip,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      actorId: req.user?.sub,
    });
    clearAuthCookies(res);
    return result;
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'admin' };
  }
}
