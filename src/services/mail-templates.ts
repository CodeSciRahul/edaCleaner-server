const BRAND = {
  name: 'edaCleaner',
  product: 'EDA Cleaner',
  eyebrow: 'DESKTOP OPTIMIZER',
  tagline: 'Scan, clean, and speed up your computer — on any desktop.',
  logoUrl: 'https://edacleaner.com/icon.png',
  primary: '#1e3a8a',
  primaryDeep: '#172554',
  accent: '#2563EB',
  muted: '#64748b',
  border: '#dbeafe',
  codeBg: '#eff6ff',
  pageBg: '#e8eef5',
  cardBg: '#ffffff',
  footerBg: '#f1f5f9',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCode(code: string): string {
  return code.replace(/\D/g, '').split('').join(' ');
}

function formatMoney(amountCents: number, currency: string): string {
  const code = (currency || 'usd').toUpperCase();
  const amount = (amountCents / 100).toFixed(2);
  return `${amount} ${code}`;
}

function wrapEmailLayout(params: {
  subject: string;
  heading: string;
  bodyHtml: string;
}): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(params.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.pageBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.cardBg};border-radius:16px;overflow:hidden;border:1px solid #dce3ec;">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.primary} 55%,${BRAND.primaryDeep} 100%);padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:14px;">
                    <img src="${BRAND.logoUrl}" width="48" height="48" alt="" style="display:block;border-radius:50%;border:2px solid rgba(255,255,255,0.85);background:#ffffff;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:11px;letter-spacing:0.14em;font-weight:600;color:rgba(255,255,255,0.78);text-transform:uppercase;">${BRAND.eyebrow}</div>
                    <div style="font-size:26px;line-height:1.15;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${BRAND.name}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.88);">${BRAND.tagline}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 32px 8px;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.primary};letter-spacing:-0.02em;">${escapeHtml(params.heading)}</h1>
              ${params.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="background:${BRAND.footerBg};border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                © ${year} ${BRAND.product}. Desktop optimization for your computer.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

type OtpEmailKind = 'login' | 'register' | 'reset';

const OTP_COPY: Record<
  OtpEmailKind,
  { subjectAction: string; heading: string; intro: string; steps: string[] }
> = {
  login: {
    subjectAction: 'verification code',
    heading: 'Sign in to the desktop app',
    intro: 'Use this one-time code in {product} to finish signing in on your computer.',
    steps: [
      'Open the login window',
      'Enter the email for this account',
      'Enter the verification code when asked',
      'After sign-in, you can set a password in Settings → Account',
    ],
  },
  register: {
    subjectAction: 'email verification code',
    heading: 'Verify your email',
    intro: 'Use this one-time code in {product} to verify your email and finish creating your account.',
    steps: [
      'Return to the create-account window',
      'Enter the 6-digit verification code',
      'Continue to the app once verified',
    ],
  },
  reset: {
    subjectAction: 'password reset code',
    heading: 'Reset your password',
    intro: 'Use this one-time code in {product} to reset the password for your account.',
    steps: [
      'Return to the forgot-password window',
      'Enter the 6-digit verification code',
      'Choose a new password',
    ],
  },
};

function buildOtpEmail(
  kind: OtpEmailKind,
  code: string,
): { subject: string; text: string; html: string } {
  const copy = OTP_COPY[kind];
  const safeCode = escapeHtml(code.trim());
  const displayCode = escapeHtml(formatCode(code.trim()));
  const year = new Date().getFullYear();
  const intro = copy.intro.replace('{product}', BRAND.product);

  const subject = `Your ${BRAND.product} ${copy.subjectAction}`;

  const text = [
    copy.heading,
    '',
    `Use this one-time code in ${BRAND.product}: ${code.trim()}`,
    'Expires in 10 minutes · one use only',
    '',
    'In the app:',
    ...copy.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    'Do not share this code. If you did not request it, you can ignore this email.',
    '',
    `© ${year} ${BRAND.product}. Desktop optimization for your computer.`,
  ].join('\n');

  const stepsHtml = copy.steps
    .map(
      (step, index) =>
        `<li style="margin-bottom:${index === copy.steps.length - 1 ? '0' : '4px'};">${escapeHtml(step)}</li>`,
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.pageBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${BRAND.cardBg};border-radius:16px;overflow:hidden;border:1px solid #dce3ec;">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.primary} 55%,${BRAND.primaryDeep} 100%);padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:14px;">
                    <img src="${BRAND.logoUrl}" width="48" height="48" alt="" style="display:block;border-radius:50%;border:2px solid rgba(255,255,255,0.85);background:#ffffff;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:11px;letter-spacing:0.14em;font-weight:600;color:rgba(255,255,255,0.78);text-transform:uppercase;">${BRAND.eyebrow}</div>
                    <div style="font-size:26px;line-height:1.15;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${BRAND.name}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:rgba(255,255,255,0.88);">${BRAND.tagline}</p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 32px 8px;">
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:${BRAND.primary};letter-spacing:-0.02em;">${escapeHtml(copy.heading)}</h1>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                ${escapeHtml(intro).replace(
                  escapeHtml(BRAND.product),
                  `<strong style="color:${BRAND.primary};">${escapeHtml(BRAND.product)}</strong>`,
                )}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px;background:${BRAND.codeBg};border:1px solid ${BRAND.border};border-radius:12px;">
                <tr>
                  <td align="center" style="padding:14px 22px;">
                    <div style="font-size:10px;letter-spacing:0.14em;font-weight:700;color:${BRAND.accent};text-transform:uppercase;">Verification code</div>
                    <div style="margin:8px 0 6px;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:0.22em;color:${BRAND.primary};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;white-space:nowrap;">${displayCode}</div>
                    <div style="font-size:11px;color:${BRAND.muted};white-space:nowrap;">Expires in 10 minutes · one use only</div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e293b;">In the app</p>
              <ol style="margin:0 0 28px;padding-left:20px;color:${BRAND.muted};font-size:14px;line-height:1.7;">
                ${stepsHtml}
              </ol>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td width="33%" valign="top" style="padding-right:10px;">
                    <div style="font-size:13px;font-weight:700;color:${BRAND.primary};margin-bottom:4px;">Smart Scan</div>
                    <div style="font-size:12px;line-height:1.5;color:${BRAND.muted};">One-click health check across junk, storage, and performance.</div>
                  </td>
                  <td width="33%" valign="top" style="padding:0 6px;">
                    <div style="font-size:13px;font-weight:700;color:${BRAND.primary};margin-bottom:4px;">Cleanup</div>
                    <div style="font-size:12px;line-height:1.5;color:${BRAND.muted};">Remove temp files and clutter with a clear review step.</div>
                  </td>
                  <td width="33%" valign="top" style="padding-left:10px;">
                    <div style="font-size:13px;font-weight:700;color:${BRAND.primary};margin-bottom:4px;">Boost</div>
                    <div style="font-size:12px;line-height:1.5;color:${BRAND.muted};">Manage startup items and keep your PC responsive.</div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:${BRAND.muted};">
                Do not share this code. If you did not request it, you can ignore this email — your account stays secure.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:${BRAND.footerBg};border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                © ${year} ${BRAND.product}. Desktop optimization for your computer.
              </p>
            </td>
          </tr>
        </table>
        <!-- Hidden plain code for accessibility / copy helpers -->
        <div style="display:none;max-height:0;overflow:hidden;">Code: ${safeCode}</div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export function buildLoginOtpEmail(code: string): { subject: string; text: string; html: string } {
  return buildOtpEmail('login', code);
}

export function buildRegisterOtpEmail(code: string): { subject: string; text: string; html: string } {
  return buildOtpEmail('register', code);
}

export function buildResetOtpEmail(code: string): { subject: string; text: string; html: string } {
  return buildOtpEmail('reset', code);
}

export interface WelcomeEmailParams {
  name?: string | null;
}

/** Transactional welcome email after a new account is created. */
export function buildWelcomeEmail(
  params: WelcomeEmailParams = {},
): { subject: string; text: string; html: string } {
  const year = new Date().getFullYear();
  const greetingName = params.name?.trim();
  const greeting = greetingName ? `Hi ${greetingName},` : 'Welcome,';
  const subject = `Welcome to ${BRAND.product}`;

  const text = [
    greeting,
    '',
    `Your ${BRAND.product} account is ready.`,
    'Download the desktop app, sign in with this email, and start scanning to reclaim space and speed.',
    '',
    'What you can do next:',
    '1. Open EDA Cleaner on your computer',
    '2. Sign in with the email for this account',
    '3. Run Smart Scan to see what you can clean',
    '',
    `If you did not create this account, you can ignore this email.`,
    '',
    `© ${year} ${BRAND.product}. Desktop optimization for your computer.`,
  ].join('\n');

  const bodyHtml = `
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
                ${escapeHtml(greeting)}
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                Your <strong style="color:${BRAND.primary};">${escapeHtml(BRAND.product)}</strong> account is ready.
                Download the desktop app, sign in with this email, and start scanning to reclaim space and speed.
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1e293b;">What you can do next</p>
              <ol style="margin:0 0 28px;padding-left:20px;color:${BRAND.muted};font-size:14px;line-height:1.7;">
                <li style="margin-bottom:4px;">Open EDA Cleaner on your computer</li>
                <li style="margin-bottom:4px;">Sign in with the email for this account</li>
                <li style="margin-bottom:0;">Run Smart Scan to see what you can clean</li>
              </ol>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:${BRAND.muted};">
                If you did not create this account, you can ignore this email.
              </p>`;

  return {
    subject,
    text,
    html: wrapEmailLayout({
      subject,
      heading: 'Your account is ready',
      bodyHtml,
    }),
  };
}

export interface PurchaseReceiptEmailParams {
  planName: string;
  billingInterval?: string | null;
  amountPaidCents: number;
  currency: string;
  invoiceNumber?: string | null;
  hostedInvoiceUrl?: string | null;
  customerName?: string | null;
  isTrial?: boolean;
}

/** Transactional receipt after a plan purchase / checkout. */
export function buildPurchaseReceiptEmail(
  params: PurchaseReceiptEmailParams,
): { subject: string; text: string; html: string } {
  const year = new Date().getFullYear();
  const planLabel = params.billingInterval
    ? `${params.planName} (${params.billingInterval === 'year' ? 'yearly' : 'monthly'})`
    : params.planName;
  const amountLabel = formatMoney(params.amountPaidCents, params.currency);
  const greetingName = params.customerName?.trim();
  const greeting = greetingName ? `Hi ${greetingName},` : 'Thanks for your purchase,';
  const subject = params.isTrial
    ? `Your ${BRAND.product} ${params.planName} trial is active`
    : `Your ${BRAND.product} ${params.planName} purchase confirmation`;

  const textLines = [
    greeting,
    '',
    params.isTrial
      ? `Your ${planLabel} trial on ${BRAND.product} is now active.`
      : `Your ${planLabel} plan on ${BRAND.product} is now active.`,
    `Amount: ${params.isTrial && params.amountPaidCents === 0 ? 'Trial — no charge today' : amountLabel}`,
  ];
  if (params.invoiceNumber) {
    textLines.push(`Invoice: ${params.invoiceNumber}`);
  }
  if (params.hostedInvoiceUrl) {
    textLines.push(`View invoice: ${params.hostedInvoiceUrl}`);
  }
  textLines.push(
    '',
    'Open the desktop app and sign in with this email to use your plan.',
    '',
    `© ${year} ${BRAND.product}. Desktop optimization for your computer.`,
  );

  const amountDisplay =
    params.isTrial && params.amountPaidCents === 0
      ? 'Trial — no charge today'
      : amountLabel;

  const invoiceLinkHtml = params.hostedInvoiceUrl
    ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;">
                <a href="${escapeHtml(params.hostedInvoiceUrl)}" style="color:${BRAND.accent};font-weight:600;text-decoration:none;">View invoice</a>
              </p>`
    : '';

  const bodyHtml = `
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
                ${escapeHtml(greeting)}
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                ${
                  params.isTrial
                    ? `Your <strong style="color:${BRAND.primary};">${escapeHtml(planLabel)}</strong> trial on ${escapeHtml(BRAND.product)} is now active.`
                    : `Your <strong style="color:${BRAND.primary};">${escapeHtml(planLabel)}</strong> plan on ${escapeHtml(BRAND.product)} is now active.`
                }
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${BRAND.codeBg};border:1px solid ${BRAND.border};border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:10px;letter-spacing:0.14em;font-weight:700;color:${BRAND.accent};text-transform:uppercase;margin-bottom:10px;">Purchase details</div>
                    <div style="font-size:14px;line-height:1.7;color:#1e293b;">
                      <div><strong>Plan:</strong> ${escapeHtml(planLabel)}</div>
                      <div><strong>Amount:</strong> ${escapeHtml(amountDisplay)}</div>
                      ${
                        params.invoiceNumber
                          ? `<div><strong>Invoice:</strong> ${escapeHtml(params.invoiceNumber)}</div>`
                          : ''
                      }
                    </div>
                  </td>
                </tr>
              </table>
              ${invoiceLinkHtml}
              <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:${BRAND.muted};">
                Open the desktop app and sign in with this email to use your plan.
              </p>`;

  return {
    subject,
    text: textLines.join('\n'),
    html: wrapEmailLayout({
      subject,
      heading: params.isTrial ? 'Trial activated' : 'Purchase confirmed',
      bodyHtml,
    }),
  };
}

export interface SubscriptionCanceledEmailParams {
  planName: string;
  billingInterval?: string | null;
  customerName?: string | null;
  /** When access actually ends (ISO or display-ready string). */
  accessUntil?: string | null;
  /** scheduled = cancel at period end; ended = subscription fully canceled. */
  kind: 'scheduled' | 'ended';
}

function formatAccessDate(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'long',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Transactional email when a subscription is canceled or ends. */
export function buildSubscriptionCanceledEmail(
  params: SubscriptionCanceledEmailParams,
): { subject: string; text: string; html: string } {
  const year = new Date().getFullYear();
  const planLabel = params.billingInterval
    ? `${params.planName} (${params.billingInterval === 'year' ? 'yearly' : 'monthly'})`
    : params.planName;
  const accessUntil = formatAccessDate(params.accessUntil ?? null);
  const greetingName = params.customerName?.trim();
  const greeting = greetingName ? `Hi ${greetingName},` : 'Hi,';
  const isScheduled = params.kind === 'scheduled';

  const subject = isScheduled
    ? `Your ${BRAND.product} ${params.planName} cancellation is confirmed`
    : `Your ${BRAND.product} ${params.planName} subscription has ended`;

  const heading = isScheduled ? 'Cancellation confirmed' : 'Subscription ended';

  const summary = isScheduled
    ? accessUntil
      ? `Your ${planLabel} plan is set to cancel. You keep full access until ${accessUntil}. After that, the plan will not renew and you will move to Free.`
      : `Your ${planLabel} plan is set to cancel at the end of your billing period. After that, the plan will not renew and you will move to Free.`
    : `Your ${planLabel} plan on ${BRAND.product} has ended. Paid features are now locked, and you can resubscribe anytime from the desktop app.`;

  const textLines = [
    greeting,
    '',
    summary,
    '',
    'You can manage billing or purchase again anytime from Settings → Plan in the desktop app.',
    '',
    `© ${year} ${BRAND.product}. Desktop optimization for your computer.`,
  ];

  const bodyHtml = `
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
                ${escapeHtml(greeting)}
              </p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#334155;">
                ${escapeHtml(summary)}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${BRAND.codeBg};border:1px solid ${BRAND.border};border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:10px;letter-spacing:0.14em;font-weight:700;color:${BRAND.accent};text-transform:uppercase;margin-bottom:10px;">Cancellation details</div>
                    <div style="font-size:14px;line-height:1.7;color:#1e293b;">
                      <div><strong>Plan:</strong> ${escapeHtml(planLabel)}</div>
                      <div><strong>Status:</strong> ${
                        isScheduled ? 'Cancels at period end' : 'Ended — Free plan'
                      }</div>
                      ${
                        accessUntil
                          ? `<div><strong>${
                              isScheduled ? 'Access until' : 'Ended on'
                            }:</strong> ${escapeHtml(accessUntil)}</div>`
                          : ''
                      }
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:${BRAND.muted};">
                You can manage billing or purchase again anytime from Settings → Plan in the desktop app.
              </p>`;

  return {
    subject,
    text: textLines.join('\n'),
    html: wrapEmailLayout({
      subject,
      heading,
      bodyHtml,
    }),
  };
}
