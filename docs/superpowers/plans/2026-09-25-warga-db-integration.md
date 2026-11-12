# Warga Database Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task with review checkpoints.

**Goal:** Wire the Sistem Data Warga frontend/backend to PostgreSQL through Prisma so warga records persist permanently (create/read/update/delete via `/api/warga`).

**Architecture:** NestJS backend (`apps/api`) becomes the system of record exposing `/api/warga`; Next.js frontend (`apps/web`) calls it through a dev rewrite proxy. SQLite → PostgreSQL; `Resident` model → `Warga`; mock/localStorage storage → DB.

**Tech Stack:** NestJS 12, Prisma 5.22, PostgreSQL 16 (Docker), Next.js 16, TypeScript 7 (api) / 5 (web), vitest + supertest for e2e.

**Spec:** `docs/superpowers/specs/2026-09-25-warga-db-integration-design.md`

## Global Constraints

- Node `node_modules` is per-workspace; run Prisma/nest from `apps/api`.
- API runs on port 3001, web on port 3000 (`turbo run dev` starts both).
- `.env` is gitignored — edit in place, never commit secrets.
- Keep the extra form fields as optional columns (do not drop UI-submitted data).
- Preserve the existing `/` (AppController) route → do NOT add a global `api` prefix; use `@Controller('api/warga')`.
- Frontend keeps officer slots in localStorage; only warga data moves to the DB.

---

## File Structure

```
apps/api/
  prisma/schema.prisma          MODIFIED  (provider postgres; Warga model)
  prisma/migrations/*           CREATED   (migrate dev)
  .env                          MODIFIED  (DATABASE_URL postgres)
  src/main.ts                   MODIFIED  (CORS + ValidationPipe already; no global prefix)
  src/prisma.service.ts         MODIFIED  (re-enable $connect/$disconnect)
  src/app.module.ts             MODIFIED  (WargaModule import; drop ResidentsModule)
  src/warga/                    CREATED
    warga.module.ts
    warga.controller.ts         (@Controller('api/warga'); includes PUT + delete-all)
    warga.service.ts            (real Prisma, dup NIK/nomorKk checks, error mapping)
    dto/create-warga.dto.ts
    dto/update-warga.dto.ts
  src/residents/                DELETED
  check-db.mjs                  MODIFIED  (prisma.warga)
  test/warga.e2e-spec.ts        CREATED   (409/201/404/PUT/DELETE)
apps/web/
  next.config.ts                MODIFIED  (rewrites proxy /api/*)
  src/app/page.tsx              MODIFIED  (GET fetch + POST/PUT/DELETE mutations)
```

## Interfaces

- `CreateWargaDto`: `{ nama, nik, nomorKk?, alamat?, nomorHp?, statusWarga?, ...all-optionals }`.
- `WargaController`: `POST /api/warga`, `GET /api/warga`, `GET /api/warga/:id`, `PUT /api/warga/:id`, `DELETE /api/warga/:id`, `DELETE /api/warga`.
- Frontend `fetchWargaList()`: GET `/api/warga` → array. Re-called after every mutation.

---

### Task 1: Database — schema + migration

**Files:**
- Modify `apps/api/prisma/schema.prisma`
- Modify `apps/api/.env`

**Interfaces:**
- Consumes: PostgreSQL listening on `127.0.0.1:5432`, db `pendaftaran`, user `postgres`, pw `pendaftaran`.
- Produces: `Warga` table with `@unique` on `nik`; `createdAt`/`updatedAt`.

- [ ] **Step 1: Start Docker Postgres & set env**

```bash
docker run --name pg-warga -e POSTGRES_PASSWORD=pendaftaran -p 127.0.0.1:5432:5432 -d postgres:16
```
`apps/api/.env`:
```env
DATABASE_URL="postgresql://postgres:pendaftaran@127.0.0.1:5432/pendaftaran?schema=public"
```

