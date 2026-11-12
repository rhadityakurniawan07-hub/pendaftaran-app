import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthJwtService, JwtPayload } from './jwt.service.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      mustChangeSecret?: boolean;
    }
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authJwtService: AuthJwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Silakan login terlebih dahulu');
    }

    const payload = this.authJwtService.verifyAccessToken(token);

    // Token stateless saja tidak cukup: logout harus benar-benar mencabut akses.
    // Query ini juga memberi tahu apakah akun masih memakai kredensial awal.
    const { mustChangeSecret } = await this.authJwtService.assertSessionActive(payload.sid);

    request.user = payload;
    request.mustChangeSecret = mustChangeSecret;
    return true;
  }
}

/**
 * Prioritas: cookie httpOnly (aman dari XSS) -> header Bearer.
 * Header hanya dipakai untuk skrip server-to-server / e2e test.
 */
export function extractToken(request: {
  cookies?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const fromCookie = request.cookies?.['access_token'];
  if (fromCookie) return fromCookie;

  const header = request.headers?.['authorization'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw?.startsWith('Bearer ')) return raw.slice(7).trim();

  return undefined;
}
