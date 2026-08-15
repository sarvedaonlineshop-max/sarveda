import {
  decodeHtmlEntities,
  emphasizeDescriptionParagraphs,
  htmlToPlainText,
  looksLikeHtml,
  normalizeProductText,
  sanitizeProductHtml
} from "@/lib/sanitize-html";

type ProductRichTextProps = {
  html: string;
  className?: string;
  /** Bold the first sentence of each paragraph (PDP body copy). */
  emphasize?: boolean;
};

export function ProductRichText({ html, className = "", emphasize = false }: ProductRichTextProps) {
  const text = normalizeProductText(html);
  if (!text.trim()) return null;

  if (looksLikeHtml(text)) {
    const raw = sanitizeProductHtml(text);
    const markup = emphasize ? emphasizeDescriptionParagraphs(raw) : raw;
    return (
      <div
        className={`rich-features max-w-[65ch] text-[15px] leading-7 text-brand-ink/80 ${className}`}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }

  return (
    <p className={`whitespace-pre-wrap text-[15px] leading-7 text-brand-ink/75 ${className}`}>
      {decodeHtmlEntities(text)}
    </p>
  );
}

export function ProductPlainText({ html, className = "" }: ProductRichTextProps) {
  return <p className={`text-[15px] leading-7 text-brand-muted ${className}`}>{htmlToPlainText(html)}</p>;
}
