import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const MAIL_FROM = 'EDA Cleaner <onboarding@edacleaner.com>';

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class MailService {
  async send(params: SendEmailParams): Promise<void> {
    if (!env.MAIL.RESEND_API_KEY) {
      throw ApiError.serviceUnavailable('Email delivery is not configured');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MAIL.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error('Resend email failed', {
        status: response.status,
        detail: detail.slice(0, 300),
      });
      throw ApiError.serviceUnavailable('Could not send verification email');
    }

    logger.info('Email sent', { to: params.to, subject: params.subject });
  }

  async sendLoginOtp(email: string, code: string): Promise<void> {
    await this.send({
      to: email,
      subject: 'Your EDA Cleaner login code',
      text: `Your EDA Cleaner verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your EDA Cleaner verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    });
  }
}

export const mailService = new MailService();
