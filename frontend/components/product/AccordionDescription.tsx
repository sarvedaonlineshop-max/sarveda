import { sanitizeProductHtml } from "@/lib/sanitize-html";

type Item = {
  id: string;
  title: string;
  content: string;
};

type Props = {
  items: Item[];
};

function RichContent({ html }: { html: string }) {
  const cleaned = sanitizeProductHtml(html);
  const looksHtml = /<[a-z][\s\S]*>/i.test(cleaned.trim());
  if (looksHtml) {
    return (
      <div
        className="border-t border-[rgba(196,176,232,0.25)] px-4 pb-4 pt-3 text-sm leading-relaxed text-brand-mid prose prose-brand max-w-none prose-p:my-2 prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-li:my-1 prose-headings:text-brand-ink"
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
    );
  }
  return (
    <div className="border-t border-[rgba(196,176,232,0.25)] px-4 pb-4 pt-3 text-sm leading-relaxed whitespace-pre-wrap text-brand-mid">
      {cleaned}
    </div>
  );
}

export function AccordionDescription({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-[rgba(196,176,232,0.25)] rounded-2xl border border-[rgba(196,176,232,0.25)] bg-white shadow-sm">
      {items.map((item) => (
        <details key={item.id} className="group">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium text-brand-ink marker:content-none [&::-webkit-details-marker]:hidden">
            <span>{item.title}</span>
            <span className="text-brand-muted transition-transform group-open:rotate-180">▾</span>
          </summary>
          <RichContent html={item.content} />
        </details>
      ))}
    </div>
  );
}
