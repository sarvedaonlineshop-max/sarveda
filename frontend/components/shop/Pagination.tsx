import Link from "next/link";

type Props = {
  page: number;
  totalPages: number;
  /** @deprecated use basePath — kept for /shop legacy */
  categorySlug?: string;
  basePath?: string;
};

function hrefForPage(p: number, basePath: string): string {
  const q = new URLSearchParams();
  if (p > 1) q.set("page", String(p));
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function ShopPagination({ page, totalPages, categorySlug, basePath }: Props) {
  const path =
    basePath ?? (categorySlug ? `/product-category/${encodeURIComponent(categorySlug)}` : "/shop");
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  if (end - start + 1 < windowSize) {
    start = Math.max(1, end - windowSize + 1);
  }
  for (let i = start; i <= end; i++) pages.push(i);

  const btnBase =
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border text-sm font-medium transition-colors";

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 pt-10" aria-label="Pagination">
      {page > 1 ? (
        <Link
          href={hrefForPage(page - 1, path)}
          className={`${btnBase} border-stone-100 bg-white px-4 text-stone-700 shadow-sm hover:border-amber-300 hover:bg-amber-50`}
        >
          Previous
        </Link>
      ) : (
        <span className={`${btnBase} cursor-not-allowed border-transparent px-4 text-stone-400`}>Previous</span>
      )}

      <div className="flex flex-wrap items-center justify-center gap-1">
        {pages.map((p) => (
          <Link
            key={p}
            href={hrefForPage(p, path)}
            className={`${btnBase} px-3 ${
              p === page
                ? "border-stone-900 bg-stone-900 text-amber-400 shadow-md"
                : "border-stone-100 bg-white text-stone-700 hover:border-amber-300 hover:bg-amber-50"
            }`}
          >
            {p}
          </Link>
        ))}
      </div>

      {page < totalPages ? (
        <Link
          href={hrefForPage(page + 1, path)}
          className={`${btnBase} border-stone-100 bg-white px-4 text-stone-700 shadow-sm hover:border-amber-300 hover:bg-amber-50`}
        >
          Next
        </Link>
      ) : (
        <span className={`${btnBase} cursor-not-allowed border-transparent px-4 text-stone-400`}>Next</span>
      )}
    </nav>
  );
}
