import { IsString, IsOptional, IsDateString, IsIn, IsEmail, IsNotEmpty } from 'class-validator';

export class CreateWargaDto {
  @IsString()
  @IsNotEmpty()
  nama: string;

  @IsString()
  @IsNotEmpty()
  nik: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  nomorKk?: string;

  @IsOptional()
  @IsString()
  namaKk?: string;

  @IsOptional()
  @IsString()
  tempatLahir?: string;

  @IsOptional()
  @IsDateString()
  tanggalLahir?: string;

  @IsOptional()
  @IsString()
  jenisKelamin?: string;

  @IsOptional()
  @IsString()
  golonganDarah?: string;

  @IsOptional()
  @IsString()
  agama?: string;

  @IsOptional()
  @IsString()
  statusPerkawinan?: string;

  @IsOptional()
  @IsString()
  statusKeluarga?: string;

  @IsOptional()
  @IsIn(['wni', 'wna'])
  kewarganegaraan?: string;

  @IsOptional()
  @IsString()
  pendidikan?: string;

  @IsOptional()
  @IsString()
  pekerjaan?: string;

  @IsOptional()
  @IsString()
  nomorHp?: string;

  @IsOptional()
  @IsString()
  alamat?: string;

  @IsOptional()
  @IsString()
  desa?: string;

  @IsOptional()
  @IsString()
  rt?: string;

  @IsOptional()
  @IsString()
  rw?: string;

  @IsOptional()
  @IsString()
  kecamatan?: string;

  @IsOptional()
  @IsString()
  kabupaten?: string;

  @IsOptional()
  @IsString()
  provinsi?: string;

  @IsOptional()
  @IsString()
  statusKependudukan?: string;

  @IsOptional()
  @IsString()
  statusTinggal?: string;

  @IsOptional()
  @IsString()
  statusWarga?: string;

  @IsOptional()
  @IsString()
  disabilitas?: string;

  @IsOptional()
  @IsString()
  bantuanSosial?: string;

  @IsOptional()
  @IsString()
  keterangan?: string;

  @IsOptional()
  @IsString()
  registeredBy?: string;
}
