import { describe, it, expect } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from '../src/auth/csrf.guard.js';
import { deriveCsrfToken, issueCsrfToken } from '../src/auth/csrf-token.js';
import {
  clearAuthCookies,
  ACCESS_COOKIE_BASE,
  REFRESH_COOKIE_BASE,
  CSRF_COOKIE_BASE,
} from '../src/auth/clear-cookies.js';

const ORIGIN = 'https://daftar.example.id';

function ctx(over: {
  method?: string;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  const request = {
    method: over.method ?? 'POST',
    cookies: over.cookies ?? {},
    headers: over.headers ?? {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('deriveCsrfToken', () => {
  it('deterministik untuk sessionId yang sama', () => {
    expect(deriveCsrfToken('sid-1')).toBe(deriveCsrfToken('sid-1'));
  });

  it('berbeda untuk sessionId berbeda (tidak bisa dipakai lintas akun)', () => {
    expect(deriveCsrfToken('sid-1')).not.toBe(deriveCsrfToken('sid-2'));
  });

  it('tidak membocorkan sessionId mentah', () => {
    const token = deriveCsrfToken('sid-rahasia-123');
    expect(token).not.toContain('sid-rahasia-123');
  });
});

describe('issueCsrfToken', () => {
  it('acak dan panjangnya memadai', () => {
    const t = issueCsrfToken();
    expect(t).not.toBe(issueCsrfToken());
    expect(t.length).toBeGreaterThanOrEqual(32);
  });
});

describe('CsrfGuard', () => {
  describe('method aman', () => {
    it('GET tidak memerlukan token', () => {
      const g = new CsrfGuard([ORIGIN]);
      expect(g.canActivate(ctx({ method: 'GET' }))).toBe(true);
    });

    it('HEAD dan OPTIONS juga bebas', () => {
      const g = new CsrfGuard([ORIGIN]);
      expect(g.canActivate(ctx({ method: 'HEAD' }))).toBe(true);
      expect(g.canActivate(ctx({ method: 'OPTIONS' }))).toBe(true);
    });
  });

  describe('double-submit', () => {
    it('menolak POST tanpa token sama sekali', () => {
      const g = new CsrfGuard([ORIGIN]);
      expect(() => g.canActivate(ctx({ method: 'POST' }))).toThrow(ForbiddenException);
    });

    it('menolak POST dengan cookie tapi tanpa header (serangan CSRF klasik)', () => {
      const g = new CsrfGuard([ORIGIN]);
      expect(() =>
        g.canActivate(
          ctx({ method: 'POST', cookies: { csrf_token: 'abc' }, headers: { origin: ORIGIN } }),
        ),
      ).toThrow(/CSRF tidak ada/);
    });

    it('menolak POST dengan header tapi tanpa cookie', () => {
      const g = new CsrfGuard([ORIGIN]);
      expect(() =>
        g.canActivate(
          ctx({ method: 'POST', headers: { origin: ORIGIN, 'x-csrf-token': 'abc' } }),
        ),
      ).toThrow(/CSRF tidak ada/);
    });

    it('menolak token yang tidak cocok', () => {
      const g = new CsrfGuard([ORIGIN]);
      expect(() =>
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: 'benar' },
            headers: { origin: ORIGIN, 'x-csrf-token': 'salah' },
          }),
        ),
      ).toThrow(/tidak cocok/);
    });

    it('menerima cookie dan header yang sama', () => {
      const g = new CsrfGuard([ORIGIN]);
      const t = deriveCsrfToken('sid-abc');
      expect(
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: t },
            headers: { origin: ORIGIN, 'x-csrf-token': t },
          }),
        ),
      ).toBe(true);
    });
  });

  describe('pemeriksaan Origin / Referer', () => {
    it('menolak Origin dari domain lain walau token cocok', () => {
      const g = new CsrfGuard([ORIGIN]);
      const t = deriveCsrfToken('sid-abc');
      expect(() =>
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: t },
            headers: { origin: 'https://evil.example.com', 'x-csrf-token': t },
          }),
        ),
      ).toThrow(/asal tidak dikenali/);
    });

    it('menerima Origin yang terdaftar', () => {
      const g = new CsrfGuard([ORIGIN, 'http://localhost:3000']);
      const t = deriveCsrfToken('s');
      expect(
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: t },
            headers: { origin: 'http://localhost:3000', 'x-csrf-token': t },
          }),
        ),
      ).toBe(true);
    });

    it('fallback ke Referer saat Origin tidak ada', () => {
      const g = new CsrfGuard([ORIGIN]);
      const t = deriveCsrfToken('s');
      expect(
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: t },
            headers: { referer: `${ORIGIN}/dashboard`, 'x-csrf-token': t },
          }),
        ),
      ).toBe(true);
    });

    it('menolak Referer dari domain lain', () => {
      const g = new CsrfGuard([ORIGIN]);
      const t = deriveCsrfToken('s');
      expect(() =>
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: t },
            headers: { referer: 'https://evil.example.com/x', 'x-csrf-token': t },
          }),
        ),
      ).toThrow(/asal tidak dikenali/);
    });

    it('menolak request tanpa Origin maupun Referer (browser modern selalu mengirimnya)', () => {
      const g = new CsrfGuard([ORIGIN]);
      const t = deriveCsrfToken('s');
      expect(() =>
        g.canActivate(
          ctx({ method: 'POST', cookies: { csrf_token: t }, headers: { 'x-csrf-token': t } }),
        ),
      ).toThrow(/asal tidak dikenali/);
    });

    it('Referer yang tidak bisa di-parse ditolak, bukan diloloskan', () => {
      const g = new CsrfGuard([ORIGIN]);
      const t = deriveCsrfToken('s');
      expect(() =>
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: t },
            headers: { referer: 'bukan-url', 'x-csrf-token': t },
          }),
        ),
      ).toThrow(/asal tidak dikenali/);
    });
  });

  describe('tanpa daftar origin', () => {
    it('andal pada double-submit saja (dikonfigurasi minimal)', () => {
      const g = new CsrfGuard([]);
      const t = deriveCsrfToken('s');
      expect(
        g.canActivate(
          ctx({
            method: 'POST',
            cookies: { csrf_token: t },
            headers: { origin: 'https://apa-saja.example', 'x-csrf-token': t },
          }),
        ),
      ).toBe(true);
      expect(() => g.canActivate(ctx({ method: 'POST' }))).toThrow(ForbiddenException);
    });
  });
});

