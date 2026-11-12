import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import express from 'express';
import { configureAppSecurity } from './bootstrap.js';

const isProd = process.env.NODE_ENV === 'production';
const BODY_LIMIT = '1mb';

function resolveAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) {
    // Tanpa konfigurasi eksplisit, izinkan hanya localhost dev.
    // Production WAJIB set CORS_ALLOWED_ORIGINS.
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const logger = new Logger('Bootstrap');

  // Body parser dipasang manual supaya limit eksplisit dan request oversized
  // benar-benar ditolak 413 (bukan sekadar dicatat di log).
  app.use(express.json({ limit: BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));

  app.use(helmet());
  configureAppSecurity(app);
  app.enableCors({
    origin: resolveAllowedOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Security header tambahan.
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  logger.log(`API berjalan di http://localhost:${port} (${isProd ? 'production' : 'development'})`);
  logger.log(`CORS origin diizinkan: ${resolveAllowedOrigins().join(', ')}`);
}
await bootstrap();
