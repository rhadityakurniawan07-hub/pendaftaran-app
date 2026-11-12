import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const SKIP_MUST_CHANGE_KEY = 'skipMustChangeSecret';

/**
 * Bypass untuk endpoint yang tetap harus bisa diakses saat akun wajib mengganti
 * kredensial: ganti PIN/password itu sendiri, /api/auth/me, dan logout.
 */
export const SkipMustChangeSecret = () => SetMetadata(SKIP_MUST_CHANGE_KEY, true);

/**
 * Menandai endpoint yang butuh kredensial yang SUDAH diganti (opsional).
 * Default: semua endpoint baca & tulis iyez, hanya tulis data yang diblokir.
 */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Menahan operasi tulis ketika akun masih memakai kredensial awal hasil seed.
 * Flag dibaca dari `request.mustChangeSecret`, yang diisi JwtAuthGuard dari DB
 * pada request yang sama — jadi tidak ada query tambahan dan tidak bisa basi.
 */
@Injectable()
export class MustChangeSecretGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Belum login? JwtAuthGuard yang menolak, bukan guard ini.
    if (!request.user) return true;

    if (this.reflector.getAllAndOverride<boolean>(SKIP_MUST_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ])) {
      return true;
    }

    if (!request.mustChangeSecret) return true;
    if (!WRITE_METHODS.has(request.method)) return true;

    throw new ForbiddenException(
      'Anda harus mengganti kredensial awal sebelum dapat mengubah data. Gunakan menu Ganti PIN/Password.',
    );
  }
}
