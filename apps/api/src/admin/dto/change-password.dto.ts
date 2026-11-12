import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword: string;

  @IsString()
  @Length(12, 200, { message: 'Password baru minimal 12 karakter' })
  newPassword: string;

  @IsString()
  newPasswordConfirm: string;
}
