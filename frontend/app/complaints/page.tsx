"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────
type View = "login"|"home"|"assigned"|"alltasks"
           |"profile"|"new"|"detail"|"notifications";
type Priority = "LOW"|"MEDIUM"|"HIGH";
type ApiStatus = "OPEN"|"IN_PROGRESS"|"RESOLVED"|"REOPENED";
type Status = "NEW"|"IN_PROGRESS"|"CLOSED"|"REOPENED";
type LoginMode = "password"|"otp";

type Member = { email: string; name: string | null };

type Assignee = {
  id: string; assigneeEmail: string; 
  assigneeName: string | null;
};

type Attachment = {
  id: string; type: string; s3Url: string;
  fileName: string | null;
};

type TaskEvent = {
  id: string; type: string; authorEmail: string;
  authorType: string; message: string | null;
  createdAt: string;
};

type Task = {
  id: string; title: string;
  description: string | null;
  priority: Priority; status: ApiStatus;
  createdAt: string; updatedAt: string;
  raisedByEmail: string; raisedByName: string | null;
  assignedByEmail: string | null;
  assignedByName: string | null;
  assignees: Assignee[];
  attachments: Attachment[];
  events?: TaskEvent[];
  children?: Task[];
  dueDate?: string | null;
  _count?: { events: number };
};

type Notification = {
  id: string; type: string; message: string;
  taskId: string; taskTitle: string;
  isRead: boolean; createdAt: string;
};

type Stats = {
  open: number; inProgress: number;
  resolved: number; total: number;
};

// ── Constants ──────────────────────────────────────────
const API = "/api";
const LOGO_PATH = "/brand/sarveda-logo.png";

function uiStatus(raw: ApiStatus | Status): Status {
  if (raw === "OPEN") return "NEW";
  if (raw === "RESOLVED") return "CLOSED";
  if (raw === "NEW" || raw === "CLOSED") return raw;
  return raw as Status;
}

function apiStatus(ui: Status): ApiStatus {
  if (ui === "NEW") return "OPEN";
  if (ui === "CLOSED") return "RESOLVED";
  return ui as ApiStatus;
}

function taskMatchesFilter(
  taskStatus: ApiStatus,
  filter: "NEW"|"IN_PROGRESS"|"CLOSED"
): boolean {
  const u = uiStatus(taskStatus);
  if (filter === "CLOSED") return u === "CLOSED" || u === "REOPENED";
  return u === filter;
}

function isTaskClosed(status: ApiStatus): boolean {
  return status === "RESOLVED" || status === "REOPENED";
}
const PC: Record<Priority,string> = {
  HIGH:"#dc2626", MEDIUM:"#d97706", LOW:"#16a34a"
};
const PB: Record<Priority,string> = {
  HIGH:"#fee2e2", MEDIUM:"#fef3c7", LOW:"#dcfce7"
};
const SS: Record<Status,{bg:string;color:string;label:string}> = {
  NEW:         {bg:"#dcfce7",color:"#166534",label:"New"},
  IN_PROGRESS: {bg:"#dbeafe",color:"#1e40af",label:"In Progress"},
  CLOSED:      {bg:"#f3f4f6",color:"#6b7280",label:"Closed"},
  REOPENED:    {bg:"#fef3c7",color:"#92400e",label:"Reopened"},
};

