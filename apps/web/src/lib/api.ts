/**
 * Klien API untuk request yang mengubah state (POST/PUT/PATCH/DELETE).
 *
 * Backend mewajibkan double-submit CSRF: cookie `csrf_token` (httpOnly=false)
 * harus diulang sebagai header `X-CSRF-Token`. Tanpa header ini server membalas
 * 403, jadi SEMUA request mutasi wajib lewat helper ini.
 *
 * Cookie dibaca lewat document.cookie karena Next.js rewrite membuat
 * first-party: cookie di-set dan dibaca pada origin yang sama dengan frontend.
 */

const CSRF_COOKIE = "csrf_token";

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [rawName, ...rest] = part.split("=");
    if (rawName.trim() === CSRF_COOKIE) {
      const value = rest.join("=").trim();
      return value.length > 0 ? decodeURIComponent(value) : null;
    }
  }
  return null;
}

export class CsrfMissingError extends Error {
  constructor() {
    super("Token CSRF tidak tersedia. Muat ulang halaman lalu coba lagi.");
    this.name = "CsrfMissingError";
  }
}

type MutateInit = Omit<RequestInit, "method"> & { method?: string };

export async function apiMutate(url: string, init: MutateInit = {}): Promise<Response> {
  const token = getCsrfToken();
  if (!token) throw new CsrfMissingError();

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  headers.set("X-CSRF-Token", token);

  return fetch(url, { ...init, method: init.method ?? "POST", credentials: "include", headers });
}