import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { AuthJwtService, SessionMeta } from '../auth/jwt.service.js';
import { AuditLogService } from '../auth/audit-log.service.js';
import { PetugasLoginDto } from './dto/petugas-login.dto.js';
import { ChangePetugasPinDto } from './dto/change-pin.dto.js';

const MAX_FAILED_LOGINS = 5;

@Injectable()
export class PetugasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authJwtService: AuthJwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async login(dto: PetugasLoginDto, meta: SessionMeta) {
    const email = dto.email.trim().toLowerCase();

    let actor;
    try {
      actor = await this.authJwtService.verifyPetugasPin(email, dto.pin);
    } catch (error) {
      // Kalau error-nya sudah "terkunci", jangan diubah jadi "sisa percobaan".
      const isLocked = error instanceof UnauthorizedException && /terkunci/i.test(error.message);

      const failed = await this.authJwtService.registerFailedAttemptPetugas(email, meta.ipAddress);

      await this.auditLogService.log({
        actorEmail: email,
        actorRole: 'unknown',
        action: 'LOGIN_FAILED',
        entity: 'Petugas',
        detail: error instanceof UnauthorizedException ? error.message : 'Percobaan login gagal',
        ipAddress: meta.ipAddress ?? null,
        outcome: 'FAILURE',
      });

      if (isLocked) throw error;

      if (failed < MAX_FAILED_LOGINS) {
        throw new UnauthorizedException(
          `Email atau PIN salah. Percobaan tersisa sebelum akun dikunci: ${MAX_FAILED_LOGINS - failed}`,
        );
      }
      throw new UnauthorizedException(
        'Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam 15 menit.',
      );
    }

    await this.authJwtService.resetFailedAttemptsPetugas(actor.id);
    const tokens = await this.authJwtService.issueTokens(actor, meta);

    await this.auditLogService.log({
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'LOGIN',
      entity: 'Petugas',
      entityId: actor.id,
      detail: `Petugas ${actor.nama} login berhasil`,
      ipAddress: meta.ipAddress ?? null,
    });

    return {
      success: true,
      message: 'Login berhasil',
      petugas: {
        id: actor.id,
        nama: actor.nama,
        email: actor.email,
        role: actor.role,
        mustChangePin: actor.mustChangeSecret,
      },
      ...tokens,
    };
  }

  async refresh(refreshToken: string, meta: SessionMeta) {
    const { actor, ...tokens } = await this.authJwtService.rotateTokens(refreshToken, meta);
    return {
      success: true,
      petugas: {
        id: actor.id,
        nama: actor.nama,
        email: actor.email,
        role: actor.role,
        mustChangePin: actor.mustChangeSecret,
      },
      ...tokens,
    };
  }

  async logout(sid: string | undefined, meta: SessionMeta) {
    if (sid) {
      await this.authJwtService.revokeSession(sid);
      await this.auditLogService.log({
        actorEmail: meta.actorEmail ?? 'unknown',
        actorRole: meta.actorRole ?? 'unknown',
        action: 'LOGOUT',
        entity: 'Petugas',
        entityId: meta.actorId ?? null,
        ipAddress: meta.ipAddress ?? null,
      });
    }
    return { success: true, message: 'Logout berhasil' };
  }

  /**
   * Ganti PIN. Setelah berhasil:
   * - PIN lama tidak berlaku lagi
   * - SEMUA sesi dicabut (termasuk sesi ini), jadi pemilik akun wajib login ulang
   */
  async changePin(petugasId: number, dto: ChangePetugasPinDto, meta: SessionMeta) {
    if (dto.newPin !== dto.newPinConfirm) {
      throw new BadRequestException('Konfirmasi PIN tidak cocok');
    }
    if (dto.newPin === dto.currentPin) {
      throw new BadRequestException('PIN baru harus berbeda dari PIN lama');
    }

    const petugas = await this.prisma.petugas.findUnique({ where: { id: petugasId } });
    if (!petugas) {
      throw new UnauthorizedException('Petugas tidak ditemukan');
    }
    if (!this.authJwtService.verifySecret(dto.currentPin, petugas.pinHash)) {
      await this.auditLogService.log({
        actorEmail: petugas.email,
        actorRole: petugas.role,
        action: 'CHANGE_PIN_FAILED',
        entity: 'Petugas',
        entityId: petugas.id,
        detail: 'Percobaan ganti PIN dengan PIN lama yang salah',
        ipAddress: meta.ipAddress ?? null,
        outcome: 'FAILURE',
      });
      throw new UnauthorizedException('PIN lama salah');
    }

    await this.prisma.petugas.update({
      where: { id: petugasId },
      data: {
        pinHash: this.authJwtService.hashSecret(dto.newPin),
        mustChangePin: false,
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    await this.authJwtService.revokeAllPetugasSessions(petugasId);

    await this.auditLogService.log({
      actorEmail: petugas.email,
      actorRole: petugas.role,
      action: 'CHANGE_PIN',
      entity: 'Petugas',
      entityId: petugas.id,
      detail: 'PIN berhasil diganti, semua sesi dicabut',
      ipAddress: meta.ipAddress ?? null,
    });

    return {
      success: true,
      message: 'PIN berhasil diganti. Silakan login kembali dengan PIN baru.',
      mustRelogin: true,
    };
  }

  async getProfile(petugasId: number) {
    const petugas = await this.prisma.petugas.findUnique({
      where: { id: petugasId },
      select: {
        id: true,
        nama: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePin: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!petugas) {
      throw new UnauthorizedException('Petugas tidak ditemukan');
    }

    return petugas;
  }
}
