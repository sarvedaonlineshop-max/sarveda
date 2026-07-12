export function ShopProductsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 px-3 pt-3 sm:gap-4 md:grid-cols-3 md:px-0 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-brand-cream-dark bg-white shadow-card"
          aria-hidden
        >
          <div className="aspect-square animate-pulse bg-brand-cream-dark/60" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-4/5 animate-pulse rounded bg-brand-cream-dark/70" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-brand-cream-dark/50" />
            <div className="mt-3 h-9 animate-pulse rounded-full bg-brand-cream-dark/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
