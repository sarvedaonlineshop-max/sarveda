import type { CourseCurriculumModule } from "@/lib/course-sessions";

type Props = {
  modules: CourseCurriculumModule[];
};

function prettyDate(raw: string | null | undefined) {
  if (!raw?.trim()) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function CourseCurriculumList({ modules }: Props) {
  const list = modules.filter((m) => m.name.trim());
  if (list.length === 0) return null;

  return (
    <section className="rounded-[2rem] border border-[#eadfcf] bg-white/82 p-6 shadow-[0_22px_70px_rgba(28,53,42,0.07)] backdrop-blur-sm sm:p-8">
      <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.26em] text-[#b98a3e]">
        Curriculum
      </p>
      <h2 className="font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.04em] text-[#10201a] sm:text-[2.2rem]">
        Course modules
      </h2>
      <div className="mt-7 overflow-hidden rounded-[1.35rem] border border-[#eadfcf] bg-white shadow-[0_14px_40px_rgba(28,53,42,0.05)]">
        <div className="hidden grid-cols-[minmax(220px,1.5fr)_0.55fr_1fr_0.7fr_0.7fr] gap-4 bg-[#143426] px-5 py-4 text-left text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[#fffbf5] md:grid">
          <span>Module</span>
          <span>Hours</span>
          <span>Dates</span>
          <span>INR</span>
          <span>USD</span>
        </div>
        <div className="divide-y divide-[#eadfcf]">
          {list.map((mod, index) => (
            <div key={mod.name} className="grid gap-3 px-5 py-5 transition hover:bg-[#fffaf2] md:grid-cols-[minmax(220px,1.5fr)_0.55fr_1fr_0.7fr_0.7fr] md:gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b98a3e] md:hidden">Module</p>
                <p className="font-serif text-lg font-semibold leading-snug text-[#10201a]">
                  {index + 1}. {mod.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b98a3e] md:hidden">Hours</p>
                <p className="text-sm font-medium text-[#65766c]">{mod.hours != null ? `${mod.hours}h` : "—"}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b98a3e] md:hidden">Dates</p>
                <p className="text-sm font-medium text-[#65766c]">
                  {prettyDate(mod.startDate)}
                  {mod.endDate && mod.endDate !== mod.startDate ? ` – ${prettyDate(mod.endDate)}` : ""}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b98a3e] md:hidden">INR</p>
                <p className="text-sm font-semibold text-[#10201a] tabular-nums">
                  {mod.priceInr != null ? `₹${mod.priceInr.toLocaleString("en-IN")}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#b98a3e] md:hidden">USD</p>
                <p className="text-sm font-semibold text-[#10201a] tabular-nums">
                  {mod.priceUsd != null ? `$${mod.priceUsd}` : "—"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}