// ── Utility Components ─────────────────────────────────
function timeAgo(d: string) {
  const m = Math.floor((Date.now()-new Date(d).getTime())/60000);
  if (m<1) return "just now";
  if (m<60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h<24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function Avatar({
  name,email,size=36
}:{name?:string|null;email:string;size?:number}) {
  const init = (name??email).split(" ")
    .map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const palettes = [
    ["#1e3a2f","#f5d88a"],["#1e40af","#bfdbfe"],
    ["#7c3aed","#ddd6fe"],["#b45309","#fde68a"],
    ["#be123c","#fecdd3"],["#0f766e","#99f6e4"],
  ];
  const [bg,fg] = palettes[email.charCodeAt(0)%palettes.length];
  return (
    <div style={{
      width:size,height:size,borderRadius:"50%",
      background:bg,color:fg,display:"flex",
      alignItems:"center",justifyContent:"center",
      fontSize:size*0.36,fontWeight:800,flexShrink:0,
      letterSpacing:"-0.5px",userSelect:"none"
    }}>{init}</div>
  );
}

function PriorityPill({p}:{p:Priority}) {
  return (
    <span style={{
      background:PB[p],color:PC[p],fontSize:"10px",
      fontWeight:700,padding:"2px 8px",borderRadius:"999px"
    }}>{p}</span>
  );
}

function StatusPill({
  s,small
}:{s:ApiStatus|Status;small?:boolean}) {
  const st = SS[uiStatus(s)];
  return (
    <span style={{
      background:st.bg,color:st.color,
      fontSize:small?"10px":"11px",fontWeight:700,
      padding:small?"2px 8px":"3px 10px",
      borderRadius:"999px",whiteSpace:"nowrap"
    }}>{st.label}</span>
  );
}

function AssigneeAvatars({
  assignees,max=3
}:{assignees:Assignee[];max?:number}) {
  const show = assignees.slice(0,max);
  const rest = assignees.length - max;
  return (
    <div style={{display:"flex",alignItems:"center"}}>
      {show.map((a,i) => (
        <div key={a.id}
          title={a.assigneeName??a.assigneeEmail}
          style={{
          marginLeft:i===0?0:-6,
          border:"2px solid #fff",borderRadius:"50%",
        }}>
          <Avatar
            name={a.assigneeName}
            email={a.assigneeEmail}
            size={22}
          />
        </div>
      ))}
      {rest>0 && (
        <div style={{
          width:22,height:22,borderRadius:"50%",
          background:"#e0d8ce",color:"#8a7060",
          fontSize:9,fontWeight:700,display:"flex",
          alignItems:"center",justifyContent:"center",
          marginLeft:-6,border:"2px solid #fff"
        }}>+{rest}</div>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────
export default function TasksApp() {

  // Auth state
  const [view,setView] = useState<View>("login");
  const [token,setToken] = useState<string|null>(null);
  const [myEmail,setMyEmail] = useState("");
  const [myName,setMyName] = useState("");
  const [myPhone,setMyPhone] = useState("");

  // Login state
  const [lMode,setLMode] = useState<LoginMode>("password");
  const [lEmail,setLEmail] = useState("");
  const [lPwd,setLPwd] = useState("");
  const [lOtp,setLOtp] = useState("");
  const [otpSent,setOtpSent] = useState(false);
  const [lErr,setLErr] = useState("");
  const [lLoading,setLLoading] = useState(false);

  // Data state
  const [dashTasks,setDashTasks] = useState<Task[]>([]);
  const [dashStats,setDashStats] = useState<Stats>(
    {open:0,inProgress:0,resolved:0,total:0}
  );
  const [myTasks,setMyTasks] = useState<Task[]>([]);
  const [myAssignments,setMyAssignments] = useState<Task[]>([]);
  const [members,setMembers] = useState<Member[]>([]);
  const [notifications,setNotifications] = 
    useState<Notification[]>([]);
  const [unreadCount,setUnreadCount] = useState(0);
  const [selected,setSelected] = useState<Task|null>(null);
  const [loading,setLoading] = useState(false);

  // Filter state
  const [statusFilter,setStatusFilter] =
    useState<"NEW"|"IN_PROGRESS"|"CLOSED">("NEW");

  // New task state
  const [ntTitle,setNtTitle] = useState("");
  const [ntDesc,setNtDesc] = useState("");
  const [ntPriority,setNtPriority] = useState<Priority>("MEDIUM");
  const [ntAssignees,setNtAssignees] = useState<string[]>([]);
  const [ntDueDate,setNtDueDate] = useState("");
  const [ntFiles,setNtFiles] = useState<File[]>([]);
  const [ntParentId,setNtParentId] = useState<string|null>(null);
  const [ntParentTitle,setNtParentTitle] = 
    useState<string|null>(null);
  const [ntSubmitting,setNtSubmitting] = useState(false);
  const [ntMsg,setNtMsg] = useState("");

  // Query/comment state
  const [msgInput,setMsgInput] = useState("");
  const [msgFiles,setMsgFiles] = useState<File[]>([]);
  const [querySending,setQuerySending] = useState(false);

  // WhatsApp UI state
  const [rememberMe,setRememberMe] = useState(false);
  const [ntTagged,setNtTagged] = useState<string[]>([]);
  const [showMemberPicker,setShowMemberPicker] =
    useState<"to"|"tag"|null>(null);
  const [showTaskMenu,setShowTaskMenu] = useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm] =
    useState(false);
  const [showSubtasks,setShowSubtasks] =
    useState<Record<string,boolean>>({});

  // Profile state
  const [pName,setPName] = useState("");
  const [pPhone,setPPhone] = useState("");
  const [pSaving,setPSaving] = useState(false);
  const [pMsg,setPMsg] = useState("");
  const [curPwd,setCurPwd] = useState("");
  const [newPwd,setNewPwd] = useState("");
  const [pwdMsg,setPwdMsg] = useState("");
  const [pwdSaving,setPwdSaving] = useState(false);

  // Status update state
  const [statusUpdating,setStatusUpdating] = useState(false);

  // Quick task compose (dashboard)
  const [quickTask,setQuickTask] = useState("");
  const [quickSubmitting,setQuickSubmitting] = useState(false);

  const prevView = useRef<View>("home");
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const toPickerRef = useRef<HTMLDivElement>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  // ── Helpers ──────────────────────────────────────────
  const ah = useCallback((t?:string) => ({
    Authorization:`Bearer ${t??token??""}`,
    "Content-Type":"application/json",
  }),[token]);

  function saveSession(
    t:string,email:string,name:string,phone:string,
    remember=false
  ) {
    localStorage.setItem("sv_token",t);
    localStorage.setItem("sv_email",email);
    localStorage.setItem("sv_name",name);
    localStorage.setItem("sv_phone",phone);
    if (remember) {
      const exp = Date.now()+(90*24*60*60*1000);
      localStorage.setItem("sv_expiry",String(exp));
    } else {
      localStorage.removeItem("sv_expiry");
    }
    setToken(t);setMyEmail(email);
    setMyName(name);setMyPhone(phone);
  }

  function logout() {
    ["sv_token","sv_email","sv_name","sv_phone","sv_expiry"]
      .forEach(k=>localStorage.removeItem(k));
    if (pollRef.current) clearInterval(pollRef.current);
    setToken(null);setView("login");
  }

  // ── Data loading ─────────────────────────────────────
  const loadDashboard = useCallback(async (t?:string) => {
    const tk = t??token;
    if (!tk) return;
    const r = await fetch(`${API}/complaints/dashboard`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      setDashTasks(d.tasks??[]);
      setDashStats(d.stats??
        {open:0,inProgress:0,resolved:0,total:0});
    }
  },[token]);

  const loadMyTasks = useCallback(async (t?:string) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/assigned-to-me`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      setMyTasks(d.tasks??[]);
    }
  },[token]);

  const loadMyAssignments = useCallback(async (t?:string) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/assigned-by-me`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      setMyAssignments(d.tasks??[]);
    }
  },[token]);

  const loadMembers = useCallback(async (t?:string) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/team-members`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      setMembers(d.members??[]);
    }
  },[token]);

  const loadNotifications = useCallback(async (t?:string) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/notifications`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      setNotifications(d.notifications??[]);
      setUnreadCount(d.unreadCount??0);
    }
  },[token]);

  const loadDetail = useCallback(async (
    id:string,t?:string
  ) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/${id}`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      setSelected(d.complaint??null);
    }
  },[token]);

  const loadAll = useCallback(async (t?:string) => {
    await Promise.all([
      loadDashboard(t),
      loadMyTasks(t),
      loadMyAssignments(t),
      loadMembers(t),
      loadNotifications(t),
    ]);
  },[loadDashboard,loadMyTasks,
     loadMyAssignments,loadMembers,loadNotifications]);

  // Restore session on mount
  useEffect(() => {
    const t = localStorage.getItem("sv_token");
    const e = localStorage.getItem("sv_email");
    const n = localStorage.getItem("sv_name");
    const p = localStorage.getItem("sv_phone");
    if (t&&e) {
      const expiry = localStorage.getItem("sv_expiry");
      if (expiry && Date.now() > Number(expiry)) {
        logout(); return;
      }
      setToken(t);setMyEmail(e);
      setMyName(n??"");setMyPhone(p??"");
      setView("home");
      void loadAll(t);
      // Poll notifications every 30 seconds
      pollRef.current = setInterval(
        () => void loadNotifications(t), 30000
      );
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(() => {
    if (!showTaskMenu) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (taskMenuRef.current && !taskMenuRef.current.contains(target)) {
        setShowTaskMenu(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showTaskMenu]);

  useEffect(() => {
    if (!showMemberPicker) return;
    const activeRef = showMemberPicker === "to" ? toPickerRef : tagPickerRef;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (activeRef.current && !activeRef.current.contains(target)) {
        setShowMemberPicker(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showMemberPicker]);

  // ── Auth ─────────────────────────────────────────────
  async function handleLogin(e:React.FormEvent) {
    e.preventDefault();
    setLLoading(true);setLErr("");
    try {
      const r = await fetch(`${API}/auth/login`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          email:lEmail.trim(),password:lPwd
        }),
      });
      const d = await r.json() as any;
      if (!r.ok) throw new Error(d.error??d.message??"Login failed");
      const t = d.data?.token??d.token;
      const u = d.data?.user??d.user;
      saveSession(t,u.email,u.name??"",u.phone??"",rememberMe);
      setView("home");
      void loadAll(t);
      pollRef.current = setInterval(
        ()=>void loadNotifications(t),30000
      );
    } catch(err:any) {
      setLErr(err.message??"Login failed");
    } finally { setLLoading(false); }
  }

  async function checkWhitelist(email:string): Promise<boolean> {
    try {
      const r = await fetch(`${API}/complaints/check-whitelist`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email}),
      });
      return r.ok;
    } catch { return false; }
  }

  async function handleSendOtp(e:React.FormEvent) {
    e.preventDefault();
    setLLoading(true);setLErr("");
    try {
      const allowed = await checkWhitelist(lEmail.trim());
      if (!allowed) {
        setLErr("This email is not authorised for Sarveda Tasks. Contact admin for access.");
        setLLoading(false); return;
      }
      const r = await fetch(`${API}/auth/send-otp`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({target:lEmail.trim()}),
      });
      const d = await r.json() as any;
      if (!r.ok) throw new Error(d.error??"Failed");
      setOtpSent(true);
    } catch(err:any) {
      setLErr(err.message??"Failed to send OTP");
    } finally { setLLoading(false); }
  }

  async function handleVerifyOtp(e:React.FormEvent) {
    e.preventDefault();
    setLLoading(true);setLErr("");
    try {
      const r = await fetch(`${API}/auth/verify-otp`,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          target:lEmail.trim(),code:lOtp.trim()
        }),
      });
      const d = await r.json() as any;
      if (!r.ok) throw new Error(d.error??"Invalid OTP");
      const t = d.data?.token??d.token;
      const u = d.data?.user??d.user;
      saveSession(t,u.email,u.name??"",u.phone??"",rememberMe);
      setView("home");
      void loadAll(t);
      pollRef.current = setInterval(
        ()=>void loadNotifications(t),30000
      );
    } catch(err:any) {
      setLErr(err.message??"Failed");
    } finally { setLLoading(false); }
  }

  // ── Create task ───────────────────────────────────────
  async function handleCreateTask(e:React.FormEvent) {
    e.preventDefault();
    if (!ntDesc.trim()) {
      setNtMsg("❌ Please describe the task"); return;
    }
    if (ntAssignees.length===0) {
      setNtMsg("❌ Please add at least one person in To field"); return;
    }
    setNtSubmitting(true);setNtMsg("");
    try {
      const autoTitle = ntDesc.trim()
        .split("\n")[0]
        .slice(0, 100) || "Task";
      const allAssignees = Array.from(
        new Set([...ntAssignees,...ntTagged])
      );
      const fd = new FormData();
      fd.append("title", autoTitle);
      fd.append("description",ntDesc.trim());
      fd.append("priority",ntPriority);
      if (ntParentId) fd.append("parentId",ntParentId);
      if (ntDueDate) fd.append("dueDate",ntDueDate);
      fd.append("assigneeEmails",JSON.stringify(allAssignees));
      ntFiles.forEach(f=>fd.append("files",f));
      const r = await fetch(`${API}/complaints`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd,
      });
      if (!r.ok) {
        const d = await r.json() as any;
        throw new Error(d.error??"Failed");
      }
      setNtTitle("");setNtDesc("");
      setNtFiles([]);setNtPriority("MEDIUM");
      setNtAssignees([]);setNtTagged([]);setNtDueDate("");
      setNtParentId(null);setNtParentTitle(null);
      setNtMsg("✅ Task created and assigned!");
      void loadAll();
      setTimeout(()=>{
        setNtMsg("");
        setView(prevView.current);
      },1200);
    } catch(err:any) {
      setNtMsg("❌ "+(err.message??"Failed"));
    } finally { setNtSubmitting(false); }
  }

  // ── Add query/comment ─────────────────────────────────
  async function handleAddQuery(e:React.FormEvent) {
    e.preventDefault();
    if (!msgInput.trim()&&msgFiles.length===0) return;
    setQuerySending(true);
    try {
      const fd = new FormData();
      fd.append("message",msgInput.trim());
      msgFiles.forEach(f=>fd.append("files",f));
      await fetch(`${API}/complaints/${selected?.id}/comment`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd,
      });
      setMsgInput("");setMsgFiles([]);
      if (selected) await loadDetail(selected.id);
    } finally { setQuerySending(false); }
  }

  // ── Update status ─────────────────────────────────────
  async function handleStatusUpdate(newStatus:Status) {
    if (!selected) return;
    setStatusUpdating(true);
    try {
      await fetch(`${API}/complaints/${selected.id}/status`,{
        method:"PATCH",
        headers:ah(),
        body:JSON.stringify({status:apiStatus(newStatus)}),
      });
      await loadDetail(selected.id);
      void loadAll();
    } finally { setStatusUpdating(false); }
  }

  async function handleDeleteTask() {
    if (!selected) return;
    try {
      await fetch(`${API}/complaints/${selected.id}`,{
        method:"DELETE",
        headers:{Authorization:`Bearer ${token}`},
      });
      setShowDeleteConfirm(false);
      setShowTaskMenu(false);
      setView(prevView.current);
      void loadAll();
    } catch {
      alert("Failed to delete. Try again.");
    }
  }

  // ── Mark notifications read ───────────────────────────
  async function markAllRead() {
    await fetch(`${API}/complaints/notifications/read-all`,{
      method:"PATCH",headers:ah()
    });
    void loadNotifications();
  }

  // ── Profile ───────────────────────────────────────────
  async function handleSaveProfile(e:React.FormEvent) {
    e.preventDefault();
    setPSaving(true);setPMsg("");
    try {
      const r = await fetch(`${API}/auth/me`,{
        method:"PATCH",headers:ah(),
        body:JSON.stringify({
          name:pName.trim(),
          phone:pPhone.trim()||null
        }),
      });
      const d = await r.json() as any;
      if (!r.ok) throw new Error(d.error??"Failed");
      const u = d.data?.user??d.user;
      setMyName(u.name??"");setMyPhone(u.phone??"");
      localStorage.setItem("sv_name",u.name??"");
      localStorage.setItem("sv_phone",u.phone??"");
      setPMsg("✅ Profile updated!");
    } catch(err:any) {
      setPMsg("❌ "+(err.message??"Failed"));
    } finally { setPSaving(false); }
  }

  async function submitQuickTask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !token) return;
    setQuickSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", trimmed.slice(0, 100));
      fd.append("description", trimmed);
      fd.append("priority", "MEDIUM");
      fd.append("assigneeEmails", JSON.stringify([]));
      await fetch(`${API}/complaints`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      setQuickTask("");
      void loadAll();
    } finally {
      setQuickSubmitting(false);
    }
  }

  async function handleChangePwd(e:React.FormEvent) {
    e.preventDefault();
    if (newPwd.length<8) {
      setPwdMsg("❌ Min 8 characters");return;
    }
    setPwdSaving(true);setPwdMsg("");
    try {
      const r = await fetch(`${API}/auth/change-password`,{
        method:"POST",headers:ah(),
        body:JSON.stringify({
          currentPassword:curPwd,newPassword:newPwd
        }),
      });
      if (!r.ok) {
        const d = await r.json() as any;
        throw new Error(d.error??"Failed");
      }
      setPwdMsg("✅ Password changed!");
      setCurPwd("");setNewPwd("");
    } catch(err:any) {
      setPwdMsg("❌ "+(err.message??"Failed"));
    } finally { setPwdSaving(false); }
  }

  // ── Shared UI ─────────────────────────────────────────
  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{background:#ECE5DD;
      font-family:'Inter',system-ui,sans-serif}
    .wa-bubble-in{
      background:#fff;
      border-radius:0 12px 12px 12px;
      padding:8px 10px;
      box-shadow:0 1px 2px rgba(0,0,0,.1);
      max-width:75%}
    .wa-bubble-out{
      background:#DCF8C6;
      border-radius:12px 0 12px 12px;
      padding:8px 10px;
      box-shadow:0 1px 2px rgba(0,0,0,.1);
      max-width:75%}
    .pressable{cursor:pointer;
      transition:opacity .12s}
    .pressable:active{opacity:.75}
    .input{width:100%;padding:11px 14px;
      border-radius:999px;
      border:1.5px solid #e0d8ce;
      background:#fff;color:#1a1614;
      font-size:14px;outline:none;
      font-family:inherit}
    .input:focus{border-color:#075E54}
    .dark-input{
      background:rgba(255,255,255,.1);
      border:1px solid rgba(255,255,255,.2);
      color:#fffbf5;border-radius:12px;
      padding:12px 14px;font-size:15px;
      width:100%;outline:none;
      font-family:inherit}
    .dark-input::placeholder{
      color:rgba(255,255,255,.4)}
    .input::placeholder{color:#c0b8b0}
    ::-webkit-scrollbar{width:0;height:0}
    .fade{animation:fadeIn .15s ease}
    @keyframes fadeIn{
      from{opacity:0;transform:translateY(3px)}
      to{opacity:1;transform:translateY(0)}}
    .task-row{
      background:#fff;
      border-bottom:0.5px solid #f0ece6;
      display:flex;gap:12px;
      padding:12px 16px;cursor:pointer;
      transition:background .1s}
    .task-row:active{background:#f5f5f5}
  `;

  function MainHeader() {
    return (
      <div style={{
        background:"#075E54",
        padding:"10px 16px 12px",
        position:"sticky",top:0,zIndex:50
      }}>
        <div style={{
          display:"flex",alignItems:"center",
          gap:"10px"
        }}>
          <div style={{flex:1}}>
            <p style={{
              fontSize:"16px",fontWeight:700,
              color:"#fff",margin:0,
              letterSpacing:"-0.2px",
              lineHeight:1.2
            }}>Sarveda Task Manager</p>
            <p style={{
              fontSize:"12px",
              color:"rgba(255,255,255,.75)",
              margin:0
            }}>
              Welcome {myName?.split(" ")[0]||"there"} 👋
            </p>
          </div>
          <button onClick={()=>{
            setView("notifications");
            void markAllRead();
          }} style={{
            position:"relative",
            background:"rgba(255,255,255,.12)",
            border:"none",width:38,height:38,
            borderRadius:"50%",cursor:"pointer",
            display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:"20px"
          }}>
            🔔
            {unreadCount>0&&(
              <div style={{
                position:"absolute",top:-3,right:-3,
                minWidth:17,height:17,
                borderRadius:"999px",
                background:"#dc2626",color:"#fff",
                fontSize:"9px",fontWeight:700,
                display:"flex",alignItems:"center",
                justifyContent:"center",
                padding:"0 3px",
                border:"2px solid #075E54"
              }}>
                {unreadCount>9?"9+":unreadCount}
              </div>
            )}
          </button>
        </div>
      </div>
    );
  }

  function DetailHeader({title,onBack,children}:{
    title:string;onBack:()=>void;
    children?:React.ReactNode
  }) {
    return (
      <div style={{
        background:"#075E54",
        padding:"10px 12px",
        position:"sticky",top:0,zIndex:50,
        display:"flex",alignItems:"center",gap:"10px"
      }}>
        <button onClick={onBack} style={{
          background:"none",border:"none",
          color:"#fff",fontSize:"24px",
          cursor:"pointer",padding:"0 4px",
          lineHeight:1,flexShrink:0
        }}>←</button>
        <p style={{
          fontSize:"15px",fontWeight:600,
          color:"#fff",flex:1,margin:0,
          overflow:"hidden",textOverflow:"ellipsis",
          whiteSpace:"nowrap"
        }}>{title}</p>
        {children}
      </div>
    );
  }

  function BottomNav() {
    const tabs = [
      {id:"home",icon:"🏠",label:"Home"},
      {id:"assigned",icon:"📤",label:"Assigned"},
      {id:"alltasks",icon:"📋",label:"All Tasks"},
      {id:"profile",icon:"👤",label:"Profile"},
    ] as const;
    return (
      <div style={{
        position:"fixed",bottom:0,
        left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:"480px",
        background:"#fff",
        borderTop:"1px solid #e0d8ce",
        display:"grid",
        gridTemplateColumns:"repeat(4,1fr)",
        paddingBottom:
          "env(safe-area-inset-bottom,4px)",
        zIndex:100
      }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{
            if (t.id==="profile") {
              setPName(myName);setPPhone(myPhone);
            }
            setView(t.id as View);
          }} style={{
            padding:"8px 4px 6px",border:"none",
            background:"transparent",cursor:"pointer",
            display:"flex",flexDirection:"column",
            alignItems:"center",gap:"2px"
          }}>
            <span style={{fontSize:"20px"}}>
              {t.icon}
            </span>
            <span style={{
              fontSize:"10px",fontWeight:600,
              color:view===t.id
                ?"#075E54":"#8a7060"
            }}>{t.label}</span>
            {view===t.id&&(
              <div style={{
                width:"24px",height:"3px",
                borderRadius:"999px",
                background:"#075E54"
              }}/>
            )}
          </button>
        ))}
      </div>
    );
  }

  function StatusTabs() {
    const tabs = [
      {v:"NEW",label:"New"},
      {v:"IN_PROGRESS",label:"In Progress"},
      {v:"CLOSED",label:"Closed"},
    ] as const;
    return (
      <div style={{
        display:"flex",gap:"6px",
        padding:"8px 16px",
        background:"#075E54",
        overflowX:"auto"
      }}>
        {tabs.map(t=>(
          <button key={t.v}
            onClick={()=>setStatusFilter(t.v)}
            style={{
              padding:"6px 16px",
              borderRadius:"999px",
              border:"none",
              background:statusFilter===t.v
                ?"#fff"
                :"rgba(255,255,255,.2)",
              color:statusFilter===t.v
                ?"#075E54":"#fff",
              fontSize:"12px",fontWeight:700,
              cursor:"pointer",whiteSpace:"nowrap"
            }}>
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  function TaskCard({
    task,onClick,isAssignment
  }:{task:Task;onClick:()=>void;isAssignment?:boolean}) {
    const overdue = task.dueDate &&
      !isTaskClosed(task.status) &&
      new Date(task.dueDate)<new Date();
    const assignerName =
      task.assignedByEmail===myEmail
        ?"You"
        :(task.assignedByName??
          task.assignedByEmail?.split("@")[0]??
          task.raisedByName??
          task.raisedByEmail.split("@")[0]);

    return (
      <div className="task-row pressable fade"
        onClick={onClick}>
        <div style={{
          width:48,height:48,borderRadius:"50%",
          background:PB[task.priority],
          border:`2px solid ${PC[task.priority]}`,
          display:"flex",alignItems:"center",
          justifyContent:"center",flexShrink:0,
          fontSize:"13px",fontWeight:800,
          color:PC[task.priority]
        }}>
          {task.priority[0]}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{
            display:"flex",
            justifyContent:"space-between",
            alignItems:"flex-start",
            marginBottom:"3px"
          }}>
            <p style={{
              fontSize:"15px",fontWeight:500,
              color:"#1a1614",margin:0,flex:1,
              overflow:"hidden",
              textOverflow:"ellipsis",
              whiteSpace:"nowrap",
              paddingRight:"8px"
            }}>{task.title}</p>
            <div style={{
              display:"flex",flexDirection:"column",
              alignItems:"flex-end",gap:"3px",
              flexShrink:0
            }}>
              <span style={{
                fontSize:"11px",color:"#8a7060"
              }}>
                {timeAgo(task.updatedAt)}
              </span>
              {overdue&&(
                <span style={{
                  fontSize:"9px",fontWeight:700,
                  color:"#dc2626",
                  background:"#fee2e2",
                  padding:"1px 6px",
                  borderRadius:"999px"
                }}>Overdue</span>
              )}
            </div>
          </div>
          <div style={{
            display:"flex",alignItems:"center",
            justifyContent:"space-between"
          }}>
            <p style={{
              fontSize:"13px",color:"#8a7060",
              margin:0,flex:1,overflow:"hidden",
              textOverflow:"ellipsis",
              whiteSpace:"nowrap"
            }}>
              {isAssignment
                ?`You → ${task.assignees.map(a=>
                    a.assigneeName??
                    a.assigneeEmail.split("@")[0]
                  ).join(", ")||"(unassigned)"}`
                :`${assignerName} • ${
                    task.description?.slice(0,35)||
                    "No description"
                  }${(task.description?.length||0)>35
                    ?"...":""}`
              }
            </p>
            <div style={{
              display:"flex",alignItems:"center",
              gap:"6px",flexShrink:0,marginLeft:"8px"
            }}>
              {(task._count?.events||0)>0&&(
                <span style={{
                  fontSize:"11px",color:"#8a7060"
                }}>
                  💬{task._count!.events}
                </span>
              )}
              <StatusPill s={task.status} small/>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function FAB({
    parentId,parentTitle
  }:{parentId?:string;parentTitle?:string}) {
    return (
      <button onClick={()=>{
        setNtParentId(parentId??null);
        setNtParentTitle(parentTitle??null);
        prevView.current=view;
        setView("new");
      }} style={{
        position:"fixed",bottom:"76px",right:"16px",
        width:"52px",height:"52px",borderRadius:"50%",
        border:"none",background:"#25D366",
        color:"#fff",fontSize:"26px",
        cursor:"pointer",display:"flex",
        alignItems:"center",justifyContent:"center",
        boxShadow:"0 4px 16px rgba(37,211,102,.35)",
        zIndex:90
      }}>+</button>
    );
  }

  // ── LOGIN VIEW ────────────────────────────────────────
  if (view==="login") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#075E54",
        display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",
        padding:"24px",maxWidth:"480px",margin:"0 auto"
      }}>
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <div style={{
            width:80,height:80,borderRadius:"20px",
            overflow:"hidden",margin:"0 auto 16px",
            border:"2px solid rgba(200,150,10,.4)",
            background:"rgba(0,0,0,.2)"
          }}>
            <img src={LOGO_PATH} alt="Sarveda"
              style={{
                width:"100%",height:"100%",
                objectFit:"cover"
              }}/>
          </div>
          <h1 style={{
            fontSize:"30px",fontWeight:900,
            color:"#fffbf5",letterSpacing:"-0.5px"
          }}>Sarveda Task Manager</h1>
          <p style={{
            fontSize:"14px",color:"#a8d5b5",marginTop:"6px"
          }}>Team task management</p>
        </div>

        {/* Login card */}
        <div style={{
          width:"100%",maxWidth:"360px",
          background:"rgba(255,255,255,.07)",
          border:"1px solid rgba(255,255,255,.12)",
          borderRadius:"24px",padding:"24px"
        }}>
          {/* Mode switcher */}
          <div style={{
            display:"grid",gridTemplateColumns:"1fr 1fr",
            gap:"6px",marginBottom:"20px",
            background:"rgba(0,0,0,.25)",
            borderRadius:"12px",padding:"4px"
          }}>
            {(["password","otp"] as LoginMode[]).map(m=>(
              <button key={m} onClick={()=>{
                setLMode(m);setLErr("");
                setOtpSent(false);setLOtp("");
              }} style={{
                padding:"9px",borderRadius:"9px",
                border:"none",cursor:"pointer",
                fontSize:"13px",fontWeight:700,
                background:lMode===m
                  ?"#c8960a":"transparent",
                color:lMode===m
                  ?"#1e3a2f":"rgba(255,255,255,.55)",
                transition:"all .2s"
              }}>
                {m==="password"?"🔑 Password":"📱 OTP"}
              </button>
            ))}
          </div>

          {/* Email */}
          <div style={{marginBottom:"12px"}}>
            <label style={{
              fontSize:"11px",fontWeight:700,
              color:"rgba(245,216,138,.7)",
              textTransform:"uppercase",
              letterSpacing:"0.1em",
              display:"block",marginBottom:"6px"
            }}>Email</label>
            <input className="dark-input"
              type="email" value={lEmail}
              onChange={e=>setLEmail(e.target.value)}
              placeholder="your@email.com"
              autoCapitalize="none"/>
          </div>

          {lMode==="password"?(
            <form onSubmit={e=>void handleLogin(e)}>
              <div style={{marginBottom:"16px"}}>
                <label style={{
                  fontSize:"11px",fontWeight:700,
                  color:"rgba(245,216,138,.7)",
                  textTransform:"uppercase",
                  letterSpacing:"0.1em",
                  display:"block",marginBottom:"6px"
                }}>Password</label>
                <input className="dark-input"
                  type="password" value={lPwd}
                  onChange={e=>setLPwd(e.target.value)}
                  placeholder="••••••••"/>
              </div>
              {lErr&&<p style={{
                color:"#fca5a5",fontSize:"13px",
                marginBottom:"12px",textAlign:"center"
              }}>{lErr}</p>}
              <div style={{
                display:"flex",alignItems:"center",
                gap:"8px",marginBottom:"12px"
              }}>
                <input type="checkbox" id="rm"
                  checked={rememberMe}
                  onChange={e=>setRememberMe(e.target.checked)}
                  style={{
                    width:16,height:16,cursor:"pointer",
                    accentColor:"#25D366"
                  }}/>
                <label htmlFor="rm" style={{
                  fontSize:"13px",
                  color:"rgba(255,255,255,.7)",
                  cursor:"pointer"
                }}>Remember me for 90 days</label>
              </div>
              <button type="submit" disabled={lLoading}
                style={{
                  width:"100%",padding:"14px",
                  borderRadius:"14px",border:"none",
                  background:"#25D366",color:"#fff",
                  fontWeight:900,fontSize:"15px",
                  cursor:"pointer"
                }}>
                {lLoading?"Signing in...":"Sign in →"}
              </button>
            </form>
          ):(
            <>
              {!otpSent?(
                <form onSubmit={e=>void handleSendOtp(e)}>
                  {lErr&&<p style={{
                    color:"#fca5a5",fontSize:"13px",
                    marginBottom:"12px",textAlign:"center"
                  }}>{lErr}</p>}
                  <div style={{
                    display:"flex",alignItems:"center",
                    gap:"8px",marginBottom:"12px"
                  }}>
                    <input type="checkbox" id="rm-otp"
                      checked={rememberMe}
                      onChange={e=>setRememberMe(e.target.checked)}
                      style={{
                        width:16,height:16,cursor:"pointer",
                        accentColor:"#25D366"
                      }}/>
                    <label htmlFor="rm-otp" style={{
                      fontSize:"13px",
                      color:"rgba(255,255,255,.7)",
                      cursor:"pointer"
                    }}>Remember me for 90 days</label>
                  </div>
                  <button type="submit"
                    disabled={lLoading} style={{
                    width:"100%",padding:"14px",
                    borderRadius:"14px",border:"none",
                    background:"#25D366",color:"#fff",
                    fontWeight:900,fontSize:"15px",
                    cursor:"pointer",marginTop:"6px"
                  }}>
                    {lLoading
                      ?"Sending...":"Send OTP →"}
                  </button>
                </form>
              ):(
                <form onSubmit={e=>void handleVerifyOtp(e)}>
                  <div style={{marginBottom:"16px"}}>
                    <label style={{
                      fontSize:"11px",fontWeight:700,
                      color:"rgba(245,216,138,.7)",
                      textTransform:"uppercase",
                      letterSpacing:"0.1em",
                      display:"block",marginBottom:"6px"
                    }}>Enter OTP</label>
                    <input className="dark-input"
                      type="number" value={lOtp}
                      onChange={e=>setLOtp(e.target.value)}
                      placeholder="123456"
                      maxLength={6}
                      style={{
                        letterSpacing:"8px",
                        textAlign:"center",
                        fontSize:"24px"
                      }}/>
                  </div>
                  {lErr&&<p style={{
                    color:"#fca5a5",fontSize:"13px",
                    marginBottom:"12px",textAlign:"center"
                  }}>{lErr}</p>}
                  <button type="submit"
                    disabled={lLoading} style={{
                    width:"100%",padding:"14px",
                    borderRadius:"14px",border:"none",
                    background:"#25D366",color:"#fff",
                    fontWeight:900,fontSize:"15px",
                    cursor:"pointer"
                  }}>
                    {lLoading?"Verifying...":"Verify →"}
                  </button>
                  <button type="button"
                    onClick={e=>void handleSendOtp(e as any)}
                    style={{
                      width:"100%",padding:"10px",
                      border:"none",background:"transparent",
                      color:"#f5d88a",fontSize:"13px",
                      cursor:"pointer",marginTop:"8px",
                      fontWeight:600
                    }}>
                    Resend OTP
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p style={{
          color:"rgba(168,213,181,.55)",fontSize:"12px",
          marginTop:"24px",textAlign:"center",lineHeight:1.6
        }}>
          Sarveda internal team tool.
          Contact admin for access.
        </p>
      </div>
    </>
  );

  // ── HOME VIEW ────────────────────────────────────────
  if (view==="home") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#ECE5DD",
        paddingBottom:"80px"
      }}>
        <MainHeader/>
        <StatusTabs/>
        <div>
          {myTasks.length===0?(
            <div style={{
              textAlign:"center",padding:"60px 16px",
              color:"#8a7060"
            }}>
              <div style={{
                fontSize:"48px",marginBottom:"12px"
              }}>🎯</div>
              <p style={{
                fontSize:"16px",fontWeight:700,
                color:"#2c2420",marginBottom:"4px"
              }}>No tasks yet</p>
              <p style={{fontSize:"13px"}}>
                Tap + to create your first task
              </p>
            </div>
          ):(
            myTasks
              .filter(t=>taskMatchesFilter(t.status,statusFilter))
              .map(t=>(
                <TaskCard key={t.id} task={t}
                  onClick={async()=>{
                    setLoading(true);
                    await loadDetail(t.id);
                    setLoading(false);
                    prevView.current="home";
                    setView("detail");
                  }}/>
              ))
          )}
        </div>
        <FAB/>
        <BottomNav/>
      </div>
    </>
  );

  // ── ASSIGNED VIEW ─────────────────────────────────────
  if (view==="assigned") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#ECE5DD",
        paddingBottom:"80px"
      }}>
        <MainHeader/>
        <StatusTabs/>
        <div>
          {myAssignments.length===0?(
            <div style={{
              textAlign:"center",padding:"60px 16px",
              color:"#8a7060"
            }}>
              <div style={{
                fontSize:"48px",marginBottom:"12px"
              }}>📤</div>
              <p style={{
                fontSize:"16px",fontWeight:700,
                color:"#2c2420",marginBottom:"4px"
              }}>No assignments yet</p>
              <p style={{fontSize:"13px"}}>
                Tap + to assign a task to a team member
              </p>
            </div>
          ):(
            myAssignments
              .filter(t=>taskMatchesFilter(t.status,statusFilter))
              .map(t=>(
                <TaskCard key={t.id} task={t}
                  isAssignment
                  onClick={async()=>{
                    await loadDetail(t.id);
                    prevView.current="assigned";
                    setView("detail");
                  }}/>
              ))
          )}
        </div>
        <FAB/>
        <BottomNav/>
      </div>
    </>
  );

  // ── ALL TASKS VIEW ────────────────────────────────────
  if (view==="alltasks") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#ECE5DD",
        paddingBottom:"80px"
      }}>
        <MainHeader/>
        <div style={{
          background:"#128C7E",
          padding:"8px 16px",
          display:"grid",
          gridTemplateColumns:"repeat(4,1fr)",gap:"6px"
        }}>
          {[
            {n:dashStats.total,l:"Total",c:"#fff"},
            {n:dashStats.open,l:"New",c:"#86efac"},
            {n:dashStats.inProgress,l:"Active",c:"#93c5fd"},
            {n:dashStats.resolved,l:"Closed",c:"#d1d5db"},
          ].map(s=>(
            <div key={s.l} style={{
              textAlign:"center",
              background:"rgba(0,0,0,.15)",
              borderRadius:"8px",padding:"6px 4px"
            }}>
              <div style={{
                fontSize:"18px",fontWeight:700,color:s.c
              }}>{s.n}</div>
              <div style={{
                fontSize:"9px",color:"rgba(255,255,255,.7)",
                fontWeight:600
              }}>{s.l}</div>
            </div>
          ))}
        </div>
        <StatusTabs/>
        <div>
          {dashTasks.length===0?(
            <div style={{
              textAlign:"center",padding:"60px 16px",
              color:"#8a7060"
            }}>
              <div style={{
                fontSize:"48px",marginBottom:"12px"
              }}>📋</div>
              <p style={{
                fontSize:"16px",fontWeight:700,
                color:"#2c2420"
              }}>No tasks found</p>
            </div>
          ):(
            dashTasks
              .filter(t=>taskMatchesFilter(t.status,statusFilter))
              .map(t=>(
                <TaskCard key={t.id} task={t}
                  onClick={async()=>{
                    await loadDetail(t.id);
                    prevView.current="alltasks";
                    setView("detail");
                  }}/>
              ))
          )}
        </div>
        <FAB/>
        <BottomNav/>
      </div>
    </>
  );

  // ── NEW TASK VIEW ─────────────────────────────────────
  if (view==="new") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#fff",
        paddingBottom:"40px"
      }}>
        <DetailHeader
          title={ntParentId?"Add Sub-task":"New Task"}
          onBack={()=>setView(prevView.current)}
        />

        <form onSubmit={e=>void handleCreateTask(e)}
          style={{padding:"16px"}}>

          {ntParentTitle&&(
            <div className="fade" style={{
              background:"#e7f8ef",
              borderLeft:"4px solid #25D366",
              borderRadius:"8px",padding:"10px 14px",
              marginBottom:"16px"
            }}>
              <p style={{
                fontSize:"11px",color:"#075E54",
                fontWeight:700,margin:0
              }}>↳ Sub-task of</p>
              <p style={{
                fontSize:"14px",color:"#1a1614",
                fontWeight:600,margin:"2px 0 0"
              }}>{ntParentTitle}</p>
            </div>
          )}

          {/* TO field */}
          <div ref={toPickerRef}
            style={{marginBottom:"14px",position:"relative"}}>
            <div style={{
              display:"flex",alignItems:"flex-start",gap:"10px",
              borderBottom:"1px solid #e0d8ce",
              paddingBottom:"10px"
            }}>
              <span style={{
                fontSize:"13px",fontWeight:700,
                color:"#075E54",paddingTop:"6px",
                minWidth:"32px"
              }}>To</span>
              <div style={{
                flex:1,display:"flex",flexWrap:"wrap",
                gap:"6px",alignItems:"center"
              }}>
                {ntAssignees.map(email=>{
                  const m = members.find(x=>x.email===email);
                  return (
                    <span key={email} style={{
                      display:"inline-flex",alignItems:"center",
                      gap:"4px",background:"#e7f8ef",
                      borderRadius:"999px",padding:"3px 8px 3px 3px",
                      fontSize:"12px",fontWeight:600,color:"#075E54"
                    }}>
                      <Avatar
                        name={m?.name} email={email} size={22}/>
                      {m?.name??email.split("@")[0]}
                      <button type="button"
                        onClick={()=>setNtAssignees(
                          ntAssignees.filter(e=>e!==email)
                        )}
                        style={{
                          background:"none",border:"none",
                          color:"#075E54",cursor:"pointer",
                          fontSize:"14px",lineHeight:1,padding:0
                        }}>×</button>
                    </span>
                  );
                })}
                <button type="button"
                  onClick={()=>setShowMemberPicker(
                    showMemberPicker==="to"?null:"to"
                  )}
                  style={{
                    background:"none",border:"none",
                    color:"#25D366",fontSize:"13px",
                    fontWeight:600,cursor:"pointer",padding:"4px 0"
                  }}>
                  {ntAssignees.length===0?"+ Add people":"+ Add"}
                </button>
              </div>
            </div>
            {showMemberPicker==="to"&&(
              <div style={{
                position:"absolute",left:0,right:0,top:"100%",
                marginTop:"4px",background:"#fff",
                border:"1px solid #e0d8ce",
                borderRadius:"12px",boxShadow:"0 8px 24px rgba(0,0,0,.12)",
                maxHeight:"220px",overflowY:"auto",zIndex:60
              }}>
                <div style={{
                  display:"flex",alignItems:"center",
                  justifyContent:"space-between",
                  padding:"8px 12px",
                  borderBottom:"1px solid #f0ece6",
                  position:"sticky",top:0,background:"#fff",
                  borderRadius:"12px 12px 0 0"
                }}>
                  <span style={{
                    fontSize:"12px",fontWeight:700,
                    color:"#8a7060"
                  }}>Select people</span>
                  <button type="button"
                    onClick={()=>setShowMemberPicker(null)}
                    style={{
                      background:"none",border:"none",
                      color:"#8a7060",cursor:"pointer",
                      fontSize:"18px",lineHeight:1,padding:"0 4px"
                    }}>×</button>
                </div>
                {members
                  .filter(m=>m.email!==myEmail)
                  .map(m=>{
                    const sel = ntAssignees.includes(m.email);
                    return (
                      <div key={m.email}
                        onClick={()=>{
                          setNtAssignees(sel
                            ?ntAssignees.filter(e=>e!==m.email)
                            :[...ntAssignees,m.email]);
                        }}
                        style={{
                          display:"flex",alignItems:"center",
                          gap:"10px",padding:"10px 14px",
                          cursor:"pointer",
                          background:sel?"#e7f8ef":"transparent"
                        }}>
                        <Avatar name={m.name} email={m.email} size={32}/>
                        <div style={{flex:1}}>
                          <p style={{
                            fontSize:"13px",fontWeight:600,
                            color:"#1a1614",margin:0
                          }}>
                            {m.name??m.email.split("@")[0]}
                          </p>
                          <p style={{
                            fontSize:"11px",color:"#8a7060",margin:0
                          }}>{m.email}</p>
                        </div>
                        {sel&&<span style={{color:"#25D366"}}>✓</span>}
                      </div>
                    );
                  })}
                {members.filter(m=>m.email!==myEmail).length===0&&(
                  <p style={{
                    padding:"16px",textAlign:"center",
                    color:"#8a7060",fontSize:"13px"
                  }}>No team members found</p>
                )}
              </div>
            )}
          </div>

          {/* TAG field */}
          <div ref={tagPickerRef}
            style={{marginBottom:"16px",position:"relative"}}>
            <div style={{
              display:"flex",alignItems:"flex-start",gap:"10px",
              borderBottom:"1px solid #e0d8ce",
              paddingBottom:"10px"
            }}>
              <span style={{
                fontSize:"13px",fontWeight:700,
                color:"#075E54",paddingTop:"6px",
                minWidth:"32px"
              }}>Tag</span>
              <div style={{
                flex:1,display:"flex",flexWrap:"wrap",
                gap:"6px",alignItems:"center"
              }}>
                {ntTagged.map(email=>{
                  const m = members.find(x=>x.email===email);
                  return (
                    <span key={email} style={{
                      display:"inline-flex",alignItems:"center",
                      gap:"4px",background:"#fef3c7",
                      borderRadius:"999px",padding:"3px 8px 3px 3px",
                      fontSize:"12px",fontWeight:600,color:"#92400e"
                    }}>
                      <Avatar
                        name={m?.name} email={email} size={22}/>
                      {m?.name??email.split("@")[0]}
                      <button type="button"
                        onClick={()=>setNtTagged(
                          ntTagged.filter(e=>e!==email)
                        )}
                        style={{
                          background:"none",border:"none",
                          color:"#92400e",cursor:"pointer",
                          fontSize:"14px",lineHeight:1,padding:0
                        }}>×</button>
                    </span>
                  );
                })}
                <button type="button"
                  onClick={()=>setShowMemberPicker(
                    showMemberPicker==="tag"?null:"tag"
                  )}
                  style={{
                    background:"none",border:"none",
                    color:"#d97706",fontSize:"13px",
                    fontWeight:600,cursor:"pointer",padding:"4px 0"
                  }}>
                  {ntTagged.length===0?"+ Tag people":"+ Add"}
                </button>
              </div>
            </div>
            {showMemberPicker==="tag"&&(
              <div style={{
                position:"absolute",left:0,right:0,top:"100%",
                marginTop:"4px",background:"#fff",
                border:"1px solid #e0d8ce",
                borderRadius:"12px",boxShadow:"0 8px 24px rgba(0,0,0,.12)",
                maxHeight:"220px",overflowY:"auto",zIndex:60
              }}>
                <div style={{
                  display:"flex",alignItems:"center",
                  justifyContent:"space-between",
                  padding:"8px 12px",
                  borderBottom:"1px solid #f0ece6",
                  position:"sticky",top:0,background:"#fff",
                  borderRadius:"12px 12px 0 0"
                }}>
                  <span style={{
                    fontSize:"12px",fontWeight:700,
                    color:"#8a7060"
                  }}>Tag people</span>
                  <button type="button"
                    onClick={()=>setShowMemberPicker(null)}
                    style={{
                      background:"none",border:"none",
                      color:"#8a7060",cursor:"pointer",
                      fontSize:"18px",lineHeight:1,padding:"0 4px"
                    }}>×</button>
                </div>
                {members
                  .filter(m=>m.email!==myEmail)
                  .map(m=>{
                    const sel = ntTagged.includes(m.email);
                    return (
                      <div key={m.email}
                        onClick={()=>{
                          setNtTagged(sel
                            ?ntTagged.filter(e=>e!==m.email)
                            :[...ntTagged,m.email]);
                        }}
                        style={{
                          display:"flex",alignItems:"center",
                          gap:"10px",padding:"10px 14px",
                          cursor:"pointer",
                          background:sel?"#fef3c7":"transparent"
                        }}>
                        <Avatar name={m.name} email={m.email} size={32}/>
                        <div style={{flex:1}}>
                          <p style={{
                            fontSize:"13px",fontWeight:600,
                            color:"#1a1614",margin:0
                          }}>
                            {m.name??m.email.split("@")[0]}
                          </p>
                          <p style={{
                            fontSize:"11px",color:"#8a7060",margin:0
                          }}>{m.email}</p>
                        </div>
                        {sel&&<span style={{color:"#d97706"}}>✓</span>}
                      </div>
                    );
                  })}
                {members.filter(m=>m.email!==myEmail).length===0&&(
                  <p style={{
                    padding:"16px",textAlign:"center",
                    color:"#8a7060",fontSize:"13px"
                  }}>No team members found</p>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div style={{marginBottom:"16px"}}>
            <textarea
              value={ntDesc}
              onChange={e=>setNtDesc(e.target.value)}
              placeholder="Describe the task... *"
              required
              rows={4}
              style={{
                width:"100%",border:"none",outline:"none",
                fontSize:"15px",lineHeight:1.6,
                color:"#1a1614",resize:"none",
                fontFamily:"inherit",background:"transparent"
              }}/>
          </div>

          {/* Priority pills */}
          <div style={{marginBottom:"16px"}}>
            <p style={{
              fontSize:"11px",fontWeight:700,
              color:"#8a7060",textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:"8px"
            }}>Priority</p>
            <div style={{display:"flex",gap:"8px"}}>
              {(["LOW","MEDIUM","HIGH"] as Priority[]).map(p=>(
                <button key={p} type="button"
                  onClick={()=>setNtPriority(p)}
                  style={{
                    padding:"6px 14px",borderRadius:"999px",
                    border:"1.5px solid",
                    borderColor:ntPriority===p?PC[p]:"#e0d8ce",
                    background:ntPriority===p?PB[p]:"#fff",
                    color:ntPriority===p?PC[p]:"#8a7060",
                    fontSize:"12px",fontWeight:700,cursor:"pointer"
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div style={{marginBottom:"16px"}}>
            <p style={{
              fontSize:"11px",fontWeight:700,
              color:"#8a7060",textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:"8px"
            }}>Due Date</p>
            <input type="date" className="input"
              value={ntDueDate}
              onChange={e=>setNtDueDate(e.target.value)}
              style={{borderRadius:"12px"}}/>
          </div>

          {/* Attachments */}
          <div style={{marginBottom:"20px"}}>
            <p style={{
              fontSize:"11px",fontWeight:700,
              color:"#8a7060",textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:"8px"
            }}>Attachments</p>
            <div style={{
              display:"flex",gap:"8px",flexWrap:"wrap",
              marginBottom:"8px"
            }}>
              {[
                {icon:"📷",label:"Camera",
                  accept:"image/*",cap:"environment"},
                {icon:"🖼",label:"Photo",
                  accept:"image/*"},
                {icon:"📄",label:"Document",
                  accept:".pdf,.doc,.docx,.xls,.xlsx,.txt,application/*"},
                {icon:"🎤",label:"Audio",
                  accept:"audio/*"},
                {icon:"🎥",label:"Video",
                  accept:"video/*"},
              ].map((btn,i)=>(
                <label key={i} style={{
                  display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",
                  gap:"2px",padding:"10px 12px",
                  borderRadius:"12px",
                  border:"1px solid #e0d8ce",
                  background:"#fafaf8",
                  fontSize:"18px",cursor:"pointer",
                  color:"#8a7060",minWidth:"58px"
                }}>
                  {btn.icon}
                  <span style={{
                    fontSize:"9px",fontWeight:600
                  }}>{btn.label}</span>
                  <input type="file"
                    accept={btn.accept}
                    capture={btn.cap as any}
                    multiple={btn.label!=="Camera"}
                    hidden
                    onChange={e=>{
                      if (e.target.files)
                        setNtFiles(f=>[
                          ...f,
                          ...Array.from(e.target.files!)
                        ]);
                    }}/>
                </label>
              ))}
            </div>
            {ntFiles.map((f,i)=>(
              <div key={i} style={{
                display:"flex",alignItems:"center",
                gap:"10px",padding:"10px 12px",
                background:"#f9f9f9",borderRadius:"10px",
                border:"1px solid #e0d8ce",
                marginBottom:"6px"
              }}>
                <span style={{fontSize:"18px"}}>
                  {f.type.startsWith("image")?"🖼"
                   :f.type.startsWith("video")?"🎥"
                   :f.type.startsWith("audio")?"🎤":"📄"}
                </span>
                <span style={{
                  flex:1,fontSize:"12px",color:"#4a3f38",
                  overflow:"hidden",
                  textOverflow:"ellipsis",
                  whiteSpace:"nowrap"
                }}>{f.name}</span>
                <button type="button"
                  onClick={()=>setNtFiles(
                    ntFiles.filter((_,j)=>j!==i)
                  )} style={{
                  background:"#fee2e2",border:"none",
                  color:"#dc2626",borderRadius:"6px",
                  width:28,height:28,cursor:"pointer",
                  fontSize:"13px",display:"flex",
                  alignItems:"center",
                  justifyContent:"center"
                }}>✕</button>
              </div>
            ))}
          </div>

          {ntMsg&&(
            <div style={{
              padding:"12px 14px",borderRadius:"10px",
              marginBottom:"12px",
              background:ntMsg.startsWith("✅")
                ?"#dcfce7":"#fee2e2",
              color:ntMsg.startsWith("✅")
                ?"#166534":"#991b1b",
              fontSize:"13px",fontWeight:600,
              textAlign:"center"
            }}>{ntMsg}</div>
          )}

          <button type="submit" disabled={ntSubmitting}
            style={{
              width:"100%",padding:"15px",
              borderRadius:"14px",border:"none",
              background:"#25D366",color:"#fff",
              fontWeight:900,fontSize:"15px",
              cursor:ntSubmitting?"default":"pointer",
              opacity:ntSubmitting?0.7:1,
              boxShadow:"0 4px 12px rgba(37,211,102,.3)"
            }}>
            {ntSubmitting?"Assigning...":"Assign Task"}
          </button>
        </form>
      </div>
    </>
  );

  // ── DETAIL VIEW ───────────────────────────────────────
  if (view==="detail"&&selected) return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",height:"100dvh",
        display:"flex",flexDirection:"column",
        background:"#ECE5DD",
        maxWidth:"480px",margin:"0 auto"
      }}>
        <DetailHeader
          title={selected.title}
          onBack={()=>setView(prevView.current)}>
          <select
            value={selected.priority}
            onChange={async e=>{
              const p = e.target.value as Priority;
              await fetch(`${API}/complaints/${selected.id}`,{
                method:"PATCH",headers:ah(),
                body:JSON.stringify({priority:p}),
              });
              await loadDetail(selected.id);
            }}
            style={{
              background:"rgba(255,255,255,.15)",
              border:"none",borderRadius:"8px",
              color:"#fff",fontSize:"11px",
              fontWeight:700,padding:"4px 6px",
              cursor:"pointer",flexShrink:0
            }}>
            {(["LOW","MEDIUM","HIGH"] as Priority[]).map(p=>(
              <option key={p} value={p} style={{color:"#000"}}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={uiStatus(selected.status)}
            disabled={statusUpdating}
            onChange={e=>void handleStatusUpdate(
              e.target.value as Status
            )}
            style={{
              background:"rgba(255,255,255,.15)",
              border:"none",borderRadius:"8px",
              color:"#fff",fontSize:"11px",
              fontWeight:700,padding:"4px 6px",
              cursor:"pointer",flexShrink:0,
              opacity:statusUpdating?0.6:1
            }}>
            <option value="NEW" style={{color:"#000"}}>New</option>
            <option value="IN_PROGRESS" style={{color:"#000"}}>
              In Progress
            </option>
            <option value="CLOSED" style={{color:"#000"}}>Closed</option>
          </select>
          <div ref={taskMenuRef} style={{position:"relative",flexShrink:0}}>
            <button
              onClick={()=>setShowTaskMenu(!showTaskMenu)}
              style={{
                background:"none",border:"none",
                color:"#fff",fontSize:"20px",
                cursor:"pointer",padding:"0 4px",
                lineHeight:1
              }}>⋮</button>
            {showTaskMenu&&(
              <div style={{
                position:"absolute",right:0,top:"100%",
                marginTop:"4px",background:"#fff",
                borderRadius:"10px",
                boxShadow:"0 4px 16px rgba(0,0,0,.15)",
                minWidth:"140px",zIndex:60,
                overflow:"hidden"
              }}>
                <button
                  onClick={()=>{
                    setShowTaskMenu(false);
                  }}
                  style={{
                    display:"block",width:"100%",
                    padding:"12px 16px",border:"none",
                    background:"#fff",color:"#8a7060",
                    fontSize:"13px",fontWeight:600,
                    textAlign:"left",cursor:"pointer"
                  }}>
                  📦 Archive
                </button>
                <button
                  onClick={()=>{
                    setShowTaskMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                  style={{
                    display:"block",width:"100%",
                    padding:"12px 16px",border:"none",
                    background:"#fff",color:"#dc2626",
                    fontSize:"13px",fontWeight:600,
                    textAlign:"left",cursor:"pointer",
                    borderTop:"1px solid #f0ece6"
                  }}>
                  🗑 Delete
                </button>
              </div>
            )}
          </div>
        </DetailHeader>

        {/* Meta bar */}
        <div style={{
          background:"#128C7E",padding:"8px 16px",
          display:"flex",alignItems:"center",
          justifyContent:"space-between",gap:"10px"
        }}>
          <div style={{
            display:"flex",alignItems:"center",gap:"8px"
          }}>
            {selected.assignees.length>0?(
              <>
                <AssigneeAvatars
                  assignees={selected.assignees} max={4}/>
                <span style={{
                  fontSize:"12px",color:"rgba(255,255,255,.85)",
                  fontWeight:500
                }}>
                  {selected.assignees.map(a=>
                    a.assigneeName??
                    a.assigneeEmail.split("@")[0]
                  ).join(", ")}
                </span>
              </>
            ):(
              <span style={{
                fontSize:"12px",color:"rgba(255,255,255,.7)"
              }}>Unassigned</span>
            )}
          </div>
          {selected.dueDate&&(
            <span style={{
              fontSize:"11px",fontWeight:600,
              padding:"3px 10px",borderRadius:"999px",
              background: !isTaskClosed(selected.status)&&
                new Date(selected.dueDate)<new Date()
                ?"rgba(220,38,38,.2)"
                :"rgba(255,255,255,.15)",
              color: !isTaskClosed(selected.status)&&
                new Date(selected.dueDate)<new Date()
                ?"#fecaca":"rgba(255,255,255,.9)",
              whiteSpace:"nowrap"
            }}>
              📅 {new Date(selected.dueDate)
                .toLocaleDateString("en-IN")}
            </span>
          )}
        </div>

        {/* Scrollable chat area */}
        <div style={{
          flex:1,overflowY:"auto",
          padding:"12px 16px",
          display:"flex",flexDirection:"column",gap:"6px"
        }}>
          {/* Initial task bubble */}
          <div style={{
            display:"flex",justifyContent:"flex-end"
          }}>
            <div className="wa-bubble-out">
              <p style={{
                fontSize:"11px",fontWeight:700,
                color:"#075E54",marginBottom:"4px"
              }}>
                {selected.assignedByEmail===myEmail||
                 selected.raisedByEmail===myEmail
                  ?"You"
                  :selected.assignedByName??
                   selected.raisedByName??
                   selected.raisedByEmail.split("@")[0]}
              </p>
              {selected.description&&(
                <p style={{
                  fontSize:"14px",color:"#1a1614",
                  lineHeight:1.5,margin:0
                }}>{selected.description}</p>
              )}
              {selected.attachments.length>0&&(
                <div style={{
                  display:"flex",gap:"6px",flexWrap:"wrap",
                  marginTop:"8px"
                }}>
                  {selected.attachments.map(a=>(
                    a.type==="image"?(
                      <a key={a.id} href={a.s3Url}
                        target="_blank"
                        rel="noopener noreferrer">
                        <img src={a.s3Url} alt=""
                          style={{
                            width:64,height:64,
                            objectFit:"cover",
                            borderRadius:"8px"
                          }}/>
                      </a>
                    ):(
                      <a key={a.id} href={a.s3Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display:"flex",
                          alignItems:"center",
                          justifyContent:"center",
                          width:64,height:64,
                          borderRadius:"8px",
                          background:"rgba(0,0,0,.06)",
                          fontSize:"24px",
                          textDecoration:"none"
                        }}>
                        {a.type==="video"?"🎥"
                         :a.type==="audio"?"🎤":"📄"}
                      </a>
                    )
                  ))}
                </div>
              )}
              <p style={{
                fontSize:"10px",color:"#8a7060",
                textAlign:"right",marginTop:"4px"
              }}>
                {timeAgo(selected.createdAt)}
              </p>
            </div>
          </div>

          {/* Sub-tasks collapsible */}
          {selected.children&&selected.children.length>0&&(
            <div style={{margin:"8px 0"}}>
              <button
                onClick={()=>setShowSubtasks(s=>({
                  ...s,
                  [selected.id]:!s[selected.id]
                }))}
                style={{
                  width:"100%",padding:"10px 14px",
                  borderRadius:"10px",border:"none",
                  background:"rgba(255,255,255,.7)",
                  color:"#075E54",fontSize:"13px",
                  fontWeight:700,cursor:"pointer",
                  display:"flex",alignItems:"center",
                  justifyContent:"space-between"
                }}>
                <span>
                  📋 Sub-tasks ({selected.children.length})
                </span>
                <span>{showSubtasks[selected.id]?"▲":"▼"}</span>
              </button>
              {showSubtasks[selected.id]&&(
                <div style={{marginTop:"6px"}}>
                  {selected.children.map(child=>(
                    <div key={child.id}
                      className="pressable"
                      onClick={async()=>{
                        await loadDetail(child.id);
                      }}
                      style={{
                        background:"#fff",
                        borderRadius:"10px",
                        padding:"10px 12px",
                        marginBottom:"6px",
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"space-between",
                        gap:"8px",
                        boxShadow:"0 1px 2px rgba(0,0,0,.08)"
                      }}>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{
                          fontSize:"13px",fontWeight:600,
                          color:"#1a1614",margin:0,
                          overflow:"hidden",
                          textOverflow:"ellipsis",
                          whiteSpace:"nowrap"
                        }}>{child.title}</p>
                        {child.assignees.length>0&&(
                          <AssigneeAvatars
                            assignees={child.assignees}/>
                        )}
                      </div>
                      <StatusPill s={child.status} small/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add sub-task */}
          <button onClick={()=>{
            setNtParentId(selected.id);
            setNtParentTitle(selected.title);
            prevView.current="detail";
            setView("new");
          }} style={{
            alignSelf:"center",padding:"8px 16px",
            borderRadius:"999px",border:"none",
            background:"rgba(255,255,255,.7)",
            color:"#075E54",fontSize:"12px",
            fontWeight:700,cursor:"pointer",
            margin:"4px 0 8px"
          }}>
            + Add Sub-task
          </button>

          {/* Chat events */}
          {selected.events?.map(ev=>{
            if (ev.type==="STATUS_CHANGE") {
              return (
                <div key={ev.id} style={{
                  textAlign:"center",margin:"8px 0"
                }}>
                  <span style={{
                    fontSize:"11px",color:"#8a7060",
                    background:"rgba(255,255,255,.6)",
                    padding:"4px 12px",
                    borderRadius:"999px",
                    fontWeight:600
                  }}>
                    🔄 {ev.message}
                  </span>
                  <p style={{
                    fontSize:"10px",color:"#b8a898",
                    marginTop:"2px"
                  }}>
                    {timeAgo(ev.createdAt)}
                  </p>
                </div>
              );
            }
            const isMine = ev.authorEmail===myEmail;
            return (
              <div key={ev.id} style={{
                display:"flex",
                justifyContent:isMine?"flex-end":"flex-start"
              }}>
                <div className={
                  isMine?"wa-bubble-out":"wa-bubble-in"
                }>
                  <p style={{
                    fontSize:"11px",fontWeight:700,
                    color:isMine?"#075E54":"#8a7060",
                    marginBottom:"3px"
                  }}>
                    {isMine
                      ?"You"
                      :ev.authorEmail.split("@")[0]}
                    {ev.authorType==="ADMIN"?" (Admin)":""}
                  </p>
                  {ev.message&&(
                    <p style={{
                      fontSize:"14px",color:"#1a1614",
                      lineHeight:1.5,margin:0
                    }}>{ev.message}</p>
                  )}
                  <p style={{
                    fontSize:"10px",color:"#8a7060",
                    textAlign:"right",marginTop:"4px"
                  }}>
                    {timeAgo(ev.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom input bar or reopen */}
        {selected.status==="RESOLVED"?(
          <div style={{
            padding:"12px 16px",
            paddingBottom:
              "calc(12px + env(safe-area-inset-bottom,0px))",
            background:"#f0ece6"
          }}>
            <button onClick={async()=>{
              await fetch(
                `${API}/complaints/${selected.id}/reopen`,{
                  method:"POST",headers:ah(),
                  body:JSON.stringify({
                    reason:"Task needs attention"
                  }),
                }
              );
              await loadDetail(selected.id);
              void loadAll();
            }} style={{
              width:"100%",padding:"14px",
              borderRadius:"12px",border:"none",
              background:"#c8960a",color:"#fff",
              fontWeight:800,fontSize:"14px",
              cursor:"pointer",
              boxShadow:"0 4px 12px rgba(200,150,10,.3)"
            }}>
              ↩ Reopen Task
            </button>
          </div>
        ):!isTaskClosed(selected.status)?(
          <form onSubmit={e=>void handleAddQuery(e)}
            style={{
              display:"flex",alignItems:"flex-end",
              gap:"8px",padding:"8px 12px",
              paddingBottom:
                "calc(8px + env(safe-area-inset-bottom,0px))",
              background:"#f0ece6"
            }}>
            <label style={{
              display:"flex",alignItems:"center",
              justifyContent:"center",
              width:36,height:36,borderRadius:"50%",
              background:"#fff",cursor:"pointer",
              flexShrink:0,fontSize:"18px"
            }}>
              📎
              <input type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                multiple hidden
                onChange={e=>{
                  if (e.target.files)
                    setMsgFiles(f=>[
                      ...f,
                      ...Array.from(e.target.files!)
                    ]);
                }}/>
            </label>
            <div style={{
              flex:1,background:"#fff",
              borderRadius:"24px",
              padding:"8px 14px",
              display:"flex",flexDirection:"column",
              gap:"4px"
            }}>
              <input
                value={msgInput}
                onChange={e=>setMsgInput(e.target.value)}
                onKeyDown={e=>{
                  if (e.key==="Enter"&&!e.shiftKey) {
                    e.preventDefault();
                    if (msgInput.trim()||msgFiles.length>0)
                      void handleAddQuery(e as any);
                  }
                }}
                placeholder="Type a message..."
                style={{
                  border:"none",outline:"none",
                  fontSize:"14px",color:"#1a1614",
                  background:"transparent",
                  fontFamily:"inherit",width:"100%"
                }}/>
              {msgFiles.length>0&&(
                <div style={{
                  display:"flex",gap:"4px",flexWrap:"wrap"
                }}>
                  {msgFiles.map((f,i)=>(
                    <span key={i} style={{
                      fontSize:"10px",color:"#8a7060",
                      background:"#f0ece6",
                      padding:"2px 8px",
                      borderRadius:"999px",
                      display:"flex",alignItems:"center",gap:"4px"
                    }}>
                      {f.name.slice(0,20)}
                      <button type="button"
                        onClick={()=>setMsgFiles(
                          msgFiles.filter((_,j)=>j!==i)
                        )}
                        style={{
                          background:"none",border:"none",
                          color:"#dc2626",cursor:"pointer",
                          fontSize:"12px",padding:0
                        }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button type="submit"
              disabled={querySending||
                (!msgInput.trim()&&msgFiles.length===0)}
              style={{
                width:44,height:44,borderRadius:"50%",
                border:"none",background:"#25D366",
                color:"#fff",fontSize:"20px",
                cursor:"pointer",flexShrink:0,
                display:"flex",alignItems:"center",
                justifyContent:"center",
                opacity:querySending?0.6:1
              }}>
              {querySending?"…":"➤"}
            </button>
          </form>
        ):null}

        {/* Delete confirm modal */}
        {showDeleteConfirm&&(
          <div style={{
            position:"fixed",inset:0,
            background:"rgba(0,0,0,.5)",
            display:"flex",alignItems:"center",
            justifyContent:"center",zIndex:200,
            padding:"24px"
          }}>
            <div style={{
              background:"#fff",borderRadius:"16px",
              padding:"24px",maxWidth:"320px",
              width:"100%",textAlign:"center"
            }}>
              <p style={{
                fontSize:"18px",fontWeight:700,
                color:"#1a1614",marginBottom:"8px"
              }}>Delete Task?</p>
              <p style={{
                fontSize:"14px",color:"#8a7060",
                marginBottom:"20px",lineHeight:1.5
              }}>
                This will permanently delete &ldquo;{selected.title}
                &rdquo; and all its messages.
              </p>
              <div style={{
                display:"flex",gap:"10px"
              }}>
                <button
                  onClick={()=>setShowDeleteConfirm(false)}
                  style={{
                    flex:1,padding:"12px",
                    borderRadius:"10px",
                    border:"1px solid #e0d8ce",
                    background:"#fff",color:"#4a3f38",
                    fontWeight:700,fontSize:"14px",
                    cursor:"pointer"
                  }}>
                  Cancel
                </button>
                <button
                  onClick={()=>void handleDeleteTask()}
                  style={{
                    flex:1,padding:"12px",
                    borderRadius:"10px",border:"none",
                    background:"#dc2626",color:"#fff",
                    fontWeight:700,fontSize:"14px",
                    cursor:"pointer"
                  }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  // ── NOTIFICATIONS VIEW ────────────────────────────────
  if (view==="notifications") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#ECE5DD",
        paddingBottom:"40px"
      }}>
        <DetailHeader title="Notifications"
          onBack={()=>setView("home")}>
          <button onClick={()=>void markAllRead()}
            style={{
              background:"rgba(255,255,255,.15)",
              border:"none",color:"#fff",
              fontSize:"11px",fontWeight:700,
              padding:"6px 12px",borderRadius:"8px",
              cursor:"pointer",flexShrink:0
            }}>
            Mark all read
          </button>
        </DetailHeader>

        <div style={{padding:"12px 16px"}}>
          {notifications.length===0?(
            <div style={{
              textAlign:"center",padding:"60px 0",
              color:"#8a7060"
            }}>
              <div style={{
                fontSize:"48px",marginBottom:"12px"
              }}>🔔</div>
              <p style={{
                fontSize:"16px",fontWeight:700,
                color:"#2c2420"
              }}>No notifications</p>
            </div>
          ):(
            notifications.map(n=>(
              <div key={n.id}
                className="pressable fade"
                onClick={async()=>{
                  await loadDetail(n.taskId);
                  prevView.current="notifications";
                  setView("detail");
                }}
                style={{
                  padding:"14px",
                  marginBottom:"8px",
                  background:"#fff",
                  borderRadius:"12px",
                  borderLeft:`4px solid ${
                    n.type==="HIGH_PRIORITY_OVERDUE"
                      ?"#dc2626"
                      :n.isRead?"#e0d8ce":"#25D366"
                  }`,
                  opacity:n.isRead?0.7:1
                }}>
                <div style={{
                  display:"flex",gap:"12px",
                  alignItems:"flex-start"
                }}>
                  <div style={{
                    fontSize:"20px",flexShrink:0
                  }}>
                    {n.type==="HIGH_PRIORITY_OVERDUE"?"🔴"
                     :n.type==="ASSIGNED"?"📋"
                     :n.type==="REPLIED"?"💬"
                     :n.type==="CLOSED"?"✅"
                     :n.type==="DUE_DATE_REMINDER"?"⏰"
                     :"🔔"}
                  </div>
                  <div style={{flex:1}}>
                    <p style={{
                      fontSize:"13px",fontWeight:
                        n.isRead?500:700,
                      color:"#1a1614",lineHeight:1.5
                    }}>{n.message}</p>
                    <p style={{
                      fontSize:"11px",
                      color:"#b8a898",marginTop:"4px"
                    }}>
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                  {!n.isRead&&(
                    <div style={{
                      width:8,height:8,
                      borderRadius:"50%",
                      background:"#25D366",
                      flexShrink:0,marginTop:"4px"
                    }}/>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  // ── PROFILE VIEW ──────────────────────────────────────
  if (view==="profile") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#ECE5DD",
        paddingBottom:"100px"
      }}>
        <MainHeader/>

        <div style={{padding:"16px"}}>
          <div style={{
            background:"linear-gradient(135deg,#075E54,#128C7E)",
            borderRadius:"20px",padding:"28px 20px",
            display:"flex",flexDirection:"column",
            alignItems:"center",marginBottom:"16px"
          }}>
            <Avatar name={myName} email={myEmail} size={72}/>
            <p style={{
              fontSize:"20px",fontWeight:900,
              color:"#fffbf5",marginTop:"12px",
              letterSpacing:"-0.3px"
            }}>
              {myName||"Set your name"}
            </p>
            <p style={{
              fontSize:"13px",color:"#a8d5b5",
              marginTop:"4px"
            }}>{myEmail}</p>
            <div style={{
              display:"flex",gap:"16px",
              marginTop:"16px"
            }}>
              {[
                {n:myTasks.filter(
                  t=>!isTaskClosed(t.status)).length,
                 l:"Active Tasks"},
                {n:myAssignments.filter(
                  t=>!isTaskClosed(t.status)).length,
                 l:"My Assignments"},
              ].map(s=>(
                <div key={s.l} style={{
                  textAlign:"center",
                  background:"rgba(255,255,255,.1)",
                  borderRadius:"12px",
                  padding:"10px 16px"
                }}>
                  <div style={{
                    fontSize:"20px",fontWeight:800,
                    color:"#f5d88a"
                  }}>{s.n}</div>
                  <div style={{
                    fontSize:"10px",
                    color:"rgba(255,255,255,.6)",
                    marginTop:"2px",fontWeight:600
                  }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Edit profile */}
          <div style={{
            padding:"16px",marginBottom:"12px",
            background:"#fff",borderRadius:"16px",
            border:"1px solid #e0d8ce"
          }}>
            <p style={{
              fontSize:"14px",fontWeight:700,
              color:"#2c2420",marginBottom:"14px"
            }}>Edit Profile</p>
            <form onSubmit={e=>void handleSaveProfile(e)}>
              {["Full Name","Mobile Number"].map((l,i)=>(
                <div key={l} style={{marginBottom:"12px"}}>
                  <label style={{
                    fontSize:"11px",fontWeight:700,
                    color:"#8a7060",
                    textTransform:"uppercase",
                    letterSpacing:"0.1em",
                    display:"block",marginBottom:"6px"
                  }}>{l}</label>
                  <input className="input"
                    type={i===1?"tel":"text"}
                    placeholder={i===0
                      ?"Your full name"
                      :"+91 9550948778"}
                    value={i===0?pName:pPhone}
                    onChange={e=>i===0
                      ?setPName(e.target.value)
                      :setPPhone(e.target.value)}/>
                </div>
              ))}
              {pMsg&&(
                <p style={{
                  fontSize:"13px",fontWeight:600,
                  color:pMsg.startsWith("✅")
                    ?"#166534":"#dc2626",
                  marginBottom:"10px"
                }}>{pMsg}</p>
              )}
              <button type="submit" disabled={pSaving}
                style={{
                  width:"100%",padding:"13px",
                  borderRadius:"12px",border:"none",
                  background:"#075E54",color:"#fff",
                  fontWeight:700,fontSize:"14px",
                  cursor:"pointer"
                }}>
                {pSaving?"Saving...":"Save Changes"}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div style={{
            padding:"16px",marginBottom:"12px",
            background:"#fff",borderRadius:"16px",
            border:"1px solid #e0d8ce"
          }}>
            <p style={{
              fontSize:"14px",fontWeight:700,
              color:"#2c2420",marginBottom:"14px"
            }}>Change Password</p>
            <form onSubmit={e=>void handleChangePwd(e)}>
              {[
                {p:"Current password",v:curPwd,
                  fn:setCurPwd},
                {p:"New password (min 8 chars)",
                  v:newPwd,fn:setNewPwd},
              ].map((f,i)=>(
                <input key={i} className="input"
                  type="password"
                  placeholder={f.p}
                  value={f.v}
                  onChange={e=>f.fn(e.target.value)}
                  style={{marginBottom:"10px"}}/>
              ))}
              {pwdMsg&&(
                <p style={{
                  fontSize:"13px",fontWeight:600,
                  color:pwdMsg.startsWith("✅")
                    ?"#166534":"#dc2626",
                  marginBottom:"10px"
                }}>{pwdMsg}</p>
              )}
              <button type="submit" disabled={pwdSaving}
                style={{
                  width:"100%",padding:"13px",
                  borderRadius:"12px",border:"none",
                  background:"#075E54",color:"#fff",
                  fontWeight:700,fontSize:"14px",
                  cursor:"pointer"
                }}>
                {pwdSaving?"Changing...":"Change Password"}
              </button>
            </form>
          </div>

          {/* Sign out */}
          <button onClick={logout} style={{
            width:"100%",padding:"14px",
            borderRadius:"12px",
            border:"1.5px solid #fca5a5",
            background:"#fff5f5",color:"#dc2626",
            fontWeight:700,fontSize:"14px",
            cursor:"pointer"
          }}>
            Sign Out
          </button>
        </div>

        <BottomNav/>
      </div>
    </>
  );

  return null;
}
