import { sendMail } from "../modules/notifications/email";
import * as dotenv from "dotenv";

dotenv.config();

async function test() {
  console.log("Testing SES connection...");
  try {
    await sendMail(
      "sarveda.onlineshop@gmail.com",
      "SES Test from Sarveda",
      "<h1>SES is working!</h1><p>Email sent via Amazon SES SMTP</p>",
      "SES is working! Email sent via Amazon SES SMTP"
    );
    console.log("✅ Email sent successfully!");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Failed:", message);
  }
  process.exit(0);
}

void test();
