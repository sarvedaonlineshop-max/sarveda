import { htmlToPlainText, looksLikeHtml, sanitizeProductHtml } from "@/lib/sanitize-html";

type ProductRichTextProps = {
  html: string;
  className?: string;
};

export function ProductRichText({ html, className = "" }: ProductRichTextProps) {
  if (!html.trim()) return null;

  if (looksLikeHtml(html)) {
    return (
      <div
        className={`prose prose-stone max-w-none text-[15px] leading-7 prose-p:my-3 prose-strong:text-stone-900 prose-ul:my-3 prose-li:my-1 prose-headings:font-serif prose-headings:text-stone-900 ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(html) }}
      />
    );
  }

  return <p className={`whitespace-pre-wrap text-[15px] leading-7 text-stone-600 ${className}`}>{html}</p>;
}

export function ProductPlainText({ html, className = "" }: ProductRichTextProps) {
  return <p className={`text-[15px] leading-7 text-stone-600 ${className}`}>{htmlToPlainText(html)}</p>;
}
