import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

export class RegisterDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: MIN_PASSWORD, maxLength: MAX_PASSWORD })
  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  password!: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_PASSWORD)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_PASSWORD)
  currentPassword!: string;

  @ApiProperty({ minLength: MIN_PASSWORD, maxLength: MAX_PASSWORD })
  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  newPassword!: string;
}

export class AccountDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}
