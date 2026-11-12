import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { deriveCsrfToken } from './auth/csrf-token.js';
import {
  ACCESS_COOKIE_BASE,
  REFRESH_COOKIE_BASE,
  CSRF_COOKIE_BASE,
} from './auth/clear-cookies.js';

export const ACCESS_COOKIE = { ...ACCESS_COOKIE_BASE, maxAge: 15 * 60 * 1000 };
export const REFRESH_COOKIE = { ...REFRESH_COOKIE_BASE, maxAge: 7 * 24 * 60 * 60 * 1000 };
export const CSRF_COOKIE = { ...CSRF_COOKIE_BASE, maxAge: 8 * 60 * 60 * 1000 };

export function configureAppSecurity(app: INestApplication): void {
  app.use(cookieParser());

  // Token hanya boleh keluar lewat cookie httpOnly — dipanen dari body response
  // lalu body.accessToken/refreshToken/sessionId dihapus sebelum dikirim kembali.
  app.use((_req: any, res: any, next: any) => {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (body && typeof body === 'object' && !Array.isArray(body) && body.accessToken) {
        res.cookie('access_token', body.accessToken, {
          ...ACCESS_COOKIE,
          maxAge: body.accessTokenMaxAge ?? ACCESS_COOKIE.maxAge,
        });
        if (body.refreshToken) {
          res.cookie('refresh_token', body.refreshToken, {
            ...REFRESH_COOKIE,
            maxAge: body.refreshTokenMaxAge ?? REFRESH_COOKIE.maxAge,
          });
        }
        if (body.sessionId) {
          res.cookie('csrf_token', deriveCsrfToken(body.sessionId), CSRF_COOKIE);
        }
        delete body.accessToken;
        delete body.refreshToken;
        delete body.accessTokenMaxAge;
        delete body.refreshTokenMaxAge;
        delete body.sessionId;
      }
      return originalJson(body);
    };
    next();
  });
}
