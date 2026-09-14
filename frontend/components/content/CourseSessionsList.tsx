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
    <section className="rounded-[2rem] border border-[#eadfcf] bg-white/82 p-6 shadow-[0_22px_70px_rgba(28,53,42,0.07)] backdrop-blur-sm sm:p-8">
      <p className="mb-3 text-[0.7rem] font-bold uppercase tracking-[0.26em] text-[#b98a3e]">
        Curriculum
      </p>
      <h2 className="font-serif text-[1.85rem] font-semibold leading-tight tracking-[-0.04em] text-[#10201a] sm:text-[2.2rem]">
        Course sessions
      </h2>
      <div className="mt-7 space-y-4">
        {list.map((session, index) => {
          const teacher = session.teacherName?.trim();
          const when = session.scheduleNote?.trim() || prettyDate(session.scheduledAt);
          return (
            <article
              key={`${session.sessionId}-${session.name}`}
              className="group relative overflow-hidden rounded-[1.35rem] border border-[#eadfcf] bg-[#fffaf2] p-5 shadow-[0_12px_34px_rgba(28,53,42,0.045)] transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_18px_50px_rgba(28,53,42,0.08)] sm:p-6"
            >
              <div className="absolute left-0 top-0 h-full w-1 bg-[#d4a14a] opacity-80" aria-hidden="true" />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#e1c990] bg-white font-sans text-sm font-bold text-[#9a6f2d] shadow-sm">
                  {session.sessionId || index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#edf7f0] px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#166D46]">
                      Session {session.sessionId || index + 1}
                    </span>
                    {when ? <span className="text-xs font-medium text-[#65766c]">{when}</span> : null}
                  </div>
                  <h3 className="mt-3 font-serif text-xl font-semibold leading-snug tracking-[-0.035em] text-[#10201a]">
                    {session.name}
                  </h3>
                  {teacher ? <p className="mt-1 text-sm font-semibold text-[#a1742f]">Guided by {teacher}</p> : null}
                  {session.content?.trim() ? (
                    <div className="course-session-content mt-4 min-w-0 break-words text-sm leading-7 text-[#34483e]">
                      <style>{`
                        .course-session-content ul { padding-left: 1.25rem; margin: 0.5rem 0; }
                        .course-session-content li { margin-bottom: 0.35rem; }
                        .course-session-content p { margin-bottom: 0.75rem; }
                        .course-session-content img, .course-session-content iframe { max-width: 100% !important; height: auto !important; border-radius: 18px; }
                      `}</style>
                      <ProductRichText html={session.content} />
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}