import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { AuthJwtService, SessionMeta } from '../auth/jwt.service.js';
import { AuditLogService } from '../auth/audit-log.service.js';
import { AdminLoginDto } from './dto/admin-login.dto.js';

const MAX_FAILED_LOGINS = 5;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authJwtService: AuthJwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async login(dto: AdminLoginDto, meta: SessionMeta) {
    const username = dto.username.trim();

    let actor;
    try {
      actor = await this.authJwtService.verifyAdminPassword(username, dto.password);
    } catch (error) {
      const isLocked = error instanceof UnauthorizedException && /terkunci/i.test(error.message);

      const failed = await this.authJwtService.registerFailedAttemptAdmin(username);

      await this.auditLogService.log({
        actorEmail: username,
        actorRole: 'unknown',
        action: 'LOGIN_FAILED',
        entity: 'Admin',
        detail: error instanceof Error ? error.message : 'Percobaan login admin gagal',
        ipAddress: meta.ipAddress ?? null,
        outcome: 'FAILURE',
      });

      if (isLocked) throw error;

      if (failed < MAX_FAILED_LOGINS) {
        throw new UnauthorizedException(
          `Username atau password salah. Percobaan tersisa sebelum akun dikunci: ${MAX_FAILED_LOGINS - failed}`,
        );
      }
      throw new UnauthorizedException(
        'Terlalu banyak percobaan gagal. Akun dikunci sementara, coba lagi dalam 15 menit.',
      );
    }

    await this.authJwtService.resetFailedAttemptsAdmin(actor.id);
    const tokens = await this.authJwtService.issueTokens(actor, meta);

    await this.auditLogService.log({
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'LOGIN',
      entity: 'Admin',
      entityId: actor.id,
      detail: `Admin ${username} login berhasil`,
      ipAddress: meta.ipAddress ?? null,
    });

    return {
      success: true,
      message: 'Login berhasil',
      admin: {
        id: actor.id,
        username: actor.nama,
        email: actor.email,
        role: actor.role,
        mustChangePassword: actor.mustChangeSecret,
      },
      ...tokens,
    };
  }

  async changePassword(
    adminId: number,
    currentPassword: string,
    newPassword: string,
    newPasswordConfirm: string,
    meta: SessionMeta,
  ) {
    if (newPassword !== newPasswordConfirm) {
      throw new BadRequestException('Konfirmasi password tidak cocok');
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException('Password baru harus berbeda dari password lama');
    }
    if (newPassword.length < 12) {
      throw new BadRequestException('Password baru minimal 12 karakter');
    }

    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new UnauthorizedException('Admin tidak ditemukan');
    }
    if (!this.authJwtService.verifySecret(currentPassword, admin.passwordHash)) {
      await this.auditLogService.log({
        actorEmail: admin.email,
        actorRole: admin.role,
        action: 'CHANGE_PASSWORD_FAILED',
        entity: 'Admin',
        entityId: admin.id,
        detail: 'Percobaan ganti password dengan password lama yang salah',
        ipAddress: meta.ipAddress ?? null,
        outcome: 'FAILURE',
      });
      throw new UnauthorizedException('Password lama salah');
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data: {
        passwordHash: this.authJwtService.hashSecret(newPassword),
        mustChangePwd: false,
        failedLogins: 0,
        lockedUntil: null,
      },
    });

    await this.authJwtService.revokeAllAdminSessions(adminId);

    await this.auditLogService.log({
      actorEmail: admin.email,
      actorRole: admin.role,
      action: 'CHANGE_PASSWORD',
      entity: 'Admin',
      entityId: admin.id,
      detail: 'Password berhasil diganti, semua sesi dicabut',
      ipAddress: meta.ipAddress ?? null,
    });

    return {
      success: true,
      message: 'Password berhasil diganti. Silakan login kembali dengan password baru.',
      mustRelogin: true,
    };
  }

  async logout(sid: string | undefined, meta: SessionMeta) {
    if (sid) {
      await this.authJwtService.revokeSession(sid);
      await this.auditLogService.log({
        actorEmail: meta.actorEmail ?? 'unknown',
        actorRole: meta.actorRole ?? 'unknown',
        action: 'LOGOUT',
        entity: 'Admin',
        entityId: meta.actorId ?? null,
        ipAddress: meta.ipAddress ?? null,
      });
    }
    return { success: true, message: 'Logout berhasil' };
  }
}
