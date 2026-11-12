import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';

export interface AuditLogInput {
  actorEmail: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId?: string | number | null;
  detail?: string | null;
  ipAddress?: string | null;
  outcome?: 'SUCCESS' | 'FAILURE';
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sengaja tidak melempar error: kegagalan menulis audit log tidak boleh
   * menggagalkan operasi bisnis yang sudah berhasil.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorEmail: input.actorEmail.slice(0, 255),
          actorRole: input.actorRole.slice(0, 64),
          action: input.action.slice(0, 64),
          entity: input.entity.slice(0, 64),
          entityId:
            input.entityId === null || input.entityId === undefined || input.entityId === ''
              ? null
              : String(input.entityId).slice(0, 64),
          detail: input.detail ? input.detail.slice(0, 1000) : null,
          ipAddress: input.ipAddress ? input.ipAddress.slice(0, 64) : null,
          outcome: input.outcome ?? 'SUCCESS',
        },
      });
    } catch (e) {
      console.error('[AuditLogService] gagal menulis audit log:', e);
    }
  }

  /** Pangkas audit log yang sudah melewati masa retensi (default 180 hari). */
  async purgeOlderThan(retentionDays = 180): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return result.count;
  }

  async getLogs(filters?: {
    actorEmail?: string;
    action?: string;
    entity?: string;
    outcome?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      actorEmail,
      action,
      entity,
      outcome,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = filters ?? {};

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const safePage = Math.max(Number(page) || 1, 1);

    const where: Record<string, unknown> = {};
    if (actorEmail) where.actorEmail = actorEmail;
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (outcome) where.outcome = outcome;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }
}
