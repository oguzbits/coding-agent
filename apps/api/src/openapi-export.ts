import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

/** Writes the OpenAPI description the web app generates its types from: `node dist/openapi-export.js <file>`. */
const target = process.argv[2];
if (!target) throw new Error('Usage: node dist/openapi-export.js <output file>');
const app = await NestFactory.create(AppModule, { logger: false });
app.setGlobalPrefix('api');
const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('coding-agent API').build());
await writeFile(target, `${JSON.stringify(document, null, 2)}\n`);
await app.close();
