/** Escape plain text for safe HTML inside accordion bodies. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Turn admin plain text into styled HTML for the storefront accordion.
 * Admins type normal paragraphs; we apply consistent Sarveda prose classes.
 */
export function formatAccordionSection(_title: string, plain: string): string {
  const trimmed = plain.trim();
  if (!trimmed) return "";

  if (/<[a-z][\s\S]*>/i.test(trimmed)) {
    return trimmed;
  }

  const blocks = trimmed.split(/\n\n+/).filter(Boolean);
  const inner = blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => escapeHtml(l.trim())).filter(Boolean);
      if (lines.length === 1 && /^[-•*]\s/.test(block.trim())) {
        return `<li class="sarveda-acc-li">${escapeHtml(block.trim().replace(/^[-•*]\s+/, ""))}</li>`;
      }
      if (lines.every((l) => /^[-•*]\s/.test(l) || block.includes("\n-"))) {
        const items = block
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("-") || l.startsWith("•") || l.startsWith("*"))
          .map((l) => `<li class="sarveda-acc-li">${escapeHtml(l.replace(/^[-•*]\s+/, ""))}</li>`)
          .join("");
        return `<ul class="sarveda-acc-ul">${items}</ul>`;
      }
      return `<p class="sarveda-acc-p">${lines.join("<br />")}</p>`;
    })
    .join("");

  return `<div class="sarveda-accordion-body">${inner}</div>`;
}

/** Strip wrapper for editing — show plain text in admin textarea. */
export function plainTextFromAccordionContent(html: string): string {
  const t = html.trim();
  if (!/<[a-z]/i.test(t)) return t;
  return t
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
