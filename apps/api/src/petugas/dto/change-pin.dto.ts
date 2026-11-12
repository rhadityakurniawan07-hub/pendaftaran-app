import { IsString, Length, Matches } from 'class-validator';

export class ChangePetugasPinDto {
  /** Kredensial lama wajib diisi ulang, bukan hanya cookie —egu whoever yang mencuri cookie tidak bisa langsung takeover. */
  @IsString()
  @Length(1, 128)
  currentPin: string;

  @IsString()
  @Length(8, 128, { message: 'PIN baru minimal 8 karakter' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'PIN baru harus mengandung huruf dan angka',
  })
  newPin: string;

  @IsString()
  newPinConfirm: string;
}
