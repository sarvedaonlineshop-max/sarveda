export type SeoSuggestInput = {
  name: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
};

export type SeoSuggestResult = {
  seoTitle: string;
  seoDescription: string;
  seoKeyword: string;
};

function clamp(len: number, min: number, max: number, text: string, pad = ""): string {
  let s = text.trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trim()}…`;
  if (s.length < min && pad) s = `${s} ${pad}`.trim().slice(0, max);
  return s;
}

/** 2–3 word phrase that fits in title + description checks. */
export function pickFocusKeyword(name: string, short?: string): string {
  const fromShort = (short ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  if (fromShort.length >= 2) return fromShort.slice(0, 2).join(" ");

  const fromName = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["sarveda", "buy", "online"].includes(w));
  if (fromName.length >= 2) return fromName.slice(0, 2).join(" ");
  return fromName[0] ?? name.toLowerCase().slice(0, 24);
}

export function polishSeoFields(
  raw: { seoTitle: string; seoDescription: string; seoKeyword: string },
  input: SeoSuggestInput
): SeoSuggestResult {
  const name = input.name.trim();
  const short = (input.shortDescription ?? "").trim();
  const desc = (input.description ?? short).trim();
  const keyword = pickFocusKeyword(name, raw.seoKeyword || short);

  let seoTitle = raw.seoTitle.trim();
  if (!seoTitle.toLowerCase().includes(keyword.toLowerCase())) {
    seoTitle = `${name} — ${keyword} | Sarveda`;
  }
  if (!seoTitle.toLowerCase().includes("sarveda")) {
    seoTitle = `${seoTitle.replace(/\s*\|\s*$/g, "").trim()} | Sarveda`;
  }
  seoTitle = seoTitle.replace(/(\|\s*Sarveda\s*){2,}/gi, "| Sarveda");
  seoTitle = clamp(50, 50, 60, seoTitle);

  let seoDescription = raw.seoDescription.trim() || short || desc.slice(0, 200);
  if (!seoDescription.toLowerCase().includes(keyword.toLowerCase())) {
    seoDescription = `${keyword}: ${seoDescription}`;
  }
  seoDescription = clamp(120, 120, 158, seoDescription, "Shop at Sarveda.");

  return { seoTitle, seoDescription, seoKeyword: keyword };
}

export function localSeoSuggest(input: SeoSuggestInput): SeoSuggestResult {
  const name = input.name.trim();
  const short = (input.shortDescription ?? "").trim();
  const desc = (input.description ?? short).trim();
  const keyword = pickFocusKeyword(name, short);

  const draft = {
    seoTitle: `${name} — ${keyword} | Sarveda`,
    seoDescription:
      short ||
      `${keyword}. ${desc.slice(0, 120)}`.trim() ||
      `Shop ${name} at Sarveda — wellness and sound healing.`,
    seoKeyword: keyword
  };
  return polishSeoFields(draft, input);
}
