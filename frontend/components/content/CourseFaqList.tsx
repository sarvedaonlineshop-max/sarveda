import { ProductRichText } from "@/components/product/ProductRichText";

type Faq = { question: string; answer: string };

export function CourseFaqList({ faqs }: { faqs: Faq[] }) {
  const list = faqs.filter((faq) => faq.question.trim());
  if (list.length === 0) return null;

  return (
    <section style={{ marginTop: "48px" }}>
      <h2
        className="font-serif"
        style={{
          color: "var(--brand-forest)",
          fontSize: "1.5rem",
          fontWeight: 700,
          marginBottom: "20px"
        }}
      >
        Frequently Asked Questions
      </h2>
      <style>{`
        .course-faq-item summary::-webkit-details-marker { display: none; }
        .course-faq-item summary { list-style: none; }
        .course-faq-item[open] .course-faq-chevron { transform: rotate(180deg); }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {list.map((faq, index) => (
          <details
            key={`${index}-${faq.question.slice(0, 48)}`}
            className="course-faq-item"
            style={{
              border: "1px solid var(--brand-cream-dark)",
              background: "var(--brand-ivory)",
              padding: "4px 8px"
            }}
          >
            <summary
              className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3.5"
              style={{ color: "var(--brand-forest)" }}
            >
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>{faq.question}</h3>
              <span
                className="course-faq-chevron shrink-0 text-lg leading-none transition-transform duration-200"
                aria-hidden
              >
                ▾
              </span>
            </summary>
            {faq.answer?.trim() ? (
              <div
                style={{
                  color: "var(--brand-muted)",
                  fontSize: "14px",
                  lineHeight: 1.7,
                  padding: "0 14px 16px"
                }}
              >
                <ProductRichText html={faq.answer} />
              </div>
            ) : null}
          </details>
        ))}
      </div>
    </section>
  );
}
