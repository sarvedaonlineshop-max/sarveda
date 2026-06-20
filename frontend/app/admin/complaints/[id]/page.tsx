"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Attachment = { id: string; type: string; s3Url: string; fileName: string | null };
type Event = {
  id: string;
  type: string;
  authorEmail: string;
  authorType: "MEMBER" | "ADMIN";
  message: string | null;
  createdAt: string;
  attachments: Attachment[];
};
type Complaint = {
  id: string;
  raisedByEmail: string;
  raisedByName: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  createdAt: string;
  attachments: Attachment[];
  events: Event[];
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  border: "1px solid #e8e2d9",
  boxShadow: "0 1px 4px rgba(44,36,32,0.06)"
};

function AttachmentPreview({ a }: { a: Attachment }) {
  if (a.type === "image") {
    return (
      <a href={a.s3Url} target="_blank" rel="noopener noreferrer">
        <img
          src={a.s3Url}
          alt={a.fileName ?? "attachment"}
          style={{
            width: "90px",
            height: "90px",
            objectFit: "cover",
            borderRadius: "8px",
            border: "1px solid #e0d8ce"
          }}
        />
      </a>
    );
  }
  if (a.type === "video") {
    return (
      <video controls style={{ width: "160px", borderRadius: "8px", border: "1px solid #e0d8ce" }}>
        <source src={a.s3Url} />
      </video>
    );
  }
  return (
    <audio controls style={{ height: "36px" }}>
      <source src={a.s3Url} />
    </audio>
  );
}

export default function ComplaintDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/complaints/admin/${id}`, { credentials: "include" });
    if (!res.ok) {
      setComplaint(null);
      setLoading(false);
      setError("Complaint not found or access denied.");
      return;
    }
    const data = (await res.json()) as { complaint: Complaint };
    setComplaint(data.complaint);
    setNewStatus(data.complaint.status);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function handleReply() {
    if (!replyText.trim() && newStatus === complaint?.status) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/complaints/admin/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: replyText.trim() || undefined,
          newStatus: newStatus !== complaint?.status ? newStatus : undefined
        })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to send reply");
      }
      setReplyText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <p style={{ color: "#8a7060" }}>Loading...</p>;
  if (!complaint) return <p style={{ color: "#dc2626" }}>{error ?? "Complaint not found"}</p>;

  const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
    HIGH: { bg: "#fee2e2", color: "#991b1b" },
    MEDIUM: { bg: "#fef3c7", color: "#92400e" },
    LOW: { bg: "#f3f4f6", color: "#6b7280" }
  };
  const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    OPEN: { bg: "#fee2e2", color: "#991b1b" },
    IN_PROGRESS: { bg: "#dbeafe", color: "#1e40af" },
    RESOLVED: { bg: "#dcfce7", color: "#166534" },
    REOPENED: { bg: "#fef3c7", color: "#92400e" }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "900px" }}>
      <Link href="/admin/complaints" style={{ fontSize: "13px", color: "#c8960a", textDecoration: "none" }}>
        ← All complaints
      </Link>

      <div style={card}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e8e2d9" }}>
          <div style={{ display: "flex", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                background: PRIORITY_STYLE[complaint.priority]?.bg ?? "#f3f4f6",
                color: PRIORITY_STYLE[complaint.priority]?.color ?? "#6b7280",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "999px"
              }}
            >
              {complaint.priority}
            </span>
            <span
              style={{
                background: STATUS_STYLE[complaint.status]?.bg ?? "#f3f4f6",
                color: STATUS_STYLE[complaint.status]?.color ?? "#6b7280",
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "999px"
              }}
            >
              {complaint.status.replace(/_/g, " ")}
            </span>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#2c2420" }}>{complaint.title}</h1>
          <p style={{ fontSize: "13px", color: "#8a7060", marginTop: "6px" }}>
            Raised by <strong>{complaint.raisedByName ?? complaint.raisedByEmail}</strong> ({complaint.raisedByEmail})
            on{" "}
            {new Date(complaint.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
          {complaint.description && (
            <p style={{ fontSize: "14px", color: "#4a3f38", marginTop: "12px", lineHeight: 1.6 }}>
              {complaint.description}
            </p>
          )}
          {complaint.attachments.length > 0 && (
            <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
              {complaint.attachments.map((a) => (
                <AttachmentPreview key={a.id} a={a} />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "20px 24px" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#8a7060",
              marginBottom: "16px"
            }}
          >
            History
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {complaint.events.map((e) => (
              <div
                key={e.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: e.authorType === "ADMIN" ? "#f0fdf4" : "#faf8f5",
                  border: `1px solid ${e.authorType === "ADMIN" ? "#bbf7d0" : "#f0ece6"}`
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: e.authorType === "ADMIN" ? "#1e3a2f" : "#c8960a",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700
                  }}
                >
                  {e.authorEmail.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#2c2420" }}>
                      {e.authorEmail} {e.authorType === "ADMIN" ? "(Admin)" : ""}
                    </span>
                    <span style={{ fontSize: "11px", color: "#8a7060" }}>
                      {new Date(e.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  {e.type === "STATUS_CHANGE" && (
                    <p style={{ fontSize: "11px", color: "#1d4ed8", fontWeight: 600, marginTop: "2px" }}>
                      🔄 {e.message}
                    </p>
                  )}
                  {e.type === "REOPENED" && (
                    <p style={{ fontSize: "11px", color: "#c8960a", fontWeight: 600, marginTop: "2px" }}>
                      ↩ {e.message ?? "Reopened"}
                    </p>
                  )}
                  {e.type === "CREATED" && e.message && (
                    <p style={{ fontSize: "13px", color: "#4a3f38", marginTop: "4px" }}>{e.message}</p>
                  )}
                  {e.message && e.type === "COMMENT" && (
                    <p style={{ fontSize: "13px", color: "#4a3f38", marginTop: "4px" }}>{e.message}</p>
                  )}
                  {e.attachments.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" }}>
                      {e.attachments.map((a) => (
                        <AttachmentPreview key={a.id} a={a} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: "20px 24px" }}>
        <p style={{ fontSize: "13px", fontWeight: 700, color: "#2c2420", marginBottom: "12px" }}>
          Reply / Update Status
        </p>
        {error ? <p style={{ color: "#dc2626", fontSize: "13px", marginBottom: "10px" }}>{error}</p> : null}
        <textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Type your reply to the team member..."
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "1px solid #e0d8ce",
            fontSize: "13px",
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: "12px"
          }}
        />
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            style={{
              height: "38px",
              padding: "0 12px",
              borderRadius: "8px",
              border: "1px solid #e0d8ce",
              fontSize: "13px"
            }}
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="REOPENED">Reopened</option>
          </select>
          <button
            type="button"
            onClick={() => void handleReply()}
            disabled={sending}
            style={{
              height: "38px",
              padding: "0 24px",
              borderRadius: "8px",
              background: "#1e3a2f",
              color: "#fffbf5",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              opacity: sending ? 0.6 : 1
            }}
          >
            {sending ? "Sending..." : "Send Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}
