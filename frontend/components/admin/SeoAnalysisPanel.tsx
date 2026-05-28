"use client";

type SeoAnalysisPanelProps = {
  seoTitle: string;
  seoDescription: string;
  seoKeyword: string;
  productName: string;
  productDescription: string;
  slug: string;
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function scoreColor(score: number): string {
  if (score === 8) return "text-emerald-700";
  if (score >= 6) return "text-amber-700";
  if (score >= 4) return "text-orange-700";
  return "text-rose-700";
}

function scoreLabel(score: number): string {
  if (score === 8) return "Excellent SEO";
  if (score >= 6) return "Good - minor improvements";
  if (score >= 4) return "Needs improvement";
  return "Poor SEO - please fix";
}

function barClass(value: number, ranges: Array<{ min: number; max: number; cls: string }>): string {
  const range = ranges.find((r) => value >= r.min && value <= r.max);
  return range?.cls ?? "bg-rose-500";
}

export function SeoAnalysisPanel({
  seoTitle,
  seoDescription,
  seoKeyword,
  productName,
  productDescription,
  slug
}: SeoAnalysisPanelProps) {
  const title = seoTitle.trim() || productName.trim();
  const description = seoDescription.trim() || truncate(productDescription.trim(), 158);
  const keyword = seoKeyword.trim();

  const titleLen = seoTitle.trim().length;
  const descLen = seoDescription.trim().length;

  const titleProgress = Math.min(100, Math.round((titleLen / 70) * 100));
  const descProgress = Math.min(100, Math.round((descLen / 175) * 100));

  const checks = [
    {
      label: "Focus keyword in SEO title",
      check: Boolean(keyword) && normalize(seoTitle).includes(normalize(keyword)),
      required: true
    },
    {
      label: "Focus keyword in meta description",
      check: Boolean(keyword) && normalize(seoDescription).includes(normalize(keyword)),
      required: true
    },
    {
      label: "SEO title length is good (50-60 chars)",
      check: titleLen >= 50 && titleLen <= 60,
      required: true
    },
    {
      label: "Meta description length is good (120-158 chars)",
      check: descLen >= 120 && descLen <= 158,
      required: true
    },
    {
      label: "SEO title is different from product name",
      check: normalize(seoTitle) !== normalize(productName) && Boolean(seoTitle.trim()),
      required: false
    },
    {
      label: "Meta description is set",
      check: descLen > 0,
      required: true
    },
    {
      label: "Focus keyword is set",
      check: keyword.length > 0,
      required: true
    },
    {
      label: "SEO title contains brand name (Sarveda)",
      check: normalize(seoTitle).includes("sarveda"),
      required: false
    }
  ];

  const passed = checks.filter((c) => c.check).length;
  const scorePercent = Math.round((passed / checks.length) * 100);
  const titleBar = barClass(titleLen, [
    { min: 0, max: 29, cls: "bg-rose-500" },
    { min: 30, max: 49, cls: "bg-amber-500" },
    { min: 50, max: 60, cls: "bg-emerald-500" },
    { min: 61, max: 70, cls: "bg-amber-500" }
  ]);
  const descBar = barClass(descLen, [
    { min: 0, max: 79, cls: "bg-rose-500" },
    { min: 80, max: 119, cls: "bg-amber-500" },
    { min: 120, max: 158, cls: "bg-emerald-500" },
    { min: 159, max: 175, cls: "bg-amber-500" }
  ]);

  return (
    <div className="mt-6 space-y-6 rounded-xl border border-emerald-200 bg-amber-50/40 p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Google SERP Preview</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-stone-200 bg-white p-3">
            <p className="text-xs text-emerald-700">🌐 sarveda.com › product › {slug || "product-slug"}</p>
            <p className="mt-1 text-lg font-medium text-blue-700">{truncate(`${title} | Sarveda`, 65)}</p>
            <p className="mt-1 text-sm text-stone-600">{truncate(description, 158)}</p>
          </div>
          <div className="max-w-xs rounded-lg border border-stone-200 bg-white p-3">
            <p className="text-xs text-emerald-700">🌐 sarveda.com</p>
            <p className="mt-1 text-base font-medium text-blue-700">{truncate(`${title} | Sarveda`, 48)}</p>
            <p className="mt-1 text-sm text-stone-600">{truncate(description, 110)}</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Character Counters</h3>
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium text-stone-800">SEO Title: {titleLen} / 60 characters</p>
            <div className="mt-1 h-2 w-full rounded bg-stone-200">
              <div className={`h-2 rounded ${titleBar}`} style={{ width: `${titleProgress}%` }} />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-stone-800">Meta Description: {descLen} / 158 characters</p>
            <div className="mt-1 h-2 w-full rounded bg-stone-200">
              <div className={`h-2 rounded ${descBar}`} style={{ width: `${descProgress}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">SEO Analysis Checklist</h3>
        <p className={`mt-2 text-sm font-semibold ${scoreColor(passed)}`}>
          {passed}/{checks.length} checks passed - {scoreLabel(passed)}
        </p>
        <div className="mt-1 h-2 w-full rounded bg-stone-200">
          <div
            className={`h-2 rounded ${
              passed === 8 ? "bg-emerald-600" : passed >= 6 ? "bg-amber-500" : passed >= 4 ? "bg-orange-500" : "bg-rose-500"
            }`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>
        <ul className="mt-3 space-y-2">
          {checks.map((item) => (
            <li key={item.label} className="flex items-start justify-between gap-4 text-sm">
              <span className="text-stone-700">{item.label}</span>
              <span
                className={`shrink-0 font-medium ${
                  item.check ? "text-emerald-700" : item.required ? "text-rose-700" : "text-amber-700"
                }`}
              >
                {item.check ? "✅" : item.required ? "❌" : "⚠️"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
