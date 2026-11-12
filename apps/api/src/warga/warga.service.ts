import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { CreateWargaDto } from './dto/create-warga.dto.js';
import { UpdateWargaDto } from './dto/update-warga.dto.js';
import { EmailService } from '../email.service.js';
import { AuditLogService } from '../auth/audit-log.service.js';
import { JwtPayload } from '../auth/jwt.service.js';

@Injectable()
export class WargaService {
  private readonly logger = new Logger(WargaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly auditLogService: AuditLogService,
  ) {
    console.log('[WargaService] connected to PostgreSQL via Prisma');
  }

  private audit(
    user: JwtPayload | undefined,
    action: string,
    entityId?: string | number,
    detail?: string,
    ipAddress?: string,
  ) {
    return this.auditLogService.log({
      actorEmail: user?.email ?? 'anonymous',
      actorRole: user?.role ?? 'unknown',
      action,
      entity: 'Warga',
      entityId: entityId ?? null,
      detail: detail ?? null,
      ipAddress: ipAddress ?? null,
    });
  }

  async findAll() {
    try {
      return await this.prisma.warga.findMany({ orderBy: { createdAt: 'desc' } });
    } catch (e: unknown) {
      this.logger.error(`Gagal memuat data warga: ${String(e)}`);
      const message = String(e instanceof Error ? e.message : e);
      if (message.includes('prisma://') || message.includes('P1001')) {
        throw new InternalServerErrorException(
          'Database belum siap. Jalankan `prisma db push` lalu `prisma generate`.',
        );
      }
      throw new InternalServerErrorException('Gagal memuat data warga dari database.');
    }
  }

  async create(dto: CreateWargaDto, user?: JwtPayload, ipAddress?: string) {
    const or: Array<{ nik?: string; nomorKk?: string }> = [{ nik: dto.nik }];
    if (dto.nomorKk) or.push({ nomorKk: dto.nomorKk });
    const existing = await this.prisma.warga.findFirst({ where: { OR: or } });
    if (existing) {
      throw new ConflictException('NIK atau Nomor KK sudah terdaftar');
    }

    // registeredBy SELALU berasal dari JWT, tidak pernah dipercaya dari body request,
    // supaya jejak audit tidak bisa dipalsukan oleh client.
    const { registeredBy: _ignoredRegisteredBy, ...rest } = dto;

    const warga = await this.prisma.warga.create({
      data: {
        ...rest,
        nomorKk: dto.nomorKk ?? null,
        nomorHp: dto.nomorHp ?? null,
        registeredBy: user?.nama ?? null,
      },
    });

    await this.emailService
      .sendNewRegistrationNotification({
        nama: warga.nama,
        nik: warga.nik,
        email: warga.email ?? undefined,
        telepon: warga.nomorHp ?? undefined,
        alamat: warga.alamat ?? undefined,
        registeredAt: warga.createdAt,
        registeredBy: warga.registeredBy ?? undefined,
      })
      .catch((err: unknown) => {
        console.warn('[WargaService] notifikasi email gagal dikirim:', err);
      });

    await this.audit(user, 'CREATE', warga.id, `Tambah warga: ${warga.nama} (NIK ${warga.nik})`, ipAddress);

    return warga;
  }

  async findOne(id: number) {
    const warga = await this.prisma.warga.findUnique({ where: { id } });
    if (!warga) {
      throw new NotFoundException(`Warga dengan ID ${id} tidak ditemukan`);
    }
    return warga;
  }

  async update(id: number, dto: UpdateWargaDto, user?: JwtPayload, ipAddress?: string) {
    if (dto.nik || dto.nomorKk) {
      const or: Array<{ nik?: string; nomorKk?: string }> = [];
      if (dto.nik) or.push({ nik: dto.nik });
      if (dto.nomorKk) or.push({ nomorKk: dto.nomorKk });
      const conflict = await this.prisma.warga.findFirst({
        where: { id: { not: id }, OR: or },
      });
      if (conflict) {
        throw new ConflictException('NIK atau Nomor KK sudah terdaftar');
      }
    }

    // Cegah client menimpa registeredBy saat update
    const { registeredBy: _ignored, ...safeDto } = dto;

    try {
      const updated = await this.prisma.warga.update({ where: { id }, data: safeDto });
      await this.audit(
        user,
        'UPDATE',
        id,
        `Update warga: ${updated.nama} (NIK ${updated.nik}) — field: ${Object.keys(dto).join(', ')}`,
        ipAddress,
      );
      return updated;
    } catch (e: any) {
      if (e?.code === 'P2025') {
        throw new NotFoundException(`Warga dengan ID ${id} tidak ditemukan`);
      }
      if (e?.code === 'P2002') {
        throw new ConflictException('NIK atau Nomor KK sudah terdaftar');
      }
      throw e;
    }
  }

  async remove(id: number, user?: JwtPayload, ipAddress?: string) {
    try {
      const existing = await this.prisma.warga.findUnique({
        where: { id },
        select: { nama: true, nik: true },
      });
      await this.prisma.warga.delete({ where: { id } });
      await this.audit(
        user,
        'DELETE',
        id,
        `Hapus warga: ${existing?.nama ?? id} (NIK ${existing?.nik ?? '-'})`,
        ipAddress,
      );
      return { message: `Warga dengan ID ${id} berhasil dihapus` };
    } catch (e: any) {
      if (e?.code === 'P2025') {
        throw new NotFoundException(`Warga dengan ID ${id} tidak ditemukan`);
      }
      throw e;
    }
  }

  async removeAll(user?: JwtPayload, ipAddress?: string) {
    const count = await this.prisma.warga.deleteMany();
    await this.audit(user, 'DELETE_ALL', undefined, `Hapus semua data warga (${count.count} data)`, ipAddress);
    return {
      message: `${count.count} data warga berhasil dihapus`,
      deletedCount: count.count,
    };
  }
}
