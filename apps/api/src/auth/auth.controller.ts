import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse } from '@nestjs/swagger';
import type { Env } from '../config/env.validation.js';
import type { Request, Response } from 'express';
import { promisify } from 'node:util';
import { EmailTakenError, RegistrationClosedError, UsersService } from '../users/users.service.js';
import { AuthSessionsService } from './auth-sessions.service.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountFlowsService } from './account-flows.service.js';
import {
  AccountDto,
  ChangePasswordDto,
  ConfirmEmailDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  LoginDto,
  LoginSessionDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto.js';
import { CurrentUser } from './current-user.decorator.js';
import { LocalAuthGuard } from './local-auth.guard.js';
import { Public } from './public.decorator.js';
import { SESSION_COOKIE_NAME } from './session.middleware.js';

const USER_AGENT_MAX = 200;

@Controller('auth')
export class AuthController {
  private readonly confirmationRequired: boolean;

  constructor(
    private readonly users: UsersService,
    private readonly authSessions: AuthSessionsService,
    private readonly flows: AccountFlowsService,
    private readonly deletion: AccountDeletionService,
    config: ConfigService<Env, true>,
  ) {
    this.confirmationRequired = config.get('REQUIRE_EMAIL_CONFIRMATION', { infer: true });
  }

  /** Answers 202 whether or not the email was already taken, so the response does not reveal registered emails. */
  @Public()
  @Post('register')
  @HttpCode(202)
  async register(@Body() dto: RegisterDto): Promise<void> {
    try {
      const user = await this.users.register(dto.email, dto.password);
      this.flows.sendConfirmationInBackground(user.id, user.email);
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
    request.session.userAgent = request.get('user-agent')?.slice(0, USER_AGENT_MAX);
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

  @Public()
  @Post('confirm-email')
  @HttpCode(204)
  async confirmEmail(@Body() dto: ConfirmEmailDto): Promise<void> {
    if (!(await this.flows.confirmEmail(dto.token))) throw new BadRequestException('The link is invalid or expired');
  }

  @Post('resend-confirmation')
  @HttpCode(202)
  async resendConfirmation(@CurrentUser() user: Express.User): Promise<void> {
    if (!user.emailConfirmed) await this.flows.sendConfirmation(user.id, user.email);
  }

  /** Answers 202 for every address, so it does not reveal which emails have an account. */
  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Body() dto: ForgotPasswordDto): void {
    this.flows.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    if (!(await this.flows.resetPassword(dto.token, dto.newPassword))) {
      throw new BadRequestException('The link is invalid or expired');
    }
  }

  @Get('sessions')
  @ApiOkResponse({ type: [LoginSessionDto] })
  sessions(@CurrentUser() user: Express.User, @Req() request: Request): Promise<LoginSessionDto[]> {
    return this.authSessions.list(user.id, request.sessionID);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async endSession(@CurrentUser() user: Express.User, @Param('id') id: string): Promise<void> {
    if (!(await this.authSessions.endOne(user.id, id))) throw new NotFoundException('No such login');
  }

  @Delete('sessions')
  @HttpCode(204)
  async endOtherSessions(@CurrentUser() user: Express.User, @Req() request: Request): Promise<void> {
    await this.authSessions.endOthers(user.id, request.sessionID);
  }

  @Delete('account')
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: Express.User,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (!(await this.deletion.delete(user.id, dto.password))) throw new ForbiddenException('The password is wrong');
    response.clearCookie(SESSION_COOKIE_NAME);
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
    await this.flows.revokeResetLinks(user.id);
  }

  private toAccount(user: Express.User | undefined): AccountDto {
    if (!user) throw new ConflictException('Not logged in');
    return {
      id: user.id,
      email: user.email,
      emailConfirmed: user.emailConfirmed,
      confirmationRequired: this.confirmationRequired,
    };
  }
}
