import { ContentDocumentShell } from "@/components/content/ContentDocumentShell";
import { ProductRichText } from "@/components/product/ProductRichText";

type PolicyDocumentProps = {
  title: string;
  html: string;
  eyebrow?: string;
  description?: string;
};

export function PolicyDocument({
  title,
  html,
  eyebrow = "Legal",
  description
}: PolicyDocumentProps) {
  return (
    <ContentDocumentShell eyebrow={eyebrow} title={title} description={description}>
      <ProductRichText html={html} className="leading-8" />
    </ContentDocumentShell>
  );
}
