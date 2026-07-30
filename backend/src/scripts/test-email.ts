import * as dotenv from "dotenv";

import { resolveEmailSmtpConfig } from "../config/email";
import { sendMail } from "../modules/notifications/email";

dotenv.config();

const to = process.argv[2]?.trim() || "sarveda.onlineshop@gmail.com";
const config = resolveEmailSmtpConfig();

function hintForError(message: string): void {
  if (message.toLowerCase().includes("authentication") || message.includes("535")) {
    console.error("\nCheck SMTP password / send-mail token in ZeptoMail (SMTP tab).");
    console.error("Username should usually be: emailapikey");
  }
  if (message.toLowerCase().includes("domain") || message.includes("553") || message.includes("554")) {
    console.error("\nFROM domain must be verified in ZeptoMail (SPF + DKIM on GoDaddy).");
    console.error("ZeptoMail → Mail Agent → Domains → verify, then wait for DNS propagation.");
  }
}

async function test() {
  if (!config) {
    console.error("No email SMTP config. Set ZEPTOMAIL_SMTP_PASS + ZEPTOMAIL_FROM_EMAIL (or AWS_SES_*).");
    process.exitCode = 1;
    return;
  }

  console.log(`Testing ${config.provider} SMTP…`);
  console.log(`  Host: ${config.host}:${config.port}`);
  console.log(`  From: ${config.fromEmail}`);
  console.log(`  To:   ${to}`);

  try {
    await sendMail(
      to,
      `Sarveda ${config.provider} test`,
      `<h1>Email is working</h1><p>Sent via <strong>${config.provider}</strong> SMTP.</p>`,
      `Email is working. Sent via ${config.provider} SMTP.`
    );
    console.log("\n✅ Email sent successfully. Check inbox (and spam).");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("\n❌ Failed:", message);
    hintForError(message);
    process.exitCode = 1;
  }
}

void test();
