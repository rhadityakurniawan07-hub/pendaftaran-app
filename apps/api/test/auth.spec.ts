import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthJwtService, hashSecret, verifySecret, hashToken } from '../src/auth/jwt.service.js';
import { PrismaService } from '../src/prisma.service.js';

/**
 * Test unit untuk logika keamanan inti. Tidak menyentuh database sungguhan —
 * prisma di-mock sehingga test cepat dan deterministik.
 */

const JWT_SECRET = 'test-secret-yang-cukup-panjang-untuk-hmac-sha256';

function makePrismaMock() {
  const state = {
    petugas: null as null | {
      id: number;
      nama: string;
      email: string;
      pinHash: string;
      role: string;
      isActive: boolean;
      mustChangePin: boolean;
      failedLogins: number;
      lockedUntil: Date | null;
      lastLoginAt: Date | null;
    },
    admin: null as null | {
      id: number;
      username: string;
      email: string;
      passwordHash: string;
      role: string;
      isActive: boolean;
      mustChangePwd: boolean;
      failedLogins: number;
      lockedUntil: Date | null;
    },
    sessions: new Map<string, any>(),
  };

  const prisma = {
    petugas: {
      findUnique: vi.fn(async ({ where }: any) =>
        state.petugas && state.petugas.email === where.email ? { ...state.petugas } : null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        if (state.petugas && state.petugas.id === where.id) {
          Object.assign(state.petugas, data);
        }
        return { ...state.petugas };
      }),
    },
    admin: {
      findUnique: vi.fn(async ({ where }: any) =>
        state.admin && state.admin.username === where.username ? { ...state.admin } : null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        if (state.admin && state.admin.id === where.id) Object.assign(state.admin, data);
        return { ...state.admin };
      }),
    },
    session: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `sid-${state.sessions.size + 1}`, revokedAt: null, ...data };
        state.sessions.set(row.id, row);
        return { ...row };
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const found = where.id
          ? state.sessions.get(where.id)
          : [...state.sessions.values()].find(
              (r) => r.refreshTokenHash === where.refreshTokenHash,
            );
        if (!found) return null;
        // Sertakan relasi, karena pemanggil bisa `select` petugas/admin.
        return {
          ...found,
          petugas: found.petugasId && state.petugas ? { ...state.petugas } : null,
          admin: found.adminId && state.admin ? { ...state.admin } : null,
        };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const s = state.sessions.get(where.id);
        if (s) Object.assign(s, data);
        return { ...s };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const s of state.sessions.values()) {
          const matchOfficer =
            (where.petugasId === undefined || s.petugasId === where.petugasId) &&
            (where.adminId === undefined || s.adminId === where.adminId);
          if (matchOfficer && (!where.revokedAt || !s.revokedAt)) {
            Object.assign(s, data);
            count++;
          }
        }
        return { count };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };

  return { prisma, state };
}

