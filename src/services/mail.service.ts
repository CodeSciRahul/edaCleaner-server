import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { normalizeEmailForStorage } from '../utils/email.js';
import {
  buildLoginOtpEmail,
  buildPurchaseReceiptEmail,
  buildRegisterOtpEmail,
  buildResetOtpEmail,
  buildSubscriptionCanceledEmail,
  buildWelcomeEmail,
  type PurchaseReceiptEmailParams,
  type SubscriptionCanceledEmailParams,
  type WelcomeEmailParams,
} from './mail-templates.js';

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

    const to = normalizeEmailForStorage(params.to);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.MAIL.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL.MAIL_FROM,
        to: [to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error('Resend email failed', {
        status: response.status,
        to,
        subject: params.subject,
        detail: detail.slice(0, 300),
      });
      throw ApiError.serviceUnavailable('Could not send verification email');
    }

    let resendId: string | undefined;
    try {
      const body = (await response.json()) as { id?: string };
      resendId = body.id;
    } catch {
      // Resend body is optional for logging only.
    }

    logger.info('Email sent', { to, subject: params.subject, resendId });
  }

  /**
   * Best-effort send for transactionals (welcome / purchase).
   * Logs and returns on failure so auth/checkout flows are never blocked.
   */
  async sendSafe(params: SendEmailParams): Promise<void> {
    if (!env.MAIL.RESEND_API_KEY) {
      logger.warn('Skipping transactional email — Resend not configured', {
        to: normalizeEmailForStorage(params.to),
        subject: params.subject,
      });
      return;
    }

    try {
      await this.send(params);
    } catch (error) {
      logger.error('Transactional email failed', {
        to: normalizeEmailForStorage(params.to),
        subject: params.subject,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async sendLoginOtp(email: string, code: string): Promise<void> {
    const template = buildLoginOtpEmail(code);
    await this.send({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendRegisterOtp(email: string, code: string): Promise<void> {
    const template = buildRegisterOtpEmail(code);
    await this.send({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendResetOtp(email: string, code: string): Promise<void> {
    const template = buildResetOtpEmail(code);
    await this.send({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendWelcomeEmail(
    email: string,
    params: WelcomeEmailParams = {},
  ): Promise<void> {
    const template = buildWelcomeEmail(params);
    await this.sendSafe({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendPurchaseReceiptEmail(
    email: string,
    params: PurchaseReceiptEmailParams,
  ): Promise<void> {
    const template = buildPurchaseReceiptEmail(params);
    await this.sendSafe({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }

  async sendSubscriptionCanceledEmail(
    email: string,
    params: SubscriptionCanceledEmailParams,
  ): Promise<void> {
    const template = buildSubscriptionCanceledEmail(params);
    await this.sendSafe({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  }
}

export const mailService = new MailService();
