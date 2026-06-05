"use client";

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export type CourseFaqForm = { question: string; answer: string };

type Props = {
  faqs: CourseFaqForm[];
  onChange: (faqs: CourseFaqForm[]) => void;
};

export function CourseFaqFields({ faqs, onChange }: Props) {
  function update(index: number, patch: Partial<CourseFaqForm>) {
    const next = [...faqs];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {faqs.map((faq, index) => (
        <div
          key={index}
          className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/60 p-4 dark:border-stone-700 dark:bg-stone-950/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              FAQ {index + 1}
            </span>
            <button
              type="button"
              disabled={faqs.length <= 1}
              onClick={() => onChange(faqs.filter((_, i) => i !== index))}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
            >
              Remove
            </button>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Question</span>
            <input
              value={faq.question}
              onChange={(e) => update(index, { question: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-stone-500">Answer</span>
            <textarea
              value={faq.answer}
              onChange={(e) => update(index, { answer: e.target.value })}
              rows={4}
              placeholder="HTML allowed"
              className={`${inputClass} font-mono text-xs`}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...faqs, { question: "", answer: "" }])}
        className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        + Add FAQ
      </button>
    </div>
  );
}
