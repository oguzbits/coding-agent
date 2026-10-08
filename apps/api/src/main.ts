import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { validateEnv } from './config/env.validation.js';

const env = validateEnv(process.env);
const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app, env);
await app.listen(env.PORT, env.HOST);
