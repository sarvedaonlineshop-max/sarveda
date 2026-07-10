import legalPagesJson from "./legal-pages.json";

export type LegalPageKey = "privacy" | "terms" | "refunds" | "shipping";

type LegalPage = {
  title: string;
  html: string;
};

const legalPages = legalPagesJson as Record<LegalPageKey, LegalPage>;

export function getLegalPage(key: LegalPageKey): LegalPage {
  const page = legalPages[key];
  if (!page) throw new Error(`Unknown legal page: ${key}`);
  return page;
}
