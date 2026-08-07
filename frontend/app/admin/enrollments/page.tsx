"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminPagination } from "@/components/admin/AdminPagination";
import {
  type CourseEnrollmentFilterCourse,
  type CourseEnrollmentsListData,
  fetchAdminCourseEnrollments,
  fetchAdminEnrollmentCourses
} from "@/lib/admin-api";
import { formatMinorFromPaise } from "@/lib/money";

const card: React.CSSProperties = {
  background: "var(--admin-card-bg, #fff)",
  borderRadius: "12px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  boxShadow: "0 4px 20px rgba(28,53,42,0.08)"
};

const thSt: React.CSSProperties = {
  padding: "11px 16px",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--admin-text-muted, #8a7060)",
  background: "var(--admin-table-head, linear-gradient(180deg,#f2ede5,#f9f7f4))",
  textAlign: "left",
  whiteSpace: "nowrap"
};

const tdSt: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "13px",
  color: "var(--admin-text, #4a3f38)",
  borderBottom: "1px solid var(--admin-card-border, #f0ece6)",
  verticalAlign: "top"
};

const inputSt: React.CSSProperties = {
  height: "40px",
  padding: "0 14px",
  borderRadius: "8px",
  border: "1px solid var(--admin-card-border, #e8e2d9)",
  fontSize: "13px",
  background: "var(--admin-card-bg, #fff)",
  color: "var(--admin-text, #2c2420)",
  outline: "none",
  transition: "all 0.15s"
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "#b98a3e";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(185,138,62,0.10)";
}

function blurGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--admin-card-border, #e8e2d9)";
  e.currentTarget.style.boxShadow = "none";
}

