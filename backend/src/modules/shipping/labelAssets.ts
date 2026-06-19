import fs from "node:fs";
import path from "node:path";

let sarvedaLogoWithNameDataUri: string | null = null;
let sarvedaIconDataUri: string | null = null;

function logoCandidates(base: string): string[] {
  return [
    path.join(__dirname, "../../../assets/labels", base),
    path.join(process.cwd(), "assets/labels", base)
  ];
}

function readLogoPng(filename: string): string {
  for (const file of logoCandidates(filename)) {
    try {
      if (!fs.existsSync(file)) continue;
      const buf = fs.readFileSync(file);
      return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* try next */
    }
  }
  return "";
}

/** Full Sarveda lockup (from data/logo_with_name.pdf). */
export function getSarvedaLogoDataUri(): string {
  if (!sarvedaLogoWithNameDataUri) sarvedaLogoWithNameDataUri = readLogoPng("sarveda-logo-with-name.png");
  return sarvedaLogoWithNameDataUri;
}

/** Sarveda spiral icon only (from data/logo_1.pdf). */
export function getSarvedaIconDataUri(): string {
  if (!sarvedaIconDataUri) sarvedaIconDataUri = readLogoPng("sarveda-logo.png");
  return sarvedaIconDataUri;
}
