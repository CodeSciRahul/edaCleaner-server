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
