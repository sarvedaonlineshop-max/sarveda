import {
  decodeHtmlEntities,
  descriptionParagraphs,
  emphasizeDescriptionParagraphs,
  emphasizePlainParagraph,
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
        className={`rich-features max-w-[72ch] text-base leading-[1.6] text-brand-ink/80 ${className}`}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    );
  }

  const paragraphs = descriptionParagraphs(text);
  if (paragraphs.length > 1 || emphasize) {
    return (
      <div className={`pdp-description rich-features max-w-[72ch] text-base leading-[1.6] text-brand-ink/80 ${className}`}>
        {paragraphs.map((para, index) => (
          <p
            key={`${index}-${para.slice(0, 24)}`}
            dangerouslySetInnerHTML={{
              __html: emphasize ? emphasizePlainParagraph(para) : para.replace(/&/g, "&amp;").replace(/</g, "&lt;")
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <p className={`text-base leading-[1.6] text-brand-ink/75 ${className}`}>
      {decodeHtmlEntities(text)}
    </p>
  );
}

export function ProductPlainText({ html, className = "" }: ProductRichTextProps) {
  return <p className={`text-[15px] leading-7 text-brand-muted ${className}`}>{htmlToPlainText(html)}</p>;
}
