import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const CSRF_COOKIE_NAME = CSRF_COOKIE;
export const CSRF_HEADER_NAME = CSRF_HEADER;
export const CSRF_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** Token DI (bukan constructor param) supaya bisa dipakai sebagai @UseGuards(CsrfGuard). */
export const CSRF_ALLOWED_ORIGINS = 'CSRF_ALLOWED_ORIGINS';

/**
 * Proteksi CSRF untuk cookie auth.
 *
 * Cookie auth punya kelemahan intrinsik: `SameSite=Lax` masih mengirim cookie
 * pada navigasi top-level, jadi POST lintas situs perlu ditahan eksplisit.
 * Dua lapis:
 *
 *  1. Double-submit — cookie `csrf_token` (dibaca JS, bukan httpOnly) wajib
 *     diulang sebagai header `X-CSRF-Token`. Penyerang di domain lain bisa
 *     memaksa browser mengirim cookie, tapi tidak bisa membaca nilainya untuk
 *     disisipkan sebagai header.
 *
 *  2. Cek Origin/Referer sebagai lapis tambahan.
 *
 * Token ini bukan kredensial: tidak punya efek terhadap otorisasi API.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Optional() @Inject(CSRF_ALLOWED_ORIGINS) private readonly allowedOrigins: string[] = []) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (SAFE_METHODS.has(request.method)) return true;

    if (this.originRejected(request)) {
      throw new ForbiddenException('Permintaan ditolak: asal tidak dikenali (proteksi CSRF)');
    }

    const cookieToken = request.cookies?.[CSRF_COOKIE];
    const headerToken = request.headers?.[CSRF_HEADER];

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('Token CSRF tidak ada. Muat ulang halaman lalu coba lagi.');
    }

    if (!constantTimeEquals(String(cookieToken), String(headerToken))) {
      throw new ForbiddenException('Token CSRF tidak cocok');
    }

    return true;
  }

  private originRejected(request: any): boolean {
    // Tanpa daftar origin, andalkan proteksi SameSite saja.
    if (this.allowedOrigins.length === 0) return false;

    const origin = request.headers?.['origin'];
    if (origin) return !this.allowedOrigins.includes(origin);

    const referer = request.headers?.['referer'];
    if (!referer) return true;

    try {
      return !this.allowedOrigins.includes(new URL(referer).origin);
    } catch {
      return true;
    }
  }
}
