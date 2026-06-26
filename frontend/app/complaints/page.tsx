"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────
type View = "login" | "home" | "mytasks" | "profile" 
          | "new" | "detail";
type Priority = "LOW" | "MEDIUM" | "HIGH";
type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REOPENED";
type LoginMode = "password" | "otp";

type Attachment = { 
  id: string; type: string; s3Url: string; 
  fileName: string | null; 
};
type Event = {
  id: string; type: string; authorEmail: string;
  authorType: string; message: string | null;
  createdAt: string;
};
type Task = {
  id: string; title: string; 
  description: string | null;
  priority: Priority; status: Status;
  createdAt: string; raisedByEmail: string;
  raisedByName: string | null;
  raisedByPhone?: string | null;
  attachments: Attachment[];
  events: Event[];
  children?: Task[];
};

// ── Constants ─────────────────────────────────────────
const API = "/api";

const PRIORITY_COLOR: Record<Priority, string> = {
  HIGH: "#dc2626", MEDIUM: "#d97706", LOW: "#16a34a"
};
const PRIORITY_BG: Record<Priority, string> = {
  HIGH: "#fee2e2", MEDIUM: "#fef3c7", LOW: "#dcfce7"
};
const STATUS_STYLE: Record<Status, { 
  bg: string; color: string; label: string 
}> = {
  OPEN:        { bg:"#fee2e2", color:"#991b1b", label:"Open" },
  IN_PROGRESS: { bg:"#dbeafe", color:"#1e40af", label:"In Progress" },
  RESOLVED:    { bg:"#dcfce7", color:"#166534", label:"Resolved" },
  REOPENED:    { bg:"#fef3c7", color:"#92400e", label:"Reopened" },
};

// ── Helpers ───────────────────────────────────────────
function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function Avatar({ name, email, size = 36 }: { 
  name?: string | null; email: string; size?: number 
}) {
  const initials = (name ?? email)
    .split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
  const colors = [
    ["#1e3a2f","#f5d88a"],["#1e40af","#dbeafe"],
    ["#7c3aed","#ede9fe"],["#b45309","#fef3c7"],
    ["#be123c","#ffe4e6"],
  ];
  const [bg, fg] = colors[
    email.charCodeAt(0) % colors.length
  ];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, color: fg,
      display: "flex", alignItems: "center",
      justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700,
      flexShrink: 0, letterSpacing: "-0.5px"
    }}>
      {initials}
    </div>
  );
}

function Badge({ 
  status, small 
}: { status: Status; small?: boolean }) {
  const st = STATUS_STYLE[status];
  return (
    <span style={{
      background: st.bg, color: st.color,
      fontSize: small ? "10px" : "11px",
      fontWeight: 700, padding: small ? "2px 8px" : "3px 10px",
      borderRadius: "999px", whiteSpace: "nowrap" as const
    }}>
      {st.label}
    </span>
  );
}

function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span style={{
      display: "inline-block",
      width: "8px", height: "8px",
      borderRadius: "50%",
      background: PRIORITY_COLOR[priority],
      flexShrink: 0
    }} />
  );
}

