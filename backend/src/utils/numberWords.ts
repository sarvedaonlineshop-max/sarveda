const BELOW_TWENTY = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen"
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return BELOW_TWENTY[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${BELOW_TWENTY[o]}` : TENS[t];
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h && rest) return `${BELOW_TWENTY[h]} Hundred ${twoDigits(rest)}`;
  if (h) return `${BELOW_TWENTY[h]} Hundred`;
  return twoDigits(rest);
}

/** e.g. 23186 → "Twenty-Three Thousand One Hundred Eighty-Six" */
export function amountInIndianWords(paise: number): string {
  const rupees = Math.round(paise / 100);
  if (rupees === 0) return "Indian Rupee Zero Only";

  const crore = Math.floor(rupees / 10_000_000);
  const lakh = Math.floor((rupees % 10_000_000) / 100_000);
  const thousand = Math.floor((rupees % 100_000) / 1000);
  const hundred = rupees % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  const words = parts.join(" ").replace(/\s+/g, " ").trim();
  return `Indian Rupee ${words} Only`;
}
