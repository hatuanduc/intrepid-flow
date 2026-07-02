import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendInvite(email: string, name: string | null, token: string) {
    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const link = `${appUrl}/setup-password?token=${token}`;
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    const displayName = name ?? email;

    try {
      await this.transporter.sendMail({
        from: `"Intrepid Flow" <${from}>`,
        to: email,
        subject: 'Thiết lập mật khẩu tài khoản Intrepid Flow',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1f36;">
            <h2 style="font-size:20px;font-weight:600;margin:0 0 16px;">Xin chào ${displayName},</h2>
            <p style="font-size:14px;line-height:1.6;color:#3c4257;margin:0 0 24px;">
              Bạn đã được thêm vào hệ thống <strong>Intrepid Flow</strong>.<br>
              Nhấn vào nút bên dưới để thiết lập mật khẩu và bắt đầu sử dụng.
            </p>
            <a href="${link}" style="display:inline-block;background:#635bff;color:#fff;font-size:14px;font-weight:500;padding:11px 22px;border-radius:6px;text-decoration:none;">
              Thiết lập mật khẩu →
            </a>
            <p style="font-size:12px;color:#697386;margin:24px 0 0;">
              Link sẽ hết hạn sau <strong>7 ngày</strong>.<br>
              Nếu bạn không yêu cầu điều này, hãy bỏ qua email này.
            </p>
          </div>
        `,
      });
      this.logger.log(`Invite sent to ${email}`);
    } catch (err) {
      this.logger.error(`Failed to send invite to ${email}`, err);
      throw new InternalServerErrorException('MAIL_ERROR');
    }
  }
}
