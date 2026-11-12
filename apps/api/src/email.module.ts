import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { EmailService } from './email.service.js';

@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: process.env.MAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.MAIL_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.MAIL_USER || '',
          pass: process.env.MAIL_PASS || '',
        },
      },
      defaults: {
        from: process.env.MAIL_FROM || '"Sistem Pendaftaran" <noreply@example.com>',
      },
    }),
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
