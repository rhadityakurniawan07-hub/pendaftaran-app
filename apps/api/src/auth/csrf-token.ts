import { createHash, randomBytes } from 'node:crypto';

/**
 * Token CSRF diikat ke sesi login: `sha256("csrf:" + sessionId)`.
 * Dengan begitu token dari satu akun tidak sah dipakai untuk request
 * akun lain yang kebetulan terbuka di tab yang sama.
 */
export function deriveCsrfToken(sid: string): string {
  return createHash('sha256').update(`csrf:${sid}`).digest('base64url');
}

export function issueCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}