async function buildService() {
  const { prisma, state } = makePrismaMock();
  const moduleRef = await Test.createTestingModule({
    imports: [
      JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
    ],
    providers: [
      AuthJwtService,
      { provide: ConfigService, useValue: { getOrThrow: () => JWT_SECRET, get: () => undefined } },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { service: moduleRef.get(AuthJwtService), prisma, state };
}

describe('hashSecret / verifySecret', () => {
  it('hash dan verify konsisten untuk secret yang sama', () => {
    const h = hashSecret('RahasiaKuat99');
    expect(verifySecret('RahasiaKuat99', h)).toBe(true);
    expect(verifySecret('RahasiaKuat99', h)).toBe(true);
  });

  it('gagal untuk secret yang salah', () => {
    const h = hashSecret('RahasiaKuat99');
    expect(verifySecret('SalahBanget', h)).toBe(false);
  });

  it('salt berbeda tiap hash, jadi hash tidak bisa dibandingkan langsung', () => {
    expect(hashSecret('sama')).not.toBe(hashSecret('sama'));
  });

  it('menolak input rusak tanpa melempar error', () => {
    expect(verifySecret('x', 'tidak-terstruktur')).toBe(false);
    expect(verifySecret('x', '')).toBe(false);
  });
});

describe('hashToken', () => {
  it('deterministik dan tidak menyimpan token mentah', () => {
    const t = 'abc.def.ghi';
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain('abc');
    expect(hashToken(t)).toHaveLength(64);
  });
});

describe('verifyPetugasPin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('menerima PIN yang benar dan mengembalikan actor', async () => {
    const { service, state } = await buildService();
    state.petugas = {
      id: 1,
      nama: 'Budi',
      email: 'budi@desa.id',
      pinHash: hashSecret('RahasiaKuat99'),
      role: 'petugas',
      isActive: true,
      mustChangePin: true,
      failedLogins: 0,
      lockedUntil: null,
      lastLoginAt: null,
    };
    const actor = await service.verifyPetugasPin('budi@desa.id', 'RahasiaKuat99');
    expect(actor).toMatchObject({ id: 1, email: 'budi@desa.id', actorType: 'petugas' });
    expect(actor.mustChangeSecret).toBe(true);
  });

  it('menolak PIN salah dengan pesan generik', async () => {
    const { service, state } = await buildService();
    state.petugas = {
      id: 1, nama: 'Budi', email: 'budi@desa.id', pinHash: hashSecret('RahasiaKuat99'),
      role: 'petugas', isActive: true, mustChangePin: false, failedLogins: 0,
      lockedUntil: null, lastLoginAt: null,
    };
    await expect(service.verifyPetugasPin('budi@desa.id', 'salah')).rejects.toThrow(
      'Email atau PIN salah',
    );
  });

  it('menolak akun yang terkunci', async () => {
    const { service, state } = await buildService();
    state.petugas = {
      id: 1, nama: 'Budi', email: 'budi@desa.id', pinHash: hashSecret('RahasiaKuat99'),
      role: 'petugas', isActive: true, mustChangePin: false, failedLogins: 5,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000), lastLoginAt: null,
    };
    await expect(service.verifyPetugasPin('budi@desa.id', 'RahasiaKuat99')).rejects.toThrow(
      /terkunci/i,
    );
  });

  it('akun nonaktif ditolak walau PIN benar', async () => {
    const { service, state } = await buildService();
    state.petugas = {
      id: 1, nama: 'Budi', email: 'budi@desa.id', pinHash: hashSecret('RahasiaKuat99'),
      role: 'petugas', isActive: false, mustChangePin: false, failedLogins: 0,
      lockedUntil: null, lastLoginAt: null,
    };
    await expect(service.verifyPetugasPin('budi@desa.id', 'RahasiaKuat99')).rejects.toThrow(
      /dinonaktifkan/i,
    );
  });

  it('email tak dikenal memberi pesan yang sama (tidak membocorkan keberadaan akun)', async () => {
    const { service, state } = await buildService();
    state.petugas = null;
    const unknown = await service
      .verifyPetugasPin('tidak@ada.id', 'apa saja')
      .catch((e) => e.message);
    expect(unknown).toBe('Email atau PIN salah');
  });
});

describe('lockout counters', () => {
  it('registerFailedAttemptPetugas menaikkan penghitung dan mengunci di percobaan ke-5', async () => {
    const { service, state } = await buildService();
    state.petugas = {
      id: 1, nama: 'Budi', email: 'budi@desa.id', pinHash: hashSecret('x'),
      role: 'petugas', isActive: true, mustChangePin: false, failedLogins: 0,
      lockedUntil: null, lastLoginAt: null,
    };
    for (let i = 1; i <= 4; i++) {
      expect(await service.registerFailedAttemptPetugas('budi@desa.id')).toBe(i);
      expect(state.petugas.lockedUntil).toBeNull();
    }
    expect(await service.registerFailedAttemptPetugas('budi@desa.id')).toBe(5);
    expect(state.petugas.lockedUntil).toBeInstanceOf(Date);
  });

  it('akun tak dikenal tidak melempar error', async () => {
    const { service, state } = await buildService();
    state.petugas = null;
    expect(await service.registerFailedAttemptPetugas('hantu@desa.id')).toBe(0);
  });
});

