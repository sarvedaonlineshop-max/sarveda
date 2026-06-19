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

/** Seller + return defaults for label when Delhivery JSON omits them. */
export function getLabelAddressDefaults(): {
  sellerName: string;
  sellerAddress: string;
  sellerGst: string;
  returnAddress: string;
} {
  const sellerAddress =
    process.env.SELLER_ADDRESS?.replace(/\n+/g, " ").replace(/\s+/g, " ").trim() ||
    "PURVA ATRIA A2 403 BENGALURU 1ST MAIN 1ST BLOCK RMV 2ND STAGE , Bangalore, Karnataka, India";
  const returnAddress =
    process.env.RETURN_WAREHOUSE_ADDRESS?.replace(/\n+/g, " ").replace(/\s+/g, " ").trim() ||
    "Plot No. B, Part 2, RASUDHI WAREHOUSE ,KIADB Industrial Housing Layout, Hebbal 2nd stage Mysore , Mysore, Karnataka";
  return {
    sellerName: "Sarveda",
    sellerAddress,
    sellerGst: process.env.SELLER_GSTIN?.trim() || "29ABFCS0538N1ZV",
    returnAddress
  };
}

export function formatPickupReturnAddress(loc: {
  returnSameAsPickup: boolean;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  returnLine1: string | null;
  returnLine2: string | null;
  returnCity: string | null;
  returnState: string | null;
  returnPostalCode: string | null;
}): string {
  if (loc.returnSameAsPickup !== false) {
    return [loc.line1, loc.line2, loc.city, loc.state, loc.postalCode ? String(loc.postalCode) : null]
      .filter(Boolean)
      .join(" , ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return [loc.returnLine1, loc.returnLine2, loc.returnCity, loc.returnState, loc.returnPostalCode]
    .filter(Boolean)
    .join(" , ")
    .replace(/\s+/g, " ")
    .trim();
}
