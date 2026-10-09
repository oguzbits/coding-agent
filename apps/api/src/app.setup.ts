import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { Env } from './config/env.validation.js';
import { JsonLogger } from './logging/json-logger.js';
import { requestIdMiddleware } from './logging/request-id.middleware.js';
import { createOriginHostMiddleware } from './security/origin-host.middleware.js';

/** Everything that turns a Nest app into this app. Used by main.ts and by tests, so both run the same pipeline. */
export function configureApp(app: INestApplication, env: Env) {
  app.useLogger(new JsonLogger(env.LOG_LEVEL));
  app.setGlobalPrefix('api', { exclude: ['metrics'] });

  const strict = helmet();
  const forSwaggerUi = helmet({ contentSecurityPolicy: false });
  app.use(requestIdMiddleware);
  app.use(createOriginHostMiddleware({ allowedOrigins: env.ALLOWED_ORIGINS, port: env.PORT }));
  app.use((req: Request, res: Response, next: NextFunction) =>
    (req.path.startsWith('/api/docs') ? forSwaggerUi : strict)(req, res, next),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  if (env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('coding-agent API').build());
    SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
  }
  app.enableShutdownHooks();
}
