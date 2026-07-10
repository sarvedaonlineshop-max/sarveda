import { ProductRichText } from "@/components/product/ProductRichText";

type PolicyDocumentProps = {
  title: string;
  html: string;
};

export function PolicyDocument({ title, html }: PolicyDocumentProps) {
  return (
    <main className="min-h-[60vh] bg-stone-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="font-serif text-3xl font-semibold text-stone-900">{title}</h1>
        <div className="mt-6 border-t border-stone-100 pt-6">
          <ProductRichText html={html} />
        </div>
      </div>
    </main>
  );
}
