import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { validateEnv } from './config/env.validation.js';
import { setupTracing } from './tracing/setup-tracing.js';

const env = validateEnv(process.env);
const flushTraces = setupTracing(process.env);
const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app, env);
await app.listen(env.PORT, env.HOST);
// Nest closes the app on these signals; the spans still in the buffer are sent meanwhile.
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void flushTraces());
