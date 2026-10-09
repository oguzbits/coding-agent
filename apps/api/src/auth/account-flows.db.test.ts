import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { validateEnv } from '../config/env.validation.js';
import { MailSender, type Mail } from '../mail/mail-sender.js';
import { resetTestDatabase } from '../testing/test-database.js';

// The config module reads the environment when AppModule is imported, so this must run before the imports below.
vi.hoisted(() => {
  process.env.REQUIRE_EMAIL_CONFIRMATION = 'true';
});

const email = 'alice@example.com';
const password = 'correct horse battery staple';
const newPassword = 'another horse battery staple';

class Outbox extends MailSender {
  readonly sent: Mail[] = [];
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }
}

describe('confirming the email and resetting the password (HTTP)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const outbox = new Outbox();

  const agent = () => request.agent(app.getHttpServer());
  const post = (a: ReturnType<typeof agent>, url: string, body?: object) =>
    a.post(`/api${url}`).set('Host', 'localhost:3000').send(body);
  const get = (a: ReturnType<typeof agent>, url: string) => a.get(`/api${url}`).set('Host', 'localhost:3000');
  const tokenOf = (mail: Mail | undefined) => /token=([\w-]+)/.exec(mail?.text ?? '')?.[1] ?? '';
  const lastMail = () => outbox.sent.at(-1);

  async function registerAndLogin() {
    const a = agent();
    await post(a, '/auth/register', { email, password });
    await post(a, '/auth/login', { email, password });
    return a;
  }
  const startRun = async (a: ReturnType<typeof agent>) => {
    const project = await post(a, '/projects', { name: 'P' });
    const conversation = await post(a, '/conversations', { projectId: project.body.id });
    return post(a, `/conversations/${conversation.body.id}/messages`, { text: 'hello' });
  };

  beforeAll(async () => {
    await resetTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailSender)
      .useValue(outbox)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, validateEnv(process.env));
    await app.init();
    dataSource = app.get(DataSource);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await dataSource.query('TRUNCATE users CASCADE');
    await dataSource.query('TRUNCATE auth_sessions');
    outbox.sent.length = 0;
  });

  it('mails a confirmation link on registration and links to the web app', async () => {
    await registerAndLogin();
    expect(outbox.sent).toHaveLength(1);
    expect(outbox.sent[0].to).toBe(email);
    expect(outbox.sent[0].text).toContain('http://localhost:5173/confirm-email?token=');
  });

  it('lets an unconfirmed account log in but not start a run, until the link was used', async () => {
    const a = await registerAndLogin();
    expect((await get(a, '/auth/me')).body).toMatchObject({ emailConfirmed: false, confirmationRequired: true });
    expect((await startRun(a)).status).toBe(403);

    expect((await post(a, '/auth/confirm-email', { token: tokenOf(lastMail()) })).status).toBe(204);

    expect((await get(a, '/auth/me')).body.emailConfirmed).toBe(true);
    expect((await startRun(a)).status).toBeLessThan(300);
  });

  it('accepts a confirmation token only once and rejects unknown ones', async () => {
    const a = await registerAndLogin();
    const token = tokenOf(lastMail());
    expect((await post(agent(), '/auth/confirm-email', { token })).status).toBe(204);
    expect((await post(a, '/auth/confirm-email', { token })).status).toBe(400);
    expect((await post(a, '/auth/confirm-email', { token: 'nonsense' })).status).toBe(400);
  });

  it('sends a fresh confirmation link on request and invalidates the old one', async () => {
    const a = await registerAndLogin();
    const first = tokenOf(lastMail());
    expect((await post(a, '/auth/resend-confirmation')).status).toBe(202);
    expect(outbox.sent).toHaveLength(2);
    expect((await post(a, '/auth/confirm-email', { token: first })).status).toBe(400);
    expect((await post(a, '/auth/confirm-email', { token: tokenOf(lastMail()) })).status).toBe(204);
  });

  it('answers a password reset request the same way for known and unknown emails', async () => {
    await registerAndLogin();
    outbox.sent.length = 0;
    const known = await post(agent(), '/auth/forgot-password', { email });
    const unknown = await post(agent(), '/auth/forgot-password', { email: 'nobody@example.com' });
    expect([known.status, unknown.status]).toEqual([202, 202]);
    expect(outbox.sent).toHaveLength(1);
    expect(outbox.sent[0].to).toBe(email);
    expect(outbox.sent[0].text).toContain('/reset-password?token=');
  });

  it('resets the password once, ends all sessions and confirms the email address', async () => {
    const a = await registerAndLogin();
    await post(agent(), '/auth/forgot-password', { email });
    const token = tokenOf(lastMail());

    expect((await post(agent(), '/auth/reset-password', { token, newPassword })).status).toBe(204);

    expect((await get(a, '/auth/me')).status).toBe(401);
    expect((await post(agent(), '/auth/login', { email, password })).status).toBe(401);
    const again = agent();
    expect((await post(again, '/auth/login', { email, password: newPassword })).status).toBe(200);
    expect((await get(again, '/auth/me')).body.emailConfirmed).toBe(true);
    expect((await post(agent(), '/auth/reset-password', { token, newPassword })).status).toBe(400);
  });

  it('rejects a new password that is too short', async () => {
    await registerAndLogin();
    await post(agent(), '/auth/forgot-password', { email });
    const response = await post(agent(), '/auth/reset-password', { token: tokenOf(lastMail()), newPassword: 'short' });
    expect(response.status).toBe(400);
  });
});
