"use client";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  onPrev: () => void;
  onNext: () => void;
};

export function AdminPagination({ page, totalPages, total, itemLabel, onPrev, onNext }: Props) {
  const safePages = Math.max(1, totalPages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-stone-500 dark:text-stone-400">
        Page {page} of {safePages} · {total} {itemLabel}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={onPrev}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700/70"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= safePages}
          onClick={onNext}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 disabled:opacity-40 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700/70"
        >
          Next
        </button>
      </div>
    </div>
  );
}
