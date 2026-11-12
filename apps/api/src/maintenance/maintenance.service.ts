import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthJwtService } from '../auth/jwt.service.js';
import { AuditLogService } from '../auth/audit-log.service.js';

/**
 * Pekerjaan rumah tangga periodik.
 *
 * Tanpa ini tabel `Session` dan `AuditLog` tumbuh tanpa batas: setiap login
 * menambah baris, dan token yang sudah kedaluwarsa tidak pernah hilang.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly authJwtService: AuthJwtService,
    private readonly auditLogService: AuditLogService,
  ) {}

  onModuleInit(): void {
    // Beri jeda startup supaya proses lain selesai boot dulu.
    setTimeout(() => void this.pruneSessions(), 30_000).unref?.();
  }

  onModuleDestroy(): void {
    // Interval dibuat per-process; biarkan event loop yang membersihkannya.
  }

  /** Sesi kedaluwarsa / dicabut yang sudah lama tidak berguna dibuang. */
  @Cron(CronExpression.EVERY_HOUR)
  async pruneSessions(): Promise<void> {
    try {
      const removed = await this.authJwtService.purgeExpiredSessions();
      if (removed > 0) this.logger.log(`Pruned ${removed} sesi kedaluwarsa`);
    } catch (e) {
      this.logger.error('Gagal prune sesi:', e);
    }
  }

  /** Audit log dipangkas agar tidak membengkak; policy 180 hari. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneAuditLog(): Promise<void> {
    try {
      const removed = await this.auditLogService.purgeOlderThan(180);
      if (removed > 0) this.logger.log(`Pruned ${removed} audit log > 180 hari`);
    } catch (e) {
      this.logger.error('Gagal prune audit log:', e);
    }
  }

  /**
   * Sesi aktif yang revoked lama (logout normal) dibersihkan setelah 30 hari,
   * supaya tetap bisa diaudit tanpa mengaburkan log yang baru.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async pruneRevokedSessions(): Promise<void> {
    try {
      const removed = await this.authJwtService.purgeRevokedSessions(30);
      if (removed > 0) this.logger.log(`Pruned ${removed} sesi dicabut > 30 hari`);
    } catch (e) {
      this.logger.error('Gagal prune sesi dicabut:', e);
    }
  }
}
