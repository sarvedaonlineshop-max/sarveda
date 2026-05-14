"use client";

type AdminConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function AdminConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  busy,
  onConfirm,
  onClose
}: AdminConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-confirm-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-600 dark:bg-stone-900">
        <h2 id="admin-confirm-title" className="font-serif text-xl italic text-stone-900 dark:text-stone-50">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{message}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${
              danger
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-amber-500 text-stone-900 hover:bg-amber-400 dark:text-stone-950"
            }`}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
