import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const KEY_LEN = 64;

function hashSecret(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plain, salt, KEY_LEN).toString('hex');
  return `${salt}:${derived}`;
}

function randomPin(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

function randomPassword(): string {
  return randomBytes(18).toString('base64url');
}

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@desa.id';
  const petugasEmail = process.env.SEED_PETUGAS_EMAIL ?? 'petugas@desa.id';
  const petugasNama = process.env.SEED_PETUGAS_NAMA ?? 'Petugas Desa';

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomPassword();
  const petugasPin = process.env.SEED_PETUGAS_PIN ?? randomPin();

  // `--force` me-rotasi kredensial yang sudah ada. Tanpa flag itu, seed tidak
  // boleh diam-diam mencetak password yang tidak berlaku.
  const force = process.argv.includes('--force');

  const existingAdmin = await prisma.admin.findUnique({ where: { username: 'admin' } });
  const existingPetugas = await prisma.petugas.findUnique({ where: { email: petugasEmail } });

  const rotateAdmin = force && Boolean(existingAdmin);
  const rotatePetugas = force && Boolean(existingPetugas);

  const admin = await prisma.admin.upsert({
    where: { username: 'admin' },
    update: rotateAdmin
      ? {
          passwordHash: hashSecret(adminPassword),
          mustChangePwd: true,
          failedLogins: 0,
          lockedUntil: null,
        }
      : {},
    create: {
      username: 'admin',
      email: adminEmail,
      passwordHash: hashSecret(adminPassword),
      role: 'super_admin',
      isActive: true,
      mustChangePwd: true,
    },
  });

  const petugas = await prisma.petugas.upsert({
    where: { email: petugasEmail },
    update: rotatePetugas
      ? {
          pinHash: hashSecret(petugasPin),
          mustChangePin: true,
          failedLogins: 0,
          lockedUntil: null,
        }
      : {},
    create: {
      nama: petugasNama,
      email: petugasEmail,
      pinHash: hashSecret(petugasPin),
      role: 'petugas',
      isActive: true,
      mustChangePin: true,
    },
  });

  if (rotateAdmin || rotatePetugas) {
    await prisma.session.updateMany({ data: { revokedAt: new Date() } });
  }

  const generated = !process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_PETUGAS_PIN;

  const created = !existingAdmin && !existingPetugas;

  console.log('='.repeat(64));
  console.log('SEED SELESAI');
  console.log('='.repeat(64));

  if (created) {
    console.log(`Admin  : username=${admin.username} email=${admin.email}`);
    console.log(`         password = ${adminPassword}`);
    console.log(`Petugas: email=${petugas.email}`);
    console.log(`         PIN      = ${petugasPin}`);
    if (generated) {
      console.log('-'.repeat(64));
      console.log('Kredensial di atas dibuat ACAK. Simpan sekarang, tidak bisa diambil lagi.');
    }
  } else if (rotateAdmin || rotatePetugas) {
    console.log('MODE ROTASI (--force): kredensial yang sudah ada DITIMPA.');
    if (rotateAdmin) console.log(`  Admin   password baru = ${adminPassword}`);
    if (rotatePetugas) console.log(`  Petugas PIN baru      = ${petugasPin}`);
    console.log('Semua sesi lama dicabut. Simpan kredensial di atas sekarang.');
  } else {
    console.log('Akun sudah ada — tidak ada yang diubah.');
    console.log('Kredensial yang dicetak TIDAK berlaku untuk akun ini.');
    console.log('Untuk sengaja merotasi kredensial, jalankan: bun run db:seed -- --force');
  }

  console.log('='.repeat(64));
  console.log('Akun ditandai mustChangePwd/mustChangePin = true.');
  console.log('WAJIB ganti kredensial ini sebelum dipakai di produksi.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