// ── Main Component ────────────────────────────────────
export default function ComplaintsPage() {
  const [view, setView] = useState<View>("login");
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [userPhone, setUserPhone] = useState("");

  // Login
  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [lEmail, setLEmail] = useState("");
  const [lPassword, setLPassword] = useState("");
  const [lOtp, setLOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loginErr, setLoginErr] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Tasks
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"OPEN" | "IN_PROGRESS" | "RESOLVED">("OPEN");

  // New task
  const [ntTitle, setNtTitle] = useState("");
  const [ntDesc, setNtDesc] = useState("");
  const [ntPriority, setNtPriority] = useState<Priority>("MEDIUM");
  const [ntFiles, setNtFiles] = useState<File[]>([]);
  const [ntSubmitting, setNtSubmitting] = useState(false);
  const [ntMsg, setNtMsg] = useState("");
  const [ntParentId, setNtParentId] = useState<string|null>(null);
  const [ntParentTitle, setNtParentTitle] = 
    useState<string|null>(null);

  // Profile
  const [profName, setProfName] = useState("");
  const [profPhone, setProfPhone] = useState("");
  const [profSaving, setProfSaving] = useState(false);
  const [profMsg, setProfMsg] = useState("");
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const prevView = useRef<View>("home");

  // ── Auth helpers ─────────────────────────────────────
  const authHeaders = useCallback((t?: string) => ({
    Authorization: `Bearer ${t ?? token ?? ""}`,
    "Content-Type": "application/json",
  }), [token]);

  useEffect(() => {
    const t = localStorage.getItem("sv_token");
    const e = localStorage.getItem("sv_email");
    const n = localStorage.getItem("sv_name");
    const p = localStorage.getItem("sv_phone");
    if (t && e) {
      setToken(t); setUserEmail(e);
      setUserName(n ?? ""); setUserPhone(p ?? "");
      setView("home");
      void loadAllTasks(t);
      void loadMyTasks(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveSession(
    t: string, email: string, 
    name: string, phone: string
  ) {
    localStorage.setItem("sv_token", t);
    localStorage.setItem("sv_email", email);
    localStorage.setItem("sv_name", name);
    localStorage.setItem("sv_phone", phone);
    setToken(t); setUserEmail(email);
    setUserName(name); setUserPhone(phone);
  }

  function logout() {
    ["sv_token","sv_email","sv_name","sv_phone"]
      .forEach(k => localStorage.removeItem(k));
    setToken(null); setView("login");
    setLEmail(""); setLPassword(""); setLOtp("");
    setOtpSent(false);
  }

  // ── API calls ─────────────────────────────────────────
  async function loadAllTasks(t: string) {
    setTasksLoading(true);
    try {
      const res = await fetch(`${API}/complaints/all`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.ok) {
        const d = await res.json() as any;
        setAllTasks(d.complaints ?? []);
      }
    } finally { setTasksLoading(false); }
  }

  async function loadMyTasks(t: string) {
    const res = await fetch(`${API}/complaints/my`, {
      headers: { Authorization: `Bearer ${t}` }
    });
    if (res.ok) {
      const d = await res.json() as any;
      setMyTasks(d.complaints ?? []);
    }
  }

  async function loadDetail(id: string, t?: string) {
    const res = await fetch(`${API}/complaints/${id}`, {
      headers: { Authorization: `Bearer ${t ?? token ?? ""}` }
    });
    const d = await res.json() as any;
    setSelected(d.complaint ?? null);
  }

  // ── Login ─────────────────────────────────────────────
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true); setLoginErr("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: lEmail.trim(), 
          password: lPassword 
        }),
      });
      const d = await res.json() as any;
      if (!res.ok) throw new Error(d.error ?? "Login failed");
      const t = d.data?.token ?? d.token;
      const u = d.data?.user ?? d.user;
      saveSession(t, u.email, u.name ?? "", u.phone ?? "");
      setView("home");
      void loadAllTasks(t);
      void loadMyTasks(t);
    } catch (err: any) {
      setLoginErr(err.message ?? "Login failed");
    } finally { setLoginLoading(false); }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true); setLoginErr("");
    try {
      const res = await fetch(`${API}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: lEmail.trim() }),
      });
      const d = await res.json() as any;
      if (!res.ok) throw new Error(d.error ?? "Failed to send OTP");
      setOtpSent(true);
    } catch (err: any) {
      setLoginErr(err.message ?? "Failed");
    } finally { setLoginLoading(false); }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoginLoading(true); setLoginErr("");
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          target: lEmail.trim(), code: lOtp.trim() 
        }),
      });
      const d = await res.json() as any;
      if (!res.ok) throw new Error(d.error ?? "Invalid OTP");
      const t = d.data?.token ?? d.token;
      const u = d.data?.user ?? d.user;
      saveSession(t, u.email, u.name ?? "", u.phone ?? "");
      setView("home");
      void loadAllTasks(t);
      void loadMyTasks(t);
    } catch (err: any) {
      setLoginErr(err.message ?? "Failed");
    } finally { setLoginLoading(false); }
  }

  // ── Submit task ────────────────────────────────────────
  async function handleSubmitTask(e: React.FormEvent) {
    e.preventDefault();
    if (!ntTitle.trim()) { 
      setNtMsg("❌ Title is required"); return; 
    }
    setNtSubmitting(true); setNtMsg("");
    try {
      const fd = new FormData();
      fd.append("title", ntTitle.trim());
      fd.append("description", ntDesc.trim());
      fd.append("priority", ntPriority);
      if (ntParentId) fd.append("parentId", ntParentId);
      ntFiles.forEach(f => fd.append("files", f));
      const res = await fetch(`${API}/complaints`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json() as any;
        throw new Error(d.error ?? "Failed");
      }
      setNtTitle(""); setNtDesc(""); 
      setNtFiles([]); setNtPriority("MEDIUM");
      setNtParentId(null); setNtParentTitle(null);
      setNtMsg("✅ Task submitted successfully!");
      void loadAllTasks(token!);
      void loadMyTasks(token!);
      setTimeout(() => { 
        setNtMsg(""); 
        setView(prevView.current); 
      }, 1500);
    } catch (err: any) {
      setNtMsg("❌ " + (err.message ?? "Failed"));
    } finally { setNtSubmitting(false); }
  }

  // ── Profile save ───────────────────────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfSaving(true); setProfMsg("");
    try {
      const res = await fetch(`${API}/auth/me`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ 
          name: profName.trim(), 
          phone: profPhone.trim() || null 
        }),
      });
      const d = await res.json() as any;
      if (!res.ok) throw new Error(d.error ?? "Failed");
      const u = d.data?.user ?? d.user;
      setUserName(u.name ?? "");
      setUserPhone(u.phone ?? "");
      localStorage.setItem("sv_name", u.name ?? "");
      localStorage.setItem("sv_phone", u.phone ?? "");
      setProfMsg("✅ Profile updated!");
    } catch (err: any) {
      setProfMsg("❌ " + (err.message ?? "Failed"));
    } finally { setProfSaving(false); }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) {
      setPwdMsg("❌ Password must be at least 8 characters");
      return;
    }
    setPwdSaving(true); setPwdMsg("");
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ 
          currentPassword: curPwd, 
          newPassword: newPwd 
        }),
      });
      if (!res.ok) {
        const d = await res.json() as any;
        throw new Error(d.error ?? "Failed");
      }
      setPwdMsg("✅ Password changed!");
      setCurPwd(""); setNewPwd("");
    } catch (err: any) {
      setPwdMsg("❌ " + (err.message ?? "Failed"));
    } finally { setPwdSaving(false); }
  }

  async function handleReopen() {
    if (!selected) return;
    await fetch(`${API}/complaints/${selected.id}/reopen`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ reason: "Task still needs attention" }),
    });
    await loadDetail(selected.id);
  }

  // ── Styles ─────────────────────────────────────────────
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f5f0ea; }
    input, textarea, select, button { 
      font-family: inherit; font-size: inherit; 
    }
    input::placeholder, textarea::placeholder { 
      color: rgba(255,255,255,0.45); 
    }
    .light-input::placeholder { color: #b8a898 !important; }
    ::-webkit-scrollbar { width: 0; }
    .task-card { 
      transition: transform 0.1s, box-shadow 0.1s; 
      cursor: pointer;
    }
    .task-card:active { 
      transform: scale(0.98); 
    }
    .tab-btn { transition: all 0.2s; }
    .nav-btn { transition: all 0.15s; }
  `;

  // ── VIEWS ─────────────────────────────────────────────

  // LOGIN VIEW
  if (view === "login") return (
    <>
      <style>{css}</style>
      <div style={{
        minHeight: "100dvh", background: "#1e3a2f",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "24px", maxWidth: "480px", margin: "0 auto"
      }}>
        {/* Logo */}
        <div style={{ marginBottom: "8px", textAlign: "center" }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "20px",
            background: "rgba(200,150,10,0.2)",
            border: "2px solid rgba(200,150,10,0.4)",
            display: "flex", alignItems: "center",
            justifyContent: "center", margin: "0 auto 16px",
            fontSize: "36px"
          }}>☸</div>
          <h1 style={{ 
            fontSize: "28px", fontWeight: 800,
            color: "#fffbf5", letterSpacing: "-0.5px"
          }}>
            Sarveda Tasks
          </h1>
          <p style={{ 
            fontSize: "14px", color: "#a8d5b5", marginTop: "6px"
          }}>
            Internal team task manager
          </p>
        </div>

        {/* Card */}
        <div style={{
          width: "100%", maxWidth: "360px",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "20px", padding: "24px", marginTop: "24px"
        }}>
          {/* Mode tabs */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: "6px", marginBottom: "20px",
            background: "rgba(0,0,0,0.2)",
            borderRadius: "10px", padding: "4px"
          }}>
            {(["password","otp"] as LoginMode[]).map(m => (
              <button key={m} onClick={() => {
                setLoginMode(m);
                setLoginErr(""); setOtpSent(false); setLOtp("");
              }}
                style={{
                  padding: "8px", borderRadius: "8px",
                  border: "none", cursor: "pointer",
                  fontSize: "13px", fontWeight: 600,
                  background: loginMode === m 
                    ? "#c8960a" : "transparent",
                  color: loginMode === m 
                    ? "#1e3a2f" : "rgba(255,255,255,0.6)",
                  transition: "all 0.2s"
                }}>
                {m === "password" ? "Password" : "OTP"}
              </button>
            ))}
          </div>

          {/* Email field (always shown) */}
          <div style={{ marginBottom: "10px" }}>
            <label style={{ 
              fontSize: "11px", fontWeight: 700,
              color: "rgba(245,216,138,0.7)",
              textTransform: "uppercase", letterSpacing: "0.1em",
              display: "block", marginBottom: "6px"
            }}>Email</label>
            <input
              type="email" value={lEmail}
              onChange={e => setLEmail(e.target.value)}
              placeholder="your@email.com"
              autoCapitalize="none" autoCorrect="off"
              style={{
                width: "100%", padding: "12px 14px",
                borderRadius: "10px", fontSize: "15px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "#fffbf5", outline: "none"
              }}
            />
          </div>

          {/* Password mode */}
          {loginMode === "password" && (
            <form onSubmit={e => void handlePasswordLogin(e)}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{
                  fontSize: "11px", fontWeight: 700,
                  color: "rgba(245,216,138,0.7)",
                  textTransform: "uppercase", letterSpacing: "0.1em",
                  display: "block", marginBottom: "6px"
                }}>Password</label>
                <input
                  type="password" value={lPassword}
                  onChange={e => setLPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: "100%", padding: "12px 14px",
                    borderRadius: "10px", fontSize: "15px",
                    border: "1px solid rgba(255,255,255,0.15)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fffbf5", outline: "none"
                  }}
                />
              </div>
              {loginErr && (
                <p style={{ 
                  color: "#fca5a5", fontSize: "13px",
                  marginBottom: "12px", textAlign: "center"
                }}>{loginErr}</p>
              )}
              <button type="submit" disabled={loginLoading}
                style={{
                  width: "100%", padding: "14px",
                  borderRadius: "12px", border: "none",
                  background: "#c8960a", color: "#1e3a2f",
                  fontWeight: 800, fontSize: "15px",
                  cursor: "pointer", letterSpacing: "0.3px"
                }}>
                {loginLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}

          {/* OTP mode */}
          {loginMode === "otp" && (
            <>
              {!otpSent ? (
                <form onSubmit={e => void handleSendOtp(e)}>
                  {loginErr && (
                    <p style={{ 
                      color: "#fca5a5", fontSize: "13px",
                      marginBottom: "12px", textAlign: "center"
                    }}>{loginErr}</p>
                  )}
                  <button type="submit" disabled={loginLoading}
                    style={{
                      width: "100%", padding: "14px",
                      borderRadius: "12px", border: "none",
                      background: "#c8960a", color: "#1e3a2f",
                      fontWeight: 800, fontSize: "15px",
                      cursor: "pointer", marginTop: "6px"
                    }}>
                    {loginLoading ? "Sending..." : "Send OTP"}
                  </button>
                </form>
              ) : (
                <form onSubmit={e => void handleVerifyOtp(e)}>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{
                      fontSize: "11px", fontWeight: 700,
                      color: "rgba(245,216,138,0.7)",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      display: "block", marginBottom: "6px"
                    }}>6-digit OTP</label>
                    <input
                      type="number" value={lOtp}
                      onChange={e => setLOtp(e.target.value)}
                      placeholder="123456" maxLength={6}
                      style={{
                        width: "100%", padding: "12px 14px",
                        borderRadius: "10px", fontSize: "24px",
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.08)",
                        color: "#fffbf5", outline: "none",
                        letterSpacing: "8px", textAlign: "center"
                      }}
                    />
                  </div>
                  {loginErr && (
                    <p style={{ 
                      color: "#fca5a5", fontSize: "13px",
                      marginBottom: "12px", textAlign: "center"
                    }}>{loginErr}</p>
                  )}
                  <button type="submit" disabled={loginLoading}
                    style={{
                      width: "100%", padding: "14px",
                      borderRadius: "12px", border: "none",
                      background: "#c8960a", color: "#1e3a2f",
                      fontWeight: 800, fontSize: "15px",
                      cursor: "pointer"
                    }}>
                    {loginLoading ? "Verifying..." : "Verify OTP"}
                  </button>
                  <button type="button"
                    onClick={e => void handleSendOtp(e as any)}
                    style={{
                      width: "100%", padding: "10px",
                      borderRadius: "10px", border: "none",
                      background: "transparent",
                      color: "#f5d88a", fontSize: "13px",
                      cursor: "pointer", marginTop: "8px",
                      fontWeight: 600
                    }}>
                    Resend OTP
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p style={{ 
          color: "rgba(168,213,181,0.6)", fontSize: "12px",
          marginTop: "24px", textAlign: "center",
          lineHeight: 1.6
        }}>
          Use your Sarveda account credentials.
          Contact admin for access.
        </p>
      </div>
    </>
  );

  // Task list component (reused in home + mytasks)
  function TaskList({ 
    tasks, loading: l 
  }: { tasks: Task[]; loading: boolean }) {
    const filtered = tasks.filter(t => {
      if (activeTab === "RESOLVED") {
        return t.status === "RESOLVED" || t.status === "REOPENED";
      }
      return t.status === activeTab;
    });

    if (l) return (
      <div style={{ 
        textAlign: "center", padding: "60px 0",
        color: "#8a7060" 
      }}>
        <div style={{ 
          fontSize: "24px", marginBottom: "8px",
          animation: "spin 1s linear infinite"
        }}>⏳</div>
        Loading...
      </div>
    );

    if (filtered.length === 0) return (
      <div style={{ 
        textAlign: "center", padding: "60px 16px"
      }}>
        <div style={{ fontSize: "48px", marginBottom: "12px" }}>
          {activeTab === "RESOLVED" ? "🎉" : "📋"}
        </div>
        <p style={{ 
          fontSize: "16px", fontWeight: 700,
          color: "#2c2420", marginBottom: "4px"
        }}>
          {activeTab === "RESOLVED" 
            ? "Nothing resolved yet" 
            : `No ${activeTab.toLowerCase().replace("_"," ")} tasks`}
        </p>
        <p style={{ fontSize: "13px", color: "#8a7060" }}>
          {activeTab === "OPEN" ? "Tap + to create a task" : ""}
        </p>
      </div>
    );

    return (
      <div style={{ 
        display: "flex", flexDirection: "column", gap: "8px"
      }}>
        {filtered.map(task => (
          <div key={task.id} className="task-card"
            onClick={async () => {
              await loadDetail(task.id);
              prevView.current = view;
              setView("detail");
            }}
            style={{
              background: "#fff", borderRadius: "14px",
              border: "1px solid #ede8e0",
              padding: "14px 16px",
              boxShadow: "0 1px 3px rgba(44,36,32,0.06)"
            }}>
            <div style={{ 
              display: "flex", alignItems: "flex-start",
              gap: "10px", marginBottom: "8px"
            }}>
              <PriorityDot priority={task.priority} />
              <p style={{
                fontSize: "14px", fontWeight: 600,
                color: "#1a1614", flex: 1, lineHeight: 1.4
              }}>
                {task.title}
              </p>
            </div>
            <div style={{ 
              display: "flex", alignItems: "center",
              gap: "8px", flexWrap: "wrap" as const
            }}>
              <Badge status={task.status} small />
              <span style={{ 
                fontSize: "10px", fontWeight: 600,
                padding: "2px 8px", borderRadius: "999px",
                background: PRIORITY_BG[task.priority],
                color: PRIORITY_COLOR[task.priority]
              }}>
                {task.priority}
              </span>
              {task.attachments.length > 0 && (
                <span style={{ 
                  fontSize: "11px", color: "#8a7060"
                }}>
                  📎 {task.attachments.length}
                </span>
              )}
              <span style={{ 
                fontSize: "11px", color: "#b8a898",
                marginLeft: "auto"
              }}>
                {timeAgo(task.createdAt)}
              </span>
            </div>
            {task.raisedByName && (
              <div style={{ 
                display: "flex", alignItems: "center",
                gap: "6px", marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid #f0ece6"
              }}>
                <Avatar 
                  name={task.raisedByName} 
                  email={task.raisedByEmail} 
                  size={20} 
                />
                <span style={{ 
                  fontSize: "11px", color: "#8a7060"
                }}>
                  {task.raisedByName}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Shared header
  function Header({ 
    title, back, onBack 
  }: { 
    title: string; back?: boolean; 
    onBack?: () => void 
  }) {
    return (
      <div style={{
        background: "#1e3a2f", padding: "14px 16px",
        display: "flex", alignItems: "center", gap: "12px",
        position: "sticky" as const, top: 0, zIndex: 50,
        borderBottom: "1px solid rgba(255,255,255,0.08)"
      }}>
        {back && (
          <button onClick={onBack}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none", color: "#f5d88a",
              width: "32px", height: "32px",
              borderRadius: "8px", cursor: "pointer",
              fontSize: "18px", display: "flex",
              alignItems: "center", justifyContent: "center",
              flexShrink: 0
            }}>
            ←
          </button>
        )}
        <h1 style={{
          fontSize: "17px", fontWeight: 700,
          color: "#fffbf5", flex: 1,
          letterSpacing: "-0.2px"
        }}>
          {title}
        </h1>
      </div>
    );
  }

  // Tab bar
  function TabBar() {
    const tabs = [
      { id: "home", label: "Home", icon: "🏠" },
      { id: "mytasks", label: "My Tasks", icon: "✅" },
      { id: "profile", label: "Profile", icon: "👤" },
    ] as const;
    return (
      <div style={{
        position: "fixed" as const, bottom: 0, left: "50%",
        transform: "translateX(-50%)",
        width: "100%", maxWidth: "480px",
        background: "#fffbf5",
        borderTop: "1px solid #e0d8ce",
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        paddingBottom: "env(safe-area-inset-bottom, 8px)",
        zIndex: 100
      }}>
        {tabs.map(t => (
          <button key={t.id} className="nav-btn"
            onClick={() => {
              if (t.id === "profile") {
                setProfName(userName);
                setProfPhone(userPhone);
              }
              setView(t.id as View);
            }}
            style={{
              padding: "10px 4px 8px",
              border: "none", background: "transparent",
              cursor: "pointer", display: "flex",
              flexDirection: "column" as const,
              alignItems: "center", gap: "3px"
            }}>
            <span style={{ fontSize: "20px" }}>{t.icon}</span>
            <span style={{
              fontSize: "10px", fontWeight: 600,
              color: view === t.id ? "#1e3a2f" : "#b8a898",
              letterSpacing: "0.03em"
            }}>
              {t.label}
            </span>
            {view === t.id && (
              <div style={{
                width: "4px", height: "4px",
                borderRadius: "50%", background: "#c8960a"
              }} />
            )}
          </button>
        ))}
      </div>
    );
  }

  // Status tabs
  function StatusTabs() {
    return (
      <div style={{
        display: "flex", gap: "6px",
        padding: "12px 16px",
        background: "#fffbf5",
        borderBottom: "1px solid #ede8e0",
        overflowX: "auto" as const,
        WebkitOverflowScrolling: "touch" as any
      }}>
        {(["OPEN","IN_PROGRESS","RESOLVED"] as const).map(s => (
          <button key={s} className="tab-btn"
            onClick={() => setActiveTab(s)}
            style={{
              padding: "7px 14px", borderRadius: "999px",
              border: "1.5px solid",
              borderColor: activeTab === s 
                ? STATUS_STYLE[s].color : "#e0d8ce",
              background: activeTab === s 
                ? STATUS_STYLE[s].bg : "#fff",
              color: activeTab === s 
                ? STATUS_STYLE[s].color : "#8a7060",
              fontSize: "12px", fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap" as const
            }}>
            {STATUS_STYLE[s].label}
          </button>
        ))}
      </div>
    );
  }

  // FAB
  function FAB() {
    return (
      <button
        onClick={() => {
          setNtParentId(null); setNtParentTitle(null);
          prevView.current = view;
          setView("new");
        }}
        style={{
          position: "fixed" as const,
          bottom: "76px", right: "16px",
          width: "54px", height: "54px",
          borderRadius: "16px", border: "none",
          background: "#1e3a2f", color: "#f5d88a",
          fontSize: "26px", cursor: "pointer",
          display: "flex", alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 16px rgba(30,58,47,0.35)",
          zIndex: 99
        }}>
        +
      </button>
    );
  }

  // HOME VIEW
  if (view === "home") return (
    <>
      <style>{css}</style>
      <div style={{ 
        minHeight: "100dvh", background: "#fdf6ed",
        paddingBottom: "80px"
      }}>
        {/* Header with greeting */}
        <div style={{
          background: "#1e3a2f",
          padding: "16px 16px 20px",
          position: "sticky" as const, top: 0, zIndex: 50
        }}>
          <div style={{ 
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: "12px"
          }}>
            <div>
              <p style={{ 
                fontSize: "13px", color: "#a8d5b5"
              }}>
                Good day,
              </p>
              <h1 style={{
                fontSize: "20px", fontWeight: 800,
                color: "#fffbf5", letterSpacing: "-0.3px"
              }}>
                {userName?.split(" ")[0] ?? "Team"} 👋
              </h1>
            </div>
            <Avatar 
              name={userName} email={userEmail} 
              size={40} 
            />
          </div>

          {/* Quick stats */}
          <div style={{ 
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: "8px"
          }}>
            {[
              { label: "Open", 
                count: allTasks.filter(
                  t => t.status==="OPEN").length,
                color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
              { label: "In Progress", 
                count: allTasks.filter(
                  t => t.status==="IN_PROGRESS").length,
                color: "#60a5fa", bg: "rgba(96,165,250,0.15)" },
              { label: "Resolved", 
                count: allTasks.filter(
                  t => t.status==="RESOLVED").length,
                color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
            ].map(s => (
              <div key={s.label} style={{
                background: s.bg, borderRadius: "10px",
                padding: "10px 8px", textAlign: "center"
              }}>
                <div style={{ 
                  fontSize: "22px", fontWeight: 800,
                  color: s.color
                }}>
                  {s.count}
                </div>
                <div style={{ 
                  fontSize: "9px", fontWeight: 600,
                  color: "rgba(255,255,255,0.6)",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.05em", marginTop: "2px"
                }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <StatusTabs />

        <div style={{ padding: "12px 16px" }}>
          <TaskList tasks={allTasks} loading={tasksLoading} />
        </div>

        <FAB />
        <TabBar />
      </div>
    </>
  );

  // MY TASKS VIEW
  if (view === "mytasks") return (
    <>
      <style>{css}</style>
      <div style={{ 
        minHeight: "100dvh", background: "#fdf6ed",
        paddingBottom: "80px"
      }}>
        <Header title="My Tasks" />
        <StatusTabs />
        <div style={{ padding: "12px 16px" }}>
          <TaskList tasks={myTasks} loading={tasksLoading} />
        </div>
        <FAB />
        <TabBar />
      </div>
    </>
  );

  // NEW TASK VIEW
  if (view === "new") return (
    <>
      <style>{css}</style>
      <div style={{ 
        minHeight: "100dvh", background: "#fdf6ed",
        paddingBottom: "40px"
      }}>
        <Header title="New Task" back
          onBack={() => setView(prevView.current)} />

        <form onSubmit={e => void handleSubmitTask(e)}
          style={{ padding: "16px" }}>

          {/* Parent task banner */}
          {ntParentTitle && (
            <div style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px", padding: "12px",
              marginBottom: "16px"
            }}>
              <p style={{ 
                fontSize: "11px", color: "#166534",
                fontWeight: 700, 
                textTransform: "uppercase" as const,
                letterSpacing: "0.08em"
              }}>
                Sub-task of
              </p>
              <p style={{ 
                fontSize: "14px", color: "#2c2420",
                fontWeight: 600, marginTop: "2px"
              }}>
                {ntParentTitle}
              </p>
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{
              fontSize: "11px", fontWeight: 700,
              color: "#8a7060", textTransform: "uppercase" as const,
              letterSpacing: "0.1em", display: "block",
              marginBottom: "8px"
            }}>
              Title *
            </label>
            <input
              className="light-input"
              value={ntTitle} 
              onChange={e => setNtTitle(e.target.value)}
              placeholder="Brief title of the task"
              style={{
                width: "100%", padding: "13px 14px",
                borderRadius: "12px", fontSize: "15px",
                border: "1.5px solid #e0d8ce",
                background: "#fff", color: "#1a1614",
                outline: "none"
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{
              fontSize: "11px", fontWeight: 700,
              color: "#8a7060", 
              textTransform: "uppercase" as const,
              letterSpacing: "0.1em", display: "block",
              marginBottom: "8px"
            }}>
              Description
            </label>
            <textarea
              className="light-input"
              value={ntDesc}
              onChange={e => setNtDesc(e.target.value)}
              placeholder="Describe the task in detail..."
              rows={4}
              style={{
                width: "100%", padding: "13px 14px",
                borderRadius: "12px", fontSize: "14px",
                border: "1.5px solid #e0d8ce",
                background: "#fff", color: "#1a1614",
                outline: "none", resize: "none" as const,
                lineHeight: 1.6
              }}
            />
          </div>

          {/* Priority */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{
              fontSize: "11px", fontWeight: 700,
              color: "#8a7060", 
              textTransform: "uppercase" as const,
              letterSpacing: "0.1em", display: "block",
              marginBottom: "8px"
            }}>
              Priority
            </label>
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr 1fr", 
              gap: "8px" 
            }}>
              {(["LOW","MEDIUM","HIGH"] as Priority[]).map(p => (
                <button key={p} type="button"
                  onClick={() => setNtPriority(p)}
                  style={{
                    padding: "10px 6px", borderRadius: "10px",
                    border: "1.5px solid",
                    borderColor: ntPriority === p 
                      ? PRIORITY_COLOR[p] : "#e0d8ce",
                    background: ntPriority === p 
                      ? PRIORITY_BG[p] : "#fff",
                    color: ntPriority === p 
                      ? PRIORITY_COLOR[p] : "#8a7060",
                    fontSize: "12px", fontWeight: 700,
                    cursor: "pointer"
                  }}>
                  {p === "LOW" ? "🟢" 
                   : p === "MEDIUM" ? "🟡" : "🔴"} {p}
                </button>
              ))}
            </div>
          </div>

          {/* Attachments */}
          <div style={{ marginBottom: "20px" }}>
            <label style={{
              fontSize: "11px", fontWeight: 700,
              color: "#8a7060", 
              textTransform: "uppercase" as const,
              letterSpacing: "0.1em", display: "block",
              marginBottom: "8px"
            }}>
              Attachments
            </label>
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr", 
              gap: "8px",
              marginBottom: "8px"
            }}>
              <label style={{
                display: "flex", alignItems: "center",
                justifyContent: "center", gap: "6px",
                padding: "11px", borderRadius: "10px",
                border: "1.5px dashed #c8960a",
                background: "rgba(200,150,10,0.04)",
                fontSize: "12px", fontWeight: 600,
                color: "#8a7060", cursor: "pointer"
              }}>
                📷 Camera
                <input type="file" accept="image/*"
                  capture="environment" hidden
                  onChange={e => {
                    if (e.target.files?.[0])
                      setNtFiles(f => [...f, e.target.files![0]]);
                  }} />
              </label>
              <label style={{
                display: "flex", alignItems: "center",
                justifyContent: "center", gap: "6px",
                padding: "11px", borderRadius: "10px",
                border: "1.5px dashed #e0d8ce",
                background: "#fafaf8",
                fontSize: "12px", fontWeight: 600,
                color: "#8a7060", cursor: "pointer"
              }}>
                🖼 Gallery
                <input type="file" 
                  accept="image/*,video/*" multiple hidden
                  onChange={e => {
                    if (e.target.files)
                      setNtFiles(f => [
                        ...f, ...Array.from(e.target.files!)
                      ]);
                  }} />
              </label>
              <label style={{
                gridColumn: "1/-1",
                display: "flex", alignItems: "center",
                justifyContent: "center", gap: "6px",
                padding: "11px", borderRadius: "10px",
                border: "1.5px dashed #e0d8ce",
                background: "#fafaf8",
                fontSize: "12px", fontWeight: 600,
                color: "#8a7060", cursor: "pointer"
              }}>
                🎤 Voice/Audio Note
                <input type="file" accept="audio/*" hidden
                  onChange={e => {
                    if (e.target.files?.[0])
                      setNtFiles(f => [...f, e.target.files![0]]);
                  }} />
              </label>
            </div>

            {/* File list */}
            {ntFiles.map((f, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center",
                gap: "10px", padding: "10px 12px",
                background: "#fff", borderRadius: "10px",
                border: "1px solid #e0d8ce",
                marginBottom: "6px"
              }}>
                <span style={{ fontSize: "18px" }}>
                  {f.type.startsWith("image") ? "🖼" 
                   : f.type.startsWith("video") ? "🎥" : "🎤"}
                </span>
                <span style={{ 
                  flex: 1, fontSize: "12px", color: "#4a3f38",
                  overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const
                }}>
                  {f.name}
                </span>
                <button type="button"
                  onClick={() => setNtFiles(
                    ntFiles.filter((_,j) => j !== i)
                  )}
                  style={{
                    background: "#fee2e2", border: "none",
                    color: "#dc2626", borderRadius: "6px",
                    width: "28px", height: "28px",
                    cursor: "pointer", fontSize: "14px",
                    display: "flex", alignItems: "center",
                    justifyContent: "center"
                  }}>
                  ✕
                </button>
              </div>
            ))}
          </div>

          {ntMsg && (
            <div style={{
              padding: "12px 14px", borderRadius: "10px",
              marginBottom: "12px",
              background: ntMsg.startsWith("✅") 
                ? "#dcfce7" : "#fee2e2",
              color: ntMsg.startsWith("✅") 
                ? "#166534" : "#991b1b",
              fontSize: "13px", fontWeight: 600,
              textAlign: "center" as const
            }}>
              {ntMsg}
            </div>
          )}

          <button type="submit" disabled={ntSubmitting}
            style={{
              width: "100%", padding: "15px",
              borderRadius: "14px", border: "none",
              background: "#1e3a2f", color: "#fffbf5",
              fontWeight: 800, fontSize: "15px",
              cursor: "pointer", letterSpacing: "0.2px",
              boxShadow: "0 4px 12px rgba(30,58,47,0.25)"
            }}>
            {ntSubmitting ? "Submitting..." : "Submit Task"}
          </button>
        </form>
      </div>
    </>
  );

  // DETAIL VIEW
  if (view === "detail" && selected) return (
    <>
      <style>{css}</style>
      <div style={{ 
        minHeight: "100dvh", background: "#fdf6ed",
        paddingBottom: "40px"
      }}>
        <Header title="Task Details" back
          onBack={() => setView(prevView.current)} />

        <div style={{ padding: "16px" }}>
          {/* Status + Priority badges */}
          <div style={{ 
            display: "flex", gap: "8px", 
            marginBottom: "14px", flexWrap: "wrap" as const
          }}>
            <Badge status={selected.status} />
            <span style={{
              background: PRIORITY_BG[selected.priority],
              color: PRIORITY_COLOR[selected.priority],
              fontSize: "11px", fontWeight: 700,
              padding: "3px 10px", borderRadius: "999px"
            }}>
              {selected.priority}
            </span>
          </div>

          {/* Title */}
          <h2 style={{
            fontSize: "20px", fontWeight: 800,
            color: "#1a1614", lineHeight: 1.3,
            marginBottom: "10px", letterSpacing: "-0.3px"
          }}>
            {selected.title}
          </h2>

          {/* Description */}
          {selected.description && (
            <p style={{
              fontSize: "14px", color: "#4a3f38",
              lineHeight: 1.7, marginBottom: "14px",
              background: "#fff", padding: "14px",
              borderRadius: "12px",
              border: "1px solid #ede8e0"
            }}>
              {selected.description}
            </p>
          )}

          {/* Raised by */}
          <div style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            background: "#fff", padding: "12px 14px",
            borderRadius: "12px", marginBottom: "14px",
            border: "1px solid #ede8e0"
          }}>
            <div style={{ 
              display: "flex", alignItems: "center", gap: "10px"
            }}>
              <Avatar 
                name={selected.raisedByName} 
                email={selected.raisedByEmail} 
                size={36} 
              />
              <div>
                <p style={{ 
                  fontSize: "13px", fontWeight: 700,
                  color: "#1a1614"
                }}>
                  {selected.raisedByName ?? selected.raisedByEmail}
                </p>
                <p style={{ 
                  fontSize: "11px", color: "#8a7060"
                }}>
                  {timeAgo(selected.createdAt)}
                </p>
              </div>
            </div>
            {selected.raisedByPhone && 
             selected.raisedByEmail !== userEmail && (
              <a href={`tel:${selected.raisedByPhone}`}
                style={{
                  display: "flex", alignItems: "center",
                  gap: "6px", padding: "8px 14px",
                  borderRadius: "8px",
                  background: "#1e3a2f", color: "#f5d88a",
                  textDecoration: "none", fontSize: "13px",
                  fontWeight: 700
                }}>
                📞 Call
              </a>
            )}
          </div>

          {/* Attachments */}
          {selected.attachments.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <p style={{
                fontSize: "11px", fontWeight: 700,
                color: "#8a7060", 
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em", marginBottom: "10px"
              }}>
                Attachments
              </p>
              <div style={{ 
                display: "flex", gap: "8px",
                flexWrap: "wrap" as const
              }}>
                {selected.attachments.map(a => (
                  a.type === "image" ? (
                    <a key={a.id} href={a.s3Url}
                       target="_blank" rel="noopener noreferrer">
                      <img src={a.s3Url} alt=""
                        style={{
                          width: "80px", height: "80px",
                          objectFit: "cover",
                          borderRadius: "10px",
                          border: "1px solid #e0d8ce"
                        }} />
                    </a>
                  ) : (
                    <a key={a.id} href={a.s3Url}
                       target="_blank" rel="noopener noreferrer"
                       style={{
                         display: "flex", alignItems: "center",
                         justifyContent: "center",
                         width: "80px", height: "80px",
                         borderRadius: "10px",
                         border: "1px solid #e0d8ce",
                         background: "#f4f1ec",
                         fontSize: "32px",
                         textDecoration: "none"
                       }}>
                      {a.type === "video" ? "🎥" : "🎤"}
                    </a>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Sub-tasks */}
          {selected.children && selected.children.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <p style={{
                fontSize: "11px", fontWeight: 700,
                color: "#8a7060",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em", marginBottom: "10px"
              }}>
                Sub-tasks ({selected.children.length})
              </p>
              {selected.children.map(child => (
                <div key={child.id} className="task-card"
                  onClick={async () => {
                    await loadDetail(child.id);
                  }}
                  style={{
                    background: "#fff", borderRadius: "12px",
                    border: "1px solid #ede8e0",
                    padding: "12px 14px", marginBottom: "8px"
                  }}>
                  <div style={{ 
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: "8px"
                  }}>
                    <p style={{ 
                      fontSize: "13px", fontWeight: 600,
                      color: "#1a1614", flex: 1
                    }}>
                      {child.title}
                    </p>
                    <Badge status={child.status} small />
                  </div>
                  <p style={{ 
                    fontSize: "11px", color: "#8a7060",
                    marginTop: "4px"
                  }}>
                    by {child.raisedByName ?? child.raisedByEmail}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Add sub-task button */}
          <button
            onClick={() => {
              setNtParentId(selected.id);
              setNtParentTitle(selected.title);
              prevView.current = "detail";
              setView("new");
            }}
            style={{
              width: "100%", padding: "12px",
              borderRadius: "12px",
              border: "1.5px dashed #c8960a",
              background: "rgba(200,150,10,0.04)",
              color: "#c8960a", fontSize: "13px",
              fontWeight: 700, cursor: "pointer",
              marginBottom: "20px",
              display: "flex", alignItems: "center",
              justifyContent: "center", gap: "6px"
            }}>
            + Add Sub-task
          </button>

          {/* Timeline */}
          <p style={{
            fontSize: "11px", fontWeight: 700,
            color: "#8a7060",
            textTransform: "uppercase" as const,
            letterSpacing: "0.1em", marginBottom: "12px"
          }}>
            History
          </p>
          {selected.events.map(ev => (
            <div key={ev.id} style={{
              padding: "12px 14px", borderRadius: "12px",
              marginBottom: "8px",
              background: ev.authorType === "ADMIN" 
                ? "#f0fdf4" : "#fff",
              border: `1px solid ${ev.authorType === "ADMIN" 
                ? "#bbf7d0" : "#ede8e0"}`
            }}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: ev.message ? "6px" : "0"
              }}>
                <div style={{ 
                  display: "flex", alignItems: "center",
                  gap: "8px"
                }}>
                  <Avatar 
                    email={ev.authorEmail} 
                    size={24} 
                  />
                  <span style={{ 
                    fontSize: "12px", fontWeight: 700,
                    color: "#1a1614"
                  }}>
                    {ev.authorEmail.split("@")[0]}
                    {ev.authorType === "ADMIN" 
                      ? " (Admin)" : ""}
                  </span>
                </div>
                <span style={{ 
                  fontSize: "11px", color: "#b8a898"
                }}>
                  {timeAgo(ev.createdAt)}
                </span>
              </div>
              {ev.message && (
                <p style={{ 
                  fontSize: "13px", color: "#4a3f38",
                  lineHeight: 1.6, marginLeft: "32px"
                }}>
                  {ev.message}
                </p>
              )}
            </div>
          ))}

          {/* Reopen button */}
          {selected.status === "RESOLVED" && (
            <button onClick={() => void handleReopen()}
              style={{
                width: "100%", padding: "14px",
                borderRadius: "12px", border: "none",
                background: "#c8960a", color: "#fff",
                fontWeight: 800, fontSize: "14px",
                cursor: "pointer", marginTop: "12px",
                boxShadow: "0 4px 12px rgba(200,150,10,0.3)"
              }}>
              ↩ Reopen This Task
            </button>
          )}
        </div>
      </div>
    </>
  );

  // PROFILE VIEW
  if (view === "profile") return (
    <>
      <style>{css}</style>
      <div style={{ 
        minHeight: "100dvh", background: "#fdf6ed",
        paddingBottom: "100px"
      }}>
        <Header title="My Profile" />

        <div style={{ padding: "16px" }}>
          {/* Avatar card */}
          <div style={{
            background: "#1e3a2f",
            borderRadius: "20px", padding: "24px",
            display: "flex", flexDirection: "column" as const,
            alignItems: "center", marginBottom: "16px"
          }}>
            <Avatar 
              name={userName} email={userEmail} 
              size={72} 
            />
            <p style={{ 
              fontSize: "18px", fontWeight: 800,
              color: "#fffbf5", marginTop: "12px",
              letterSpacing: "-0.3px"
            }}>
              {userName || "Set your name"}
            </p>
            <p style={{ 
              fontSize: "13px", color: "#a8d5b5",
              marginTop: "4px"
            }}>
              {userEmail}
            </p>
          </div>

          {/* Edit profile */}
          <div style={{
            background: "#fff", borderRadius: "16px",
            border: "1px solid #ede8e0", padding: "16px",
            marginBottom: "12px"
          }}>
            <p style={{ 
              fontSize: "13px", fontWeight: 700,
              color: "#2c2420", marginBottom: "14px"
            }}>
              Edit Profile
            </p>
            <form onSubmit={e => void handleSaveProfile(e)}>
              <label style={{
                fontSize: "11px", fontWeight: 700,
                color: "#8a7060",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em", display: "block",
                marginBottom: "6px"
              }}>
                Full Name
              </label>
              <input
                className="light-input"
                value={profName}
                onChange={e => setProfName(e.target.value)}
                placeholder="Your name"
                style={{
                  width: "100%", padding: "12px 14px",
                  borderRadius: "10px", fontSize: "14px",
                  border: "1.5px solid #e0d8ce",
                  background: "#fdf6ed", color: "#1a1614",
                  outline: "none", marginBottom: "12px"
                }}
              />
              <label style={{
                fontSize: "11px", fontWeight: 700,
                color: "#8a7060",
                textTransform: "uppercase" as const,
                letterSpacing: "0.1em", display: "block",
                marginBottom: "6px"
              }}>
                Mobile Number
              </label>
              <input
                className="light-input"
                value={profPhone}
                onChange={e => setProfPhone(e.target.value)}
                placeholder="+91 9550948778"
                type="tel"
                style={{
                  width: "100%", padding: "12px 14px",
                  borderRadius: "10px", fontSize: "14px",
                  border: "1.5px solid #e0d8ce",
                  background: "#fdf6ed", color: "#1a1614",
                  outline: "none", marginBottom: "14px"
                }}
              />
              {profMsg && (
                <p style={{
                  fontSize: "13px", fontWeight: 600,
                  color: profMsg.startsWith("✅") 
                    ? "#166534" : "#dc2626",
                  marginBottom: "10px"
                }}>
                  {profMsg}
                </p>
              )}
              <button type="submit" disabled={profSaving}
                style={{
                  width: "100%", padding: "13px",
                  borderRadius: "10px", border: "none",
                  background: "#1e3a2f", color: "#fffbf5",
                  fontWeight: 700, fontSize: "14px",
                  cursor: "pointer"
                }}>
                {profSaving ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div style={{
            background: "#fff", borderRadius: "16px",
            border: "1px solid #ede8e0", padding: "16px",
            marginBottom: "12px"
          }}>
            <p style={{ 
              fontSize: "13px", fontWeight: 700,
              color: "#2c2420", marginBottom: "14px"
            }}>
              Change Password
            </p>
            <form onSubmit={e => void handleChangePassword(e)}>
              {["Current password","New password (min 8 chars)"]
                .map((ph, i) => (
                <input key={i}
                  className="light-input"
                  type="password"
                  placeholder={ph}
                  value={i === 0 ? curPwd : newPwd}
                  onChange={e => i === 0 
                    ? setCurPwd(e.target.value) 
                    : setNewPwd(e.target.value)}
                  style={{
                    width: "100%", padding: "12px 14px",
                    borderRadius: "10px", fontSize: "14px",
                    border: "1.5px solid #e0d8ce",
                    background: "#fdf6ed", color: "#1a1614",
                    outline: "none", marginBottom: "10px"
                  }}
                />
              ))}
              {pwdMsg && (
                <p style={{
                  fontSize: "13px", fontWeight: 600,
                  color: pwdMsg.startsWith("✅") 
                    ? "#166534" : "#dc2626",
                  marginBottom: "10px"
                }}>
                  {pwdMsg}
                </p>
              )}
              <button type="submit" disabled={pwdSaving}
                style={{
                  width: "100%", padding: "13px",
                  borderRadius: "10px", border: "none",
                  background: "#1e3a2f", color: "#fffbf5",
                  fontWeight: 700, fontSize: "14px",
                  cursor: "pointer"
                }}>
                {pwdSaving ? "Changing..." : "Change Password"}
              </button>
            </form>
          </div>

          {/* Sign out */}
          <button onClick={logout}
            style={{
              width: "100%", padding: "14px",
              borderRadius: "12px",
              border: "1.5px solid #fca5a5",
              background: "#fff5f5", color: "#dc2626",
              fontWeight: 700, fontSize: "14px",
              cursor: "pointer"
            }}>
            Sign Out
          </button>
        </div>

        <TabBar />
      </div>
    </>
  );

  return null;
}