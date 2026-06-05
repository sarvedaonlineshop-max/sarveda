import { ProductRichText } from "@/components/product/ProductRichText";
import type { CourseSession } from "@/lib/course-sessions";

type Props = {
  sessions: CourseSession[];
};

function prettyDate(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export function CourseSessionsList({ sessions }: Props) {
  const list = sessions.filter((s) => s.name.trim());
  if (list.length === 0) return null;

  return (
    <section style={{ marginBottom: "40px" }}>
      <h2
        className="font-serif"
        style={{
          color: "var(--brand-forest)",
          fontSize: "1.5rem",
          fontWeight: 700,
          marginBottom: "24px"
        }}
      >
        Course Sessions
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {list.map((session) => {
          const teacher = session.teacherName?.trim();
          const when = session.scheduleNote?.trim() || prettyDate(session.scheduledAt);
          return (
            <article
              key={`${session.sessionId}-${session.name}`}
              style={{
                border: "1px solid var(--brand-cream-dark)",
                background: "var(--brand-ivory)",
                padding: "22px 26px"
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline" }}>
                <span
                  style={{
                    color: "var(--brand-gold)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase"
                  }}
                >
                  Session {session.sessionId || "—"}
                </span>
                {when ? (
                  <span style={{ color: "var(--brand-muted)", fontSize: "12px" }}>{when}</span>
                ) : null}
              </div>
              <h3
                className="font-serif"
                style={{
                  color: "var(--brand-forest)",
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  marginTop: "8px",
                  marginBottom: teacher ? "4px" : "12px"
                }}
              >
                {session.name}
              </h3>
              {teacher ? (
                <p style={{ color: "var(--brand-gold)", fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}>
                  By {teacher}
                </p>
              ) : null}
              {session.content?.trim() ? (
                <div className="course-session-content text-sm leading-relaxed" style={{ color: "var(--brand-ink)" }}>
                  <style>{`
                    .course-session-content ul { padding-left: 1.25rem; margin: 0.5rem 0; }
                    .course-session-content li { margin-bottom: 0.35rem; }
                    .course-session-content p { margin-bottom: 0.75rem; }
                  `}</style>
                  <ProductRichText html={session.content} />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