- [ ] **Step 2: Rewrite schema**  `apps/api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Warga {
  id                Int      @id @default(autoincrement())
  nama              String
  nik               String   @unique
  email             String?
  nomorKk           String?
  namaKk            String?
  tempatLahir       String?
  tanggalLahir      String?
  jenisKelamin      String?
  golonganDarah     String?
  agama             String?
  statusPerkawinan  String?
  statusKeluarga    String?
  kewarganegaraan   String?
  pendidikan        String?
  pekerjaan         String?
  nomorHp           String?
  alamat            String?
  desa              String?
  rt                String?
  rw                String?
  kecamatan         String?
  kabupaten         String?
  provinsi          String?
  statusKependudukan String?
  statusTinggal     String?
  statusWarga       String?
  disabilitas       String?
  bantuanSosial     String?
  keterangan        String?
  registeredBy      String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

- [ ] **Step 3: Generate + migrate**

Run (CWD `apps/api`):
```bash
npx prisma generate
npx prisma migrate dev --name warga_postgres
```

- [ ] **Step 4: Verify** — confirm `Warga` table exists; a second insert with the same `nik` must fail at the DB layer.

```bash
psql -h 127.0.0.1 -U postgres -d pendaftaran -c "\d warga"
```

**Checkpoint:** migration applied, `Warga` table present with `@unique(nik)`.

---

### Task 2: Backend module — rename to `warga` + wire Prisma (POST/GET)

**Files:**
- Create `apps/api/src/warga/warga.module.ts`, `warga.controller.ts`, `warga.service.ts`, `dto/create-warga.dto.ts`
- Modify `apps/api/src/app.module.ts`
- Modify `apps/api/src/prisma.service.ts`
- Delete `apps/api/src/residents/`

**Interfaces:**
- Consumes: `PrismaService` (re-enabled), `CreateWargaDto`.
- Produces: `POST /api/warga` (201, 409 on dup nik/nomorKk), `GET /api/warga`.

- [ ] **Step 1: Re-enable PrismaService**  `apps/api/src/prisma.service.ts`

```ts
async onModuleInit() {
  await this.$connect();
  console.log('[PrismaService] connected to PostgreSQL');
}
async onModuleDestroy() {
  await this.$disconnect();
}
```

- [ ] **Step 2: Create DTO**  `apps/api/src/warga/dto/create-warga.dto.ts`
(same decorators as `CreateResidentDto` but fields: `nama`, `nik`, `nomorKk`,
`nomorHp`, plus all optionals; `@IsUnique`? — checked in service.)

- [ ] **Step 3: Create WargaModule**  `apps/api/src/warga/warga.module.ts`

```ts
import { Module } from '@nestjs/common';
import { WargaController } from './warga.controller.js';
import { WargaService } from './warga.service.js';
import { PrismaService } from '../prisma.service.js';
import { EmailModule } from '../email.module.js';

@Module({
  imports: [EmailModule],
  controllers: [WargaController],
  providers: [WargaService, PrismaService],
})
export class WargaModule {}
```

- [ ] **Step 4: Create WargaController**  `apps/api/src/warga/warga.controller.ts`

```ts
import { Controller, Get, Post, Body, Param, Delete, Put, ParseIntPipe, NotFoundException, ConflictException } from '@nestjs/common';
import { WargaService } from './warga.service.js';
import { CreateWargaDto } from './dto/create-warga.dto.js';
import { UpdateWargaDto } from './dto/update-warga.dto.js';

@Controller('api/warga')
export class WargaController {
  constructor(private readonly wargaService: WargaService) {}

