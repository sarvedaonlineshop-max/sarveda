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
        className="border-t border-stone-100 px-4 pb-4 pt-3 text-sm leading-relaxed text-stone-600 prose prose-stone max-w-none prose-p:my-2 prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5 prose-li:my-1 prose-headings:text-stone-900"
        dangerouslySetInnerHTML={{ __html: cleaned }}
      />
    );
  }
  return (
    <div className="border-t border-stone-100 px-4 pb-4 pt-3 text-sm leading-relaxed whitespace-pre-wrap text-stone-600">
      {cleaned}
    </div>
  );
}

export function AccordionDescription({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-stone-100 rounded-2xl border border-stone-100 bg-white shadow-sm">
      {items.map((item) => (
        <details key={item.id} className="group">
          <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium text-stone-900 marker:content-none [&::-webkit-details-marker]:hidden">
            <span>{item.title}</span>
            <span className="text-stone-400 transition-transform group-open:rotate-180">▾</span>
          </summary>
          <RichContent html={item.content} />
        </details>
      ))}
    </div>
  );
}
