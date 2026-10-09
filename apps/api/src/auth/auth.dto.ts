import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

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

  @ApiProperty({ description: 'False until the link from the confirmation mail was used.' })
  emailConfirmed!: boolean;
}

export class ConfirmEmailDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @ApiProperty({ minLength: MIN_PASSWORD, maxLength: MAX_PASSWORD })
  @IsString()
  @MinLength(MIN_PASSWORD)
  @MaxLength(MAX_PASSWORD)
  newPassword!: string;
}

export class LoginSessionDto {
  @ApiProperty({ description: 'Names the login in the other session routes. Not the session id.' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  userAgent!: string | null;

  @ApiProperty({ description: 'True for the login that made this request.' })
  current!: boolean;
}

export class DeleteAccountDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_PASSWORD)
  password!: string;
}
