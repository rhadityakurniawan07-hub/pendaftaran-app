# Design Spec: Sistem Data Warga → PostgreSQL via Prisma

Date: 2026-09-25
Status: Approved (PostgreSQL via local Docker; assumptions accepted)
Owner: penduduk-app monorepo

## 1. Goal

Replace the local-state / mock-data storage (localStorage `wargaList` in the
Next.js frontend, `MOCK_WARGA` in the NestJS backend) with a real, permanent
PostgreSQL database accessed through Prisma ORM. Data must persist across
browser reloads and app restarts.

## 2. Architecture overview

- `apps/api` — NestJS REST backend (port 3001). Becomes the system of record.
  Exposes `/api/warga` (global prefix `api`).
- `apps/web` — Next.js frontend (port 3000). Stateless UI; reads/writes via
  `fetch('/api/warga')`. No warga data in localStorage any more.
- `apps/api/prisma/schema.prisma` — Prisma schema → `Warga` model → PostgreSQL.
- `apps/api/prisma/dev.db` (SQLite) is replaced by a local Docker Postgres.
- Dev workflow: `docker run postgres:16`; backend `npx prisma migrate dev`.

## 3. Prisma schema (`prisma/schema.prisma`)

- `datasource db.provider = "postgresql"`.
- Model renamed `Resident` → `Warga`.
- Required columns (per user spec): `id`, `nama`, `nik` (`@unique`),
  `nomorKk`, `alamat`, `nomorHp`, `statusWarga`, `createdAt`, `updatedAt`.
- Column renames: `kk` → `nomorKk`; `telepon` → `nomorHp`.
- `nik` gains `@unique` (DB-level duplicate protection).
- `registeredAt` (single) replaced by `createdAt DateTime @default(now())`
  + `updatedAt DateTime @updatedAt`.
- Assumption: all other form-only fields (`email`, `namaKk`, `tempatLahir`,
  `tanggalLahir`, `jenisKelamin`, `golonganDarah`, `agama`, `statusPerkawinan`,
  `statusKeluarga`, `kewarganegaraan`, `pendidikan`, `pekerjaan`, `desa`, `rt`,
  `rw`, `kecamatan`, `kabupaten`, `provinsi`, `statusKependudukan`,
  `statusTinggal`, `disabilitas`, `bantuanSosial`, `keterangan`, `registeredBy`)
  are kept as optional columns so no UI-submitted data is discarded.

## 4. Environment (`apps/api/.env`)

- `DATABASE_URL="postgresql://postgres:pendaftaran@127.0.0.1:5432/pendaftaran"`.
- `.env` is already covered by `.gitignore`. SMTP/seed creds remain; noted as
  pre-existing. No new secrets committed.

## 5. Migration

- `npx prisma migrate dev --name warga_postgres` (run from `apps/api`).
- Seeds the 10 mock warga into Postgres on first migrate via a seed script
  `prisma/seed.ts` (optional, for dev data parity).

## 6. Backend API (`apps/api/src/warga/*`)

Module/controller/service renamed from `residents` → `warga`.
- `main.ts`: `app.setGlobalPrefix('api')` → routes `/api/warga`.
- `PrismaService`: re-enable `$connect()` / `$disconnect()`.
- `WargaController` (DTO `CreateWargaDto` from `dto/create-warga.dto.ts` —
  renames `kk`→`nomorKk`, `telepon`→`nomorHp`):
  - `POST /api/warga` — duplicate `nik` **and** `nomorKk` check
    (`prisma.warga.findFirst`) → `409 Conflict` ("NIK sudah terdaftar" /
    "Nomor KK sudah terdaftar"). Else `prisma.warga.create` → `201`.
    Emits admin email notification via `EmailService` (unchanged behavior).
  - `GET /api/warga` — `prisma.warga.findMany()`.
  - `GET /api/warga/:id` — 404 on miss.
  - `PUT /api/warga/:id` — `prisma.warga.update`, with `nik`/`nomorKk`
    duplicate check scoped to *other* rows → 409 on collision; 404 if missing.
  - `DELETE /api/warga/:id` — `prisma.warga.delete`; 404 on miss.
  - `DELETE /api/warga` — delete-all (bulk) for the "Hapus Semua" action.
- Error mapping: Prisma `P2002` (unique) and `P2025` (not found) →
  idiomatic `ConflictException` / `NotFoundException`.

## 7. Frontend API bridge (`apps/web`)

- `next.config.ts`: `rewrites` proxying `/api/:path*` →
  `http://127.0.0.1:3001/api/:path*` during dev (so the requested
  `fetch('/api/warga', { method:'POST', ... })` reaches NestJS without CORS).
  Falls back to absolute `${NEXT_PUBLIC_API_URL}/api/warga` for prod deploys.
- `src/app/page.tsx`:
  - `INITIAL_WARGA_DATA` + localStorage `wargaList` seed removed.
  - `useEffect` on mount → `GET /api/warga` → `setWargaList`. Loading +
    error states added; empty-state message if DB empty.
  - Officer slots (`officerSlots`) **stay** in localStorage (auth/monitoring).
  - `handleSubmit`: create → `POST /api/warga`; edit →
    `PUT /api/warga/${id}`. On success → re-fetch list (`fetchWargaList`),
    reset form, close form, view `dataWarga`.
  - `handleDeleteResident(id)` → `DELETE /api/warga/${id}`; re-fetch.
  - `handleDeleteAll()` → `DELETE /api/warga`; re-fetch.
  - `handleEditResident(id)` loads resident into form, sets `editingResident`
    (PUT on submit).
  - Dashboard stats/charts recompute from API-backed list — no formula changes.

## 8. Supporting updates

- `apps/api/check-db.mjs`: `prisma.resident` → `prisma.warga`.
- Tests: extend e2e (`apps/api/test/`) for `/api/warga` — duplicate NIK 409,
  GET, PUT, DELETE. Update stale `app.e2e-spec` expectations if affected.
- `prisma/schema.prisma` generator unchanged (client-js).

## 9. Verification plan

1. `docker run postgres:16` reachable; env points to it.
2. `npx prisma generate` succeeds; `prisma migrate dev` creates migration.
3. `turbo run dev` — API up, web up.
4. Smoke test: submit a warga via form → appears in table (auto-refresh);
    reload page → still present (proves DB). Edit → persists. Delete → gone;
    reload → stays gone.
5. `npx prisma studio` shows rows in Postgres.
6. `turbo run lint` + `turbo run check-types` + `turbo run test` green.

## 10. Out of scope

- Changing the officer auth gate (Fase 2) — stays as-is.
- UI redesign — only data wiring changes.
- Production Postgres provisioning — dev uses local Docker only.
