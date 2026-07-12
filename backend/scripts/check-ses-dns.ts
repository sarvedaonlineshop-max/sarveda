/**
 * Verify Amazon SES DNS for sarveda.com (ap-south-1).
 * Run: npx ts-node scripts/check-ses-dns.ts
 */
import { promises as dns } from "dns";

const DOMAIN = "sarveda.com";

/** Easy DKIM tokens from SES identity (Jul 10, 2026). Update if AWS rotates them. */
const DKIM_CNAME_TARGETS: Record<string, string> = {
  "ccm3btqeaoy53kwlqyz7aufgvxxloxft._domainkey": "ccm3btqeaoy53kwlqyz7aufgvxxloxft.dkim.amazonses.com",
  "y6qwlk4djq7m2cc5z6uytpwg6id66tqf._domainkey": "y6qwlk4djq7m2cc5z6uytpwg6id66tqf.dkim.amazonses.com",
  "amcw7a5coywjrprkva5qsf2cioimqypp._domainkey": "amcw7a5coywjrprkva5qsf2cioimqypp.dkim.amazonses.com"
};

function normalizeCname(value: string): string {
  return value.replace(/\.$/, "").toLowerCase();
}

async function resolveCname(host: string): Promise<string | null> {
  try {
    const records = await dns.resolveCname(host);
    return records[0] ? normalizeCname(records[0]) : null;
  } catch {
    return null;
  }
}

async function resolveTxt(host: string): Promise<string[][]> {
  try {
    return await dns.resolveTxt(host);
  } catch {
    return [];
  }
}

async function main() {
  console.log(`\nSES DNS check — ${DOMAIN} (nameservers should be DigitalOcean)\n`);

  const ns = await dns.resolveNs(DOMAIN).catch(() => [] as string[]);
  console.log("Nameservers:", ns.length ? ns.join(", ") : "(lookup failed)");

  let dkimOk = 0;
  for (const [label, expected] of Object.entries(DKIM_CNAME_TARGETS)) {
    const fqdn = `${label}.${DOMAIN}`;
    const actual = await resolveCname(fqdn);
    const pass = actual === normalizeCname(expected);
    if (pass) dkimOk += 1;
    console.log(
      `${pass ? "✅" : "❌"} DKIM CNAME ${label}\n` +
        `   expected: ${expected}\n` +
        `   actual:   ${actual ?? "(not found)"}`
    );
  }

  const rootTxt = (await resolveTxt(DOMAIN)).flat();
  const spf = rootTxt.find((t) => t.startsWith("v=spf1"));
  const spfHasSes = spf?.includes("amazonses.com") ?? false;
  console.log(
    `\n${spfHasSes ? "✅" : "⚠️ "} SPF on ${DOMAIN}\n` +
      `   ${spf ?? "(no SPF TXT record)"}\n` +
      (spfHasSes
        ? ""
        : "   Add or merge: include:amazonses.com\n" +
          "   Example: v=spf1 include:zcsend.in include:amazonses.com ~all")
  );

  const dmarc = (await resolveTxt(`_dmarc.${DOMAIN}`)).flat();
  console.log(
    `\n${dmarc.length ? "✅" : "⚠️ "} DMARC _dmarc.${DOMAIN}\n` +
      `   ${dmarc[0] ?? "(optional but recommended for production)"}`
  );

  console.log("\n--- Summary ---");
  console.log(`DKIM: ${dkimOk}/3 records published`);
  if (dkimOk === 3) {
    console.log("Next: wait 5–30 min, then refresh the sarveda.com identity in SES → should show Verified.");
    console.log("Then reapply for production access with sarveda.com as the sending domain.");
  } else {
    console.log("Blocker: add the 3 DKIM CNAME records in DigitalOcean → Networking → Domains → sarveda.com");
    console.log("Host = label only (e.g. ccm3btqeaoy53kwlqyz7aufgvxxloxft._domainkey), not the full domain.");
  }

  process.exit(dkimOk === 3 ? 0 : 1);
}

void main();
