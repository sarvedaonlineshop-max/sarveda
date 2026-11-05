import { ProductRichText } from "@/components/product/ProductRichText";
import type { CourseSession } from "@/lib/course-sessions";

type Props = {
  sessions: CourseSession[];
};

function prettyDate(raw: string | null | undefined) {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function titlesOverlap(header: string, name: string): boolean {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const a = norm(header);
  const b = norm(name);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** scheduleNote often starts with "Session N – …" while we already render Session {id}. */
function formatSessionWhen(session: CourseSession): string | null {
  const note = session.scheduleNote?.trim();
  if (note) {
    const id = session.sessionId?.trim();
    const stripped = (
      id
        ? note.replace(new RegExp(`^Session\\s+${id}\\s*[–\\-·,:]?\\s*`, "i"), "")
        : note.replace(/^Session\s+\d+\s*[–\-·,:]?\s*/i, "")
    ).trim();
    return stripped || null;
  }
  return prettyDate(session.scheduledAt);
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
      <style>{`
        .course-session-card {
          border: 1px solid rgba(185, 138, 62, 0.22);
          background: var(--brand-ivory);
          padding: 20px 18px;
          border-radius: 12px;
          box-shadow:
            0 10px 24px rgba(44, 36, 32, 0.10),
            0 0 28px rgba(185, 138, 62, 0.18);
          transform: translateY(-1px);
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .course-session-card:hover {
          transform: translateY(-4px) scale(1.015);
          box-shadow:
            0 16px 36px rgba(44, 36, 32, 0.14),
            0 0 36px rgba(185, 138, 62, 0.28);
        }
        @media (prefers-reduced-motion: reduce) {
          .course-session-card,
          .course-session-card:hover {
            transform: none;
            transition: none;
          }
        }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "6px 4px" }}>
        {list.map((session) => {
          const teacher = session.teacherName?.trim();
          const when = formatSessionWhen(session);
          const header = session.header?.trim() || "";
          const eyebrow = header
            ? titlesOverlap(header, session.name)
              ? ""
              : header
            : `Session ${session.sessionId || "—"}`;
          return (
            <article
              key={`${session.sessionId}-${session.name}`}
              className="course-session-card min-w-0"
            >
              {eyebrow || when ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "baseline" }}>
                  {eyebrow ? (
                    <span
                      style={{
                        color: "var(--brand-gold)",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase"
                      }}
                    >
                      {eyebrow}
                    </span>
                  ) : null}
                  {when ? (
                    <span style={{ color: "var(--brand-muted)", fontSize: "12px" }}>
                      {eyebrow ? `· ${when}` : when}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <h3
                className="font-serif break-words"
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
                <div className="course-session-content min-w-0 break-words text-sm leading-[1.75]" style={{ color: "var(--brand-ink)" }}>
                  <style>{`
                    .course-session-content > * + * { margin-top: 0.85rem; }
                    .course-session-content h1 { font-family: var(--font-fraunces,serif); color:var(--brand-forest); font-size:1.6rem; font-weight:700; margin:1.2rem 0 0.6rem; }
                    .course-session-content h2 { font-family: var(--font-fraunces,serif); color:var(--brand-forest); font-size:1.35rem; font-weight:700; margin:1.1rem 0 0.5rem; }
                    .course-session-content h3 { font-family: var(--font-fraunces,serif); color:var(--brand-forest); font-size:1.15rem; font-weight:700; margin:1rem 0 0.45rem; }
                    .course-session-content h4 { color:var(--brand-forest); font-size:1rem; font-weight:700; margin:0.85rem 0 0.4rem; }
                    .course-session-content ul, .course-session-content ol { padding-left: 1.25rem; margin: 0.75rem 0; }
                    .course-session-content li:empty,
                    .course-session-content li:has(br:only-child) { display: none; }
                    .course-session-content li { margin-bottom: 0.45rem; line-height: 1.75; }
                    .course-session-content p { margin-bottom: 0.9rem; line-height: 1.75; }
                    .course-session-content a { color: var(--brand-gold); text-decoration: underline; }
                    .course-session-content br + br { display: block; content: ""; margin-top: 0.7rem; }
                    .course-session-content img, .course-session-content iframe { max-width: 100% !important; height: auto !important; }
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
