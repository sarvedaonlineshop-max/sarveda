"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────
type View = "login"|"dashboard"|"mytasks"|"myassignments"
           |"profile"|"new"|"detail"|"notifications";
type Priority = "LOW"|"MEDIUM"|"HIGH";
type Status = "OPEN"|"IN_PROGRESS"|"RESOLVED"|"REOPENED";
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
  priority: Priority; status: Status;
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
const PC: Record<Priority,string> = {
  HIGH:"#dc2626", MEDIUM:"#d97706", LOW:"#16a34a"
};
const PB: Record<Priority,string> = {
  HIGH:"#fee2e2", MEDIUM:"#fef3c7", LOW:"#dcfce7"
};
const SS: Record<Status,{bg:string;color:string;label:string}> = {
  OPEN:        {bg:"#fee2e2",color:"#991b1b",label:"Open"},
  IN_PROGRESS: {bg:"#dbeafe",color:"#1e40af",label:"In Progress"},
  RESOLVED:    {bg:"#dcfce7",color:"#166534",label:"Resolved"},
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
}:{s:Status;small?:boolean}) {
  const st = SS[s];
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
    useState<"OPEN"|"IN_PROGRESS"|"RESOLVED">("OPEN");

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
  const [queryText,setQueryText] = useState("");
  const [queryFiles,setQueryFiles] = useState<File[]>([]);
  const [querySending,setQuerySending] = useState(false);

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

  const prevView = useRef<View>("dashboard");
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Helpers ──────────────────────────────────────────
  const ah = useCallback((t?:string) => ({
    Authorization:`Bearer ${t??token??""}`,
    "Content-Type":"application/json",
  }),[token]);

  function saveSession(
    t:string,email:string,name:string,phone:string
  ) {
    localStorage.setItem("sv_token",t);
    localStorage.setItem("sv_email",email);
    localStorage.setItem("sv_name",name);
    localStorage.setItem("sv_phone",phone);
    setToken(t);setMyEmail(email);
    setMyName(name);setMyPhone(phone);
  }

  function logout() {
    ["sv_token","sv_email","sv_name","sv_phone"]
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
      setToken(t);setMyEmail(e);
      setMyName(n??"");setMyPhone(p??"");
      setView("dashboard");
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
      saveSession(t,u.email,u.name??"",u.phone??"");
      setView("dashboard");
      void loadAll(t);
      pollRef.current = setInterval(
        ()=>void loadNotifications(t),30000
      );
    } catch(err:any) {
      setLErr(err.message??"Login failed");
    } finally { setLLoading(false); }
  }

  async function handleSendOtp(e:React.FormEvent) {
    e.preventDefault();
    setLLoading(true);setLErr("");
    try {
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
      saveSession(t,u.email,u.name??"",u.phone??"");
      setView("dashboard");
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
    if (!ntTitle.trim()) {
      setNtMsg("❌ Title is required"); return;
    }
    setNtSubmitting(true);setNtMsg("");
    try {
      const fd = new FormData();
      fd.append("title",ntTitle.trim());
      fd.append("description",ntDesc.trim());
      fd.append("priority",ntPriority);
      if (ntParentId) fd.append("parentId",ntParentId);
      if (ntDueDate) fd.append("dueDate",ntDueDate);
      fd.append("assigneeEmails",JSON.stringify(ntAssignees));
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
      setNtAssignees([]);setNtDueDate("");
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
    if (!queryText.trim()&&queryFiles.length===0) return;
    setQuerySending(true);
    try {
      const fd = new FormData();
      fd.append("message",queryText.trim());
      queryFiles.forEach(f=>fd.append("files",f));
      await fetch(`${API}/complaints/${selected?.id}/comment`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd,
      });
      setQueryText("");setQueryFiles([]);
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
        body:JSON.stringify({status:newStatus}),
      });
      await loadDetail(selected.id);
      void loadAll();
    } finally { setStatusUpdating(false); }
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
    html,body{background:#f0ece6;
      font-family:'Inter',system-ui,sans-serif}
    .card{background:#fff;border-radius:16px;
      border:1px solid #ede8e0;
      box-shadow:0 1px 4px rgba(44,36,32,.05)}
    .pressable{cursor:pointer;transition:
      transform .12s,opacity .12s}
    .pressable:active{transform:scale(.97);opacity:.85}
    .input{width:100%;padding:12px 14px;
      border-radius:12px;border:1.5px solid #e0d8ce;
      background:#fff;color:#1a1614;font-size:14px;
      outline:none;font-family:inherit}
    .input:focus{border-color:#1e3a2f}
    .dark-input{background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.15);
      color:#fffbf5;border-radius:12px;
      padding:12px 14px;font-size:15px;
      width:100%;outline:none;font-family:inherit}
    .dark-input::placeholder{
      color:rgba(255,255,255,.4)}
    .input::placeholder{color:#c0b8b0}
    ::-webkit-scrollbar{width:0;height:0}
    .fade{animation:fadeIn .2s ease}
    @keyframes fadeIn{from{opacity:0;
      transform:translateY(4px)}to{opacity:1;
      transform:translateY(0)}}
    select.input option{color:#1a1614;background:#fff}
  `;

  function Header({
    title,back,onBack,actions
  }:{
    title:string;back?:boolean;
    onBack?:()=>void;
    actions?:React.ReactNode
  }) {
    return (
      <div style={{
        background:"#1e3a2f",
        padding:"14px 16px",
        display:"flex",alignItems:"center",gap:"12px",
        position:"sticky",top:0,zIndex:50,
        borderBottom:"1px solid rgba(255,255,255,.08)"
      }}>
        {back && (
          <button onClick={onBack} style={{
            background:"rgba(255,255,255,.1)",
            border:"none",color:"#f5d88a",
            width:34,height:34,borderRadius:"10px",
            cursor:"pointer",fontSize:"18px",
            display:"flex",alignItems:"center",
            justifyContent:"center",flexShrink:0
          }}>←</button>
        )}
        <h1 style={{
          fontSize:"17px",fontWeight:800,
          color:"#fffbf5",flex:1,
          letterSpacing:"-0.3px"
        }}>{title}</h1>
        {actions}
      </div>
    );
  }

  function BottomNav() {
    const tabs = [
      {id:"dashboard",icon:"🏠",label:"Home"},
      {id:"mytasks",icon:"📋",label:"My Tasks"},
      {id:"myassignments",icon:"📤",label:"Assigned"},
      {id:"profile",icon:"👤",label:"Profile"},
    ] as const;
    return (
      <div style={{
        position:"fixed",bottom:0,
        left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:"480px",
        background:"#fffbf5",
        borderTop:"1px solid #e0d8ce",
        display:"grid",
        gridTemplateColumns:"repeat(4,1fr)",
        paddingBottom:"env(safe-area-inset-bottom,8px)",
        zIndex:100
      }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{
            if (t.id==="profile") {
              setPName(myName);setPPhone(myPhone);
            }
            setView(t.id as View);
          }} style={{
            padding:"10px 4px 8px",border:"none",
            background:"transparent",cursor:"pointer",
            display:"flex",flexDirection:"column",
            alignItems:"center",gap:"3px"
          }}>
            <span style={{fontSize:"20px"}}>{t.icon}</span>
            <span style={{
              fontSize:"10px",fontWeight:700,
              color:view===t.id?"#1e3a2f":"#b8a898",
              letterSpacing:"0.02em"
            }}>{t.label}</span>
            {view===t.id&&(
              <div style={{
                width:"20px",height:"3px",
                borderRadius:"999px",
                background:"#c8960a"
              }}/>
            )}
          </button>
        ))}
      </div>
    );
  }

  function StatusTabs() {
    return (
      <div style={{
        display:"flex",gap:"6px",
        padding:"10px 16px",
        background:"#fffbf5",
        borderBottom:"1px solid #ede8e0",
        overflowX:"auto"
      }}>
        {(["OPEN","IN_PROGRESS","RESOLVED"] as const)
          .map(s=>(
          <button key={s} onClick={()=>setStatusFilter(s)}
            style={{
              padding:"7px 14px",borderRadius:"999px",
              border:"1.5px solid",
              borderColor:statusFilter===s
                ?SS[s].color:"#e0d8ce",
              background:statusFilter===s
                ?SS[s].bg:"#fff",
              color:statusFilter===s
                ?SS[s].color:"#8a7060",
              fontSize:"12px",fontWeight:700,
              cursor:"pointer",whiteSpace:"nowrap"
            }}>
            {SS[s].label}
          </button>
        ))}
      </div>
    );
  }

  function TaskCard({
    task,onClick
  }:{task:Task;onClick:()=>void}) {
    const overdue = task.dueDate && 
      task.status!=="RESOLVED" &&
      new Date(task.dueDate)<new Date();
    return (
      <div className="card pressable fade"
        onClick={onClick}
        style={{padding:"14px 16px",marginBottom:"8px"}}>
        {/* Header row */}
        <div style={{
          display:"flex",alignItems:"flex-start",
          gap:"8px",marginBottom:"10px"
        }}>
          <div style={{
            width:"10px",height:"10px",
            borderRadius:"50%",
            background:PC[task.priority],
            flexShrink:0,marginTop:"4px"
          }}/>
          <p style={{
            fontSize:"14px",fontWeight:700,
            color:"#1a1614",flex:1,lineHeight:1.4
          }}>{task.title}</p>
        </div>

        {/* Meta row */}
        <div style={{
          display:"flex",alignItems:"center",
          gap:"6px",flexWrap:"wrap",marginBottom:"10px"
        }}>
          <StatusPill s={task.status} small/>
          <PriorityPill p={task.priority}/>
          {task._count?.events!=null&&
           task._count.events>0&&(
            <span style={{
              fontSize:"11px",color:"#8a7060",
              display:"flex",alignItems:"center",gap:"3px"
            }}>
              💬{task._count.events}
            </span>
          )}
          {task.attachments.length>0&&(
            <span style={{
              fontSize:"11px",color:"#8a7060"
            }}>
              📎{task.attachments.length}
            </span>
          )}
          {overdue&&(
            <span style={{
              fontSize:"10px",fontWeight:700,
              color:"#dc2626",
              background:"#fee2e2",
              padding:"2px 8px",borderRadius:"999px"
            }}>⚠️ Overdue</span>
          )}
          <span style={{
            fontSize:"11px",color:"#b8a898",
            marginLeft:"auto"
          }}>
            {timeAgo(task.updatedAt)}
          </span>
        </div>

        {/* People row */}
        <div style={{
          display:"flex",alignItems:"center",
          justifyContent:"space-between",
          paddingTop:"10px",
          borderTop:"1px solid #f0ece6"
        }}>
          <div style={{
            display:"flex",alignItems:"center",gap:"6px"
          }}>
            <Avatar
              name={task.assignedByName??task.raisedByName}
              email={task.assignedByEmail??task.raisedByEmail}
              size={20}
            />
            <span style={{
              fontSize:"11px",color:"#8a7060"
            }}>
              {task.assignedByName??
               task.assignedByEmail?.split("@")[0]??
               task.raisedByName??
               task.raisedByEmail.split("@")[0]}
            </span>
            {task.assignees.length>0&&(
              <>
                <span style={{
                  fontSize:"11px",color:"#c0b8b0"
                }}>→</span>
                <AssigneeAvatars assignees={task.assignees}/>
              </>
            )}
          </div>
          {task.dueDate&&task.status!=="RESOLVED"&&(
            <span style={{
              fontSize:"10px",fontWeight:600,
              color:overdue?"#dc2626":"#8a7060"
            }}>
              📅{new Date(task.dueDate)
                .toLocaleDateString("en-IN",
                  {day:"numeric",month:"short"})}
            </span>
          )}
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
        width:"52px",height:"52px",borderRadius:"16px",
        border:"none",background:"#1e3a2f",
        color:"#f5d88a",fontSize:"26px",
        cursor:"pointer",display:"flex",
        alignItems:"center",justifyContent:"center",
        boxShadow:"0 4px 16px rgba(30,58,47,.35)",
        zIndex:90
      }}>+</button>
    );
  }

  // ── LOGIN VIEW ────────────────────────────────────────
  if (view==="login") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#1e3a2f",
        display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",
        padding:"24px",maxWidth:"480px",margin:"0 auto"
      }}>
        {/* Brand */}
        <div style={{textAlign:"center",marginBottom:"32px"}}>
          <div style={{
            width:"80px",height:"80px",
            borderRadius:"24px",margin:"0 auto 16px",
            background:"rgba(200,150,10,.2)",
            border:"2px solid rgba(200,150,10,.4)",
            display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:"40px"
          }}>☸</div>
          <h1 style={{
            fontSize:"30px",fontWeight:900,
            color:"#fffbf5",letterSpacing:"-0.5px"
          }}>Sarveda Tasks</h1>
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
              <button type="submit" disabled={lLoading}
                style={{
                  width:"100%",padding:"14px",
                  borderRadius:"14px",border:"none",
                  background:"#c8960a",color:"#1e3a2f",
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
                  <button type="submit"
                    disabled={lLoading} style={{
                    width:"100%",padding:"14px",
                    borderRadius:"14px",border:"none",
                    background:"#c8960a",color:"#1e3a2f",
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
                    background:"#c8960a",color:"#1e3a2f",
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

  // ── DASHBOARD VIEW ────────────────────────────────────
  if (view==="dashboard") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#f0ece6",
        paddingBottom:"80px"
      }}>
        {/* Hero header */}
        <div style={{
          background:"linear-gradient(135deg,#1e3a2f,#2d5240)",
          padding:"16px 16px 24px"
        }}>
          <div style={{
            display:"flex",alignItems:"center",
            justifyContent:"space-between",
            marginBottom:"16px"
          }}>
            <div>
              <p style={{
                fontSize:"13px",color:"#a8d5b5"
              }}>Good day 👋</p>
              <h1 style={{
                fontSize:"22px",fontWeight:900,
                color:"#fffbf5",letterSpacing:"-0.4px"
              }}>
                {myName?.split(" ")[0]||"Team"}
              </h1>
            </div>
            <div style={{
              display:"flex",alignItems:"center",gap:"10px"
            }}>
              {/* Notification bell */}
              <button onClick={()=>{
                setView("notifications");
                void markAllRead();
              }} style={{
                position:"relative",
                background:"rgba(255,255,255,.1)",
                border:"none",color:"#f5d88a",
                width:40,height:40,borderRadius:"12px",
                cursor:"pointer",fontSize:"20px",
                display:"flex",alignItems:"center",
                justifyContent:"center"
              }}>
                🔔
                {unreadCount>0&&(
                  <div style={{
                    position:"absolute",top:-4,right:-4,
                    width:18,height:18,borderRadius:"50%",
                    background:"#dc2626",color:"#fff",
                    fontSize:"10px",fontWeight:800,
                    display:"flex",alignItems:"center",
                    justifyContent:"center",
                    border:"2px solid #1e3a2f"
                  }}>{unreadCount>9?"9+":unreadCount}</div>
                )}
              </button>
              <Avatar name={myName} email={myEmail} size={40}/>
            </div>
          </div>

          {/* Stats cards */}
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(4,1fr)",
            gap:"8px"
          }}>
            {[
              {label:"Total",n:dashStats.total,
               color:"#f5d88a",bg:"rgba(245,216,138,.15)"},
              {label:"Open",n:dashStats.open,
               color:"#fca5a5",bg:"rgba(220,38,38,.2)"},
              {label:"Active",n:dashStats.inProgress,
               color:"#93c5fd",bg:"rgba(59,130,246,.2)"},
              {label:"Done",n:dashStats.resolved,
               color:"#86efac",bg:"rgba(34,197,94,.2)"},
            ].map(s=>(
              <div key={s.label} style={{
                background:s.bg,borderRadius:"12px",
                padding:"10px 8px",textAlign:"center"
              }}>
                <div style={{
                  fontSize:"20px",fontWeight:900,
                  color:s.color,lineHeight:1
                }}>{s.n}</div>
                <div style={{
                  fontSize:"9px",fontWeight:700,
                  color:"rgba(255,255,255,.6)",
                  textTransform:"uppercase",
                  letterSpacing:"0.06em",marginTop:"3px"
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <StatusTabs/>

        {/* Task list */}
        <div style={{padding:"12px 16px"}}>
          {dashTasks.length===0?(
            <div style={{
              textAlign:"center",padding:"60px 0",
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
            dashTasks
              .filter(t=>{
                if (statusFilter==="RESOLVED")
                  return t.status==="RESOLVED"||
                         t.status==="REOPENED";
                return t.status===statusFilter;
              })
              .map(t=>(
                <TaskCard key={t.id} task={t}
                  onClick={async()=>{
                    setLoading(true);
                    await loadDetail(t.id);
                    setLoading(false);
                    prevView.current="dashboard";
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

  // ── MY TASKS VIEW ─────────────────────────────────────
  if (view==="mytasks") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#f0ece6",
        paddingBottom:"80px"
      }}>
        <Header title="My Tasks"
          actions={
            <span style={{
              fontSize:"11px",color:"rgba(245,216,138,.7)"
            }}>
              Assigned to me
            </span>
          }/>
        <StatusTabs/>
        <div style={{padding:"12px 16px"}}>
          {myTasks.length===0?(
            <div style={{
              textAlign:"center",padding:"60px 0",
              color:"#8a7060"
            }}>
              <div style={{
                fontSize:"48px",marginBottom:"12px"
              }}>✅</div>
              <p style={{
                fontSize:"16px",fontWeight:700,
                color:"#2c2420"
              }}>No tasks assigned to you</p>
            </div>
          ):(
            myTasks
              .filter(t=>{
                if (statusFilter==="RESOLVED")
                  return t.status==="RESOLVED"||
                         t.status==="REOPENED";
                return t.status===statusFilter;
              })
              .map(t=>(
                <TaskCard key={t.id} task={t}
                  onClick={async()=>{
                    await loadDetail(t.id);
                    prevView.current="mytasks";
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

  // ── MY ASSIGNMENTS VIEW ───────────────────────────────
  if (view==="myassignments") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#f0ece6",
        paddingBottom:"80px"
      }}>
        <Header title="My Assignments"
          actions={
            <span style={{
              fontSize:"11px",color:"rgba(245,216,138,.7)"
            }}>
              Tasks I created
            </span>
          }/>
        <StatusTabs/>
        <div style={{padding:"12px 16px"}}>
          {myAssignments.length===0?(
            <div style={{
              textAlign:"center",padding:"60px 0",
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
              .filter(t=>{
                if (statusFilter==="RESOLVED")
                  return t.status==="RESOLVED"||
                         t.status==="REOPENED";
                return t.status===statusFilter;
              })
              .map(t=>(
                <TaskCard key={t.id} task={t}
                  onClick={async()=>{
                    await loadDetail(t.id);
                    prevView.current="myassignments";
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
        minHeight:"100dvh",background:"#f0ece6",
        paddingBottom:"40px"
      }}>
        <Header title={ntParentId
          ?"Add Sub-task":"New Task"}
          back onBack={()=>setView(prevView.current)}/>

        <form onSubmit={e=>void handleCreateTask(e)}
          style={{padding:"16px"}}>

          {/* Parent banner */}
          {ntParentTitle&&(
            <div className="fade" style={{
              background:"#f0fdf4",
              border:"1px solid #bbf7d0",
              borderRadius:"12px",padding:"12px",
              marginBottom:"16px"
            }}>
              <p style={{
                fontSize:"11px",color:"#166534",
                fontWeight:700,
                textTransform:"uppercase",
                letterSpacing:"0.08em"
              }}>Sub-task of</p>
              <p style={{
                fontSize:"14px",color:"#2c2420",
                fontWeight:600,marginTop:"2px"
              }}>{ntParentTitle}</p>
            </div>
          )}

          {/* Title */}
          <div style={{marginBottom:"16px"}}>
            <label style={{
              fontSize:"11px",fontWeight:700,
              color:"#8a7060",
              textTransform:"uppercase",
              letterSpacing:"0.1em",
              display:"block",marginBottom:"8px"
            }}>Title *</label>
            <input className="input"
              value={ntTitle}
              onChange={e=>setNtTitle(e.target.value)}
              placeholder="What needs to be done?"/>
          </div>

          {/* Description */}
          <div style={{marginBottom:"16px"}}>
            <label style={{
              fontSize:"11px",fontWeight:700,
              color:"#8a7060",
              textTransform:"uppercase",
              letterSpacing:"0.1em",
              display:"block",marginBottom:"8px"
            }}>Description</label>
            <textarea className="input"
              value={ntDesc}
              onChange={e=>setNtDesc(e.target.value)}
              placeholder="Add more context..."
              rows={3}
              style={{
                resize:"none",lineHeight:1.6
              }}/>
          </div>

          {/* Priority + Due date */}
          <div style={{
            display:"grid",
            gridTemplateColumns:"1fr 1fr",
            gap:"12px",marginBottom:"16px"
          }}>
            <div>
              <label style={{
                fontSize:"11px",fontWeight:700,
                color:"#8a7060",
                textTransform:"uppercase",
                letterSpacing:"0.1em",
                display:"block",marginBottom:"8px"
              }}>Priority</label>
              <div style={{
                display:"flex",flexDirection:"column",
                gap:"6px"
              }}>
                {(["LOW","MEDIUM","HIGH"] as Priority[])
                  .map(p=>(
                  <button key={p} type="button"
                    onClick={()=>setNtPriority(p)}
                    style={{
                      padding:"8px 10px",borderRadius:"10px",
                      border:"1.5px solid",
                      borderColor:ntPriority===p
                        ?PC[p]:"#e0d8ce",
                      background:ntPriority===p
                        ?PB[p]:"#fff",
                      color:ntPriority===p
                        ?PC[p]:"#8a7060",
                      fontSize:"12px",fontWeight:700,
                      cursor:"pointer",textAlign:"left",
                      display:"flex",alignItems:"center",
                      gap:"6px"
                    }}>
                    <div style={{
                      width:8,height:8,
                      borderRadius:"50%",
                      background:ntPriority===p
                        ?PC[p]:"#d0c8c0"
                    }}/>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{
                fontSize:"11px",fontWeight:700,
                color:"#8a7060",
                textTransform:"uppercase",
                letterSpacing:"0.1em",
                display:"block",marginBottom:"8px"
              }}>Due Date</label>
              <input type="date" className="input"
                value={ntDueDate}
                onChange={e=>setNtDueDate(e.target.value)}
                style={{marginBottom:"0"}}/>
            </div>
          </div>

          {/* Assignees */}
          <div style={{marginBottom:"16px"}}>
            <label style={{
              fontSize:"11px",fontWeight:700,
              color:"#8a7060",
              textTransform:"uppercase",
              letterSpacing:"0.1em",
              display:"block",marginBottom:"8px"
            }}>
              Assign To ({ntAssignees.length} selected)
            </label>
            <div style={{
              background:"#fff",
              border:"1.5px solid #e0d8ce",
              borderRadius:"12px",
              maxHeight:"180px",overflowY:"auto",
              padding:"4px"
            }}>
              {members
                .filter(m=>m.email!==myEmail)
                .map(m=>{
                  const sel = ntAssignees.includes(m.email);
                  return (
                    <div key={m.email}
                      onClick={()=>setNtAssignees(
                        sel
                          ?ntAssignees.filter(
                              e=>e!==m.email)
                          :[...ntAssignees,m.email]
                      )}
                      style={{
                        display:"flex",
                        alignItems:"center",
                        gap:"10px",padding:"10px 12px",
                        borderRadius:"8px",cursor:"pointer",
                        background:sel
                          ?"#f0fdf4":"transparent",
                        marginBottom:"2px",
                        transition:"background .15s"
                      }}>
                      <Avatar
                        name={m.name}
                        email={m.email}
                        size={32}/>
                      <div style={{flex:1}}>
                        <p style={{
                          fontSize:"13px",
                          fontWeight:sel?700:500,
                          color:"#1a1614"
                        }}>
                          {m.name??m.email.split("@")[0]}
                        </p>
                        <p style={{
                          fontSize:"11px",color:"#8a7060"
                        }}>{m.email}</p>
                      </div>
                      <div style={{
                        width:20,height:20,
                        borderRadius:"50%",
                        border:`2px solid ${
                          sel?"#166534":"#d0c8c0"
                        }`,
                        background:sel?"#166534":"transparent",
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"center",
                        color:"#fff",fontSize:"11px",
                        fontWeight:700,flexShrink:0
                      }}>
                        {sel?"✓":""}
                      </div>
                    </div>
                  );
                })}
              {members.filter(m=>m.email!==myEmail)
                .length===0&&(
                <p style={{
                  padding:"16px",textAlign:"center",
                  color:"#8a7060",fontSize:"13px"
                }}>
                  No team members found
                </p>
              )}
            </div>
          </div>

          {/* Attachments */}
          <div style={{marginBottom:"20px"}}>
            <label style={{
              fontSize:"11px",fontWeight:700,
              color:"#8a7060",
              textTransform:"uppercase",
              letterSpacing:"0.1em",
              display:"block",marginBottom:"8px"
            }}>Attachments</label>
            <div style={{
              display:"grid",
              gridTemplateColumns:"1fr 1fr 1fr",
              gap:"8px",marginBottom:"8px"
            }}>
              {[
                {label:"📷",hint:"Camera",
                  accept:"image/*",cap:"environment"},
                {label:"🖼",hint:"Gallery",
                  accept:"image/*,video/*"},
                {label:"🎤",hint:"Audio",
                  accept:"audio/*"},
              ].map((btn,i)=>(
                <label key={i} style={{
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  justifyContent:"center",
                  gap:"4px",padding:"12px 6px",
                  borderRadius:"12px",
                  border:"1.5px dashed #e0d8ce",
                  background:"#fafaf8",
                  fontSize:"20px",cursor:"pointer",
                  color:"#8a7060"
                }}>
                  {btn.label}
                  <span style={{
                    fontSize:"10px",fontWeight:600
                  }}>{btn.hint}</span>
                  <input type="file"
                    accept={btn.accept}
                    capture={btn.cap as any}
                    multiple={btn.hint==="Gallery"}
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
                background:"#fff",borderRadius:"10px",
                border:"1px solid #e0d8ce",
                marginBottom:"6px"
              }}>
                <span style={{fontSize:"18px"}}>
                  {f.type.startsWith("image")?"🖼"
                   :f.type.startsWith("video")?"🎥":"🎤"}
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
              background:"#1e3a2f",color:"#fffbf5",
              fontWeight:900,fontSize:"15px",
              cursor:"pointer",
              boxShadow:"0 4px 12px rgba(30,58,47,.25)"
            }}>
            {ntSubmitting
              ?"Creating...":"Create & Assign Task ✓"}
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
        minHeight:"100dvh",background:"#f0ece6",
        paddingBottom:"40px"
      }}>
        <Header title="Task Details" back
          onBack={()=>setView(prevView.current)}/>

        <div style={{padding:"16px"}}>
          {/* Status + Priority */}
          <div style={{
            display:"flex",gap:"8px",
            marginBottom:"14px",flexWrap:"wrap"
          }}>
            <StatusPill s={selected.status}/>
            <PriorityPill p={selected.priority}/>
            {selected.dueDate&&(
              <span style={{
                fontSize:"11px",fontWeight:600,
                padding:"3px 10px",borderRadius:"999px",
                background: new Date(selected.dueDate)
                  <new Date()&&
                  selected.status!=="RESOLVED"
                  ?"#fee2e2":"#f3f4f6",
                color: new Date(selected.dueDate)
                  <new Date()&&
                  selected.status!=="RESOLVED"
                  ?"#dc2626":"#6b7280"
              }}>
                📅 {new Date(selected.dueDate)
                  .toLocaleDateString("en-IN")}
              </span>
            )}
          </div>

          {/* Title */}
          <h2 style={{
            fontSize:"20px",fontWeight:900,
            color:"#1a1614",lineHeight:1.3,
            marginBottom:"12px",
            letterSpacing:"-0.3px"
          }}>{selected.title}</h2>

          {/* Description */}
          {selected.description&&(
            <div className="card" style={{
              padding:"14px",marginBottom:"14px"
            }}>
              <p style={{
                fontSize:"14px",color:"#4a3f38",
                lineHeight:1.7
              }}>{selected.description}</p>
            </div>
          )}

          {/* People card */}
          <div className="card" style={{
            padding:"14px",marginBottom:"14px"
          }}>
            {/* Creator */}
            <div style={{
              display:"flex",alignItems:"center",
              gap:"10px",marginBottom:
                selected.assignees.length>0?"12px":"0"
            }}>
              <Avatar
                name={selected.assignedByName??
                      selected.raisedByName}
                email={selected.assignedByEmail??
                       selected.raisedByEmail}
                size={36}/>
              <div style={{flex:1}}>
                <p style={{
                  fontSize:"11px",color:"#8a7060",
                  fontWeight:600,
                  textTransform:"uppercase",
                  letterSpacing:"0.08em"
                }}>Created by</p>
                <p style={{
                  fontSize:"13px",fontWeight:700,
                  color:"#1a1614"
                }}>
                  {selected.assignedByName??
                   selected.raisedByName??
                   selected.raisedByEmail.split("@")[0]}
                </p>
              </div>
              <p style={{
                fontSize:"11px",color:"#b8a898"
              }}>
                {timeAgo(selected.createdAt)}
              </p>
            </div>

            {/* Assignees */}
            {selected.assignees.length>0&&(
              <>
                <div style={{
                  height:"1px",
                  background:"#f0ece6",
                  margin:"0 -14px 12px"
                }}/>
                <p style={{
                  fontSize:"11px",color:"#8a7060",
                  fontWeight:600,
                  textTransform:"uppercase",
                  letterSpacing:"0.08em",
                  marginBottom:"10px"
                }}>
                  Assigned to ({selected.assignees.length})
                </p>
                <div style={{
                  display:"flex",flexDirection:"column",
                  gap:"8px"
                }}>
                  {selected.assignees.map(a=>(
                    <div key={a.id} style={{
                      display:"flex",
                      alignItems:"center",gap:"10px"
                    }}>
                      <Avatar
                        name={a.assigneeName}
                        email={a.assigneeEmail}
                        size={30}/>
                      <div style={{flex:1}}>
                        <p style={{
                          fontSize:"13px",fontWeight:600,
                          color:"#1a1614"
                        }}>
                          {a.assigneeName??
                           a.assigneeEmail.split("@")[0]}
                        </p>
                        <p style={{
                          fontSize:"11px",color:"#8a7060"
                        }}>{a.assigneeEmail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Status update buttons */}
          <div style={{
            display:"grid",
            gridTemplateColumns:"repeat(3,1fr)",
            gap:"8px",marginBottom:"14px"
          }}>
            {(["OPEN","IN_PROGRESS","RESOLVED"] as Status[])
              .map(s=>(
              <button key={s}
                disabled={selected.status===s||
                           statusUpdating}
                onClick={()=>void handleStatusUpdate(s)}
                style={{
                  padding:"10px 4px",borderRadius:"10px",
                  border:"1.5px solid",
                  borderColor:selected.status===s
                    ?SS[s].color:"#e0d8ce",
                  background:selected.status===s
                    ?SS[s].bg:"#fff",
                  color:selected.status===s
                    ?SS[s].color:"#8a7060",
                  fontSize:"11px",fontWeight:700,
                  cursor:selected.status===s
                    ?"default":"pointer",
                  opacity:statusUpdating?0.6:1
                }}>
                {SS[s].label}
              </button>
            ))}
          </div>

          {/* Attachments */}
          {selected.attachments.length>0&&(
            <div style={{marginBottom:"16px"}}>
              <p style={{
                fontSize:"11px",fontWeight:700,
                color:"#8a7060",
                textTransform:"uppercase",
                letterSpacing:"0.1em",marginBottom:"10px"
              }}>Attachments</p>
              <div style={{
                display:"flex",gap:"8px",
                flexWrap:"wrap"
              }}>
                {selected.attachments.map(a=>(
                  a.type==="image"?(
                    <a key={a.id} href={a.s3Url}
                      target="_blank"
                      rel="noopener noreferrer">
                      <img src={a.s3Url} alt=""
                        style={{
                          width:72,height:72,
                          objectFit:"cover",
                          borderRadius:"10px",
                          border:"1px solid #e0d8ce"
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
                        width:72,height:72,
                        borderRadius:"10px",
                        border:"1px solid #e0d8ce",
                        background:"#f4f1ec",
                        fontSize:"28px",
                        textDecoration:"none"
                      }}>
                      {a.type==="video"?"🎥":"🎤"}
                    </a>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Sub-tasks */}
          {selected.children&&
           selected.children.length>0&&(
            <div style={{marginBottom:"16px"}}>
              <p style={{
                fontSize:"11px",fontWeight:700,
                color:"#8a7060",
                textTransform:"uppercase",
                letterSpacing:"0.1em",
                marginBottom:"10px"
              }}>
                Sub-tasks ({selected.children.length})
              </p>
              {selected.children.map(child=>(
                <div key={child.id}
                  className="card pressable"
                  onClick={async()=>{
                    await loadDetail(child.id);
                  }}
                  style={{
                    padding:"12px 14px",
                    marginBottom:"8px"
                  }}>
                  <div style={{
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"space-between",
                    gap:"8px"
                  }}>
                    <p style={{
                      fontSize:"13px",fontWeight:600,
                      color:"#1a1614",flex:1
                    }}>{child.title}</p>
                    <StatusPill s={child.status} small/>
                  </div>
                  {child.assignees.length>0&&(
                    <div style={{
                      marginTop:"8px",
                      display:"flex",
                      alignItems:"center",gap:"6px"
                    }}>
                      <AssigneeAvatars
                        assignees={child.assignees}/>
                      <span style={{
                        fontSize:"11px",color:"#8a7060"
                      }}>
                        {child.assignees.length} assignee
                        {child.assignees.length>1?"s":""}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add sub-task */}
          <button onClick={()=>{
            setNtParentId(selected.id);
            setNtParentTitle(selected.title);
            prevView.current="detail";
            setView("new");
          }} style={{
            width:"100%",padding:"12px",
            borderRadius:"12px",
            border:"1.5px dashed #c8960a",
            background:"rgba(200,150,10,.04)",
            color:"#c8960a",fontSize:"13px",
            fontWeight:700,cursor:"pointer",
            marginBottom:"20px",
            display:"flex",alignItems:"center",
            justifyContent:"center",gap:"6px"
          }}>
            + Add Sub-task
          </button>

          {/* Query/Comments */}
          <p style={{
            fontSize:"11px",fontWeight:700,
            color:"#8a7060",
            textTransform:"uppercase",
            letterSpacing:"0.1em",marginBottom:"12px"
          }}>
            Conversation ({selected.events?.length??0})
          </p>

          {selected.events?.map(ev=>(
            <div key={ev.id} style={{
              padding:"12px 14px",borderRadius:"12px",
              marginBottom:"8px",
              background:ev.authorType==="ADMIN"
                ?"#f0fdf4"
                :ev.authorEmail===myEmail
                  ?"#eff6ff":"#fff",
              border:`1px solid ${
                ev.authorType==="ADMIN"?"#bbf7d0"
                :ev.authorEmail===myEmail?"#bfdbfe"
                :"#ede8e0"
              }`
            }}>
              <div style={{
                display:"flex",
                justifyContent:"space-between",
                alignItems:"flex-start",
                marginBottom:"6px"
              }}>
                <div style={{
                  display:"flex",
                  alignItems:"center",gap:"8px"
                }}>
                  <Avatar email={ev.authorEmail} size={24}/>
                  <span style={{
                    fontSize:"12px",fontWeight:700,
                    color:"#1a1614"
                  }}>
                    {ev.authorEmail===myEmail
                      ?"You"
                      :ev.authorEmail.split("@")[0]}
                    {ev.authorType==="ADMIN"
                      ?" (Admin)":""}
                  </span>
                </div>
                <span style={{
                  fontSize:"10px",color:"#b8a898"
                }}>
                  {timeAgo(ev.createdAt)}
                </span>
              </div>
              {ev.type==="STATUS_CHANGE"?(
                <p style={{
                  fontSize:"12px",color:"#1e40af",
                  fontWeight:600,
                  fontStyle:"italic"
                }}>
                  🔄 {ev.message}
                </p>
              ):(
                ev.message&&(
                  <p style={{
                    fontSize:"13px",color:"#4a3f38",
                    lineHeight:1.6,marginLeft:"32px"
                  }}>{ev.message}</p>
                )
              )}
            </div>
          ))}

          {/* Add query form */}
          <form onSubmit={e=>void handleAddQuery(e)}
            style={{
              background:"#fff",borderRadius:"14px",
              border:"1.5px solid #e0d8ce",
              padding:"14px",marginTop:"8px"
            }}>
            <p style={{
              fontSize:"12px",fontWeight:700,
              color:"#8a7060",marginBottom:"10px",
              textTransform:"uppercase",
              letterSpacing:"0.08em"
            }}>Add Query / Update</p>
            <textarea className="input"
              value={queryText}
              onChange={e=>setQueryText(e.target.value)}
              placeholder="Ask a question or add an update..."
              rows={2}
              style={{
                resize:"none",marginBottom:"10px",
                lineHeight:1.6
              }}/>
            <div style={{
              display:"flex",
              justifyContent:"space-between",
              alignItems:"center"
            }}>
              <label style={{
                display:"flex",alignItems:"center",
                gap:"6px",padding:"8px 12px",
                borderRadius:"8px",
                border:"1px solid #e0d8ce",
                background:"#fafaf8",
                fontSize:"12px",fontWeight:600,
                color:"#8a7060",cursor:"pointer"
              }}>
                📎 Attach
                <input type="file"
                  accept="image/*,video/*,audio/*"
                  multiple hidden
                  onChange={e=>{
                    if (e.target.files)
                      setQueryFiles(f=>[
                        ...f,
                        ...Array.from(e.target.files!)
                      ]);
                  }}/>
              </label>
              {queryFiles.length>0&&(
                <span style={{
                  fontSize:"11px",color:"#8a7060"
                }}>
                  {queryFiles.length} file(s) selected
                </span>
              )}
              <button type="submit"
                disabled={querySending||
                  (!queryText.trim()&&
                   queryFiles.length===0)}
                style={{
                  padding:"9px 18px",
                  borderRadius:"10px",border:"none",
                  background:"#1e3a2f",color:"#fffbf5",
                  fontWeight:700,fontSize:"13px",
                  cursor:"pointer",
                  opacity:querySending?0.6:1
                }}>
                {querySending?"Sending...":"Send"}
              </button>
            </div>
          </form>

          {/* Reopen */}
          {selected.status==="RESOLVED"&&(
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
              cursor:"pointer",marginTop:"12px",
              boxShadow:"0 4px 12px rgba(200,150,10,.3)"
            }}>
              ↩ Reopen Task
            </button>
          )}
        </div>
      </div>
    </>
  );

  // ── NOTIFICATIONS VIEW ────────────────────────────────
  if (view==="notifications") return (
    <>
      <style>{CSS}</style>
      <div style={{
        minHeight:"100dvh",background:"#f0ece6",
        paddingBottom:"40px"
      }}>
        <Header title="Notifications" back
          onBack={()=>setView("dashboard")}
          actions={
            <button onClick={()=>void markAllRead()}
              style={{
                background:"rgba(255,255,255,.1)",
                border:"none",color:"#f5d88a",
                fontSize:"11px",fontWeight:700,
                padding:"6px 12px",borderRadius:"8px",
                cursor:"pointer"
              }}>
              Mark all read
            </button>
          }/>

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
                className="card pressable fade"
                onClick={async()=>{
                  await loadDetail(n.taskId);
                  prevView.current="notifications";
                  setView("detail");
                }}
                style={{
                  padding:"14px",
                  marginBottom:"8px",
                  borderLeft:`4px solid ${
                    n.isRead?"#e0d8ce":"#c8960a"
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
                    {n.type==="ASSIGNED"?"📋"
                     :n.type==="REPLIED"?"💬"
                     :n.type==="CLOSED"?"✅":"🔔"}
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
                      background:"#c8960a",
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
        minHeight:"100dvh",background:"#f0ece6",
        paddingBottom:"100px"
      }}>
        <Header title="My Profile"/>

        <div style={{padding:"16px"}}>
          {/* Avatar hero */}
          <div style={{
            background:"linear-gradient(135deg,#1e3a2f,#2d5240)",
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
                  t=>t.status!=="RESOLVED").length,
                 l:"Active Tasks"},
                {n:myAssignments.filter(
                  t=>t.status!=="RESOLVED").length,
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
          <div className="card" style={{
            padding:"16px",marginBottom:"12px"
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
                  background:"#1e3a2f",color:"#fffbf5",
                  fontWeight:700,fontSize:"14px",
                  cursor:"pointer"
                }}>
                {pSaving?"Saving...":"Save Changes"}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="card" style={{
            padding:"16px",marginBottom:"12px"
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
                  background:"#1e3a2f",color:"#fffbf5",
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
