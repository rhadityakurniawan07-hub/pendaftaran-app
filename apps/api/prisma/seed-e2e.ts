import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const KEY_LEN = 64;
const prisma = new PrismaClient();

function hashSecret(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plain, salt, KEY_LEN).toString('hex');
  return `${salt}:${derived}`;
}

/**
 * Seed khusus E2E.
 *
 * Berbeda dengan seed produksi (yang memaksa mustChangePwd/mustChangePin=true),
 * seed ini membuat akun yang SIAP PAKAI: mustChange* = false. Tujuannya agar
 * suite E2E bisa memakai credential tetap tanpa terhalang guard
 * MustChangeSecretGuard — guard tetap DIUJI secara terpisah di unit test.
 *
 * Jalankan:  npx tsx prisma/seed-e2e.ts
 * Env opsional:
 *   E2E_ADMIN_PASSWORD
 *   E2E_PETUGAS_PIN
 */
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'AdminPass123!secure';
const petugasPin = process.env.E2E_PETUGAS_PIN ?? 'Petugas99';

async function main() {
  await prisma.warga.deleteMany({});
  await prisma.session.deleteMany({});

  await prisma.admin.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash: hashSecret(adminPassword),
      mustChangePwd: false,
      isActive: true,
      failedLogins: 0,
      lockedUntil: null,
    },
    create: {
      username: 'admin',
      email: 'admin@desa.id',
      passwordHash: hashSecret(adminPassword),
      role: 'super_admin',
      isActive: true,
      mustChangePwd: false,
    },
  });

  await prisma.petugas.upsert({
    where: { email: 'petugas@desa.id' },
    update: {
      pinHash: hashSecret(petugasPin),
      mustChangePin: false,
      isActive: true,
      failedLogins: 0,
      lockedUntil: null,
    },
    create: {
      nama: 'Petugas E2E',
      email: 'petugas@desa.id',
      pinHash: hashSecret(petugasPin),
      role: 'petugas',
      isActive: true,
      mustChangePin: false,
    },
  });

  console.log('E2E seed OK');
  console.log('  Admin   username=admin  password=' + adminPassword);
  console.log('  Petugas email=petugas@desa.id  PIN=' + petugasPin);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
