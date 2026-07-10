import {
  decodeHtmlEntities,
  htmlToPlainText,
  looksLikeHtml,
  normalizeProductText,
  sanitizeProductHtml
} from "@/lib/sanitize-html";

type ProductRichTextProps = {
  html: string;
  className?: string;
};

export function ProductRichText({ html, className = "" }: ProductRichTextProps) {
  const text = normalizeProductText(html);
  if (!text.trim()) return null;

  if (looksLikeHtml(text)) {
    return (
      <div
        className={`rich-features prose prose-stone max-w-[65ch] text-[15px] leading-7 prose-p:my-3 prose-strong:text-brand-ink prose-ul:my-3 prose-li:my-1 prose-headings:font-serif prose-headings:text-brand-ink ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(text) }}
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
  return <p className={`text-[15px] leading-7 text-stone-600 ${className}`}>{htmlToPlainText(html)}</p>;
}
