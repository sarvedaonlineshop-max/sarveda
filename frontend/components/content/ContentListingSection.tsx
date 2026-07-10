import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  id?: string;
};

export function ContentListingSection({ title, children, id }: Props) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-serif text-2xl font-semibold text-brand-ink md:text-3xl">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export function ContentCardGrid({ children }: { children: ReactNode }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">{children}</ul>
  );
}
