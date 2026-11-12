import type { Response } from 'express';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Basis konfigurasi cookie auth. Didefinisikan di satu tempat supaya main.ts
 * (menerbitkan cookie) dan clearAuthCookies() (menghapusnya) tidak pernah
 * berbeda pada atribut path/sameSite — kalau beda, cookie tidak terhapus.
 */
export const ACCESS_COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
};

export const REFRESH_COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: isProd,
  path: '/api',
};

export const CSRF_COOKIE_BASE = {
  // Dibaca JS supaya bisa diulang sebagai header X-CSRF-Token (double-submit).
  // Tidak memuat otorisasi apa pun, jadi tidak aman bila bocor.
  httpOnly: false,
  sameSite: 'lax' as const,
  secure: isProd,
  path: '/',
};

/**
 * Hapus cookie auth. Dipanggil HANYA setelah logout benar-benar berhasil,
 * supaya percobaan logout yang ditolak guard tidak ikut memutus sesi pengguna.
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', { ...ACCESS_COOKIE_BASE, maxAge: undefined });
  res.clearCookie('refresh_token', { ...REFRESH_COOKIE_BASE, maxAge: undefined });
  res.clearCookie('csrf_token', { ...CSRF_COOKIE_BASE, maxAge: undefined });
}