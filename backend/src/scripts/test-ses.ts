import * as dotenv from "dotenv";

import { sendMail } from "../modules/notifications/email";

dotenv.config();

const to = process.argv[2]?.trim() || "sarveda.onlineshop@gmail.com";
const from = process.env.AWS_SES_FROM_EMAIL?.trim() ?? "(unset)";

function hintForError(message: string): void {
  if (message.includes("not verified")) {
    console.error("\nSandbox mode: recipient must be verified in SES (ap-south-1).");
    console.error("SES → Verified identities → Create identity → Email address → verify inbox.");
    console.error("Or complete sarveda.com domain DKIM + production access request.");
  }
  if (message.includes("554") && from.includes("@")) {
    console.error(`\nFROM address: ${from}`);
    console.error("FROM domain must match a Verified identity in SES (verify sarveda.com domain with DKIM).");
  }
}

async function test() {
  console.log("Testing SES SMTP…");
  console.log(`  Host: ${process.env.AWS_SES_SMTP_HOST ?? "(unset)"}`);
  console.log(`  From: ${from}`);
  console.log(`  To:   ${to}`);

  try {
    await sendMail(
      to,
      "SES Test from Sarveda",
      "<h1>SES is working</h1><p>Sent via Amazon SES SMTP (ap-south-1).</p>",
      "SES is working. Sent via Amazon SES SMTP (ap-south-1)."
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
