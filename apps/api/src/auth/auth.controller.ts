import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { promisify } from 'node:util';
import { EmailTakenError, RegistrationClosedError, UsersService } from '../users/users.service.js';
import { AuthSessionsService } from './auth-sessions.service.js';
import { AccountDto, ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto.js';
import { CurrentUser } from './current-user.decorator.js';
import { LocalAuthGuard } from './local-auth.guard.js';
import { Public } from './public.decorator.js';
import { SESSION_COOKIE_NAME } from './session.middleware.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly authSessions: AuthSessionsService,
  ) {}

  /**
   * Answers 202 whether or not the email was already taken, so the response does not reveal registered emails.
   * (Slice 8 adds the confirmation mail that makes this useful to the person registering.)
   */
  @Public()
  @Post('register')
  @HttpCode(202)
  async register(@Body() dto: RegisterDto): Promise<void> {
    try {
      await this.users.register(dto.email, dto.password);
    } catch (error) {
      if (error instanceof EmailTakenError) return;
      if (error instanceof RegistrationClosedError) throw new ForbiddenException('Registration is closed');
      throw error;
    }
  }

  // LocalAuthGuard performs the login (new session id, user stored in the session) before this handler runs.
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: AccountDto })
  login(@Body() _dto: LoginDto, @Req() request: Request): AccountDto {
    request.session.createdAt = Date.now();
    return this.toAccount(request.user);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    await promisify(request.logout.bind(request))();
    await new Promise<void>((resolve) => request.session.destroy(() => resolve()));
    response.clearCookie(SESSION_COOKIE_NAME);
  }

  @Get('me')
  @ApiOkResponse({ type: AccountDto })
  me(@CurrentUser() user: Express.User): AccountDto {
    return this.toAccount(user);
  }

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: Express.User,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    const changed = await this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
    if (!changed) throw new ForbiddenException('The current password is wrong');
    await this.authSessions.endOthers(user.id, request.sessionID);
  }

  private toAccount(user: Express.User | undefined): AccountDto {
    if (!user) throw new ConflictException('Not logged in');
    return { id: user.id, email: user.email };
  }
}
