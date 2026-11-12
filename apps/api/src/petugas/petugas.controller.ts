import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Req,
  Res,
  Ip,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PetugasService } from './petugas.service.js';
import { PetugasLoginDto } from './dto/petugas-login.dto.js';
import { ChangePetugasPinDto } from './dto/change-pin.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { clearAuthCookies } from '../auth/clear-cookies.js';

@Controller('api/petugas')
export class PetugasController {
  constructor(private readonly petugasService: PetugasService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async login(
    @Body() dto: PetugasLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.petugasService.login(dto, { ipAddress: ip, userAgent });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(@Req() req: any, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (!refreshToken) {
      throw new UnauthorizedException('Sesi tidak ditemukan. Silakan login kembali.');
    }
    return this.petugasService.refresh(refreshToken, { ipAddress: ip, userAgent });
  }

  @Post('change-pin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles('petugas', 'super_admin')
  async changePin(@Body() dto: ChangePetugasPinDto, @Req() req: any, @Ip() ip: string) {
    return this.petugasService.changePin(req.user.sub, dto, {
      ipAddress: ip,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      actorId: req.user?.sub,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, CsrfGuard)
  async logout(@Req() req: any, @Ip() ip: string, @Res({ passthrough: true }) res: any) {
    const result = await this.petugasService.logout(req.user?.sid, {
      ipAddress: ip,
      actorEmail: req.user?.email,
      actorRole: req.user?.role,
      actorId: req.user?.sub,
    });
    clearAuthCookies(res);
    return result;
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('petugas', 'super_admin')
  async getProfile(@Req() req: any) {
    return this.petugasService.getProfile(req.user.sub);
  }
}
