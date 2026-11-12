import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendNewRegistrationNotification(resident: {
    nama: string;
    nik: string;
    email?: string;
    telepon?: string;
    alamat?: string;
    registeredAt: Date;
    registeredBy?: string;
  }) {
    const to = process.env.ADMIN_EMAIL || process.env.MAIL_USER || '';
    if (!to) {
      this.logger.warn('ADMIN_EMAIL tidak diisi, email notifikasi tidak dikirim');
      return;
    }

    const subject = `Pendaftaran Warga Baru - ${resident.nama}`;
    const html = `
      <h2>Pendaftaran Warga Baru</h2>
      <p><strong>Nama:</strong> ${resident.nama}</p>
      <p><strong>NIK:</strong> ${resident.nik}</p>
      ${resident.email ? `<p><strong>Email:</strong> ${resident.email}</p>` : ''}
      ${resident.telepon ? `<p><strong>No. HP:</strong> ${resident.telepon}</p>` : ''}
      ${resident.alamat ? `<p><strong>Alamat:</strong> ${resident.alamat}</p>` : ''}
      <p><strong>Tanggal Daftar:</strong> ${resident.registeredAt.toLocaleString('id-ID')}</p>
      ${resident.registeredBy ? `<p><strong>Didaftarkan oleh:</strong> ${resident.registeredBy}</p>` : ''}
    `;

    try {
      await this.mailerService.sendMail({
        to,
        subject,
        html,
      });
      this.logger.log(`Email notifikasi dikirim ke ${to}`);
    } catch (error) {
      this.logger.error('Gagal mengirim email notifikasi', error);
    }
  }
}
