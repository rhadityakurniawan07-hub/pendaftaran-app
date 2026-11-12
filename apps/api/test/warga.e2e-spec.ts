import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request, { Agent as SupertestAgent } from 'supertest';
import { AppModule } from './../src/app.module.js';
import { EmailService } from './../src/email.service.js';
import { PrismaService } from './../src/prisma.service.js';
import { configureAppSecurity } from './../src/bootstrap.js';
import { CreateWargaDto } from './../src/warga/dto/create-warga.dto.js';

/**
 * E2E warga: seluruh endpoint dilindungi JWT + CSRF (double-submit) +
 * MustChangeSecret. Agar bisa diuji otomatis, suite ini:
 *  - menyiapkan middleware cookie (sama persis seperti main.ts) lewat configureAppSecurity
 *  - login lewat COOKIE (bukan Bearer), lalu `supertest.Agent` otomatis
 *    mereplay cookie access_token + csrf_token.
 *  - mengirim header `x-csrf-token` yang diambil dari cookie login.
 *
 * Agar MustChangeSecretGuard tidak mem-blok, seed E2E membuat akun admin
 * dengan `mustChangePwd=false` (jalankan `bun run test:e2e` yang sudah menyertakan
 * seed-e2e, atau `tsx prisma/seed-e2e.ts`).
 */
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'AdminPass123!secure';
const ADMIN_ORIGIN = 'http://localhost:3000';

describe('WargaController (e2e)', () => {
  let app: INestApplication;
  let agent: SupertestAgent;
  let csrfToken: string;
  let server: any;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({
        sendNewRegistrationNotification: vi.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    configureAppSecurity(app);
    await app.init();

    // Isolasi DB: kosongkan tabel warga sebelum tiap test sehingga hitungan
    // dan konflik NIK tidak terpengaruh antar-test.
    await app.get(PrismaService).warga.deleteMany({});

    server = app.getHttpServer();
    agent = request.agent(server);

    // Login lewat cookie; supertest.Agent menyimpan Set-Cookie otomatis,
    // lalu mereplay access_token + csrf_token pada request berikutnya.
    const login = await agent
      .post('/api/admin/login')
      .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
      .expect(200);

    // accessToken sudah tidak ada di body; hanya tersedia lewat cookie.
    expect(login.body.accessToken).toBeUndefined();

    // Baca csrf_token dari cookie yang baru saja diset server, lalu kirim
    // kembali sebagai header double-submit.
    const rawCookies = login.headers['set-cookie'];
    const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
    const csrfCookie = cookies.find((c: string) => c.startsWith('csrf_token='));
    csrfToken = csrfCookie.split(';')[0].split('=')[1];
    expect(csrfToken).toBeTruthy();
  });

  afterEach(async () => {
    await app.close();
  });

  const csrfHeaders = () => ({ 'x-csrf-token': csrfToken, origin: ADMIN_ORIGIN });

  const basePayload = (): CreateWargaDto => ({
    nama: 'Budi Santoso',
    nik: '3273010000000001',
    nomorKk: '3273010000000002',
    nomorHp: '081200000001',
    alamat: 'Jl. Merdeka 1',
    statusWarga: 'Aktif',
    jenisKelamin: 'Laki-laku',
  });

  it('menolak request tanpa token', async () => {
    const fresh: SupertestAgent = request.agent(server);
    await fresh.get('/api/warga').expect(401);
  });

  it('registeredBy diambil dari JWT, bukan dari body', async () => {
    const res = await agent
      .post('/api/warga')
      .set(csrfHeaders())
      .send({ ...basePayload(), registeredBy: 'Admin Palsu' })
      .expect(201);

    expect(res.body.registeredBy).toBe(ADMIN_USERNAME);
  });

  it('POST /api/warga -> 201 created with id and timestamps', async () => {
    const res = await agent
      .post('/api/warga')
      .set(csrfHeaders())
      .send(basePayload())
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(Number),
      nama: 'Budi Santoso',
      nik: '3273010000000001',
      nomorKk: '3273010000000002',
    });
    expect(res.body.createdAt).toBeDefined();
    expect(res.body.updatedAt).toBeDefined();
  });

  it('POST /api/warga -> 409 when NIK is duplicated', async () => {
    const first = { ...basePayload() };
    const dup = { ...basePayload(), nomorKk: '3273010000000999' };

    await agent.post('/api/warga').set(csrfHeaders()).send(first).expect(201);
    const res = await agent
      .post('/api/warga')
      .set(csrfHeaders())
      .send(dup)
      .expect(409);

    expect(res.body.message).toContain('NIK');
  });

  it('POST /api/warga -> 409 when Nomor KK is duplicated', async () => {
    const first = { ...basePayload() };
    const dup = { ...basePayload(), nik: '3273010000000555', nomorKk: '3273010000000002' };

    await agent.post('/api/warga').set(csrfHeaders()).send(first).expect(201);
    const res = await agent
      .post('/api/warga')
      .set(csrfHeaders())
      .send(dup)
      .expect(409);

    expect(res.body.message).toContain('Nomor KK');
  });

  it('GET /api/warga -> 200 returns the created list', async () => {
    await agent.post('/api/warga').set(csrfHeaders()).send(basePayload()).expect(201);

    const res = await agent.get('/api/warga').set(csrfHeaders()).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].nik).toBe('3273010000000001');
  });

  it('PUT /api/warga/:id -> 200 persists updated fields', async () => {
    const created = await agent
      .post('/api/warga')
      .set(csrfHeaders())
      .send(basePayload())
      .expect(201);
    const id = created.body.id;

    await agent
      .put(`/api/warga/${id}`)
      .set(csrfHeaders())
      .send({ nama: 'Budi Setiawan', nomorHp: '081200009999' })
      .expect(200);

    const res = await agent.get(`/api/warga/${id}`).set(csrfHeaders()).expect(200);
    expect(res.body.nama).toBe('Budi Setiawan');
    expect(res.body.nomorHp).toBe('081200009999');
  });

  it('PUT /api/warga/:id -> 404 when record does not exist', async () => {
    const res = await agent
      .put('/api/warga/999999')
      .set(csrfHeaders())
      .send({ nama: 'Ghost' })
      .expect(404);

    expect(res.body.message).toMatch(/tidak ditemukan/i);
  });

  it('DELETE /api/warga/:id -> 200 deletes the record', async () => {
    const created = await agent
      .post('/api/warga')
      .set(csrfHeaders())
      .send(basePayload())
      .expect(201);
    const id = created.body.id;

    await agent.delete(`/api/warga/${id}`).set(csrfHeaders()).expect(200);
    await agent.get(`/api/warga/${id}`).set(csrfHeaders()).expect(404);
  });

  it('DELETE /api/warga/:id -> 404 when already deleted', async () => {
    await agent.delete('/api/warga/999999').set(csrfHeaders()).expect(404);
  });

  it('DELETE /api/warga -> 200 removes all and empties the list', async () => {
    await agent.post('/api/warga').set(csrfHeaders()).send(basePayload()).expect(201);
    await agent
      .post('/api/warga')
      .set(csrfHeaders())
      .send({ ...basePayload(), nik: '3273010000000003', nomorKk: '3273010000000004' })
      .expect(201);

    const res = await agent.delete('/api/warga').set(csrfHeaders()).expect(200);
    expect(res.body.deletedCount).toBe(2);

    const list = await agent.get('/api/warga').set(csrfHeaders()).expect(200);
    expect(list.body).toEqual([]);
  });
});
