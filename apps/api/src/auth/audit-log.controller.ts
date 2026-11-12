import { Controller, Get, Query, UseGuards, ParseIntPipe, BadRequestException, DefaultValuePipe } from '@nestjs/common';
import { AuditLogService } from './audit-log.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { Roles } from './roles.decorator.js';

@Controller('api/audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(
    @Query('actorEmail') actorEmail?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('outcome') outcome?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    if (page !== undefined && page < 1) {
      throw new BadRequestException('Parameter "page" minimal 1');
    }
    return this.auditLogService.getLogs({
      actorEmail: actorEmail || undefined,
      action: action || undefined,
      entity: entity || undefined,
      outcome: outcome || undefined,
      page,
      limit,
    });
  }
}
