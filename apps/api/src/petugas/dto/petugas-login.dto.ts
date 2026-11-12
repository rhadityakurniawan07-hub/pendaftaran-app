import { IsEmail, IsString, MinLength } from 'class-validator';

export class PetugasLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(4)
  pin: string;
}