export default function AdminEnrollmentsPage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CourseEnrollmentsListData | null>(null);
  const [courses, setCourses] = useState<CourseEnrollmentFilterCourse[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetchAdminEnrollmentCourses()
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetchAdminCourseEnrollments({
        q: search || undefined,
        courseId: courseId || undefined,
        status: status || undefined,
        page,
        limit: 25
      });
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load enrollments");
      setData(null);
    }
  }, [search, courseId, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(q.trim());
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          background: "linear-gradient(135deg, #1c352a 0%, #2d5040 100%)",
          borderRadius: "16px",
          padding: "22px 28px",
          marginBottom: "4px"
        }}
      >
        <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#faf5ec", margin: 0 }}>
          🎓 Course Enrollments
        </h1>
        <p style={{ fontSize: "13px", color: "#a8c4b0", marginTop: "4px", maxWidth: "560px" }}>
          Students who paid online and have an active enrollment record.
        </p>
      </div>

      <div
        style={{
          background: "var(--admin-card-bg, #faf9f7)",
          borderRadius: "12px",
          border: "1px solid var(--admin-card-border, #e8e2d9)",
          borderLeft: "3px solid rgba(185,138,62,0.25)",
          padding: "16px 20px",
          marginBottom: "4px",
          boxShadow: "0 2px 8px rgba(28,53,42,0.05)"
        }}
      >
        <form
          onSubmit={applyFilters}
          style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, phone, course, order #"
            style={{ ...inputSt, flex: "1 1 220px", minWidth: "200px" }}
            onFocus={focusGold}
            onBlur={blurGold}
          />
          <select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setPage(1);
            }}
            style={{ ...inputSt, flex: "1 1 200px", minWidth: "180px" }}
            onFocus={focusGold}
            onBlur={blurGold}
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.enrollmentCount > 0 ? ` (${c.enrollmentCount})` : ""}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            style={{ ...inputSt, width: "140px" }}
            onFocus={focusGold}
            onBlur={blurGold}
          >
            <option value="ACTIVE">Active</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="ALL">All statuses</option>
          </select>
          <button
            type="submit"
            style={{
              height: "40px",
              padding: "0 20px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #1c352a, #2d5040)",
              color: "#fffbf5",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(28,53,42,0.2)"
            }}
          >
            🔍 Search
          </button>
        </form>
      </div>

      {err ? (
        <p style={{ color: "#dc2626", fontSize: "13px" }} role="alert">
          {err}
        </p>
      ) : null}

      {data ? (
        <>
          <p style={{ fontSize: "13px", color: "var(--admin-text-muted, #8a7060)", fontWeight: 500 }}>
            {data.pagination.total.toLocaleString("en-IN")} enrollment
            {data.pagination.total === 1 ? "" : "s"}
            {courseId ? (
              <>
                {" "}
                for{" "}
                <strong style={{ color: "var(--admin-text, #2c2420)" }}>
                  {courses.find((c) => c.id === courseId)?.title ?? "selected course"}
                </strong>
              </>
            ) : null}
          </p>

          {data.items.length === 0 ? (
            <div
              style={{
                background: "var(--admin-card-bg, #faf9f7)",
                borderRadius: "14px",
                border: "1px solid var(--admin-card-border, #e8e2d9)",
                padding: "60px 40px",
                textAlign: "center"
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎓</div>
              <p style={{ fontSize: "15px", fontWeight: 700, color: "var(--admin-text, #2c2420)" }}>No enrollments found</p>
              <p style={{ color: "var(--admin-text-muted, #8a7060)", fontSize: "13px", marginTop: "8px" }}>
                Enrollments are created when a signed-in customer completes payment for a course with
                online checkout enabled. Guest checkouts without a matching account are not listed here.
              </p>
            </div>
          ) : (
            <div style={{ ...card, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "920px" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f0ece6" }}>
                    {["Student", "Course", "Enrolled", "Order", "Paid", "Status"].map((h) => (
                      <th key={h} style={thSt}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr
                      key={row.id}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "var(--admin-row-hover, #faf5ec)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "";
                      }}
                    >
                      <td style={tdSt}>
                        <p style={{ fontWeight: 700, color: "var(--admin-text, #2c2420)", margin: 0 }}>
                          {row.user.name?.trim() || "—"}
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--admin-text-muted, #8a7060)" }}>
                          <a href={`mailto:${row.user.email}`} style={{ color: "#b98a3e" }}>
                            {row.user.email}
                          </a>
                        </p>
                        {row.user.phone ? (
                          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--admin-text-muted, #8a7060)" }}>
                            {row.user.phone}
                          </p>
                        ) : null}
                      </td>
                      <td style={tdSt}>
                        <Link
                          href={`/course/${row.course.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontWeight: 600, color: "var(--admin-text, #2c2420)", textDecoration: "none" }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#b98a3e";
                            e.currentTarget.style.textDecoration = "underline";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--admin-text, #2c2420)";
                            e.currentTarget.style.textDecoration = "none";
                          }}
                        >
                          {row.course.title}
                        </Link>
                      </td>
                      <td style={{ ...tdSt, fontSize: "12px", color: "var(--admin-text-muted, #8a7060)", whiteSpace: "nowrap" }}>
                        {formatWhen(row.enrolledAt)}
                      </td>
                      <td style={tdSt}>
                        {row.order ? (
                          <Link
                            href={`/admin/orders/${row.order.id}`}
                            style={{
                              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                              fontSize: "12px",
                              color: "#b98a3e",
                              textDecoration: "none"
                            }}
                          >
                            {row.order.orderNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ ...tdSt, whiteSpace: "nowrap", color: "var(--admin-text, #2c2420)", fontWeight: 600 }}>
                        {row.order
                          ? formatMinorFromPaise(row.order.grandTotalInPaise, row.order.currency)
                          : "—"}
                      </td>
                      <td style={tdSt}>
                        <span
                          style={
                            row.status === "ACTIVE"
                              ? {
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: "999px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  background: "#f0fdf4",
                                  color: "#166534",
                                  border: "1px solid rgba(34,197,94,0.2)"
                                }
                              : {
                                  display: "inline-block",
                                  padding: "3px 10px",
                                  borderRadius: "999px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  background: "#fef2f2",
                                  color: "#dc2626",
                                  border: "1px solid rgba(220,38,38,0.2)"
                                }
                          }
                        >
                          {row.status === "ACTIVE" ? "● ACTIVE" : "● CANCELLED"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AdminPagination
            page={page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            itemLabel="enrollments"
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
          />
        </>
      ) : !err ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "var(--admin-text-muted, #8a7060)",
            padding: "40px 16px",
            justifyContent: "center"
          }}
          role="status"
        >
          <span style={{ fontSize: "22px" }}>🎓</span>
          <span style={{ fontSize: "14px" }}>Loading enrollments…</span>
        </div>
      ) : null}
    </div>
  );
}
