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
    <section style={{ marginBottom: "40px" }}>
      <h2
        className="font-serif"
        style={{ color: "var(--brand-forest)", fontSize: "1.5rem", fontWeight: 700, marginBottom: "20px" }}
      >
        Course Modules
      </h2>
      <div style={{ overflowX: "auto", border: "1px solid var(--brand-cream-dark)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", background: "var(--brand-ivory)" }}>
          <thead>
            <tr style={{ background: "var(--brand-forest)", color: "#fffbf5", textAlign: "left" }}>
              {["Module", "Hours", "Dates", "Price (INR)", "Price (USD)"].map((h) => (
                <th key={h} style={{ padding: "12px 14px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((mod) => (
              <tr key={mod.name} style={{ borderTop: "1px solid var(--brand-cream-dark)" }}>
                <td style={{ padding: "12px 14px", color: "var(--brand-ink)", fontWeight: 600 }}>{mod.name}</td>
                <td style={{ padding: "12px 14px", color: "var(--brand-muted)" }}>
                  {mod.hours != null ? `${mod.hours}h` : "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "var(--brand-muted)" }}>
                  {prettyDate(mod.startDate)}
                  {mod.endDate && mod.endDate !== mod.startDate ? ` – ${prettyDate(mod.endDate)}` : ""}
                </td>
                <td style={{ padding: "12px 14px", color: "var(--brand-muted)" }}>
                  {mod.priceInr != null ? `₹${mod.priceInr.toLocaleString("en-IN")}` : "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "var(--brand-muted)" }}>
                  {mod.priceUsd != null ? `$${mod.priceUsd}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
