import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { MailSender } from '../mail/mail-sender.js';
import { UsersService } from '../users/users.service.js';
import { AccountTokensService } from './account-tokens.service.js';
import { AuthSessionsService } from './auth-sessions.service.js';

/** Confirming the email address and resetting a forgotten password, both with single-use mailed links. */
@Injectable()
export class AccountFlowsService {
  private readonly logger = new Logger(AccountFlowsService.name);
  private readonly webOrigin: string;
  private readonly confirmHours: number;
  private readonly resetMinutes: number;

  constructor(
    private readonly users: UsersService,
    private readonly tokens: AccountTokensService,
    private readonly mail: MailSender,
    private readonly authSessions: AuthSessionsService,
    config: ConfigService<Env, true>,
  ) {
    this.webOrigin = config.get('ALLOWED_ORIGINS', { infer: true })[0] ?? '';
    this.confirmHours = config.get('CONFIRM_TOKEN_HOURS', { infer: true });
    this.resetMinutes = config.get('RESET_TOKEN_MINUTES', { infer: true });
  }

  /** Like requestPasswordReset, the registration does not wait for the mail. */
  sendConfirmationInBackground(userId: string, email: string): void {
    void this.sendConfirmation(userId, email).catch((error: unknown) => {
      this.logger.error(
        `Could not prepare the confirmation mail: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async sendConfirmation(userId: string, email: string): Promise<void> {
    const token = await this.tokens.issue(userId, 'confirm_email', this.confirmHours * 60);
    await this.deliver({
      to: email,
      subject: 'Confirm your email address',
      text: `Open this link to confirm your email address (valid for ${this.confirmHours} hours):\n\n${this.webOrigin}/confirm-email?token=${token}\n`,
    });
  }

  async confirmEmail(token: string): Promise<boolean> {
    const userId = await this.tokens.consume(token, 'confirm_email');
    if (!userId) return false;
    await this.users.markEmailConfirmed(userId);
    return true;
  }

  /**
   * Sends a mail only for known addresses. The caller does not wait for it and answers the same way either way,
   * so neither the answer nor its timing reveals which addresses have an account.
   */
  requestPasswordReset(email: string): void {
    void this.sendResetMail(email).catch((error: unknown) => {
      this.logger.error(`Could not prepare the reset mail: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  private async sendResetMail(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const token = await this.tokens.issue(user.id, 'reset_password', this.resetMinutes);
    await this.deliver({
      to: user.email,
      subject: 'Reset your password',
      text: `Open this link to choose a new password (valid for ${this.resetMinutes} minutes). If you did not ask for it, ignore this mail.\n\n${this.webOrigin}/reset-password?token=${token}\n`,
    });
  }

  /** A changed password makes a reset link that was mailed earlier worthless. */
  async revokeResetLinks(userId: string): Promise<void> {
    await this.tokens.revoke(userId, 'reset_password');
  }

  /** Receiving the mail proves the address, so a reset also confirms it. All logins end. */
  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const userId = await this.tokens.consume(token, 'reset_password');
    if (!userId) return false;
    await this.users.setPassword(userId, newPassword);
    await this.users.markEmailConfirmed(userId);
    await this.authSessions.endAll(userId);
    return true;
  }

  // A mail provider outage must not change the answer of the endpoint, which would reveal which emails exist.
  private async deliver(mail: { to: string; subject: string; text: string }): Promise<void> {
    try {
      await this.mail.send(mail);
    } catch (error) {
      this.logger.error(`Could not send mail: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
