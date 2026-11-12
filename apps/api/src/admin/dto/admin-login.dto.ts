import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(100)
  password: string;
}