describe('issueTokens & assertSessionActive', () => {
  async function seedPetugas() {
    const ctx = await buildService();
    ctx.state.petugas = {
      id: 7, nama: 'Siti', email: 'siti@desa.id', pinHash: hashSecret('RahasiaKuat99'),
      role: 'petugas', isActive: true, mustChangePin: false, failedLogins: 0,
      lockedUntil: null, lastLoginAt: null,
    };
    return ctx;
  }

  it('token yang diterbitkan bisa diverifikasi dan sesi aktif', async () => {
    const { service } = await seedPetugas();
    const actor = {
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas' as const, mustChangeSecret: false,
    };
    const issued = await service.issueTokens(actor);
    expect(issued.accessToken).toBeTruthy();
    expect(issued.refreshToken).toBeTruthy();

    const payload = service.verifyAccessToken(issued.accessToken);
    expect(payload).toMatchObject({ sub: 7, actorType: 'petugas', email: 'siti@desa.id' });
    expect(await service.assertSessionActive(payload.sid)).toEqual({ mustChangeSecret: false });
  });

  it('access token yang kedaluwarsa ditolak', async () => {
    const { service } = await seedPetugas();
    const expired = service['jwt'].sign(
      { sub: 7, sid: 'x', actorType: 'petugas', email: 'a@b.c', role: 'petugas', nama: 'X' },
      { secret: JWT_SECRET, expiresIn: '-1s' },
    );
    expect(() => service.verifyAccessToken(expired)).toThrow(/berakhir|tidak valid/i);
  });

  it('token yang ditandatangani secret lain ditolak', async () => {
    const { service } = await seedPetugas();
    const forged = service['jwt'].sign(
      { sub: 7, sid: 'x', actorType: 'petugas', email: 'a@b.c', role: 'super_admin', nama: 'X' },
      { secret: 'secret-penyerang', expiresIn: '15m' },
    );
    expect(() => service.verifyAccessToken(forged)).toThrow(UnauthorizedException);
  });

  it('sesi yang dicabut langsung ditolak walau token masih valid secara signature', async () => {
    const { service } = await seedPetugas();
    const issued = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    const payload = service.verifyAccessToken(issued.accessToken);
    await expect(service.assertSessionActive(payload.sid)).resolves.toBeTruthy();

    await service.revokeSession(payload.sid);
    // Inilah inti dari "logout benar-benar mencabut token".
    await expect(service.assertSessionActive(payload.sid)).rejects.toThrow(/berakhir/i);
  });

  it('logout: token lama mati setelah revokeAllPetugasSessions', async () => {
    const { service, state } = await seedPetugas();
    const a = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    const b = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    const pa = service.verifyAccessToken(a.accessToken);
    const pb = service.verifyAccessToken(b.accessToken);

    await service.revokeAllPetugasSessions(7);
    await expect(service.assertSessionActive(pa.sid)).rejects.toThrow();
    await expect(service.assertSessionActive(pb.sid)).rejects.toThrow();
    expect([...state.sessions.values()].every((s) => s.revokedAt !== null)).toBe(true);
  });

  it('akun yang dinonaktifkan langsung kehilangan akses', async () => {
    const { service, state } = await seedPetugas();
    const issued = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    const payload = service.verifyAccessToken(issued.accessToken);
    state.petugas!.isActive = false;
    await expect(service.assertSessionActive(payload.sid)).rejects.toThrow(/dinonaktifkan/i);
  });

  it('mustChangeSecret diteruskan ke guard dari state DB saat ini', async () => {
    const { service, state } = await seedPetugas();
    const issued = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    const payload = service.verifyAccessToken(issued.accessToken);
    // Nilai di payload sengaja tidak relevan — guard harus membaca dari DB.
    state.petugas!.mustChangePin = true;
    expect(await service.assertSessionActive(payload.sid)).toEqual({ mustChangeSecret: true });
  });
});

describe('rotateTokens', () => {
  async function seed() {
    const ctx = await buildService();
    ctx.state.petugas = {
      id: 7, nama: 'Siti', email: 'siti@desa.id', pinHash: hashSecret('RahasiaKuat99'),
      role: 'petugas', isActive: true, mustChangePin: false, failedLogins: 0,
      lockedUntil: null, lastLoginAt: null,
    };
    return ctx;
  }

  it('rotasi berhasil dan membatalkan refresh token lama', async () => {
    const { service } = await seed();
    const first = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    const rotated = await service.rotateTokens(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    // Refresh token lama harus tidak bisa dipakai lagi.
    await expect(service.rotateTokens(first.refreshToken)).rejects.toThrow(/tidak valid/i);
  });

  it('refresh token asing ditolak', async () => {
    const { service } = await seed();
    await expect(service.rotateTokens('token-palsu')).rejects.toThrow(UnauthorizedException);
  });

  it('token bertanda tangan-asli tapi refresh hash tidak ketemu ditolak', async () => {
    const { service } = await seed();
    const a = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    const b = await service.issueTokens({
      id: 7, nama: 'Siti', email: 'siti@desa.id', role: 'petugas',
      actorType: 'petugas', mustChangeSecret: false,
    });
    await service.revokeSession(service.verifyAccessToken(b.accessToken).sid);
    await expect(service.rotateTokens(a.refreshToken)).rejects.toThrow();
  });
});
