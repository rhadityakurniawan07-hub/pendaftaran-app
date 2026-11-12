-- CreateTable
CREATE TABLE "Warga" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "nik" TEXT NOT NULL,
    "email" TEXT,
    "nomorKk" TEXT,
    "namaKk" TEXT,
    "tempatLahir" TEXT,
    "tanggalLahir" TEXT,
    "jenisKelamin" TEXT,
    "golonganDarah" TEXT,
    "agama" TEXT,
    "statusPerkawinan" TEXT,
    "statusKeluarga" TEXT,
    "kewarganegaraan" TEXT,
    "pendidikan" TEXT,
    "pekerjaan" TEXT,
    "nomorHp" TEXT,
    "alamat" TEXT,
    "desa" TEXT,
    "rt" TEXT,
    "rw" TEXT,
    "kecamatan" TEXT,
    "kabupaten" TEXT,
    "provinsi" TEXT,
    "statusKependudukan" TEXT,
    "statusTinggal" TEXT,
    "statusWarga" TEXT,
    "disabilitas" TEXT,
    "bantuanSosial" TEXT,
    "keterangan" TEXT,
    "registeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warga_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warga_nik_key" ON "Warga"("nik");

-- CreateIndex
CREATE UNIQUE INDEX "Warga_nomorKk_key" ON "Warga"("nomorKk");