describe('clearAuthCookies', () => {
  function fakeRes() {
    const calls: { name: string; opts: Record<string, unknown> }[] = [];
    return {
      calls,
      clearCookie: (name: string, opts: Record<string, unknown>) => calls.push({ name, opts }),
    };
  }

  it('menghapus ketiga cookie auth dengan maxAge kosong', () => {
    const res = fakeRes();
    clearAuthCookies(res as never);
    expect(res.calls.map((c) => c.name)).toEqual(['access_token', 'refresh_token', 'csrf_token']);
    for (const c of res.calls) expect(c.opts.maxAge).toBeUndefined();
  });

  it('path refresh_token tetap /api agar benar-benar terhapus', () => {
    const res = fakeRes();
    clearAuthCookies(res as never);
    const refresh = res.calls.find((c) => c.name === 'refresh_token');
    expect(refresh?.opts.path).toBe('/api');
  });

  it('atribut cookie pasterror sama dengan saat diterbitkan', () => {
    // Kalau berbeda, browser diam-diam menolak penghapusan dan user tidak bisa logout.
    const res = fakeRes();
    clearAuthCookies(res as never);
    const byName = Object.fromEntries(res.calls.map((c) => [c.name, c.opts]));
    expect(byName.access_token).toMatchObject(ACCESS_COOKIE_BASE);
    expect(byName.refresh_token).toMatchObject(REFRESH_COOKIE_BASE);
    expect(byName.csrf_token).toMatchObject(CSRF_COOKIE_BASE);
  });

  it('access_token tetap httpOnly, csrf_token tetap terbaca JS', () => {
    const res = fakeRes();
    clearAuthCookies(res as never);
    const byName = Object.fromEntries(res.calls.map((c) => [c.name, c.opts]));
    expect(byName.access_token.httpOnly).toBe(true);
    expect(byName.csrf_token.httpOnly).toBe(false);
  });
});
