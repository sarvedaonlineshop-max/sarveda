import Link from "next/link";

type Crumb = { label: string; href?: string };

type Props = {
  items: Crumb[];
  variant?: "default" | "onDark";
};

export function Breadcrumbs({ items, variant = "default" }: Props) {
  const onDark = variant === "onDark";

  return (
    <nav
      aria-label="Breadcrumb"
      className={`text-sm ${onDark ? "text-brand-lavender/60" : "text-brand-muted"}`}
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-2">
            {i > 0 ? (
              <span className={onDark ? "text-brand-lavender/40" : "text-brand-lavender-mid/50"}>/</span>
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className={
                  onDark
                    ? "text-brand-lavender/80 hover:text-brand-lavender hover:underline"
                    : "hover:text-brand-violet hover:underline"
                }
              >
                {item.label}
              </Link>
            ) : (
              <span className={`font-medium ${onDark ? "text-brand-lavender" : "text-brand-ink"}`}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
