import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service.js';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LEN = 64;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export function hashSecret(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plain, salt, KEY_LEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  const [salt, derived] = stored.split(':');
  if (!salt || !derived) return false;
  const expected = Buffer.from(derived, 'hex');
  const actual = scryptSync(plain, salt, KEY_LEN);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Hash cepat (SHA-256) untuk token acak — aman karena tokennya entropy tinggi. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface JwtPayload {
  sub: number;
  sid: string;
  actorType: 'petugas' | 'admin';
  email: string;
  role: string;
  nama: string;
}

export interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
  actorEmail?: string;
  actorRole?: string;
  actorId?: number;
}

export interface Actor {
  id: number;
  nama: string;
  email: string;
  role: string;
  actorType: 'petugas' | 'admin';
  mustChangeSecret: boolean;
}

@Injectable()
export class AuthJwtService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get accessTtlMs(): number {
    return 15 * 60 * 1000;
  }

  private get refreshTtlMs(): number {
    const days = Number(this.config.get('JWT_REFRESH_TTL_DAYS') ?? 7);
    return days * 24 * 60 * 60 * 1000;
  }

  assertNotLocked(lockedUntil: Date | null, email: string): void {
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedException(
        `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit. (${email})`,
      );
    }
  }

  async registerFailedAttemptPetugas(email: string, _ip?: string): Promise<number> {
    const account = await this.prisma.petugas.findUnique({ where: { email } });
    if (!account) return 0;
    const failed = account.failedLogins + 1;
    const shouldLock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.petugas.update({
      where: { id: account.id },
      data: {
        failedLogins: failed,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    return failed;
  }

  async registerFailedAttemptAdmin(username: string): Promise<number> {
    const account = await this.prisma.admin.findUnique({ where: { username } });
    if (!account) return 0;
    const failed = account.failedLogins + 1;
    const shouldLock = failed >= MAX_FAILED_LOGINS;
    await this.prisma.admin.update({
      where: { id: account.id },
      data: {
        failedLogins: failed,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null,
      },
    });
    return failed;
  }

  /** Verifikasi PIN petugas. Tidak mengubah state lain — pemanggil yang mengatur lockout. */
  async verifyPetugasPin(email: string, pin: string): Promise<Actor> {
    const petugas = await this.prisma.petugas.findUnique({ where: { email } });
    if (!petugas) {
      // Tetap jalankan hashing agar waktu respons tidak membocorkan keberadaan akun
      verifySecret(pin, hashSecret('dummy-placeholder-value'));
      throw new UnauthorizedException('Email atau PIN salah');
    }
    if (!petugas.isActive) {
      throw new UnauthorizedException('Akun petugas dinonaktifkan. Hubungi administrator.');
    }
    this.assertNotLocked(petugas.lockedUntil, email);
    if (!verifySecret(pin, petugas.pinHash)) {
      throw new UnauthorizedException('Email atau PIN salah');
    }
    return {
      id: petugas.id,
      nama: petugas.nama,
      email: petugas.email,
      role: petugas.role,
      actorType: 'petugas',
      mustChangeSecret: petugas.mustChangePin,
    };
  }

  async verifyAdminPassword(username: string, password: string): Promise<Actor> {
    const admin = await this.prisma.admin.findUnique({ where: { username } });
    if (!admin) {
      verifySecret(password, hashSecret('dummy-placeholder-value'));
      throw new UnauthorizedException('Username atau password salah');
    }
    if (!admin.isActive) {
      throw new UnauthorizedException('Akun admin dinonaktifkan.');
    }
    this.assertNotLocked(admin.lockedUntil, username);
    if (!verifySecret(password, admin.passwordHash)) {
      throw new UnauthorizedException('Username atau password salah');
    }
    return {
      id: admin.id,
      nama: admin.username,
      email: admin.email,
      role: admin.role,
      actorType: 'admin',
      mustChangeSecret: admin.mustChangePwd,
    };
  }

  async resetFailedAttemptsPetugas(id: number): Promise<void> {
    await this.prisma.petugas.update({
      where: { id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  async resetFailedAttemptsAdmin(id: number): Promise<void> {
    await this.prisma.admin.update({
      where: { id },
      data: { failedLogins: 0, lockedUntil: null },
    });
  }

  /** Buat sesi baru + pasangan token untuk actor yang sudah terverifikasi. */
  async issueTokens(actor: Actor, meta: SessionMeta = {}) {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        refreshTokenHash: hashToken(refreshToken),
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        ...(actor.actorType === 'petugas'
          ? { petugasId: actor.id }
          : { adminId: actor.id }),
      },
    });

    const payload: JwtPayload = {
      sub: actor.id,
      sid: session.id,
      actorType: actor.actorType,
      email: actor.email,
      role: actor.role,
      nama: actor.nama,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: Math.floor(this.accessTtlMs / 1000),
    });

    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
      accessTokenMaxAge: this.accessTtlMs,
      refreshTokenMaxAge: this.refreshTtlMs,
    };
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwt.verify(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Sesi Anda telah berakhir. Silakan login kembali.');
      }
      throw new UnauthorizedException('Token tidak valid');
    }
  }

  /** Tukar refresh token dengan pasangan token baru (rotasi) dan cabut sesi lama. */
  async rotateTokens(refreshToken: string, meta: SessionMeta = {}) {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
      include: { petugas: true, admin: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      // Sesi tidak dikenal / kedaluwarsa: cabut semua sesi untuk keamanan (reuse detection)
      if (session?.petugasId) {
        await this.revokeAllPetugasSessions(session.petugasId);
      }
      throw new UnauthorizedException('Sesi tidak valid atau telah berakhir. Silakan login kembali.');
    }

    const isPetugas = Boolean(session.petugasId);
    const account = isPetugas ? session.petugas : session.admin;

    if (!account || !account.isActive) {
      throw new UnauthorizedException('Akun tidak aktif.');
    }

    const actor: Actor = isPetugas
      ? {
          id: (session.petugas as { id: number }).id,
          nama: (session.petugas as { nama: string }).nama,
          email: (session.petugas as { email: string }).email,
          role: (session.petugas as { role: string }).role,
          actorType: 'petugas',
          mustChangeSecret: (session.petugas as { mustChangePin: boolean }).mustChangePin,
        }
      : {
          id: (session.admin as { id: number }).id,
          nama: (session.admin as { username: string }).username,
          email: (session.admin as { email: string }).email,
          role: (session.admin as { role: string }).role,
          actorType: 'admin',
          mustChangeSecret: (session.admin as { mustChangePwd: boolean }).mustChangePwd,
        };

    // Cabut sesi lama sebelum menerbitkan yang baru
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const issued = await this.issueTokens(actor, {
      ipAddress: meta.ipAddress ?? session.ipAddress ?? undefined,
      userAgent: meta.userAgent ?? session.userAgent ?? undefined,
    });

    await this.prisma.session.update({
      where: { id: issued.sessionId },
      data: { lastUsedAt: new Date() },
    });

    return { ...issued, actor };
  }

  /** Pastikan sesi masih hidup di DB — inilah yang membuat logout benar-benar mencabut token. */
  async assertSessionActive(sid: string): Promise<{ mustChangeSecret: boolean }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sid },
      select: {
        revokedAt: true,
        expiresAt: true,
        petugas: { select: { isActive: true, mustChangePin: true } },
        admin: { select: { isActive: true, mustChangePwd: true } },
      },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sesi telah berakhir. Silakan login kembali.');
    }
    if (session.petugas) {
      if (!session.petugas.isActive) throw new UnauthorizedException('Akun dinonaktifkan.');
      return { mustChangeSecret: session.petugas.mustChangePin };
    }
    if (session.admin) {
      if (!session.admin.isActive) throw new UnauthorizedException('Akun dinonaktifkan.');
      return { mustChangeSecret: session.admin.mustChangePwd };
    }
    throw new UnauthorizedException('Sesi tidak valid.');
  }

  async revokeSession(sid: string): Promise<void> {
    await this.prisma.session
      .updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  async revokeAllPetugasSessions(petugasId: number): Promise<void> {
    await this.prisma.session.updateMany({
      where: { petugasId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllAdminSessions(adminId: number): Promise<void> {
    await this.prisma.session.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Buang sesi kedaluwarsa (dan yang sudah lama dicabut) agar tabel tidak tumbuh tanpa batas. */
  async purgeExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    return result.count;
  }

  /** Buang sesi yang sudah dicabut lebih dari `retentionDays` hari, agar log tetap bisa diaudit. */
  async purgeRevokedSessions(retentionDays = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.session.deleteMany({
      where: { revokedAt: { not: null, lt: cutoff } },
    });
    return result.count;
  }

  hashSecret(plain: string): string {
    return hashSecret(plain);
  }

  verifySecret(plain: string, stored: string): boolean {
    return verifySecret(plain, stored);
  }

  hashToken(token: string): string {
    return hashToken(token);
  }
}
