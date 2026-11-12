import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Put,
  ParseIntPipe,
  UseGuards,
  Req,
  Ip,
} from '@nestjs/common';
import { WargaService } from './warga.service.js';
import { CreateWargaDto } from './dto/create-warga.dto.js';
import { UpdateWargaDto } from './dto/update-warga.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { MustChangeSecretGuard } from '../auth/must-change-secret.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { JwtPayload } from '../auth/jwt.service.js';

@Controller('api/warga')
@UseGuards(JwtAuthGuard, RolesGuard, MustChangeSecretGuard, CsrfGuard)
@Roles('petugas', 'super_admin')
export class WargaController {
  constructor(private readonly wargaService: WargaService) {}

  @Post()
  create(@Body() dto: CreateWargaDto, @Req() req: any, @Ip() ip: string) {
    return this.wargaService.create(dto, req.user as JwtPayload, ip);
  }

  @Get()
  findAll() {
    return this.wargaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.wargaService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWargaDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    return this.wargaService.update(id, dto, req.user as JwtPayload, ip);
  }

  @Delete(':id')
  @Roles('petugas', 'super_admin')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any, @Ip() ip: string) {
    return this.wargaService.remove(id, req.user as JwtPayload, ip);
  }

  /// Hapus massal hanya untuk super_admin — petugas biasa tidak boleh menghapus seluruh database
  @Delete()
  @Roles('super_admin')
  removeAll(@Req() req: any, @Ip() ip: string) {
    return this.wargaService.removeAll(req.user as JwtPayload, ip);
  }
}