  @Post() create(@Body() dto: CreateWargaDto) { return this.wargaService.create(dto); }
  @Get() findAll() { return this.wargaService.findAll(); }
  @Get(':id') findOne(@Param('id', ParseIntPipe) id: number) { return this.wargaService.findOne(id); }
  @Put(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWargaDto) { return this.wargaService.update(id, dto); }
  @Delete(':id') remove(@Param('id', ParseIntPipe) id: number) { return this.wargaService.remove(id); }
  @Delete() removeAll() { return this.wargaService.removeAll(); }
}
```

- [ ] **Step 5: Create WargaService**  `apps/api/src/warga/warga.service.ts`
(key: dup check + Prisma errors mapped to 409/404.)

```ts
async create(dto: CreateWargaDto) {
  const dup = await this.prisma.warga.findFirst({
    where: { OR: [{ nik: dto.nik }, { nomorKk: dto.nomorKk ?? undefined }] },
  });
  if (dup) throw new ConflictException('NIK atau Nomor KK sudah terdaftar');
  const created = await this.prisma.warga.create({ data: { ...dto, registeredBy: dto.registeredBy ?? null } });
  await this.emailService.sendNewRegistrationNotification({ ...created, registeredAt: created.createdAt });
  return created;
}
async findAll() { return this.prisma.warga.findMany({ orderBy: { createdAt: 'desc' } }); }
async findOne(id: number) {
  const w = await this.prisma.warga.findUnique({ where: { id } });
  if (!w) throw new NotFoundException(`Warga ${id} tidak ditemukan`);
  return w;
}
async update(id: number, dto: UpdateWargaDto) {
  try {
    return await this.prisma.warga.update({ where: { id }, data: dto });
  } catch (e: any) {
    if (e?.code === 'P2025') throw new NotFoundException(`Warga ${id} tidak ditemukan`);
    if (e?.code === 'P2002') throw new ConflictException('NIK atau Nomor KK sudah terdaftar');
    throw e;
  }
}
async remove(id: number) {
  try { await this.prisma.warga.delete({ where: { id } }); return { message: 'Dihapus' }; }
  catch (e: any) { if (e?.code === 'P2025') throw new NotFoundException(`Warga ${id} tidak ditemukan`); throw e; }
}
async removeAll() { await this.prisma.warga.deleteMany(); return { message: 'Semua warga dihapus' }; }
```

- [ ] **Step 6: Wire module**  `apps/api/src/app.module.ts`
replace `ResidentsModule` import with `WargaModule`.

- [ ] **Step 7: Delete** `apps/api/src/residents/`.

- [ ] **Step 8: Smoke test** via supertest/HTTP:
`POST /api/warga` (nik dup) → 409; `POST` valid → 201; `GET /api/warga` → array.

**Checkpoint:** `/api/warga` POST 201/409 and GET work against Postgres.

---

### Task 3: PUT + delete-all + e2e tests (backend complete)

**Files:**
- Create `apps/api/src/warga/dto/update-warga.dto.ts` (`PartialType(CreateWargaDto)`)
- Create `apps/api/test/warga.e2e-spec.ts`

- [ ] **Step 1: Create UpdateWargaDto**

```ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateWargaDto } from './create-warga.dto.js';
export class UpdateWargaDto extends PartialType(CreateWargaDto) {}
```

- [ ] **Step 2: Write e2e tests**  `apps/api/test/warga.e2e-spec.ts`
using `supertest` against the Nest app (override DB? — runs against real Postgres; seed+cleanup per test).

- [ ] **Step 3: Run**  `cd apps/api && npx vitest run --config ./vitest.config.e2e.ts`

**Checkpoint:** PUT returns 200, 404 on missing, 409 on dup-nik-of-other-row; DELETE all works; tests green.

---

### Task 4: Frontend proxy + GET data fetch

**Files:**
- Modify `apps/web/next.config.ts`
- Modify `apps/web/src/app/page.tsx`

- [ ] **Step 1: Add rewrite proxy**  `apps/web/next.config.ts`

```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001'}/api/:path*` }];
  },
};
export default nextConfig;
```

- [ ] **Step 2: Replace local seed with GET fetch** in `page.tsx`
Add `fetchWargaList` + `useEffect` to load `GET /api/warga`; show loading/empty/error
states; drop `INITIAL_WARGA_DATA` warga seed and its localStorage write effect
(keep `localStorage` only for `officerSlots`).

- [ ] **Step 3: Verify** — `turbo dev`; table loads records from DB on open.

**Checkpoint:** table reflects DB rows (reload persists them).

---

### Task 5: Frontend mutations (POST / PUT / DELETE)

**Files:**
- Modify `apps/web/src/app/page.tsx`

- [ ] **Step 1: Wire `handleSubmit`** — create → `POST /api/warga`; edit →
`PUT /api/warga/${id}`; on success call `fetchWargaList()`, reset form, close.

- [ ] **Step 2: Wire delete handlers** — `handleDeleteResident` →
`DELETE /api/warga/${id}`; `handleDeleteAll` → `DELETE /api/warga`; re-fetch.

- [ ] **Step 3: Verify** — add warga shows immediately; reload keeps it;
edit persists; delete persists after reload.

**Checkpoint:** full round-trip persists in Postgres (no localStorage for warga).

---

### Task 6: Supporting + verification

**Files:**
- Modify `apps/api/check-db.mjs`
- (tests in Tasks 2–3)

- [ ] **Step 1: Update** `check-db.mjs`: `prisma.resident` → `prisma.warga`.

- [ ] **Step 2: Run full verification**

```bash
cd apps/api && npx prisma generate
cd apps/api && npx tsc --noEmit        # typecheck
cd apps/api && npx oxlint src/ test/
cd apps/web && npx tsc --noEmit        # or turbo run check-types
turbo run lint
turbo run check-types
cd apps/api && npx vitest run --config ./vitest.config.e2e.ts
```

- [ ] **Step 3: `npx prisma studio`** — confirm rows in `Warga`.

**Checkpoint:** lint + typecheck + tests green; data visible in Studio.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-25-warga-db-integration.md`.

I'll proceed with **Inline Execution** (this session, task-by-task with the checkpoints above) since the tasks are tightly coupled and sequential. Speak up if you'd prefer subagent-driven instead.
