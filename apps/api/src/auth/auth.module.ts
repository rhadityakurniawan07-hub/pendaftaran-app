import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthJwtService } from './jwt.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { AuditLogService } from './audit-log.service.js';
import { AuditLogController } from './audit-log.controller.js';
import { AuthController } from './auth.controller.js';
import { MustChangeSecretGuard } from './must-change-secret.guard.js';
import { CsrfGuard, CSRF_ALLOWED_ORIGINS } from './csrf.guard.js';
import { PrismaService } from '../prisma.service.js';

function allowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          name: 'default',
          ttl: Number(configService.get('THROTTLE_TTL_MS') ?? 60_000),
          limit: Number(configService.get('THROTTLE_LIMIT') ?? 120),
        },
      ],
      inject: [ConfigService],
    }),
  ],
  controllers: [AuditLogController, AuthController],
  providers: [
    AuthJwtService,
    JwtAuthGuard,
    RolesGuard,
    AuditLogService,
    PrismaService,
    MustChangeSecretGuard,
    CsrfGuard,
    { provide: CSRF_ALLOWED_ORIGINS, useFactory: allowedOrigins },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [
    AuthJwtService,
    JwtAuthGuard,
    RolesGuard,
    AuditLogService,
    PrismaService,
    MustChangeSecretGuard,
    CsrfGuard,
    CSRF_ALLOWED_ORIGINS,
  ],
})
export class AuthModule {}
