/**
 * Transactional email SMTP config.
 * Prefers Zoho ZeptoMail when ZEPTOMAIL_SMTP_PASS is set; otherwise Amazon SES.
 */
export type EmailSmtpConfig = {
  provider: "zeptomail" | "ses";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  replyTo?: string;
};

function trim(value?: string | null): string {
  return value?.trim() ?? "";
}

export function resolveEmailSmtpConfig(): EmailSmtpConfig | null {
  const zeptoPass = trim(process.env.ZEPTOMAIL_SMTP_PASS);
  const zeptoFrom = trim(process.env.ZEPTOMAIL_FROM_EMAIL);

  if (zeptoPass && zeptoFrom) {
    const port = Number(process.env.ZEPTOMAIL_SMTP_PORT ?? 587);
    return {
      provider: "zeptomail",
      host: trim(process.env.ZEPTOMAIL_SMTP_HOST) || "smtp.zeptomail.com",
      port: Number.isFinite(port) ? port : 587,
      secure: port === 465,
      user: trim(process.env.ZEPTOMAIL_SMTP_USER) || "emailapikey",
      pass: zeptoPass,
      fromEmail: zeptoFrom,
      replyTo: trim(process.env.ZEPTOMAIL_REPLY_TO) || undefined
    };
  }

  const host = trim(process.env.AWS_SES_SMTP_HOST);
  const user = trim(process.env.AWS_SES_SMTP_USER);
  const pass = trim(process.env.AWS_SES_SMTP_PASS);
  const fromEmail = trim(process.env.AWS_SES_FROM_EMAIL);
  if (!host || !user || !pass || !fromEmail) return null;

  const port = Number(process.env.AWS_SES_SMTP_PORT ?? 587);
  return {
    provider: "ses",
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: port === 465,
    user,
    pass,
    fromEmail,
    replyTo: trim(process.env.AWS_SES_REPLY_TO) || undefined
  };
}

export function isEmailSmtpConfigured(): boolean {
  return resolveEmailSmtpConfig() != null;
}
