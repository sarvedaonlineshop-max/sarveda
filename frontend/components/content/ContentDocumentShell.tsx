import type { ReactNode } from "react";

type ContentDocumentShellProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  maxWidth?: "3xl" | "5xl";
  headerAside?: ReactNode;
  children: ReactNode;
};

export function ContentDocumentShell({
  eyebrow,
  title,
  description,
  maxWidth = "3xl",
  headerAside,
  children
}: ContentDocumentShellProps) {
  const maxClass = maxWidth === "5xl" ? "max-w-5xl" : "max-w-3xl";

  return (
    <>
      <div className="border-b border-brand-cream-dark/60 bg-white">
        <div className={`mx-auto ${maxClass} px-4 py-12 sm:px-6 lg:px-8 md:py-16`}>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold">{eyebrow}</p>
          ) : null}
          <h1
            className={`font-serif text-3xl font-semibold tracking-tight text-brand-ink md:text-4xl ${
              eyebrow ? "mt-2" : ""
            }`}
          >
            {title}
          </h1>
          {description ? <p className="mt-3 max-w-2xl text-brand-muted">{description}</p> : null}
        </div>
      </div>

      <main className="bg-brand-cream px-4 py-14 sm:px-6 lg:px-8 md:py-20">
        <div
          className={`mx-auto ${maxClass} rounded-2xl border border-brand-cream-dark bg-white p-8 shadow-card sm:p-10`}
        >
          {headerAside ? (
            <div className="mb-8 grid gap-8 md:grid-cols-[minmax(220px,336px)_1fr] md:items-start">
              <div className="mx-auto w-full max-w-[336px] md:mx-0">{headerAside}</div>
              <div className="border-t border-brand-cream-dark/60 pt-6 md:border-t-0 md:pt-0">
                {children}
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </>
  );
}
