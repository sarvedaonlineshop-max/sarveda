import Link from "next/link";

type Crumb = { label: string; href?: string };

type Props = {
  items: Crumb[];
};

export function Breadcrumbs({ items }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-stone-500">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-2">
            {i > 0 ? <span className="text-stone-300">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-amber-700 hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className="font-medium text-[#108967]">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
