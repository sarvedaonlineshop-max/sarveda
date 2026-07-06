"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────
type View = "login"|"home"|"assigned"|"alltasks"
           |"profile"|"new"|"detail"|"notifications";

type AppHistoryState = {
  stack: View[];
  subtaskId?: string | null;
};
type Priority = "LOW"|"MEDIUM"|"HIGH";
type ApiStatus = "OPEN"|"IN_PROGRESS"|"RESOLVED"|"REOPENED";
type Status = "NEW"|"IN_PROGRESS"|"CLOSED"|"REOPENED";
type LoginMode = "password"|"otp";

type Member = {
  email: string;
  name: string | null;
  avatarUrl?: string | null;
};

type Assignee = {
  id: string; assigneeEmail: string; 
  assigneeName: string | null;
  responseStatus?: "PENDING"|"ACCEPTED"|"DENIED_AWAITING_OWNER";
  markedClosedAt?: string | null;
};

type Attachment = {
  id: string; type: string; s3Url: string;
  fileName: string | null;
  fileSizeBytes?: number | null;
};

type TaskEvent = {
  id: string; type: string; authorEmail: string;
  authorType: string; message: string | null;
  createdAt: string;
  attachments?: Attachment[];
};

type Task = {
  id: string; title: string;
  description: string | null;
  priority: Priority; status: ApiStatus;
  createdAt: string; updatedAt: string;
  raisedByEmail: string; raisedByName: string | null;
  assignedByEmail: string | null;
  assignedByName: string | null;
  parentId?: string | null;
  assignees: Assignee[];
  attachments: Attachment[];
  events?: TaskEvent[];
  children?: Task[];
  dueDate?: string | null;
  pendingDeadlineDate?: string | null;
  pendingDeadlineRequestedBy?: string | null;
  _count?: { events: number };
  unreadCount?: number;
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
const NAV_BAR_H = 58;
const SCROLL_BOTTOM_PAD =
  `calc(${NAV_BAR_H}px + env(safe-area-inset-bottom, 8px) + 12px)`;

const FETCH_NO_CACHE: RequestInit = { cache: "no-store" };

function isJwtExpired(token: string): boolean {
  try {
    const part = token.split(".")[1];
    if (!part) return true;
    const payload = JSON.parse(atob(part)) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

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

type PriorityFilter = Priority | "ALL";

function taskListStatus(
  task: Task,
  email: string,
  usePerUserStatus: boolean
): ApiStatus {
  return apiStatus(viewerListStatus(task, email, usePerUserStatus));
}

function matchesListFilters(
  task: Task,
  statusFilter: "NEW"|"IN_PROGRESS"|"CLOSED",
  priorityFilter: PriorityFilter,
  email: string,
  usePerUserStatus: boolean
): boolean {
  if (task.parentId) return false;
  if (!taskMatchesFilter(taskListStatus(task, email, usePerUserStatus), statusFilter)) {
    return false;
  }
  if (priorityFilter !== "ALL" && task.priority !== priorityFilter) return false;
  return true;
}

function countTasksByStatus(
  tasks: Task[],
  email: string,
  usePerUserStatus: boolean
): Record<"NEW"|"IN_PROGRESS"|"CLOSED", number> {
  const roots = rootTasksOnly(tasks);
  return {
    NEW: roots.filter((t) =>
      taskMatchesFilter(taskListStatus(t, email, usePerUserStatus), "NEW")
    ).length,
    IN_PROGRESS: roots.filter((t) =>
      taskMatchesFilter(taskListStatus(t, email, usePerUserStatus), "IN_PROGRESS")
    ).length,
    CLOSED: roots.filter((t) =>
      taskMatchesFilter(taskListStatus(t, email, usePerUserStatus), "CLOSED")
    ).length,
  };
}

function countTasksByPriority(
  tasks: Task[],
  statusFilter: "NEW"|"IN_PROGRESS"|"CLOSED",
  email: string,
  usePerUserStatus: boolean
): Record<PriorityFilter, number> {
  const roots = rootTasksOnly(tasks).filter((t) =>
    taskMatchesFilter(taskListStatus(t, email, usePerUserStatus), statusFilter)
  );
  return {
    ALL: roots.length,
    HIGH: roots.filter((t) => t.priority === "HIGH").length,
    MEDIUM: roots.filter((t) => t.priority === "MEDIUM").length,
    LOW: roots.filter((t) => t.priority === "LOW").length,
  };
}

function rootTasksOnly(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.parentId);
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    assignees: task.assignees ?? [],
    attachments: task.attachments ?? [],
    children: task.children?.map(normalizeTask),
    unreadCount: task.unreadCount ?? 0,
  };
}

function normalizeTasks(tasks: Task[]): Task[] {
  return tasks.map(normalizeTask);
}

function sortTasksByRecent(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
}

function emailsMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function formatNameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, ${names.at(-1)}`;
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function isTaskClosed(status: ApiStatus): boolean {
  return status === "RESOLVED";
}

function assigneeForEmail(task: Task, email: string): Assignee | undefined {
  return (task.assignees ?? []).find(
    (a) => a.assigneeEmail.toLowerCase() === email.toLowerCase()
  );
}

function viewerListStatus(task: Task, email: string, usePerUserStart: boolean): Status {
  if (!usePerUserStart) return uiStatus(task.status);

  if (task.status === "RESOLVED") return "CLOSED";

  const isOwner = isTaskOwner(task, email);
  const mine = assigneeForEmail(task, email);

  if (!isOwner && mine?.markedClosedAt) return "CLOSED";

  if (mine && task.status === "IN_PROGRESS" && mine.responseStatus !== "ACCEPTED") {
    return "NEW";
  }
  return uiStatus(task.status);
}

function isTaskOwner(task: Task, email: string): boolean {
  return task.raisedByEmail.toLowerCase() === email.toLowerCase();
}

function canParticipateInTask(task: Task, email: string): boolean {
  const e = email.toLowerCase();
  if (task.raisedByEmail.toLowerCase() === e) return true;
  if (task.assignedByEmail?.toLowerCase() === e) return true;
  return (task.assignees ?? []).some((a) => a.assigneeEmail.toLowerCase() === e);
}

function attachmentIcon(type: string): string {
  if (type === "image") return "🖼";
  if (type === "video") return "🎥";
  if (type === "audio") return "🎤";
  return "📄";
}

const MAX_CHAT_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_CHAT_ATTACHMENTS = 20;
const UPLOAD_LIMITS_HINT =
  `Up to ${MAX_CHAT_ATTACHMENTS} files · 250 MB total per send`;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function headerTitle(task: Task): string {
  const t = task.title.trim();
  return t.length > 36 ? `${t.slice(0, 36)}…` : t || "Task";
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function IconPaperclip({
  size = 22, color = "#8696a0",
}: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden>
      <path d="M16.5 6.5v8.25a4.5 4.5 0 1 1-9 0V7a3 3 0 1 1 6 0v7.5a1.5 1.5 0 1 1-3 0V8"
        stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconCamera({
  size = 22, color = "#8696a0",
}: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden>
      <path d="M4 8.5h2.2l1.4-2h8.8l1.4 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"
        stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <circle cx="12" cy="13.5" r="3.2" stroke={color} strokeWidth="1.8"/>
    </svg>
  );
}

function IconMic({
  size = 22, color = "#fff",
}: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3"
        fill={color}/>
      <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5v3.5"
        stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconSend({
  size = 20, color = "#fff",
}: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
        fill={color}/>
    </svg>
  );
}

function IconBack({
  size = 22, color = "#fff",
}: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden>
      <path d="M15 6l-6 6 6 6"
        stroke={color} strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconRefresh({
  size = 20, color = "#075E54",
}: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden>
      <path d="M21 12a9 9 0 1 1-2.64-6.36"
        stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M21 3v6h-6"
        stroke={color} strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function PullRefreshIndicator({
  pullDistance, refreshing,
}: { pullDistance: number; refreshing: boolean }) {
  const show = pullDistance > 0 || refreshing;
  const armed = pullDistance >= 70;
  const spinDeg = refreshing
    ? undefined
    : Math.min(pullDistance / 70, 1) * 360;

  return (
    <div style={{
      height: show ? 52 : 0,
      transition: refreshing ? undefined : "height .15s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 2px 10px rgba(0,0,0,.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: spinDeg !== undefined
          ? `rotate(${spinDeg}deg) scale(${armed ? 1 : 0.88})`
          : undefined,
        animation: refreshing
          ? "sv-pull-spin .75s linear infinite" : undefined,
        opacity: show ? 1 : 0,
      }}>
        <IconRefresh size={20} color="#075E54"/>
      </div>
    </div>
  );
}

function resolvePersonName(
  email: string,
  task: Task | null | undefined,
  members: Member[],
  viewerEmail: string,
  viewerName: string
): string {
  if (emailsMatch(email, viewerEmail)) {
    return viewerName || "You";
  }
  const member = members.find((m) => emailsMatch(m.email, email));
  if (member?.name) return member.name;
  if (task) {
    if (task.assignedByEmail && emailsMatch(task.assignedByEmail, email)
      && task.assignedByName) {
      return task.assignedByName;
    }
    if (emailsMatch(task.raisedByEmail, email) && task.raisedByName) {
      return task.raisedByName;
    }
    const a = (task.assignees ?? []).find(
      (x) => emailsMatch(x.assigneeEmail, email)
    );
    if (a?.assigneeName) return a.assigneeName;
  }
  return email.split("@")[0];
}

function formatAssignPromptMessage(
  raw: string,
  viewerEmail: string,
  task: Task | null | undefined,
  members: Member[],
  viewerName: string
): string | null {
  if (!raw.startsWith("@@ASSIGN_PROMPT@@")) return null;
  const payload = raw.slice("@@ASSIGN_PROMPT@@".length);
  const [ownerEmail, ...memberEmails] = payload.split("|");
  if (!ownerEmail || memberEmails.length === 0) return null;

  const ownerName = resolvePersonName(
    ownerEmail, task, members, viewerEmail, viewerName
  );
  const isOwner = emailsMatch(viewerEmail, ownerEmail);
  const labels = memberEmails.map((email) => {
    if (!isOwner && emailsMatch(email, viewerEmail)) return "you";
    return resolvePersonName(
      email, task, members, viewerEmail, viewerName
    );
  });

  const youIdx = labels.indexOf("you");
  const nameList = youIdx >= 0
    ? (labels.length === 1
      ? "you"
      : `you, ${formatNameList(labels.filter((_, i) => i !== youIdx))}`)
    : formatNameList(labels);

  return `${ownerName} has added ${nameList} to this task. Please press start button to proceed.`;
}

function systemMessageText(
  message: string,
  viewerEmail: string,
  task: Task | null | undefined,
  members: Member[],
  viewerName: string
): string {
  const body = message.replace("@@SYSTEM@@", "");
  return formatAssignPromptMessage(
    body, viewerEmail, task, members, viewerName
  ) ?? body;
}

function isStartPromptMessage(message: string): boolean {
  const body = message.replace("@@SYSTEM@@", "");
  return body.startsWith("@@ASSIGN_PROMPT@@")
    || body.includes("Please press Start button to proceed.")
    || body.includes("Please press start button to proceed.");
}

function seedAppHistory(stack: View[]) {
  const state: AppHistoryState = {
    stack: [...stack],
    subtaskId: null,
  };
  const path = window.location.pathname;
  window.history.replaceState(state, "", path);
  window.history.pushState(state, "", path);
  try {
    sessionStorage.setItem("sv_view_stack", JSON.stringify(stack));
  } catch { /* ignore */ }
}

function IconChevronDown({
  size = 16, color = "#667781",
}: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      aria-hidden>
      <path d="m6 9 6 6 6-6" stroke={color}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function AttachmentActionMenu({
  open, onClose, onDownload, onDelete, canDelete,
}: {
  open: boolean;
  onClose: () => void;
  onDownload: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} style={{
      position:"absolute",top:6,right:6,zIndex:20,
      background:"#233138",borderRadius:10,
      boxShadow:"0 8px 24px rgba(0,0,0,.28)",
      minWidth:148,overflow:"hidden"
    }}>
      <button type="button"
        onClick={()=>{ onDownload(); onClose(); }}
        style={{
          width:"100%",padding:"12px 14px",
          border:"none",background:"transparent",
          color:"#e9edef",fontSize:14,fontWeight:500,
          display:"flex",alignItems:"center",gap:12,
          cursor:"pointer",textAlign:"left"
        }}>
        <span style={{fontSize:16}}>⬇</span> Download
      </button>
      {canDelete && onDelete && (
        <button type="button"
          onClick={()=>{ onDelete(); onClose(); }}
          style={{
            width:"100%",padding:"12px 14px",
            border:"none",background:"transparent",
            color:"#ea7070",fontSize:14,fontWeight:500,
            display:"flex",alignItems:"center",gap:12,
            cursor:"pointer",textAlign:"left",
            borderTop:"1px solid rgba(255,255,255,.08)"
          }}>
          <span style={{fontSize:16}}>🗑</span> Delete
        </button>
      )}
    </div>
  );
}

function WhatsAppAudioPlayer({src}:{src:string}) {
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [playing,setPlaying] = useState(false);
  const [duration,setDuration] = useState(0);
  const [current,setCurrent] = useState(0);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    const onMeta = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onEnd = () => { setPlaying(false); setCurrent(0); };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, [src]);

  const progress = duration > 0 ? current / duration : 0;

  return (
    <div style={{
      display:"flex",alignItems:"center",gap:10,
      padding:"8px 10px 6px",minWidth:210,maxWidth:260
    }}>
      <button type="button"
        onClick={()=>{
          const audio = audioRef.current;
          if (!audio) return;
          if (playing) {
            audio.pause();
            setPlaying(false);
          } else {
            void audio.play().then(()=>setPlaying(true))
              .catch(()=>{});
          }
        }}
        style={{
          width:34,height:34,borderRadius:"50%",
          border:"none",background:"#075E54",
          color:"#fff",fontSize:14,cursor:"pointer",
          display:"flex",alignItems:"center",
          justifyContent:"center",flexShrink:0
        }}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div style={{flex:1,minWidth:0}}>
        <div style={{
          position:"relative",height:24,
          display:"flex",alignItems:"center",gap:2
        }}>
          {Array.from({length:28},(_,i)=>{
            const barProgress = i / 27;
            const active = barProgress <= progress;
            return (
              <div key={i} style={{
                width:2,borderRadius:2,flexShrink:0,
                height:`${Math.max(28,
                  Math.sin(i * 0.75) * 42 + 48
                )}%`,
                background: active ? "#53bdeb" : "#9bb0b8",
                opacity: active ? 1 : 0.65
              }}/>
            );
          })}
          <div style={{
            position:"absolute",
            left:`${Math.max(0, Math.min(100, progress * 100))}%`,
            top:"50%",transform:"translate(-50%,-50%)",
            width:10,height:10,borderRadius:"50%",
            background:"#53bdeb",
            boxShadow:"0 0 0 2px rgba(255,255,255,.9)"
          }}/>
        </div>
        <div style={{
          display:"flex",justifyContent:"space-between",
          marginTop:4,fontSize:11,color:"#667781"
        }}>
          <span>{formatAudioTime(playing ? current : duration)}</span>
        </div>
      </div>
    </div>
  );
}

function ChatAttachmentBubble({
  a, canDelete, onDelete,
}: {
  a: Attachment;
  canDelete?: boolean;
  onDelete?: (attachment: Attachment) => void;
}) {
  const isImage = a.type==="image";
  const isVideo = a.type==="video";
  const isAudio = a.type==="audio";
  const isDoc = a.type==="document"||a.type==="file";
  const [imgErr, setImgErr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const download = () => {
    const link = document.createElement("a");
    link.href = a.s3Url;
    link.download = a.fileName ?? "download";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const view = () => {
    if (isAudio) return;
    window.open(a.s3Url, "_blank", "noopener");
  };

  const shellStyle: React.CSSProperties = {
    position:"relative",
    borderRadius:10,
    overflow:"visible",
    maxWidth:260,
    background:"rgba(255,255,255,.55)",
  };

  const menuBtn = (
    <button type="button"
      onClick={e=>{ e.stopPropagation(); setMenuOpen(p=>!p); }}
      style={{
        position:"absolute",top:4,right:4,zIndex:15,
        width:24,height:24,borderRadius:6,
        border:"none",background:"rgba(255,255,255,.88)",
        display:"flex",alignItems:"center",
        justifyContent:"center",cursor:"pointer",
        boxShadow:"0 1px 4px rgba(0,0,0,.12)"
      }}
      aria-label="Attachment options">
      <IconChevronDown size={14}/>
    </button>
  );

  const menu = (
    <AttachmentActionMenu
      open={menuOpen}
      onClose={()=>setMenuOpen(false)}
      onDownload={download}
      onDelete={onDelete ? ()=>onDelete(a) : undefined}
      canDelete={canDelete}
    />
  );

  if (isImage && !imgErr) return (
    <div style={shellStyle}>
      {menuBtn}
      {menu}
      <div onClick={view} style={{cursor:"pointer",borderRadius:10,overflow:"hidden"}}>
        <img src={a.s3Url} alt={a.fileName??"image"}
          onError={()=>setImgErr(true)}
          style={{
            width:"100%",maxHeight:220,display:"block",
            objectFit:"cover"
          }}/>
      </div>
    </div>
  );

  if (isVideo) return (
    <div style={shellStyle}>
      {menuBtn}
      {menu}
      <video src={a.s3Url} controls playsInline
        onClick={e=>e.stopPropagation()}
        style={{
          width:"100%",maxHeight:220,display:"block",
          background:"#000",borderRadius:10
        }}/>
    </div>
  );

  if (isAudio) return (
    <div style={{...shellStyle, overflow:"hidden"}}>
      {menuBtn}
      {menu}
      <WhatsAppAudioPlayer src={a.s3Url}/>
    </div>
  );

  return (
    <div style={shellStyle}>
      {menuBtn}
      {menu}
      <div onClick={view} style={{
        display:"flex",alignItems:"center",gap:10,
        padding:"10px 12px",cursor:"pointer"
      }}>
        <div style={{
          width:36,height:36,borderRadius:8,
          background:"#1e3a2f",color:"#f5d88a",
          display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:18,flexShrink:0
        }}>
          {isDoc?"📄":"📎"}
        </div>
        <div style={{flex:1,minWidth:0,paddingRight:18}}>
          <p style={{
            fontSize:12,fontWeight:600,color:"#1a1614",
            margin:0,overflow:"hidden",
            textOverflow:"ellipsis",whiteSpace:"nowrap"
          }}>
            {a.fileName??"Attachment"}
          </p>
          {a.fileSizeBytes!=null&&a.fileSizeBytes>0&&(
            <p style={{
              fontSize:10,color:"#8a7060",margin:"2px 0 0"
            }}>
              {formatBytes(a.fileSizeBytes)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatMedia({
  attachments, canDelete, onDeleteMessage,
}: {
  attachments: Attachment[];
  canDelete?: boolean;
  onDeleteMessage?: (attachment: Attachment) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div style={{
      display:"flex",flexDirection:"column",
      gap:8,marginTop:6
    }}>
      {attachments.map(a=>(
        <ChatAttachmentBubble key={a.id} a={a}
          canDelete={canDelete}
          onDelete={onDeleteMessage}
        />
      ))}
    </div>
  );
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

function renderLinkedText(
  text: string,
  linkColor = "#0b57d0"
): React.ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi);
  return parts.map((part, idx) => {
    const isUrl = /^(https?:\/\/|www\.)/i.test(part);
    if (!isUrl) {
      return (
        <span key={idx} style={{ whiteSpace: "pre-wrap" }}>
          {part}
        </span>
      );
    }
    const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
    return (
      <a
        key={idx}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: linkColor,
          textDecoration: "underline",
          wordBreak: "break-word",
        }}
      >
        {part}
      </a>
    );
  });
}

function TimeAgo({date}:{date:string}) {
  const [label,setLabel] = useState("…");
  useEffect(()=>{
    setLabel(timeAgo(date));
    const t = window.setInterval(
      ()=>setLabel(timeAgo(date)),30000
    );
    return ()=>window.clearInterval(t);
  },[date]);
  return <span>{label}</span>;
}

function AttachToastBar({message}:{message:string|null}) {
  if (!message) return null;
  return (
    <div style={{
      position:"fixed",top:12,left:"50%",
      transform:"translateX(-50%)",
      zIndex:9999,maxWidth:"min(92vw,400px)",
      padding:"12px 16px",
      background:"#1a1614",color:"#fff",
      borderRadius:12,fontSize:14,fontWeight:600,
      boxShadow:"0 8px 32px rgba(0,0,0,.35)",
      textAlign:"center",pointerEvents:"none"
    }}>
      {message}
    </div>
  );
}

const CHAT_FILE_INPUT_STYLE: React.CSSProperties = {
  position:"absolute",inset:0,
  width:"100%",height:"100%",
  opacity:0,cursor:"pointer",
  fontSize:16,zIndex:2,
};

function Avatar({
  name,email,size=36,avatarUrl
}:{name?:string|null;email:string;size?:number;
  avatarUrl?:string|null}) {
  const [broken,setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [avatarUrl, email]);

  if (avatarUrl && !broken) {
    return (
      <img
        key={`${email}:${avatarUrl}`}
        src={avatarUrl} alt=""
        onError={()=>setBroken(true)}
        style={{
          width:size,height:size,borderRadius:"50%",
          objectFit:"cover",objectPosition:"center",flexShrink:0,
          display:"block"
        }}/>
    );
  }
  const init = (name??email).split(" ")
    .map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const palettes = [
    ["#1e3a2f","#f5d88a"],["#1e40af","#bfdbfe"],
    ["#7c3aed","#ddd6fe"],["#b45309","#fde68a"],
    ["#be123c","#fecdd3"],["#0f766e","#99f6e4"],
  ];
  const [bg,fg] = palettes[email.toLowerCase().charCodeAt(0)%palettes.length];
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
  assignees,max=3,memberLookup
}:{assignees:Assignee[];max?:number;
  memberLookup?:Member[]}) {
  const show = assignees.slice(0,max);
  const rest = assignees.length - max;
  const avatarUrl = (email:string) =>
    memberLookup?.find(
      m=>emailsMatch(m.email, email)
    )?.avatarUrl??null;
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
            avatarUrl={avatarUrl(a.assigneeEmail)}
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
  const [priorityFilter,setPriorityFilter] =
    useState<PriorityFilter>("ALL");

  // New task state
  const [ntTitle,setNtTitle] = useState("");
  const [ntDesc,setNtDesc] = useState("");
  const [ntPriority,setNtPriority] = useState<Priority>("LOW");
  const [ntAssignees,setNtAssignees] = useState<string[]>([]);
  const [ntDueDate,setNtDueDate] = useState(defaultDueDate);
  const [ntFiles,setNtFiles] = useState<File[]>([]);
  const [ntFilePreviews,setNtFilePreviews] = useState<string[]>([]);
  const [ntAttachStatus,setNtAttachStatus] = useState<string|null>(null);
  const [ntUploadProgress,setNtUploadProgress] = useState<number|null>(null);
  const [ntParentId,setNtParentId] = useState<string|null>(null);
  const [ntParentTitle,setNtParentTitle] = 
    useState<string|null>(null);
  const [ntSubmitting,setNtSubmitting] = useState(false);
  const [ntMsg,setNtMsg] = useState("");

  // Query/comment state
  const [msgInput,setMsgInput] = useState("");
  const [msgFiles,setMsgFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] =
    useState<number|null>(null);
  const [attachStatus, setAttachStatus] =
    useState<string|null>(null);
  const [attachToast, setAttachToast] =
    useState<string|null>(null);
  const [msgFilePreviews,setMsgFilePreviews] =
    useState<string[]>([]);
  const [querySending,setQuerySending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob|null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder|null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob|null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // WhatsApp UI state
  const [rememberMe,setRememberMe] = useState(false);
  const [showMemberPicker,setShowMemberPicker] =
    useState(false);
  const [subtaskPanel,setSubtaskPanel] = useState<Task|null>(null);
  const [subtaskLoading,setSubtaskLoading] = useState(false);
  const [showTaskMenu,setShowTaskMenu] = useState(false);
  const [showDeleteConfirm,setShowDeleteConfirm] =
    useState(false);
  const [showSubtasks,setShowSubtasks] =
    useState<Record<string,boolean>>({});
  const [showMembersModal,setShowMembersModal] = useState(false);
  const [showDueDateModal,setShowDueDateModal] = useState(false);
  const [showExtendDeadlineModal,setShowExtendDeadlineModal] = useState(false);
  const [extendDeadlineDraft,setExtendDeadlineDraft] = useState("");
  const [dueDateDraft,setDueDateDraft] = useState("");
  const [membersDraft,setMembersDraft] = useState<string[]>([]);
  const [membersSaving,setMembersSaving] = useState(false);
  const [msgMenuId,setMsgMenuId] = useState<string|null>(null);
  const [selectedDelete,setSelectedDelete] = useState<{
    kind: "message" | "task-attachment";
    id: string;
  } | null>(null);
  const [keyboardInset,setKeyboardInset] = useState(0);
  const [myAvatarUrl,setMyAvatarUrl] = useState<string|null>(null);
  const [hasPassword,setHasPassword] = useState(true);
  const [showCurPwd,setShowCurPwd] = useState(false);
  const [showNewPwd,setShowNewPwd] = useState(false);
  const [avatarUploading,setAvatarUploading] = useState(false);
  const [showAvatarPicker,setShowAvatarPicker] = useState(false);
  const [pullDistance,setPullDistance] = useState(0);
  const [refreshing,setRefreshing] = useState(false);

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

  const viewStack = useRef<View[]>(["home"]);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const pullStartY = useRef<number|null>(null);
  const pullArmed = useRef(false);
  const pullDistanceRef = useRef(0);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const avatarCameraRef = useRef<HTMLInputElement>(null);
  const avatarGalleryRef = useRef<HTMLInputElement>(null);
  const toPickerRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const camBarRef = useRef<HTMLInputElement>(null);
  const swipeRef = useRef<{
    id: string; startX: number; startY: number;
  } | null>(null);

  // ── Helpers ──────────────────────────────────────────
  const ah = useCallback((t?:string) => ({
    Authorization:`Bearer ${t??token??""}`,
    "Content-Type":"application/json",
  }),[token]);

  function pullHandlers(onRefresh: () => Promise<void>) {
    return {
      onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (el.scrollTop <= 0) {
          pullStartY.current = e.touches[0].clientY;
          pullArmed.current = true;
        } else {
          pullStartY.current = null;
          pullArmed.current = false;
        }
      },
      onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => {
        if (!pullArmed.current || pullStartY.current == null || refreshing) {
          return;
        }
        const delta = Math.max(0, e.touches[0].clientY - pullStartY.current);
        const d = Math.min(delta, 90);
        pullDistanceRef.current = d;
        setPullDistance(d);
      },
      onTouchEnd: () => {
        const shouldRefresh =
          pullArmed.current && pullDistanceRef.current >= 70 && !refreshing;
        pullStartY.current = null;
        pullArmed.current = false;
        if (shouldRefresh) {
          void onRefresh();
        } else {
          pullDistanceRef.current = 0;
          setPullDistance(0);
        }
      }
    };
  }

  const writeHistory = useCallback((
    stack: View[],
    mode: "push" | "replace",
    subtaskId?: string | null
  ) => {
    const state: AppHistoryState = {
      stack: [...stack],
      subtaskId: subtaskId ?? null,
    };
    const path = window.location.pathname;
    if (mode === "replace") {
      window.history.replaceState(state, "", path);
    } else {
      window.history.pushState(state, "", path);
    }
    try {
      sessionStorage.setItem("sv_view_stack", JSON.stringify(stack));
    } catch { /* ignore */ }
  }, []);

  const switchTab = useCallback((tab: View) => {
    viewStack.current = [tab];
    setSelected(null);
    setSubtaskPanel(null);
    writeHistory(viewStack.current, "replace");
    setView(tab);
  }, [writeHistory]);

  const pushView = useCallback((next: View) => {
    viewStack.current.push(next);
    writeHistory(viewStack.current, "push");
    setView(next);
  }, [writeHistory]);

  const openNewTask = useCallback((
    from: View,
    parentId?: string | null,
    parentTitle?: string | null
  ) => {
    if (from === "detail" && viewStack.current.includes("detail")) {
      viewStack.current.push("new");
    } else {
      viewStack.current = [from, "new"];
    }
    writeHistory(viewStack.current, "push");
    setNtParentId(parentId ?? null);
    setNtParentTitle(parentTitle ?? null);
    setView("new");
  }, [writeHistory]);

  function personName(
    email:string,task?:Task|null
  ): string {
    if (email===myEmail) return myName||"You";
    const member = members.find(m=>m.email===email);
    if (member?.name) return member.name;
    if (task) {
      if (task.assignedByEmail===email&&task.assignedByName)
        return task.assignedByName;
      if (task.raisedByEmail===email&&task.raisedByName)
        return task.raisedByName;
      const a = (task.assignees ?? []).find(
        x=>x.assigneeEmail===email
      );
      if (a?.assigneeName) return a.assigneeName;
    }
    return email.split("@")[0];
  }

  function avatarFor(email:string): string|null {
    if (emailsMatch(email, myEmail) && myAvatarUrl) return myAvatarUrl;
    return members.find(
      (m) => emailsMatch(m.email, email)
    )?.avatarUrl ?? null;
  }

  const loadMeProfile = useCallback(async (t?:string) => {
    const tk = t??token;
    if (!tk) return;
    const r = await fetch(`${API}/auth/me`,{
      headers:{Authorization:`Bearer ${tk}`},
    });
    if (r.ok) {
      const d = await r.json() as any;
      const u = d.data?.user??d.user;
      setHasPassword(!!u?.hasPassword);
    }
  },[token]);

  function saveSession(
    t:string,email:string,name:string,phone:string,
    remember=false
  ) {
    localStorage.setItem("sv_token",t);
    localStorage.setItem("sv_email",email.toLowerCase());
    localStorage.setItem("sv_name",name);
    localStorage.setItem("sv_phone",phone);
    if (remember) {
      const exp = Date.now()+(90*24*60*60*1000);
      localStorage.setItem("sv_expiry",String(exp));
    } else {
      localStorage.removeItem("sv_expiry");
    }
    setToken(t);setMyEmail(email.toLowerCase());
    setMyName(name);setMyPhone(phone);
  }

  function logout(message?: string) {
    ["sv_token","sv_email","sv_name","sv_phone","sv_expiry"]
      .forEach(k=>localStorage.removeItem(k));
    if (pollRef.current) clearInterval(pollRef.current);
    setToken(null);
    setView("login");
    setDashTasks([]);
    setMyTasks([]);
    setMyAssignments([]);
    setDashStats({ open: 0, inProgress: 0, resolved: 0, total: 0 });
    if (message) setLErr(message);
  }

  function authFailed(message: string) {
    logout(message);
  }

  // ── Data loading ─────────────────────────────────────
  const loadDashboard = useCallback(async (t?:string) => {
    const tk = t??token;
    if (!tk) return;
    const r = await fetch(`${API}/complaints/all`, {
      ...FETCH_NO_CACHE,
      headers:{Authorization:`Bearer ${tk}`},
    });
    if (r.status === 401 || r.status === 403) {
      authFailed("Session expired. Please sign in again.");
      return;
    }
    if (r.ok) {
      const d = await r.json() as any;
      const tasks = normalizeTasks(d.complaints??d.tasks??[]);
      setDashTasks(tasks);
      setDashStats({
        open: tasks.filter((t: Task) => t.status === "OPEN" || t.status === "REOPENED").length,
        inProgress: tasks.filter((t: Task) => t.status === "IN_PROGRESS").length,
        resolved: tasks.filter((t: Task) => t.status === "RESOLVED").length,
        total: tasks.length
      });
    }
  },[token]);

  const loadMyTasks = useCallback(async (t?:string) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/assigned-to-me`, {
      ...FETCH_NO_CACHE,
      headers:{Authorization:`Bearer ${tk}`},
    });
    if (r.status === 401 || r.status === 403) {
      authFailed("Session expired. Please sign in again.");
      return;
    }
    if (r.ok) {
      const d = await r.json() as any;
      setMyTasks(normalizeTasks(d.tasks??[]));
    }
  },[token]);

  const loadMyAssignments = useCallback(async (t?:string) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/assigned-by-me`, {
      ...FETCH_NO_CACHE,
      headers:{Authorization:`Bearer ${tk}`},
    });
    if (r.status === 401 || r.status === 403) {
      authFailed("Session expired. Please sign in again.");
      return;
    }
    if (r.ok) {
      const d = await r.json() as any;
      setMyAssignments(normalizeTasks(d.tasks??[]));
    }
  },[token]);

  const loadMembers = useCallback(async (t?:string) => {
    const tk = t??token; if (!tk) return;
    const r = await fetch(`${API}/complaints/team-members`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      const list = ((d.members??[]) as Member[]).map((m) => ({
        ...m,
        email: m.email.toLowerCase(),
      }));
      setMembers(list);
      const me = list.find((m) => emailsMatch(m.email, myEmail));
      if (me?.avatarUrl) setMyAvatarUrl(me.avatarUrl);
    }
  },[token, myEmail]);

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
    const tk = t??token; if (!tk) return null;
    const r = await fetch(`${API}/complaints/${id}`,
      {headers:{Authorization:`Bearer ${tk}`}});
    if (r.ok) {
      const d = await r.json() as any;
      const task = d.complaint
        ? normalizeTask(d.complaint as Task)
        : null;
      setSelected(task);
      return task;
    }
    return null;
  },[token]);

  const markTaskRead = useCallback(async (taskId: string, t?: string) => {
    const tk = t ?? token;
    if (!tk) return;
    await fetch(`${API}/complaints/${taskId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tk}` },
    }).catch(() => null);
  }, [token]);

  const openTaskDetail = useCallback(async (taskId: string, from: View) => {
    viewStack.current = [from, "detail"];
    writeHistory(viewStack.current, "push");
    setSubtaskPanel(null);
    await loadDetail(taskId);
    await markTaskRead(taskId);
    void loadNotifications();
    if (from === "home") void loadMyTasks();
    if (from === "assigned") void loadMyAssignments();
    if (from === "alltasks") void loadDashboard();
    if (from === "notifications") void loadNotifications();
    setView("detail");
    scrollChatToBottom();
    window.setTimeout(scrollChatToBottom, 200);
  }, [loadDashboard, loadDetail, loadMyAssignments, loadMyTasks, loadNotifications, markTaskRead, writeHistory]);

  const loadSubtaskPanel = useCallback(async (id:string) => {
    const tk = token; if (!tk) return;
    setSubtaskLoading(true);
    try {
      const r = await fetch(`${API}/complaints/${id}`,
        {headers:{Authorization:`Bearer ${tk}`}});
      if (r.ok) {
        const d = await r.json() as any;
        setSubtaskPanel(
          d.complaint ? normalizeTask(d.complaint as Task) : null
        );
      }
    } finally {
      setSubtaskLoading(false);
    }
  },[token]);

  const applyHistoryState = useCallback((state: AppHistoryState | null) => {
    if (state?.stack?.length) {
      viewStack.current = state.stack;
      const next = state.stack[state.stack.length - 1];
      setView(next);
      if (next !== "detail") {
        setSelected(null);
        setSubtaskPanel(null);
        return;
      }
      if (state.subtaskId) {
        void loadSubtaskPanel(state.subtaskId);
      } else {
        setSubtaskPanel(null);
      }
      return;
    }

    if (subtaskPanel) {
      setSubtaskPanel(null);
      writeHistory(viewStack.current, "replace");
      return;
    }
    if (viewStack.current.length > 1) {
      viewStack.current.pop();
      const next = viewStack.current[viewStack.current.length - 1];
      setView(next);
      if (next !== "detail") {
        setSelected(null);
        setSubtaskPanel(null);
      }
      writeHistory(viewStack.current, "replace");
      return;
    }
    if (view === "detail" || view === "new" || view === "notifications") {
      const tab = viewStack.current[0] ?? "home";
      viewStack.current = [tab];
      setView(tab);
      setSelected(null);
      setSubtaskPanel(null);
      writeHistory(viewStack.current, "replace");
    }
  }, [loadSubtaskPanel, writeHistory, subtaskPanel, view]);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      applyHistoryState(null);
    }
  }, [applyHistoryState]);

  const openSubtaskPanel = useCallback((id: string) => {
    writeHistory(viewStack.current, "push", id);
    void markTaskRead(id);
    void loadNotifications();
    void loadMyTasks();
    void loadMyAssignments();
    void loadDashboard();
    void loadSubtaskPanel(id);
  }, [loadDashboard, loadMyAssignments, loadMyTasks, loadNotifications, loadSubtaskPanel, markTaskRead, writeHistory]);

  async function uploadTaskAttachments(
    taskId: string,
    files: File[],
    onProgress?: (pct: number) => void
  ) {
    if (files.length === 0) return;
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API}/complaints/${taskId}/attachments`);
      xhr.setRequestHeader("Authorization", `Bearer ${token ?? ""}`);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) {
          onProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          try {
            const d = JSON.parse(xhr.responseText) as { error?: string };
            reject(new Error(d.error ?? "Attachment upload failed"));
          } catch {
            reject(new Error("Attachment upload failed"));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(fd);
    });
  }

  const loadAll = useCallback(async (t?:string) => {
    await Promise.all([
      loadDashboard(t),
      loadMyTasks(t),
      loadMyAssignments(t),
      loadMembers(t),
      loadNotifications(t),
      loadMeProfile(t),
    ]);
  },[loadDashboard,loadMyTasks,
     loadMyAssignments,loadMembers,loadNotifications,
     loadMeProfile]);

  const refreshCurrentView = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (view === "home") {
        await Promise.all([loadMyTasks(), loadNotifications()]);
      } else if (view === "assigned") {
        await Promise.all([loadMyAssignments(), loadNotifications()]);
      } else if (view === "alltasks") {
        await Promise.all([loadDashboard(), loadNotifications()]);
      } else if (view === "notifications") {
        await loadNotifications();
      } else {
        await loadNotifications();
      }
    } finally {
      setRefreshing(false);
      pullDistanceRef.current = 0;
      setPullDistance(0);
    }
  }, [
    view, loadMyTasks, loadMyAssignments, loadDashboard,
    loadNotifications, refreshing
  ]);

  // Restore session on mount
  useEffect(() => {
    const t = localStorage.getItem("sv_token");
    const e = localStorage.getItem("sv_email");
    const n = localStorage.getItem("sv_name");
    const p = localStorage.getItem("sv_phone");
    if (t&&e) {
      const expiry = localStorage.getItem("sv_expiry");
      if (expiry && Date.now() > Number(expiry)) {
        logout("Session expired. Please sign in again.");
        return;
      }
      if (isJwtExpired(t)) {
        logout("Session expired. Please sign in again.");
        return;
      }
      setToken(t);setMyEmail(e.toLowerCase());
      setMyName(n??"");setMyPhone(p??"");
      setView("home");
      seedAppHistory(["home"]);
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

  // iOS PWA: refetch when app returns from background or bfcache
  useEffect(() => {
    const onPageShow = (ev: PageTransitionEvent) => {
      const t = localStorage.getItem("sv_token");
      if (!t || isJwtExpired(t)) return;
      if (ev.persisted) void loadAll(t);
    };
    const onVisible = () => {
      const t = localStorage.getItem("sv_token");
      if (!t || isJwtExpired(t)) return;
      if (document.visibilityState === "visible") void loadAll(t);
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadAll]);

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
    if (view === "profile" && token) {
      void loadMembers();
    }
  }, [view, token, loadMembers]);

  useEffect(() => {
    if (!token || view === "login") return;
    const onPop = (e: PopStateEvent) => {
      applyHistoryState(e.state as AppHistoryState | null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [token, view, applyHistoryState]);

  useEffect(() => {
    if (!showMemberPicker) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (toPickerRef.current && !toPickerRef.current.contains(target)) {
        setShowMemberPicker(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [showMemberPicker]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest("#wa-attach-menu")) return;
      if (target.closest("#wa-attach-btn")) return;
      setShowAttachMenu(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", close);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", close);
    };
  }, [showAttachMenu]);

  useEffect(() => {
    if (!msgMenuId) return;
    const close = () => setMsgMenuId(null);
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("touchstart", close);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [msgMenuId]);

  function showAttachToast(msg: string) {
    console.log("[attach]", msg);
    setAttachToast(msg);
    window.setTimeout(() => setAttachToast(null), 5000);
  }

  function totalUploadBytes(files: File[]): number {
    return files.reduce((sum, file) => sum + file.size, 0);
  }

  useEffect(() => {
    const nextPreviews = msgFiles.map((file) =>
      file.type.startsWith("image") || file.type.startsWith("video")
        ? URL.createObjectURL(file)
        : ""
    );
    setMsgFilePreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [msgFiles]);

  useEffect(() => {
    const nextPreviews = ntFiles.map((file) =>
      file.type.startsWith("image") || file.type.startsWith("video")
        ? URL.createObjectURL(file)
        : ""
    );
    setNtFilePreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [ntFiles]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop
      );
      setKeyboardInset(inset > 50 ? inset : 0);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  function addNtAttachments(
    fileList: FileList | null,
    source: string,
    inputEl?: HTMLInputElement | null
  ) {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    const nextCount = ntFiles.length + picked.length;
    if (nextCount > MAX_CHAT_ATTACHMENTS) {
      const reason =
        `You can upload up to ${MAX_CHAT_ATTACHMENTS} files. Current selection would create ${nextCount} files.`;
      setNtAttachStatus(reason);
      if (inputEl) inputEl.value = "";
      return;
    }
    const nextTotal = totalUploadBytes([...ntFiles, ...picked]);
    if (nextTotal > MAX_CHAT_UPLOAD_BYTES) {
      const reason =
        `Upload limit exceeded. Maximum total size is 250 MB, current selection is ${formatBytes(nextTotal)}.`;
      setNtAttachStatus(reason);
      if (inputEl) inputEl.value = "";
      return;
    }
    setNtFiles((prev) => {
      const next = [...prev, ...picked];
      setNtAttachStatus(
        `✓ ${picked.length} file${picked.length > 1 ? "s" : ""} added (${next.length}/${MAX_CHAT_ATTACHMENTS}) · ${UPLOAD_LIMITS_HINT}`
      );
      return next;
    });
    if (inputEl) inputEl.value = "";
  }

  function addChatAttachments(
    fileList: FileList | null,
    source: string,
    inputEl?: HTMLInputElement | null
  ) {
    if (!fileList || fileList.length === 0) {
      console.log(`[attach] ${source}: cancelled or empty`);
      showAttachToast("No file selected");
      setAttachStatus("No file selected");
      window.setTimeout(() => setAttachStatus(null), 2500);
      return;
    }
    const picked = Array.from(fileList);
    const nextCount = msgFiles.length + picked.length;
    if (nextCount > MAX_CHAT_ATTACHMENTS) {
      const reason =
        `You can upload up to ${MAX_CHAT_ATTACHMENTS} files per message. Current selection would create ${nextCount} files.`;
      console.error("[attach]", reason);
      setAttachStatus(reason);
      showAttachToast(reason);
      if (inputEl) inputEl.value = "";
      return;
    }
    const nextTotal = totalUploadBytes([...msgFiles, ...picked]);
    if (nextTotal > MAX_CHAT_UPLOAD_BYTES) {
      const reason =
        `Upload limit exceeded. Maximum total size is 250 MB, current selection is ${formatBytes(nextTotal)}.`;
      console.error("[attach]", reason);
      setAttachStatus(reason);
      showAttachToast(reason);
      if (inputEl) inputEl.value = "";
      return;
    }
    console.log(`[attach] ${source}:`, picked.map(f => ({
      name: f.name, size: f.size, type: f.type,
    })));
    setMsgFiles(prev => {
      const next = [...prev, ...picked];
      const summary = `${picked.length} file${picked.length > 1 ? "s" : ""} added (${next.length}/${MAX_CHAT_ATTACHMENTS})`;
      showAttachToast(`✓ ${summary} — tap send to upload`);
      setAttachStatus(`✓ ${summary} · ${UPLOAD_LIMITS_HINT}`);
      return next;
    });
    setShowAttachMenu(false);
    if (inputEl) inputEl.value = "";
    if (view === "detail") scrollChatToBottom();
  }

  useEffect(() => {
    if (view === "detail") {
      scrollChatToBottom();
      const t1 = window.setTimeout(scrollChatToBottom, 120);
      const t2 = window.setTimeout(scrollChatToBottom, 400);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
  }, [view, selected?.id, subtaskPanel?.id,
      selected?.events?.length, subtaskPanel?.events?.length,
      msgFiles.length]);

  // ── Auth ─────────────────────────────────────────────
  async function handleLogin(e:React.FormEvent) {
    e.preventDefault();
    setLLoading(true);setLErr("");
    try {
      const allowed = await checkWhitelist(lEmail.trim());
      if (!allowed) {
        setLErr("This email is not authorised for Sarveda Tasks. Contact admin for access.");
        setLLoading(false); return;
      }
      const r = await fetch(`${API}/complaints/auth/login`,{
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
      seedAppHistory(["home"]);
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
      seedAppHistory(["home"]);
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
      setNtMsg("❌ Please add at least one person or tap “To me”"); return;
    }
    setNtSubmitting(true);setNtMsg("");
    const filesToUpload = [...ntFiles];
    try {
      const autoTitle = ntDesc.trim()
        .split("\n")[0]
        .slice(0, 100) || "Task";
      const fd = new FormData();
      fd.append("title", autoTitle);
      fd.append("description",ntDesc.trim());
      fd.append("priority",ntPriority);
      if (ntParentId) fd.append("parentId",ntParentId);
      if (ntDueDate) fd.append("dueDate",ntDueDate);
      fd.append("assigneeEmails",JSON.stringify(ntAssignees));
      const r = await fetch(`${API}/complaints`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd,
      });
      if (!r.ok) {
        const d = await r.json() as any;
        throw new Error(d.error??"Failed");
      }
      const created = await r.json() as {complaint?:{id:string}};
      const taskId = created.complaint?.id;
      const parentTaskId = ntParentId;

      setNtTitle("");setNtDesc("");
      setNtFiles([]);setNtPriority("LOW");
      setNtAssignees([]);setNtDueDate(defaultDueDate());
      setNtParentId(null);setNtParentTitle(null);
      setNtMsg(filesToUpload.length>0
        ?"✅ Task created — uploading files…"
        :"✅ Task created and assigned!");
      void loadAll();
      if (parentTaskId) {
        if (viewStack.current[viewStack.current.length - 1] === "new") {
          viewStack.current.pop();
        }
        if (viewStack.current[viewStack.current.length - 1] !== "detail") {
          viewStack.current.push("detail");
        }
        await loadDetail(parentTaskId);
        setSubtaskPanel(null);
        writeHistory(viewStack.current, "replace");
        setView("detail");
      } else {
        const base = viewStack.current[0] ?? "home";
        viewStack.current = [base];
        writeHistory(viewStack.current, "replace");
        setView(base);
      }

      if (filesToUpload.length>0 && taskId) {
        setNtUploadProgress(0);
        void uploadTaskAttachments(taskId, filesToUpload, (pct) => {
          setNtUploadProgress(pct);
        })
          .then(()=>{
            setNtUploadProgress(null);
            if (selected?.id===taskId || subtaskPanel?.id===taskId) {
              void loadDetail(taskId);
            }
          })
          .catch((err:Error)=>{
            setNtUploadProgress(null);
            setNtMsg("⚠️ Task saved but some files failed: "+err.message);
          });
      }

      setTimeout(()=>setNtMsg(""), filesToUpload.length>0 ? 2500 : 1200);
    } catch(err:any) {
      setNtMsg("❌ "+(err.message??"Failed"));
    } finally { setNtSubmitting(false); }
  }

  // ── Add query/comment ─────────────────────────────────
  async function handleAddQuery(
    e: React.FormEvent
  ) {
    e.preventDefault();
    const active = subtaskPanel ?? selected;
    if (!active) return;
    if (!msgInput.trim() && msgFiles.length===0) {
      console.log("[chat] nothing to send");
      return;
    }
    console.log("[chat] sending message:", {
      text: msgInput.trim(),
      files: msgFiles.map(f=>({
        name:f.name,size:f.size,type:f.type
      }))
    });
    const totalBytes = totalUploadBytes(msgFiles);
    if (msgFiles.length > MAX_CHAT_ATTACHMENTS) {
      const reason =
        `Upload blocked: only ${MAX_CHAT_ATTACHMENTS} files are allowed per message.`;
      console.error("[chat]", reason);
      setAttachStatus(reason);
      alert(reason);
      return;
    }
    if (totalBytes > MAX_CHAT_UPLOAD_BYTES) {
      const reason =
        `Upload blocked: total selected files are ${formatBytes(totalBytes)}, which exceeds the 250 MB limit.`;
      console.error("[chat]", reason);
      setAttachStatus(reason);
      alert(reason);
      return;
    }
    setQuerySending(true);
    setUploadProgress(msgFiles.length>0 ? 0 : null);
    if (msgFiles.length > 0) {
      setAttachStatus(null);
    }
    try {
      const fd = new FormData();
      fd.append("message", msgInput.trim());
      msgFiles.forEach((f,i)=>{
        fd.append("files", f);
        console.log(`[chat] appended file ${i}:`,
          f.name, f.size, f.type);
      });

      await new Promise<void>((resolve, reject)=>{
        const xhr = new XMLHttpRequest();
        xhr.open(
          "POST",
          `${API}/complaints/${active.id}/comment`
        );
        xhr.setRequestHeader(
          "Authorization", `Bearer ${token}`
        );

        xhr.upload.onprogress = (ev)=>{
          if (ev.lengthComputable) {
            const pct = Math.round(
              (ev.loaded/ev.total)*100
            );
            console.log(`[chat] upload progress: ${pct}%`);
            setUploadProgress(pct);
          }
        };

        xhr.onload = ()=>{
          console.log("[chat] xhr status:", xhr.status);
          if (xhr.status>=200 && xhr.status<300) {
            resolve();
          } else {
            try {
              const d = JSON.parse(xhr.responseText);
              reject(new Error(d.error??"Upload failed"));
            } catch {
              reject(new Error(
                `HTTP ${xhr.status}: Upload failed`
              ));
            }
          }
        };

        xhr.onerror = ()=>{
          console.error("[chat] xhr network error");
          const reason = navigator.onLine
            ? "Connection failed before the server completed the upload. This usually means the upload was interrupted or the server rejected the request."
            : "You appear to be offline.";
          reject(new Error(reason));
        };

        xhr.onabort = ()=>{
          reject(new Error("Upload was cancelled before completion."));
        };

        xhr.ontimeout = ()=>{
          reject(new Error("Upload timed out before the server responded."));
        };

        xhr.timeout = 10 * 60 * 1000;
        xhr.send(fd);
      });

      console.log("[chat] send success, reloading");
      setMsgInput("");
      setMsgFiles([]);
      setUploadProgress(null);
      setAttachStatus(null);
      showAttachToast("✓ Sent successfully");
      if (subtaskPanel)
        await loadSubtaskPanel(active.id);
      else
        await loadDetail(active.id);
      scrollChatToBottom();

    } catch(err:any) {
      console.error("[chat] send failed:", err);
      setUploadProgress(null);
      setAttachStatus(`Upload failed: ${err.message ?? "Try again"}`);
      showAttachToast(`Upload failed: ${err.message ?? "Try again"}`);
      alert(err.message ?? "Could not send. Try again.");
    } finally {
      setQuerySending(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({audio:true});
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = e => {
        if (e.data.size>0)
          audioChunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(
          audioChunksRef.current,
          {type:"audio/webm"}
        );
        audioBlobRef.current = blob;
        setAudioBlob(blob);
        stream.getTracks().forEach(t=>t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(()=>{
        setRecordingSeconds(s=>s+1);
      },1000);
    } catch {
      alert("Microphone permission denied");
    }
  }

  function togglePauseRecording() {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    if (isRecordingPaused) {
      if (typeof mr.resume === "function") mr.resume();
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
      setIsRecordingPaused(false);
    } else {
      if (typeof mr.pause === "function") mr.pause();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setIsRecordingPaused(true);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingSeconds(0);
  }

  function cancelRecording() {
    mediaRecorderRef.current?.stop();
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    audioChunksRef.current = [];
    setAudioBlob(null);
    audioBlobRef.current = null;
  }

  async function sendVoiceNote() {
    const blob = audioBlobRef.current;
    if (!blob) return;
    const file = new File(
      [blob],
      `voice-${Date.now()}.webm`,
      {type:"audio/webm"}
    );
    setMsgFiles(f=>[...f,file]);
    setAudioBlob(null);
    audioBlobRef.current = null;
    const fd = new FormData();
    fd.append("message","");
    fd.append("files",file);
    const active = subtaskPanel ?? selected;
    if (!active||!token) return;
    setQuerySending(true);
    try {
      const r = await fetch(
        `${API}/complaints/${active.id}/comment`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd,
      });
      if (!r.ok) throw new Error("Failed");
      setMsgFiles([]);
      if (subtaskPanel)
        await loadSubtaskPanel(active.id);
      else
        await loadDetail(active.id);
      scrollChatToBottom();
    } catch(err:any) {
      alert(err.message??"Could not send voice note");
    } finally { setQuerySending(false); }
  }

  async function stopAndUploadVoice() {
    mediaRecorderRef.current?.stop();
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordingSeconds(0);
    await new Promise(r=>setTimeout(r,400));
    const blob = audioBlobRef.current;
    if (!blob) return;
    const file = new File(
      [blob],
      `voice-${Date.now()}.webm`,
      {type:"audio/webm"}
    );
    audioBlobRef.current = null;
    setAudioBlob(null);
    const active = subtaskPanel ?? selected;
    if (!active||!token) return;
    setQuerySending(true);
    try {
      const fd = new FormData();
      fd.append("message","");
      fd.append("files",file);
      const r = await fetch(
        `${API}/complaints/${active.id}/comment`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd,
      });
      if (!r.ok) throw new Error("Failed to send");
      setMsgFiles([]);
      if (subtaskPanel)
        await loadSubtaskPanel(active.id);
      else
        await loadDetail(active.id);
      scrollChatToBottom();
    } catch(err:any) {
      alert(err.message??"Could not send voice note");
    } finally { setQuerySending(false); }
  }

  // ── Update status ─────────────────────────────────────
  async function handleStatusUpdate(newStatus:Status) {
    const active = subtaskPanel ?? selected;
    if (!active) return;
    setStatusUpdating(true);
    try {
      const r = await fetch(`${API}/complaints/${active.id}/status`,{
        method:"PATCH",
        headers:ah(),
        body:JSON.stringify({status:apiStatus(newStatus)}),
      });
      if (!r.ok) {
        const d = await r.json().catch(()=>({})) as {error?:string};
        alert(d.error ?? "Could not update status.");
      }
      if (subtaskPanel) await loadSubtaskPanel(active.id);
      else await loadDetail(active.id);
      void loadAll();
    } finally { setStatusUpdating(false); }
  }

  async function handleDeleteTask() {
    const active = subtaskPanel ?? selected;
    if (!active) return;
    try {
      await fetch(`${API}/complaints/${active.id}`,{
        method:"DELETE",
        headers:{Authorization:`Bearer ${token}`},
      });
      setShowDeleteConfirm(false);
      setShowTaskMenu(false);
      if (subtaskPanel) setSubtaskPanel(null);
      else goBack();
      void loadAll();
    } catch {
      alert("Failed to delete. Try again.");
    }
  }

  async function handleSaveMembers() {
    const active = subtaskPanel ?? selected;
    if (!active) return;
    setMembersSaving(true);
    try {
      await fetch(`${API}/complaints/${active.id}/assignees`,{
        method:"PATCH",headers:ah(),
        body:JSON.stringify({assigneeEmails:membersDraft}),
      });
      setShowMembersModal(false);
      setShowTaskMenu(false);
      if (subtaskPanel) await loadSubtaskPanel(active.id);
      else await loadDetail(active.id);
      void loadAll();
    } catch {
      alert("Failed to update members.");
    } finally { setMembersSaving(false); }
  }

  async function handleDueDateSave() {
    const active = subtaskPanel ?? selected;
    if (!active) return;
    try {
      await fetch(`${API}/complaints/${active.id}`,{
        method:"PATCH",headers:ah(),
        body:JSON.stringify({
          dueDate:dueDateDraft||null
        }),
      });
      setShowDueDateModal(false);
      if (subtaskPanel) await loadSubtaskPanel(active.id);
      else await loadDetail(active.id);
      void loadAll();
    } catch {
      alert("Failed to update due date.");
    }
  }

  async function handleDeleteMessage(eventId:string) {
    const active = subtaskPanel ?? selected;
    if (!active) return;
    try {
      const r = await fetch(
        `${API}/complaints/${active.id}/events/${eventId}`,{
        method:"DELETE",
        headers:{Authorization:`Bearer ${token}`},
      });
      if (!r.ok) {
        const d = await r.json() as any;
        alert(d.error??"Cannot delete message");
        return;
      }
      setSelectedDelete(null);
      if (subtaskPanel) await loadSubtaskPanel(active.id);
      else await loadDetail(active.id);
      scrollChatToBottom();
    } catch {
      alert("Failed to delete message.");
    }
  }

  async function handleDeleteTaskAttachment(attachmentId: string) {
    const active = subtaskPanel ?? selected;
    if (!active) return;
    try {
      const r = await fetch(
        `${API}/complaints/${active.id}/attachments/${attachmentId}`,{
        method:"DELETE",
        headers:{Authorization:`Bearer ${token}`},
      });
      if (!r.ok) {
        const d = await r.json() as any;
        alert(d.error??"Cannot delete attachment");
        return;
      }
      if (subtaskPanel) await loadSubtaskPanel(active.id);
      else await loadDetail(active.id);
      scrollChatToBottom();
    } catch {
      alert("Failed to delete attachment.");
    }
  }

  async function handleAvatarUpload(file:File) {
    if (!token) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar",file);
      const r = await fetch(`${API}/complaints/profile/avatar`,{
        method:"POST",
        headers:{Authorization:`Bearer ${token}`},
        body:fd,
      });
      const d = await r.json() as any;
      if (!r.ok) throw new Error(d.error??"Upload failed");
      setMyAvatarUrl(d.avatarUrl);
      setMembers(prev=>prev.map(m=>
        emailsMatch(m.email, myEmail)
          ?{...m,avatarUrl:d.avatarUrl}
          :m
      ));
    } catch(err:any) {
      alert(err.message??"Upload failed");
    } finally { setAvatarUploading(false); }
  }

  function messageCanDelete(ev:TaskEvent): boolean {
    if (ev.authorEmail!==myEmail) return false;
    if (ev.type!=="COMMENT") return false;
    if (ev.message?.startsWith("@@SYSTEM@@")) return false;
    const age = Date.now()-new Date(ev.createdAt).getTime();
    return age<=15*60*1000;
  }

  async function markAllRead() {
    await fetch(`${API}/complaints/notifications/read-all`,{
      method:"PATCH",headers:ah()
    });
    void loadNotifications();
  }

  async function clearAllNotifications() {
    await fetch(`${API}/complaints/notifications`,{
      method:"DELETE",
      headers:{Authorization:`Bearer ${token}`},
    });
    void loadNotifications();
  }

  async function deleteNotification(id: string) {
    await fetch(`${API}/complaints/notifications/${id}`,{
      method:"DELETE",
      headers:{Authorization:`Bearer ${token}`},
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  function scrollChatToBottom() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = chatScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  async function handleAcceptTask(taskId: string) {
    await fetch(`${API}/complaints/${taskId}/assignees/me/accept`,{
      method:"POST",headers:ah(),
    });
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
  }

  async function handleStartTask(taskId:string) {
    await fetch(`${API}/complaints/${taskId}/assignees/me/start`,{
      method:"POST",headers:ah(),
    });
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
  }

  async function handleDenyTask(taskId: string) {
    await fetch(`${API}/complaints/${taskId}/assignees/me/deny`,{
      method:"POST",headers:ah(),
    });
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
  }

  async function handleApproveDenial(taskId: string, email: string) {
    await fetch(`${API}/complaints/${taskId}/assignees/${encodeURIComponent(email)}/denial/approve`,{
      method:"POST",headers:ah(),
    });
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
  }

  async function handleRejectDenial(taskId: string, email: string) {
    await fetch(`${API}/complaints/${taskId}/assignees/${encodeURIComponent(email)}/denial/reject`,{
      method:"POST",headers:ah(),
    });
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
  }

  async function handleRequestExtension(taskId: string) {
    if (!extendDeadlineDraft) return;
    await fetch(`${API}/complaints/${taskId}/deadline-extension`,{
      method:"POST",headers:ah(),
      body:JSON.stringify({ requestedDate: extendDeadlineDraft }),
    });
    setShowExtendDeadlineModal(false);
    setExtendDeadlineDraft("");
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
  }

  async function handleApproveExtension(taskId: string) {
    await fetch(`${API}/complaints/${taskId}/deadline-extension/approve`,{
      method:"POST",headers:ah(),
    });
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
  }

  async function handleRejectExtension(taskId: string) {
    await fetch(`${API}/complaints/${taskId}/deadline-extension/reject`,{
      method:"POST",headers:ah(),
    });
    if (subtaskPanel) await loadSubtaskPanel(taskId);
    else await loadDetail(taskId);
    void loadAll();
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
      const endpoint = hasPassword
        ?"/auth/change-password":"/auth/set-password";
      const body = hasPassword
        ?{currentPassword:curPwd,newPassword:newPwd}
        :{newPassword:newPwd};
      const r = await fetch(`${API}${endpoint}`,{
        method:"POST",headers:ah(),
        body:JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json() as any;
        throw new Error(d.error??"Failed");
      }
      setPwdMsg("✅ Password "+(hasPassword?"changed":"set")+"!");
      if (!hasPassword) setHasPassword(true);
      setCurPwd("");setNewPwd("");
    } catch(err:any) {
      setPwdMsg("❌ "+(err.message??"Failed"));
    } finally { setPwdSaving(false); }
  }

  // ── Shared UI ─────────────────────────────────────────
  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{
      height:100%;overflow:hidden;
      overscroll-behavior:none;
      background:#ECE5DD;
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
    @keyframes sv-pull-spin{
      from{transform:rotate(0deg)}
      to{transform:rotate(360deg)}
    }
    @keyframes fadeIn{
      from{opacity:0;transform:translateY(3px)}
      to{opacity:1;transform:translateY(0)}}
    .task-row{
      background:#fff;
      border-bottom:0.5px solid #f0ece6;
      display:flex;gap:12px;
      padding:12px 16px;cursor:pointer;
      transition:background .1s;
      user-select:none;-webkit-user-select:none;
      -webkit-tap-highlight-color:transparent}
    .task-row:active{background:#f5f5f5}
    @keyframes slideInRight{
      from{transform:translateX(100%)}
      to{transform:translateX(0)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  `;

  function MainHeader() {
    return (
      <div style={{
        background:"#075E54",
        padding:"10px 16px 12px",
        flexShrink:0
      }}>
        <div style={{
          display:"flex",alignItems:"center",
          gap:"6px"
        }}>
          <img src={LOGO_PATH} alt="Sarveda"
            style={{
              width:28,height:28,
              objectFit:"contain",
              borderRadius:"6px",flexShrink:0
            }}/>
          <div style={{flex:1,minWidth:0}}>
            <p style={{
              fontSize:"15px",fontWeight:700,
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
            pushView("notifications");
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
        flexShrink:0,
        padding:"10px 12px",
        display:"flex",alignItems:"center",gap:"8px",
        minHeight:"52px"
      }}>
        <button onClick={onBack} style={{
          background:"none",border:"none",
          color:"#fff",cursor:"pointer",
          padding:"4px",lineHeight:1,flexShrink:0,
          display:"flex",alignItems:"center",
          justifyContent:"center"
        }} aria-label="Back">
          <IconBack/>
        </button>
        <p style={{
          fontSize:"17px",fontWeight:600,
          color:"#fff",flex:1,margin:0,
          overflow:"hidden",textOverflow:"ellipsis",
          whiteSpace:"nowrap"
        }}>{title}</p>
        {children}
      </div>
    );
  }

  function BottomNav({embedded}:{embedded?:boolean}) {
    const tabs = [
      {id:"home",icon:"🏠",label:"Home"},
      {id:"assigned",icon:"📤",label:"Assigned"},
      {id:"alltasks",icon:"📋",label:"All Tasks"},
      {id:"profile",icon:"👤",label:"Profile"},
    ] as const;
    return (
      <div style={{
        ...(embedded?{}:{
          position:"fixed",bottom:0,
          left:"50%",transform:"translateX(-50%)",
        }),
        width:"100%",maxWidth:"480px",
        background:"#fff",
        borderTop:"1px solid #e0d8ce",
        display:"grid",
        gridTemplateColumns:"repeat(4,1fr)",
        paddingBottom:
          "env(safe-area-inset-bottom,4px)",
        flexShrink:0,
        zIndex:embedded?1:100
      }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{
            if (t.id==="profile") {
              setPName(myName);setPPhone(myPhone);
              void loadMeProfile();
            }
            switchTab(t.id as View);
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

  function StatusTabs({
    tasks,
    usePerUserStatus,
  }: {
    tasks: Task[];
    usePerUserStatus: boolean;
  }) {
    const statusTabs = [
      {
        v: "NEW" as const,
        label: "New",
        activeBg: "#dcfce7",
        activeColor: "#166534",
        idleBg: "rgba(255,255,255,.14)",
        idleColor: "#ecfdf5",
      },
      {
        v: "IN_PROGRESS" as const,
        label: "In Progress",
        activeBg: "#dbeafe",
        activeColor: "#1e40af",
        idleBg: "rgba(255,255,255,.14)",
        idleColor: "#eff6ff",
      },
      {
        v: "CLOSED" as const,
        label: "Closed",
        activeBg: "#f3f4f6",
        activeColor: "#4b5563",
        idleBg: "rgba(255,255,255,.14)",
        idleColor: "#f9fafb",
      },
    ];
    const priorityTabs = [
      {
        v: "ALL" as const,
        label: "All",
        activeBg: "#075E54",
        activeColor: "#fff",
        idleBg: "#fff",
        idleColor: "#075E54",
      },
      {
        v: "HIGH" as const,
        label: "High",
        activeBg: "#dc2626",
        activeColor: "#fff",
        idleBg: "#fee2e2",
        idleColor: "#dc2626",
      },
      {
        v: "MEDIUM" as const,
        label: "Medium",
        activeBg: "#d97706",
        activeColor: "#fff",
        idleBg: "#fef3c7",
        idleColor: "#b45309",
      },
      {
        v: "LOW" as const,
        label: "Low",
        activeBg: "#16a34a",
        activeColor: "#fff",
        idleBg: "#dcfce7",
        idleColor: "#15803d",
      },
    ];
    const statusCounts = countTasksByStatus(tasks, myEmail, usePerUserStatus);
    const priorityCounts = countTasksByPriority(
      tasks,
      statusFilter,
      myEmail,
      usePerUserStatus
    );
    const statusBtn = (
      t: (typeof statusTabs)[number],
      count: number
    ) => {
      const active = statusFilter === t.v;
      return (
        <button
          key={t.v}
          type="button"
          onClick={() => {
            setStatusFilter(t.v);
            setPriorityFilter("ALL");
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 8px",
            borderRadius: "12px",
            border: active ? "2px solid #fff" : "2px solid transparent",
            background: active ? t.activeBg : t.idleBg,
            color: active ? t.activeColor : t.idleColor,
            fontSize: "12px",
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: active ? "0 2px 8px rgba(0,0,0,.12)" : "none",
          }}
        >
          {t.label} ({count})
        </button>
      );
    };
    const priorityBtn = (
      t: (typeof priorityTabs)[number],
      count: number
    ) => {
      const active = priorityFilter === t.v;
      return (
        <button
          key={t.v}
          type="button"
          onClick={() => setPriorityFilter(t.v)}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "8px 6px",
            borderRadius: "999px",
            border: `1.5px solid ${active ? t.activeBg : "#e0d8ce"}`,
            background: active ? t.activeBg : t.idleBg,
            color: active ? t.activeColor : t.idleColor,
            fontSize: "11px",
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t.label} ({count})
        </button>
      );
    };
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{
          background: "linear-gradient(180deg, #075E54 0%, #064e47 100%)",
          padding: "10px 12px 8px",
          borderBottom: "1px solid rgba(255,255,255,.1)",
        }}>
          <p style={{
            fontSize: "10px",
            fontWeight: 800,
            color: "rgba(255,255,255,.55)",
            margin: "0 0 8px 2px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            Status
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            {statusTabs.map((t) => statusBtn(t, statusCounts[t.v]))}
          </div>
        </div>
        <div style={{
          background: "#f7f3ee",
          padding: "10px 12px 12px",
          borderBottom: "1px solid #e0d8ce",
        }}>
          <p style={{
            fontSize: "10px",
            fontWeight: 800,
            color: "#8a7060",
            margin: "0 0 8px 2px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            Priority
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            {priorityTabs.map((t) => priorityBtn(t, priorityCounts[t.v]))}
          </div>
        </div>
      </div>
    );
  }

  function TaskCard({
    task,onClick,isAssignment
  }:{task:Task;onClick:()=>void;isAssignment?:boolean}) {
    const cardStatus = viewerListStatus(task,myEmail,!view.startsWith("all"));
    const overdue = task.dueDate &&
      !isTaskClosed(task.status) &&
      new Date(task.dueDate)<new Date();
    const ownerEmail = task.assignedByEmail ?? task.raisedByEmail;

    return (
      <div className="task-row pressable fade"
        onClick={onClick}>
        <Avatar
          email={ownerEmail}
          name={personName(ownerEmail, task)}
          size={48}
          avatarUrl={avatarFor(ownerEmail)}
        />
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
                <TimeAgo date={task.updatedAt}/>
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
            <div style={{
              display:"flex",alignItems:"center",gap:"6px",
              flex:1,minWidth:0
            }}>
              {(task.assignees ?? []).length>0 ? (
                <AssigneeAvatars
                  assignees={task.assignees ?? []}
                  max={isAssignment ? 4 : 5}
                  memberLookup={members}
                />
              ) : (
                <span style={{
                  fontSize:"12px",color:"#b8a898"
                }}>No members</span>
              )}
            </div>
            <div style={{
              display:"flex",alignItems:"center",
              gap:"6px",flexShrink:0,marginLeft:"8px"
            }}>
              {(task.unreadCount ?? 0) > 0 && (
                <span style={{
                  minWidth: 18,
                  height: 18,
                  padding: "0 6px",
                  borderRadius: 999,
                  background: "#25D366",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {(task.unreadCount ?? 0) > 99 ? "99+" : task.unreadCount}
                </span>
              )}
              {(task._count?.events||0)>0&&(
                <span style={{
                  fontSize:"11px",color:"#8a7060"
                }}>
                  💬{task._count!.events}
                </span>
              )}
              <StatusPill s={cardStatus} small/>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function FAB({
    parentId,parentTitle,embedded
  }:{parentId?:string;parentTitle?:string;
    embedded?:boolean}) {
    return (
      <button onClick={()=>{
        openNewTask(view, parentId, parentTitle);
      }} style={{
        position:embedded?"absolute":"fixed",
        bottom:embedded
          ?`calc(${NAV_BAR_H}px + env(safe-area-inset-bottom, 8px) + 12px)`
          :"76px",
        right:"16px",
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

  function ListShell({
    children,
    showFab,
    listTasks,
    usePerUserStatus,
  }: {
    children: React.ReactNode;
    showFab?: boolean;
    listTasks: Task[];
    usePerUserStatus: boolean;
  }) {
    const pull = pullHandlers(refreshCurrentView);
    return (
      <div style={{
        height:"100dvh",maxHeight:"100dvh",
        display:"flex",flexDirection:"column",
        background:"#ECE5DD",
        maxWidth:"480px",margin:"0 auto",
        overflow:"hidden",position:"relative",
        width:"100%"
      }}>
        <div style={{flexShrink:0}}>
          <MainHeader/>
          <StatusTabs tasks={listTasks} usePerUserStatus={usePerUserStatus}/>
        </div>
        <div style={{
          flex:1,minHeight:0,overflowY:"auto",
          WebkitOverflowScrolling:"touch",
          paddingBottom:SCROLL_BOTTOM_PAD
        }} {...pull}>
          <PullRefreshIndicator
            pullDistance={pullDistance}
            refreshing={refreshing}
          />
          {children}
        </div>
        {showFab&&<FAB embedded/>}
        <BottomNav embedded/>
      </div>
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
      <ListShell showFab listTasks={myTasks} usePerUserStatus>
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
              Tap + to add a task for yourself or others
            </p>
          </div>
        ):(
          sortTasksByRecent(
            myTasks.filter((t) => matchesListFilters(
              t, statusFilter, priorityFilter, myEmail, true
            ))
          ).map(t=>(
              <TaskCard key={t.id} task={t}
                onClick={()=>void openTaskDetail(t.id,"home")}/>
            ))
        )}
      </ListShell>
    </>
  );

  // ── ASSIGNED VIEW ─────────────────────────────────────
  if (view==="assigned") return (
    <>
      <style>{CSS}</style>
      <ListShell showFab listTasks={myAssignments} usePerUserStatus>
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
              Tap + to assign a task to yourself or a team member
            </p>
          </div>
        ):(
          sortTasksByRecent(
            myAssignments.filter((t) => matchesListFilters(
              t, statusFilter, priorityFilter, myEmail, true
            ))
          ).map(t=>(
              <TaskCard key={t.id} task={t}
                isAssignment
                onClick={()=>void openTaskDetail(t.id,"assigned")}/>
            ))
        )}
      </ListShell>
    </>
  );

  // ── ALL TASKS VIEW ────────────────────────────────────
  if (view==="alltasks") return (
    <>
      <style>{CSS}</style>
      {(() => {
        const pull = pullHandlers(refreshCurrentView);
        return (
      <div style={{
        height:"100dvh",maxHeight:"100dvh",
        display:"flex",flexDirection:"column",
        background:"#ECE5DD",
        maxWidth:"480px",margin:"0 auto",
        overflow:"hidden",width:"100%"
      }}>
        <div style={{flexShrink:0}}>
          <MainHeader/>
          <div style={{
            background:"#128C7E",
            padding:"10px 16px",
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
                borderRadius:"8px",padding:"8px 4px"
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
          <StatusTabs tasks={dashTasks} usePerUserStatus={false}/>
        </div>
        <div style={{
          flex:1,minHeight:0,overflowY:"auto",
          WebkitOverflowScrolling:"touch",
          paddingBottom:SCROLL_BOTTOM_PAD
        }} {...pull}>
          <PullRefreshIndicator
            pullDistance={pullDistance}
            refreshing={refreshing}
          />
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
            sortTasksByRecent(
              dashTasks.filter((t) => matchesListFilters(
                t, statusFilter, priorityFilter, myEmail, false
              ))
            ).map(t=>(
                <TaskCard key={t.id} task={t}
                  onClick={()=>void openTaskDetail(t.id,"alltasks")}/>
              ))
          )}
        </div>
        <FAB embedded/>
        <BottomNav embedded/>
      </div>
        );
      })()}
    </>
  );

  // ── NEW TASK VIEW ─────────────────────────────────────
  if (view==="new") return (
    <>
      <style>{CSS}</style>
      <div style={{
        height:"100dvh",maxHeight:"100dvh",
        display:"flex",flexDirection:"column",
        background:"#fff",
        maxWidth:"480px",margin:"0 auto",
        overflow:"hidden",width:"100%"
      }}>
        <div style={{flexShrink:0}}>
          <DetailHeader
            title={ntParentId?"Add Sub-task":"New Task"}
            onBack={goBack}
          />
        </div>

        <div style={{
          flex:1,minHeight:0,overflowY:"auto",
          WebkitOverflowScrolling:"touch",
          paddingBottom:"env(safe-area-inset-bottom, 12px)"
        }}>
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
                  onClick={()=>{
                    if (!ntAssignees.includes(myEmail)) {
                      setNtAssignees([...ntAssignees, myEmail]);
                    }
                    setShowMemberPicker(false);
                  }}
                  style={{
                    background: ntAssignees.includes(myEmail)
                      ? "#075E54" : "rgba(37,211,102,.15)",
                    border: "none",
                    borderRadius: "999px",
                    color: ntAssignees.includes(myEmail) ? "#fff" : "#075E54",
                    fontSize: "12px",
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "6px 12px",
                    marginRight: "6px",
                  }}
                >
                  To me
                </button>
                <button type="button"
                  onClick={()=>setShowMemberPicker(!showMemberPicker)}
                  style={{
                    background:"none",border:"none",
                    color:"#25D366",fontSize:"13px",
                    fontWeight:600,cursor:"pointer",padding:"4px 0"
                  }}>
                  {ntAssignees.length===0?"+ Add people":"+ Add"}
                </button>
              </div>
            </div>
            {showMemberPicker&&(
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
                    onClick={()=>setShowMemberPicker(false)}
                    style={{
                      background:"none",border:"none",
                      color:"#8a7060",cursor:"pointer",
                      fontSize:"18px",lineHeight:1,padding:"0 4px"
                    }}>×</button>
                </div>
                {[
                  {
                    email: myEmail,
                    name: myName || "You",
                    avatarUrl: myAvatarUrl,
                    isSelf: true,
                  },
                  ...members
                    .filter((m) => m.email.toLowerCase() !== myEmail.toLowerCase())
                    .map((m) => ({ ...m, isSelf: false })),
                ].map((m) => {
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
                        <Avatar
                          name={m.name} email={m.email} size={32}
                          avatarUrl={m.avatarUrl ?? undefined}/>
                        <div style={{flex:1}}>
                          <p style={{
                            fontSize:"13px",fontWeight:600,
                            color:"#1a1614",margin:0
                          }}>
                            {m.isSelf
                              ? `${m.name ?? "You"} (You)`
                              : (m.name ?? m.email.split("@")[0])}
                          </p>
                          <p style={{
                            fontSize:"11px",color:"#8a7060",margin:0
                          }}>{m.email}</p>
                        </div>
                        {sel&&<span style={{color:"#25D366"}}>✓</span>}
                      </div>
                    );
                  })}
                {members.filter(m=>m.email.toLowerCase()!==myEmail.toLowerCase()).length===0&&(
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
                  accept:"image/*",cap:"environment",multi:false},
                {icon:"🖼",label:"Photo",
                  accept:"image/*",multi:true},
                {icon:"📄",label:"Document",
                  accept:".pdf,.doc,.docx,.xls,.xlsx,.txt,application/*",
                  multi:true},
                {icon:"🎤",label:"Audio",
                  accept:"audio/*",multi:true},
                {icon:"🎥",label:"Video",
                  accept:"video/*",multi:true},
              ].map((btn)=>(
                <label key={btn.label} style={{
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
                    capture={btn.cap as "environment" | undefined}
                    multiple={btn.multi}
                    hidden
                    onChange={e=>{
                      addNtAttachments(
                        e.target.files,
                        btn.label.toLowerCase(),
                        e.target
                      );
                    }}/>
                </label>
              ))}
            </div>
            {ntAttachStatus && (
              <p style={{
                fontSize:"12px",fontWeight:600,
                color:ntAttachStatus.startsWith("✓")
                  ?"#166534":"#dc2626",
                margin:"0 0 8px"
              }}>{ntAttachStatus}</p>
            )}
            {ntUploadProgress !== null && (
              <div style={{
                padding:"8px 0",display:"flex",
                alignItems:"center",gap:10,marginBottom:8
              }}>
                <div style={{
                  flex:1,height:6,borderRadius:999,
                  background:"#e0d8ce",overflow:"hidden"
                }}>
                  <div style={{
                    width:`${ntUploadProgress}%`,height:"100%",
                    background:"#25D366",transition:"width .15s"
                  }}/>
                </div>
                <span style={{
                  fontSize:11,fontWeight:700,color:"#075E54"
                }}>{ntUploadProgress}%</span>
              </div>
            )}
            {ntFiles.length > 0 && (
              <div style={{
                display:"flex",gap:8,overflowX:"auto",
                paddingBottom:4,marginBottom:8
              }}>
                {ntFiles.map((f,i)=>(
                  <div key={`${f.name}-${i}`} style={{
                    position:"relative",flexShrink:0
                  }}>
                    {ntFilePreviews[i] ? (
                      f.type.startsWith("video") ? (
                        <video src={ntFilePreviews[i]}
                          style={{
                            width:64,height:64,
                            objectFit:"cover",borderRadius:10
                          }}/>
                      ) : (
                        <img src={ntFilePreviews[i]} alt=""
                          style={{
                            width:64,height:64,
                            objectFit:"cover",borderRadius:10
                          }}/>
                      )
                    ) : (
                      <div style={{
                        width:64,height:64,borderRadius:10,
                        background:"#f0ece6",
                        display:"flex",alignItems:"center",
                        justifyContent:"center",fontSize:22
                      }}>
                        {f.type.startsWith("audio")?"🎤"
                          :f.type.startsWith("video")?"🎥":"📄"}
                      </div>
                    )}
                    <button type="button"
                      onClick={()=>{
                        setNtFiles(ntFiles.filter((_,j)=>j!==i));
                      }}
                      style={{
                        position:"absolute",top:-6,right:-6,
                        width:18,height:18,borderRadius:"50%",
                        background:"#dc2626",border:"2px solid #fff",
                        color:"#fff",fontSize:10,cursor:"pointer",
                        display:"flex",alignItems:"center",
                        justifyContent:"center",padding:0
                      }}>✕</button>
                  </div>
                ))}
              </div>
            )}
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
      </div>
    </>
  );

  // ── DETAIL VIEW ───────────────────────────────────────
  if (view==="detail"&&selected) {
    const activeTask = subtaskPanel ?? selected;
    const isSubtaskPanel = subtaskPanel !== null;
    const taskIsOwner = isTaskOwner(activeTask, myEmail);
    const canAct = canParticipateInTask(activeTask, myEmail);
    const subtaskHost = isSubtaskPanel ? activeTask : selected;
    const subtaskCount = subtaskHost.children?.length ?? 0;
    const myAssignee = activeTask.assignees.find(
      (a) => a.assigneeEmail.toLowerCase() === myEmail.toLowerCase()
    );
    const pendingDenials = activeTask.assignees.filter(
      (a) => a.responseStatus === "DENIED_AWAITING_OWNER"
    );

    return (
    <>
      <style>{CSS}</style>
      <AttachToastBar message={attachToast}/>
      {isSubtaskPanel&&(
        <div style={{
          position:"fixed",inset:0,
          background:"rgba(0,0,0,.35)",
          zIndex:140,maxWidth:"480px",
          margin:"0 auto",left:0,right:0
        }} aria-hidden onClick={()=>setSubtaskPanel(null)}/>
      )}
      <div style={{
        height:"100dvh",maxHeight:"100dvh",
        display:"flex",flexDirection:"column",
        background:"#ECE5DD",
        maxWidth:"480px",margin:"0 auto",
        overflow:"hidden",width:"100%",
        ...(isSubtaskPanel?{
          position:"fixed",top:0,left:0,right:0,
          zIndex:150,
          boxShadow:"-6px 0 28px rgba(0,0,0,.18)",
          animation:"slideInRight .22s ease-out"
        }:{}),
      }}>
        <div style={{flexShrink:0}}>
        <DetailHeader
          title={headerTitle(activeTask)}
          onBack={goBack}>
          {taskIsOwner ? (
          <select
            value={activeTask.priority}
            onChange={async e=>{
              const p = e.target.value as Priority;
              await fetch(`${API}/complaints/${activeTask.id}`,{
                method:"PATCH",headers:ah(),
                body:JSON.stringify({priority:p}),
              });
              if (isSubtaskPanel) await loadSubtaskPanel(activeTask.id);
              else await loadDetail(activeTask.id);
            }}
            style={{
              background:"rgba(255,255,255,.15)",
              border:"none",borderRadius:"10px",
              color:"#fff",fontSize:"12px",
              fontWeight:700,padding:"6px 8px",
              minHeight:32,cursor:"pointer",flexShrink:0
            }}>
            {(["LOW","MEDIUM","HIGH"] as Priority[]).map(p=>(
              <option key={p} value={p} style={{color:"#000"}}>
                {p}
              </option>
            ))}
          </select>
          ) : (
            <span style={{
              background:"rgba(255,255,255,.15)",
              borderRadius:"10px",color:"#fff",
              fontSize:"11px",fontWeight:700,
              padding:"6px 8px",flexShrink:0
            }}>{activeTask.priority}</span>
          )}
          {canAct && !isTaskClosed(activeTask.status) ? (
          <select
            value={viewerListStatus(activeTask, myEmail, true)}
            disabled={statusUpdating}
            onChange={e=>void handleStatusUpdate(
              e.target.value as Status
            )}
            style={{
              background:"rgba(255,255,255,.15)",
              border:"none",borderRadius:"10px",
              color:"#fff",fontSize:"12px",
              fontWeight:700,padding:"6px 8px",
              minHeight:32,cursor:"pointer",flexShrink:0,
              opacity:statusUpdating?0.6:1
            }}>
            <option value="NEW" style={{color:"#000"}}>New</option>
            <option value="IN_PROGRESS" style={{color:"#000"}}>
              In Progress
            </option>
            <option value="CLOSED" style={{color:"#000"}}>Closed</option>
          </select>
          ) : canAct && taskIsOwner && isTaskClosed(activeTask.status) ? (
            <span style={{
              background:"rgba(255,255,255,.15)",
              borderRadius:"10px",color:"#fff",
              fontSize:"11px",fontWeight:700,
              padding:"6px 8px",flexShrink:0
            }}>Closed</span>
          ) : canAct ? (
            <span style={{
              background:"rgba(255,255,255,.15)",
              borderRadius:"10px",color:"#fff",
              fontSize:"11px",fontWeight:700,
              padding:"6px 8px",flexShrink:0
            }}>{viewerListStatus(activeTask, myEmail, true)}</span>
          ) : (
            <span style={{
              background:"rgba(255,255,255,.15)",
              borderRadius:"10px",color:"#fff",
              fontSize:"11px",fontWeight:700,
              padding:"6px 8px",flexShrink:0
            }}>{uiStatus(activeTask.status)}</span>
          )}
          {canAct && (
          <div ref={taskMenuRef} style={{position:"relative",flexShrink:0}}>
            <button
              onClick={()=>setShowTaskMenu(!showTaskMenu)}
              style={{
                background:"rgba(255,255,255,.12)",
                border:"none",borderRadius:"10px",
                color:"#fff",fontSize:"22px",
                cursor:"pointer",padding:"0",
                lineHeight:1,width:36,height:36,
                display:"flex",alignItems:"center",
                justifyContent:"center"
              }} aria-label="Task menu">⋮</button>
            {showTaskMenu&&(
              <div style={{
                position:"absolute",right:0,top:"100%",
                marginTop:"4px",background:"#fff",
                borderRadius:"10px",
                boxShadow:"0 4px 16px rgba(0,0,0,.15)",
                minWidth:"200px",zIndex:60,
                overflow:"hidden"
              }}>
                {!isSubtaskPanel&&(
                <button
                  onClick={()=>{
                    const host = isSubtaskPanel ? activeTask : selected;
                    setShowTaskMenu(false);
                    openNewTask("detail", host.id, host.title);
                  }}
                  style={{
                    display:"block",width:"100%",
                    padding:"12px 16px",border:"none",
                    background:"#fff",color:"#075E54",
                    fontSize:"13px",fontWeight:600,
                    textAlign:"left",cursor:"pointer"
                  }}>
                  ➕ Add Sub-task
                </button>
                )}
                {!taskIsOwner&&(
                <button
                  onClick={()=>{
                    setExtendDeadlineDraft(
                      activeTask.dueDate
                        ? new Date(activeTask.dueDate).toISOString().slice(0, 10)
                        : defaultDueDate()
                    );
                    setShowExtendDeadlineModal(true);
                    setShowTaskMenu(false);
                  }}
                  style={{
                    display:"block",width:"100%",
                    padding:"12px 16px",border:"none",
                    background:"#fff",color:"#075E54",
                    fontSize:"13px",fontWeight:600,
                    textAlign:"left",cursor:"pointer",
                    borderTop:"1px solid #f0ece6"
                  }}>
                  📅 Extend Deadline
                </button>
                )}
                {(taskIsOwner || activeTask.assignedByEmail?.toLowerCase() === myEmail.toLowerCase()) && (
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
                )}
              </div>
            )}
          </div>
          )}
        </DetailHeader>

        {isSubtaskPanel&&selected&&(
          <div style={{
            background:"#128C7E",
            padding:"8px 16px 10px",
            fontSize:"12px",fontWeight:600,
            color:"rgba(255,255,255,.85)",
            borderTop:"1px solid rgba(255,255,255,.08)"
          }}>
            ↳ Sub-task of {selected.title}
          </div>
        )}

        {/* Meta bar */}
        <div style={{
          background:"#128C7E",padding:"12px 16px",
          display:"flex",alignItems:"center",
          justifyContent:"space-between",gap:"10px",
          minHeight:"52px"
        }}>
          <button type="button"
            onClick={()=>{
              if (!canAct) return;
              setMembersDraft(
                activeTask.assignees.map(a=>a.assigneeEmail)
              );
              setShowMembersModal(true);
            }}
            style={{
              display:"flex",alignItems:"center",gap:"8px",
              background:"none",border:"none",
              cursor:canAct?"pointer":"default",
              flex:1,minWidth:0,textAlign:"left",padding:0
            }}>
            {(activeTask.assignees ?? []).length>0?(
              <AssigneeAvatars
                assignees={activeTask.assignees ?? []}
                max={5} memberLookup={members}/>
            ):(
              <span style={{
                fontSize:"13px",color:"rgba(255,255,255,.75)"
              }}>{canAct ? "Tap to add members" : "No members"}</span>
            )}
          </button>
          <button type="button"
            onClick={()=>{
              if (!taskIsOwner) return;
              setDueDateDraft(activeTask.dueDate
                ?new Date(activeTask.dueDate)
                  .toISOString().slice(0,10)
                :"");
              setShowDueDateModal(true);
            }}
            style={{
              fontSize:"12px",fontWeight:600,
              padding:"6px 12px",borderRadius:"999px",
              background: !isTaskClosed(activeTask.status)&&
                activeTask.dueDate&&
                new Date(activeTask.dueDate)<new Date()
                ?"rgba(220,38,38,.25)"
                :"rgba(255,255,255,.18)",
              color: !isTaskClosed(activeTask.status)&&
                activeTask.dueDate&&
                new Date(activeTask.dueDate)<new Date()
                ?"#fecaca":"rgba(255,255,255,.95)",
              whiteSpace:"nowrap",border:"none",
              cursor:taskIsOwner?"pointer":"default",
              flexShrink:0
            }}>
            📅 {activeTask.dueDate
              ?new Date(activeTask.dueDate)
                .toLocaleDateString("en-IN")
              : taskIsOwner ? "Set date" : "No date"}
          </button>
        </div>

        {!isSubtaskPanel && subtaskCount > 0 && (
          <div style={{
            background:"linear-gradient(180deg,#0a6b60,#075E54)",
            borderTop:"1px solid rgba(255,255,255,.08)",
            maxHeight:200,overflowY:"auto",
            WebkitOverflowScrolling:"touch",
          }}>
            <p style={{
              fontSize:10,fontWeight:800,
              letterSpacing:"0.1em",textTransform:"uppercase",
              color:"rgba(255,255,255,.6)",
              margin:"8px 16px 4px",
            }}>
              Sub-tasks ({subtaskCount})
            </p>
            {sortTasksByRecent(subtaskHost.children!).map((child) => {
              const done = isTaskClosed(child.status);
              return (
                <div key={child.id}
                  className="pressable"
                  onClick={()=>void openSubtaskPanel(child.id)}
                  style={{
                    display:"flex",alignItems:"center",gap:10,
                    padding:"10px 16px",
                    borderBottom:"1px solid rgba(255,255,255,.06)",
                    cursor:"pointer",
                  }}>
                  <div style={{
                    width:26,height:26,borderRadius:"50%",
                    background:done?"#25D366":"rgba(255,255,255,.18)",
                    color:"#fff",display:"flex",
                    alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:800,flexShrink:0,
                    border:done?"none":"1px solid rgba(255,255,255,.25)",
                  }}>
                    {done?"✓":"✕"}
                  </div>
                  <p style={{
                    flex:1,margin:0,fontSize:13,fontWeight:600,
                    color:"rgba(255,255,255,.95)",
                    overflow:"hidden",textOverflow:"ellipsis",
                    whiteSpace:"nowrap",
                  }}>{child.title}</p>
                  {child.assignees && child.assignees.length>0 && (
                    <AssigneeAvatars
                      assignees={child.assignees}
                      max={3}
                      memberLookup={members}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>

        {/* Scrollable chat area */}
        <div ref={chatScrollRef} style={{
          flex:1,minHeight:0,overflowY:"auto",
          padding:"12px 16px",
          display:"flex",flexDirection:"column",gap:"6px",
          WebkitOverflowScrolling:"touch"
        }}>
          {taskIsOwner&&activeTask.pendingDeadlineDate&&(
            <div style={{
              background:"#fef3c7",borderRadius:12,padding:12,marginBottom:8
            }}>
              <p style={{fontSize:13,color:"#92400e",margin:"0 0 10px",fontWeight:600}}>
                Deadline extension requested for{" "}
                {new Date(activeTask.pendingDeadlineDate).toLocaleDateString("en-IN")}
              </p>
              <div style={{display:"flex",gap:8}}>
                <button type="button" onClick={()=>void handleApproveExtension(activeTask.id)}
                  style={{flex:1,padding:"10px",borderRadius:999,border:"none",background:"#075E54",color:"#fff",fontWeight:700,cursor:"pointer"}}>
                  Approve
                </button>
                <button type="button" onClick={()=>void handleRejectExtension(activeTask.id)}
                  style={{flex:1,padding:"10px",borderRadius:999,border:"1px solid #d97706",background:"#fff",color:"#92400e",fontWeight:700,cursor:"pointer"}}>
                  Decline
                </button>
              </div>
            </div>
          )}
          {taskIsOwner&&pendingDenials.map((a)=>(
            <div key={a.id} style={{
              background:"#fee2e2",borderRadius:12,padding:12,marginBottom:8
            }}>
              <p style={{fontSize:13,color:"#991b1b",margin:"0 0 10px",fontWeight:600}}>
                {personName(a.assigneeEmail, activeTask)} denied this task
              </p>
              <div style={{display:"flex",gap:8}}>
                <button type="button" onClick={()=>void handleApproveDenial(activeTask.id, a.assigneeEmail)}
                  style={{flex:1,padding:"10px",borderRadius:999,border:"none",background:"#dc2626",color:"#fff",fontWeight:700,cursor:"pointer"}}>
                  Approve removal
                </button>
                <button type="button" onClick={()=>void handleRejectDenial(activeTask.id, a.assigneeEmail)}
                  style={{flex:1,padding:"10px",borderRadius:999,border:"1px solid #dc2626",background:"#fff",color:"#991b1b",fontWeight:700,cursor:"pointer"}}>
                  Keep member
                </button>
              </div>
            </div>
          ))}
          {/* Initial task bubble */}
          <div style={{
            display:"flex",justifyContent:"flex-end",
            alignItems:"flex-end",gap:"6px"
          }}>
            <div className="wa-bubble-out">
              <p style={{
                fontSize:"11px",fontWeight:700,
                color:"#075E54",marginBottom:"4px"
              }}>
                {personName(
                  activeTask.assignedByEmail??
                  activeTask.raisedByEmail,
                  activeTask
                )}
              </p>
              {activeTask.description&&(
                <p style={{
                  fontSize:"14px",color:"#1a1614",
                  lineHeight:1.5,margin:0
                }}>{renderLinkedText(activeTask.description)}</p>
              )}
              {activeTask.attachments.length>0&&(
                <ChatMedia
                  attachments={activeTask.attachments}
                  canDelete={canAct}
                  onDeleteMessage={(attachment)=>{
                    setSelectedDelete({
                      kind: "task-attachment",
                      id: attachment.id,
                    });
                  }}
                />
              )}
              <p style={{
                fontSize:"10px",color:"#8a7060",
                textAlign:"right",marginTop:"4px"
              }}>
                <TimeAgo date={activeTask.createdAt}/>
              </p>
            </div>
          </div>

          {/* Sub-tasks shown via floating button */}

          {/* Chat events */}
          {activeTask.events?.map(ev=>{
            if (ev.type==="CREATED") return null;
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
                    🔄 {ev.message ? renderLinkedText(ev.message, "#8a7060") : null}
                  </span>
                  <p style={{
                    fontSize:"10px",color:"#b8a898",
                    marginTop:"2px"
                  }}>
                    <TimeAgo date={ev.createdAt}/>
                  </p>
                </div>
              );
            }
            if (ev.message?.startsWith("@@SYSTEM@@")) {
              return (
                <div key={ev.id} style={{
                  textAlign:"center",margin:"8px 0"
                }}>
                  <span style={{
                    fontSize:"12px",color:"#4a3f38",
                    background:"rgba(255,255,255,.75)",
                    padding:"8px 14px",
                    borderRadius:"12px",
                    lineHeight:1.5,display:"inline-block",
                    maxWidth:"90%"
                  }}>
                    {renderLinkedText(
                      systemMessageText(
                        ev.message,
                        myEmail,
                        activeTask,
                        members,
                        myName
                      ),
                      "#4a3f38"
                    )}
                  </span>
                  <p style={{
                    fontSize:"10px",color:"#b8a898",
                    marginTop:"4px"
                  }}>
                    <TimeAgo date={ev.createdAt}/>
                  </p>
                  {myAssignee?.responseStatus==="PENDING" &&
                    isStartPromptMessage(ev.message) && (
                    <button
                      type="button"
                      onClick={()=>void handleStartTask(activeTask.id)}
                      style={{
                        marginTop:"10px",
                        padding:"10px 22px",
                        borderRadius:"999px",
                        border:"none",
                        background:"#25D366",
                        color:"#fff",
                        fontWeight:800,
                        cursor:"pointer"
                      }}
                    >
                      Start
                    </button>
                  )}
                </div>
              );
            }
            const isMine = ev.authorEmail===myEmail;
            const canDel = canAct && messageCanDelete(ev);
            return (
              <div key={ev.id} style={{
                display:"flex",
                justifyContent:isMine?"flex-end":"flex-start",
                alignItems:"flex-end",gap:"6px"
              }}>
                {!isMine&&(
                  <Avatar
                    email={ev.authorEmail}
                    name={personName(ev.authorEmail,activeTask)}
                    size={28}
                    avatarUrl={avatarFor(ev.authorEmail)}
                  />
                )}
                <div
                  className={isMine?"wa-bubble-out":"wa-bubble-in"}
                  style={{position:"relative",maxWidth:"75%"}}>
                  {canDel && (
                    <button type="button"
                      onMouseDown={(e)=>e.stopPropagation()}
                      onClick={(e)=>{
                        e.stopPropagation();
                        setMsgMenuId(
                          msgMenuId === ev.id ? null : ev.id
                        );
                      }}
                      style={{
                        position:"absolute",top:4,right:4,
                        width:24,height:24,borderRadius:6,
                        border:"none",background:"rgba(0,0,0,.06)",
                        color:"#4a3f38",cursor:"pointer",
                        fontSize:14,lineHeight:1,zIndex:2
                      }}
                      aria-label="Message options">⋮</button>
                  )}
                  {msgMenuId === ev.id && canDel && (
                    <div style={{
                      position:"absolute",top:30,right:4,zIndex:20,
                      background:"#233138",borderRadius:10,
                      boxShadow:"0 8px 24px rgba(0,0,0,.28)",
                      minWidth:120,overflow:"hidden"
                    }}>
                      <button type="button"
                        onClick={()=>{
                          setMsgMenuId(null);
                          setSelectedDelete({
                            kind: "message",
                            id: ev.id,
                          });
                        }}
                        style={{
                          width:"100%",padding:"12px 14px",
                          border:"none",background:"transparent",
                          color:"#ea7070",fontSize:14,fontWeight:500,
                          display:"flex",alignItems:"center",gap:12,
                          cursor:"pointer",textAlign:"left"
                        }}>
                        <span style={{fontSize:16}}>🗑</span> Delete
                      </button>
                    </div>
                  )}
                  {!isMine&&(
                    <p style={{
                      fontSize:"11px",fontWeight:700,
                      color:"#075E54",marginBottom:"3px",
                      paddingRight:canDel?22:0
                    }}>
                      {personName(ev.authorEmail,activeTask)}
                    </p>
                  )}
                  {ev.message&&(
                    <p style={{
                      fontSize:"14px",color:"#1a1614",
                      lineHeight:1.5,margin:0,
                      paddingRight:canDel?18:0
                    }}>{renderLinkedText(ev.message)}</p>
                  )}
                  {ev.attachments&&ev.attachments.length>0&&(
                    <ChatMedia
                      attachments={ev.attachments}
                      canDelete={canDel}
                      onDeleteMessage={()=>{
                        setSelectedDelete({
                          kind: "message",
                          id: ev.id,
                        });
                      }}
                    />
                  )}
                  <p style={{
                    fontSize:"10px",color:"#8a7060",
                    textAlign:"right",marginTop:"4px"
                  }}>
                    <TimeAgo date={ev.createdAt}/>
                  </p>
                </div>
                {isMine&&(
                  <Avatar
                    email={ev.authorEmail}
                    name={personName(ev.authorEmail,activeTask)}
                    size={28}
                    avatarUrl={avatarFor(ev.authorEmail)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          flexShrink:0,position:"relative"
        }}>
        {/* Bottom input bar or reopen */}
        <div style={{flexShrink:0}}>
        {!canAct ? (
          <div style={{
            padding:"12px 16px",
            paddingBottom:"calc(12px + env(safe-area-inset-bottom,0px))",
            background:"#f0ece6",
            borderTop:"1px solid #e0d8ce",
            textAlign:"center"
          }}>
            <p style={{
              fontSize:13,color:"#8a7060",margin:0,fontWeight:600
            }}>
              View only — you are not assigned to this task
            </p>
          </div>
        ) : activeTask.status==="RESOLVED"?(
          taskIsOwner ? (
          <div style={{
            padding:"12px 16px",
            paddingBottom:
              "calc(12px + env(safe-area-inset-bottom,0px))",
            background:"#f0ece6"
          }}>
            <button onClick={async()=>{
              const r = await fetch(
                `${API}/complaints/${activeTask.id}/reopen`,{
                  method:"POST",headers:ah(),
                }
              );
              if (!r.ok) {
                const d = await r.json().catch(()=>({})) as {error?:string};
                alert(d.error ?? "Could not reopen task.");
                return;
              }
              if (isSubtaskPanel) await loadSubtaskPanel(activeTask.id);
              else await loadDetail(activeTask.id);
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
          ) : (
          <div style={{
            padding:"12px 16px",
            paddingBottom:"calc(12px + env(safe-area-inset-bottom,0px))",
            background:"#f0ece6",
            borderTop:"1px solid #e0d8ce",
            textAlign:"center"
          }}>
            <p style={{
              fontSize:13,color:"#8a7060",margin:0,fontWeight:600
            }}>
              This task is closed by the owner
            </p>
          </div>
          )
        ):(
          <>
          {/* Menu always in DOM — inputs nested in labels (iOS-safe) */}
          <div id="wa-attach-menu" style={{
            position:"absolute",
            bottom:"72px",right:"10px",
            background:"#fff",
            borderRadius:16,
            boxShadow:"0 4px 24px rgba(0,0,0,0.18)",
            overflow:"hidden",
            zIndex:200,minWidth:220,
            border:"1px solid #f0ece6",
            display:showAttachMenu?"block":"none",
            pointerEvents:showAttachMenu?"auto":"none"
          }}>
            <div style={{
              padding:"10px 14px",
              background:"#f8f6f3",
              borderBottom:"1px solid #f0ece6"
            }}>
              <p style={{
                margin:0,fontSize:12,fontWeight:700,
                color:"#075E54"
              }}>
                {UPLOAD_LIMITS_HINT}
              </p>
            </div>
            <label style={{
              position:"relative",
              display:"flex",alignItems:"center",
              gap:14,padding:"14px 16px",
              cursor:"pointer",
              borderBottom:"0.5px solid #f0ece6"
            }}>
              <input type="file"
                accept="image/*,video/*"
                multiple
                style={CHAT_FILE_INPUT_STYLE}
                onChange={e=>{
                  addChatAttachments(
                    e.target.files,"photos",e.target
                  );
                }}/>
              <div style={{
                width:40,height:40,borderRadius:"50%",
                background:"#2196F318",
                display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:20,
                pointerEvents:"none"
              }}>🖼</div>
              <span style={{
                fontSize:15,color:"#1a1614",fontWeight:500,
                pointerEvents:"none"
              }}>Photos & Videos</span>
            </label>

            <label style={{
              position:"relative",
              display:"flex",alignItems:"center",
              gap:14,padding:"14px 16px",
              cursor:"pointer",
              borderBottom:"0.5px solid #f0ece6"
            }}>
              <input type="file"
                accept="image/*"
                capture="environment"
                style={CHAT_FILE_INPUT_STYLE}
                onChange={e=>{
                  addChatAttachments(
                    e.target.files,"camera",e.target
                  );
                }}/>
              <div style={{
                width:40,height:40,borderRadius:"50%",
                background:"#F4433618",
                display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:20,
                pointerEvents:"none"
              }}>📷</div>
              <span style={{
                fontSize:15,color:"#1a1614",fontWeight:500,
                pointerEvents:"none"
              }}>Camera</span>
            </label>

            <label style={{
              position:"relative",
              display:"flex",alignItems:"center",
              gap:14,padding:"14px 16px",
              cursor:"pointer",
              borderBottom:"0.5px solid #f0ece6"
            }}>
              <input type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,application/msword"
                multiple
                style={CHAT_FILE_INPUT_STYLE}
                onChange={e=>{
                  addChatAttachments(
                    e.target.files,"document",e.target
                  );
                }}/>
              <div style={{
                width:40,height:40,borderRadius:"50%",
                background:"#7c5cbf18",
                display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:20,
                pointerEvents:"none"
              }}>📄</div>
              <span style={{
                fontSize:15,color:"#1a1614",fontWeight:500,
                pointerEvents:"none"
              }}>Document</span>
            </label>

            <label style={{
              position:"relative",
              display:"flex",alignItems:"center",
              gap:14,padding:"14px 16px",
              cursor:"pointer"
            }}>
              <input type="file"
                accept="audio/*"
                style={CHAT_FILE_INPUT_STYLE}
                onChange={e=>{
                  addChatAttachments(
                    e.target.files,"audio",e.target
                  );
                }}/>
              <div style={{
                width:40,height:40,borderRadius:"50%",
                background:"#FF980018",
                display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:20,
                pointerEvents:"none"
              }}>🎵</div>
              <span style={{
                fontSize:15,color:"#1a1614",fontWeight:500,
                pointerEvents:"none"
              }}>Audio</span>
            </label>
          </div>

          {/* Voice recording UI */}
          {isRecording&&(
            <div style={{
              padding:"10px 12px",
              background:"#fff",
              borderTop:"1px solid #e0d8ce"
            }}>
              <div style={{
                display:"flex",alignItems:"center",
                justifyContent:"space-between",marginBottom:10
              }}>
                <span style={{
                  fontSize:14,fontWeight:600,color:"#1a1614"
                }}>
                  {formatAudioTime(recordingSeconds)}
                </span>
                <div style={{
                  display:"flex",alignItems:"center",
                  gap:2,flex:1,marginLeft:12,height:28
                }}>
                  {Array.from({length:28},(_,i)=>(
                    <div key={i} style={{
                      width:2,borderRadius:2,
                      background:"#8696a0",
                      height:`${Math.max(28,
                        Math.sin(i*0.8)*42+48
                      )}%`,
                      opacity:0.8
                    }}/>
                  ))}
                </div>
              </div>
              <div style={{
                display:"flex",alignItems:"center",
                justifyContent:"space-between"
              }}>
                <button type="button" onClick={cancelRecording}
                  style={{
                    width:40,height:40,border:"none",
                    background:"transparent",cursor:"pointer",
                    fontSize:22,color:"#8696a0"
                  }} aria-label="Discard recording">🗑</button>
                <button type="button"
                  onClick={togglePauseRecording}
                  style={{
                    width:40,height:40,border:"none",
                    background:"transparent",cursor:"pointer",
                    fontSize:22,color:"#dc2626"
                  }}
                  aria-label={isRecordingPaused
                    ? "Resume recording" : "Pause recording"}>
                  {isRecordingPaused ? "▶" : "❚❚"}
                </button>
                <button type="button"
                  onClick={()=>void stopAndUploadVoice()}
                  style={{
                    width:48,height:48,borderRadius:"50%",
                    background:"#25D366",border:"none",
                    color:"#fff",cursor:"pointer",
                    display:"flex",alignItems:"center",
                    justifyContent:"center"
                  }} aria-label="Send voice note">
                  <IconSend size={22}/>
                </button>
              </div>
            </div>
          )}

          {/* Preview strip for selected files */}
          {/* Attachment status + upload progress */}
          {!isRecording && attachStatus && (
            <div style={{
              padding:"10px 16px",
              background:"#e8f5e9",
              borderTop:"1px solid #c8e6c9",
              display:"flex",alignItems:"center",gap:8
            }}>
              <span style={{fontSize:16}}>📎</span>
              <p style={{
                fontSize:13,fontWeight:600,
                color:"#1b5e20",margin:0,flex:1
              }}>
                {attachStatus}
              </p>
            </div>
          )}
          {uploadProgress !== null && (
            <div style={{
              padding:"8px 16px",
              background:"#f0ece6",
              display:"flex",alignItems:"center",gap:10,
              borderTop:"1px solid #e0d8ce"
            }}>
              <div style={{
                position:"relative",
                width:36,height:36,flexShrink:0
              }}>
                <svg width="36" height="36"
                  style={{transform:"rotate(-90deg)"}}>
                  <circle cx="18" cy="18" r="14"
                    fill="none" stroke="#e0d8ce"
                    strokeWidth="3"/>
                  <circle cx="18" cy="18" r="14"
                    fill="none" stroke="#25D366"
                    strokeWidth="3"
                    strokeDasharray={`${2*Math.PI*14}`}
                    strokeDashoffset={
                      `${2*Math.PI*14*(1-uploadProgress/100)}`
                    }
                    strokeLinecap="round"/>
                </svg>
                <span style={{
                  position:"absolute",inset:0,
                  display:"flex",alignItems:"center",
                  justifyContent:"center",
                  fontSize:9,fontWeight:700,
                  color:"#075E54"
                }}>
                  {uploadProgress}%
                </span>
              </div>
              <div>
                <p style={{
                  fontSize:13,fontWeight:600,
                  color:"#1a1614",margin:0
                }}>
                  {uploadProgress<100
                    ?"Uploading...":"Processing..."}
                </p>
                <p style={{
                  fontSize:11,color:"#8a7060",margin:"2px 0 0"
                }}>
                  {uploadProgress}% complete
                </p>
              </div>
            </div>
          )}
          {!isRecording&&msgFiles.length>0&&(
            <div style={{
              display:"flex",gap:8,padding:"8px 12px",
              background:"#f0ece6",
              overflowX:"auto",
              borderTop:"1px solid #e0d8ce"
            }}>
              {msgFiles.map((f,i)=>{
                const isImg = f.type.startsWith("image");
                const isVid = f.type.startsWith("video");
                const isAud = f.type.startsWith("audio");
                const previewUrl = msgFilePreviews[i] || null;
                return (
                  <div key={i} style={{
                    position:"relative",flexShrink:0,
                    width:72
                  }}>
                    {isImg&&previewUrl?(
                      <img src={previewUrl}
                        alt={f.name}
                        style={{
                          width:72,height:72,
                          objectFit:"cover",
                          borderRadius:8,display:"block"
                        }}/>
                    ):isVid&&previewUrl?(
                      <video src={previewUrl}
                        muted
                        style={{
                          width:72,height:72,
                          objectFit:"cover",
                          borderRadius:8,display:"block"
                        }}/>
                    ):(
                      <div style={{
                        width:72,height:72,
                        borderRadius:8,
                        background:"#fff",
                        border:"1px solid #e0d8ce",
                        display:"flex",
                        flexDirection:"column",
                        alignItems:"center",
                        justifyContent:"center",
                        fontSize:20,gap:2
                      }}>
                        {isAud?"🎤":"📄"}
                        <span style={{
                          fontSize:8,color:"#8a7060",
                          padding:"0 2px",
                          overflow:"hidden",
                          textOverflow:"ellipsis",
                          whiteSpace:"nowrap",
                          width:"100%",textAlign:"center"
                        }}>
                          {f.name.split(".").pop()
                            ?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <p style={{
                      margin:"6px 0 0",
                      fontSize:9,
                      color:"#6b5d53",
                      whiteSpace:"nowrap",
                      overflow:"hidden",
                      textOverflow:"ellipsis"
                    }}>
                      {f.name}
                    </p>
                    <button
                      onClick={()=>{
                        const next = msgFiles.filter(
                          (_,j)=>j!==i
                        );
                        setMsgFiles(next);
                        if (next.length===0) {
                          setAttachStatus(null);
                        } else {
                          setAttachStatus(
                            `✓ ${next.length}/${MAX_CHAT_ATTACHMENTS} ready · ${UPLOAD_LIMITS_HINT}`
                          );
                        }
                      }}
                      style={{
                        position:"absolute",top:-6,right:-6,
                        width:18,height:18,borderRadius:"50%",
                        background:"#dc2626",border:"2px solid #fff",
                        color:"#fff",fontSize:10,
                        cursor:"pointer",display:"flex",
                        alignItems:"center",
                        justifyContent:"center",padding:0,
                        lineHeight:1
                      }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Main input bar */}
          {!isRecording&&(
            <form onSubmit={e=>void handleAddQuery(e)}
              onPointerDown={e=>e.stopPropagation()}
              style={{
                display:"flex",alignItems:"flex-end",
                gap:8,padding:"6px 8px",
                paddingBottom: 6,
                transform: keyboardInset > 0
                  ? `translateY(-${Math.max(0, keyboardInset - 8)}px)`
                  : undefined,
                background:"#f0ece6",
                borderTop:msgFiles.length>0
                  ?"none":"1px solid #e0d8ce",
                position:"relative"
              }}>

              <div style={{
                flex:1,background:"#fff",
                borderRadius:24,
                padding:"6px 8px 6px 14px",
                display:"flex",alignItems:"center",
                gap:4,minHeight:48,
                boxShadow:"0 1px 2px rgba(0,0,0,.06)"
              }}>
                <input
                  value={msgInput}
                  onChange={e=>{
                    setMsgInput(e.target.value);
                    setShowAttachMenu(false);
                  }}
                  onKeyDown={e=>{
                    if (e.key==="Enter"&&!e.shiftKey) {
                      e.preventDefault();
                      if (msgInput.trim()||msgFiles.length>0)
                        void handleAddQuery(e as any);
                    }
                  }}
                  placeholder="Message"
                  style={{
                    border:"none",outline:"none",
                    fontSize:15,color:"#1a1614",
                    background:"transparent",
                    fontFamily:"inherit",flex:1,minWidth:0
                  }}/>

                <button id="wa-attach-btn" type="button"
                  onClick={()=>setShowAttachMenu(p=>!p)}
                  style={{
                    width:36,height:36,borderRadius:"50%",
                    background:"transparent",border:"none",
                    cursor:"pointer",flexShrink:0,
                    display:"flex",alignItems:"center",
                    justifyContent:"center",position:"relative"
                  }}
                  aria-label="Attach file">
                  <IconPaperclip/>
                  {msgFiles.length>0&&(
                    <span style={{
                      position:"absolute",top:2,right:2,
                      minWidth:16,height:16,padding:"0 3px",
                      borderRadius:999,background:"#25D366",
                      color:"#fff",fontSize:9,fontWeight:700,
                      display:"flex",alignItems:"center",
                      justifyContent:"center"
                    }}>
                      {msgFiles.length}
                    </span>
                  )}
                </button>

                <label style={{
                  width:36,height:36,borderRadius:"50%",
                  display:"flex",alignItems:"center",
                  justifyContent:"center",cursor:"pointer",
                  flexShrink:0,position:"relative"
                }}>
                  <input ref={camBarRef} type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    onChange={e=>{
                      addChatAttachments(
                        e.target.files,"camera",e.target
                      );
                    }}/>
                  <IconCamera/>
                </label>
              </div>

              {(msgInput.trim()||msgFiles.length>0)?(
                <button type="submit"
                  disabled={querySending}
                  style={{
                    width:48,height:48,borderRadius:"50%",
                    border:"none",background:"#25D366",
                    color:"#fff",cursor:"pointer",flexShrink:0,
                    display:"flex",alignItems:"center",
                    justifyContent:"center",
                    opacity:querySending?0.6:1
                  }}
                  aria-label="Send message">
                  {querySending ? (
                    uploadProgress!==null && uploadProgress<100
                      ? "↑" : "…"
                  ) : <IconSend/>}
                </button>
              ):(
                <button type="button"
                  onPointerDown={()=>void startRecording()}
                  onPointerUp={async ()=>{
                    if (isRecording) {
                      await stopAndUploadVoice();
                    }
                  }}
                  style={{
                    width:48,height:48,borderRadius:"50%",
                    border:"none",background:"#25D366",
                    color:"#fff",cursor:"pointer",flexShrink:0,
                    display:"flex",alignItems:"center",
                    justifyContent:"center"
                  }}
                  aria-label="Record voice note">
                  <IconMic/>
                </button>
              )}
            </form>
          )}
          </>
        )}
        </div>
        </div>

        {showMembersModal&&(
          <div style={{
            position:"fixed",inset:0,
            background:"rgba(0,0,0,.5)",
            display:"flex",alignItems:"flex-end",
            justifyContent:"center",zIndex:200
          }}
            onClick={()=>setShowMembersModal(false)}>
            <div style={{
              background:"#fff",borderRadius:"20px 20px 0 0",
              width:"100%",maxWidth:"480px",
              maxHeight:"75vh",overflowY:"auto",
              padding:"20px 16px"
            }}
              onClick={e=>e.stopPropagation()}>
              <div style={{
                display:"flex",justifyContent:"space-between",
                alignItems:"center",marginBottom:"16px"
              }}>
                <h3 style={{
                  fontSize:"17px",fontWeight:700,
                  color:"#1a1614",margin:0
                }}>Task members</h3>
                <button type="button"
                  onClick={()=>setShowMembersModal(false)}
                  style={{
                    background:"none",border:"none",
                    fontSize:"22px",cursor:"pointer",
                    color:"#8a7060"
                  }}>×</button>
              </div>
              <p style={{
                fontSize:"12px",color:"#8a7060",
                marginBottom:"12px"
              }}>Add or remove people on this task</p>
              <div style={{marginBottom:"16px"}}>
                {membersDraft.map(email=>{
                  const m = members.find(x=>x.email===email);
                  return (
                    <div key={email} style={{
                      display:"flex",alignItems:"center",
                      gap:"10px",padding:"10px 0",
                      borderBottom:"1px solid #f0ece6"
                    }}>
                      <Avatar
                        name={m?.name??personName(email,activeTask)}
                        email={email}
                        size={36}
                        avatarUrl={m?.avatarUrl??avatarFor(email)}
                      />
                      <div style={{flex:1}}>
                        <p style={{
                          fontSize:"14px",fontWeight:600,
                          margin:0,color:"#1a1614"
                        }}>
                          {personName(email,activeTask)}
                        </p>
                        <p style={{
                          fontSize:"11px",color:"#8a7060",margin:0
                        }}>{email}</p>
                      </div>
                      <button type="button"
                        onClick={()=>setMembersDraft(
                          membersDraft.filter(e=>e!==email)
                        )}
                        style={{
                          background:"#fee2e2",border:"none",
                          color:"#dc2626",borderRadius:"8px",
                          padding:"6px 10px",fontSize:"12px",
                          fontWeight:600,cursor:"pointer"
                        }}>Remove</button>
                    </div>
                  );
                })}
              </div>
              <p style={{
                fontSize:"12px",fontWeight:700,
                color:"#075E54",marginBottom:"8px"
              }}>Add member</p>
              <div style={{
                maxHeight:"160px",overflowY:"auto",
                marginBottom:"16px"
              }}>
                {members
                  .filter(m=>
                    m.email!==myEmail&&
                    !membersDraft.includes(m.email)
                  )
                  .map(m=>(
                    <button key={m.email} type="button"
                      onClick={()=>setMembersDraft(
                        d=>[...d,m.email]
                      )}
                      style={{
                        width:"100%",display:"flex",
                        alignItems:"center",gap:"10px",
                        padding:"10px 8px",border:"none",
                        background:"#f9faf8",borderRadius:"10px",
                        marginBottom:"6px",cursor:"pointer",
                        textAlign:"left"
                      }}>
                      <Avatar
                        name={m.name} email={m.email}
                        size={32} avatarUrl={m.avatarUrl}
                      />
                      <span style={{
                        fontSize:"13px",fontWeight:600,
                        color:"#1a1614"
                      }}>
                        {m.name??m.email.split("@")[0]}
                      </span>
                    </button>
                  ))}
              </div>
              <button type="button"
                disabled={membersSaving}
                onClick={()=>void handleSaveMembers()}
                style={{
                  width:"100%",padding:"14px",
                  borderRadius:"999px",border:"none",
                  background:"#25D366",color:"#fff",
                  fontWeight:700,fontSize:"15px",
                  cursor:"pointer"
                }}>
                {membersSaving?"Saving...":"Save members"}
              </button>
            </div>
          </div>
        )}

        {showDueDateModal&&(
          <div style={{
            position:"fixed",inset:0,
            background:"rgba(0,0,0,.5)",
            display:"flex",alignItems:"center",
            justifyContent:"center",zIndex:200,padding:"24px"
          }}
            onClick={()=>setShowDueDateModal(false)}>
            <div style={{
              background:"#fff",borderRadius:"16px",
              padding:"24px",width:"100%",maxWidth:"320px"
            }}
              onClick={e=>e.stopPropagation()}>
              <h3 style={{
                fontSize:"17px",fontWeight:700,
                margin:"0 0 16px",color:"#1a1614"
              }}>Update due date</h3>
              <input type="date" className="input"
                value={dueDateDraft}
                onChange={e=>setDueDateDraft(e.target.value)}
                style={{marginBottom:"16px",borderRadius:"12px"}}
              />
              <div style={{display:"flex",gap:"10px"}}>
                <button type="button"
                  onClick={()=>setShowDueDateModal(false)}
                  style={{
                    flex:1,padding:"12px",borderRadius:"999px",
                    border:"1.5px solid #e0d8ce",
                    background:"#fff",cursor:"pointer"
                  }}>Cancel</button>
                <button type="button"
                  onClick={()=>void handleDueDateSave()}
                  style={{
                    flex:1,padding:"12px",borderRadius:"999px",
                    border:"none",background:"#075E54",
                    color:"#fff",fontWeight:700,cursor:"pointer"
                  }}>Save & notify</button>
              </div>
            </div>
          </div>
        )}

        {showExtendDeadlineModal&&(
          <div style={{
            position:"fixed",inset:0,
            background:"rgba(0,0,0,.5)",
            display:"flex",alignItems:"center",
            justifyContent:"center",zIndex:200,padding:"24px"
          }}
            onClick={()=>setShowExtendDeadlineModal(false)}>
            <div style={{
              background:"#fff",borderRadius:"16px",
              padding:"24px",width:"100%",maxWidth:"320px"
            }}
              onClick={e=>e.stopPropagation()}>
              <h3 style={{
                fontSize:"17px",fontWeight:700,
                margin:"0 0 16px",color:"#1a1614"
              }}>Request deadline extension</h3>
              <input type="date" className="input"
                value={extendDeadlineDraft}
                onChange={e=>setExtendDeadlineDraft(e.target.value)}
                style={{marginBottom:"16px",borderRadius:"12px"}}
              />
              <div style={{display:"flex",gap:"10px"}}>
                <button type="button"
                  onClick={()=>setShowExtendDeadlineModal(false)}
                  style={{
                    flex:1,padding:"12px",borderRadius:"999px",
                    border:"1.5px solid #e0d8ce",
                    background:"#fff",cursor:"pointer"
                  }}>Cancel</button>
                <button type="button"
                  onClick={()=>void handleRequestExtension(activeTask.id)}
                  style={{
                    flex:1,padding:"12px",borderRadius:"999px",
                    border:"none",background:"#075E54",
                    color:"#fff",fontWeight:700,cursor:"pointer"
                  }}>Send request</button>
              </div>
            </div>
          </div>
        )}

        {selectedDelete&&(
          <>
            <div
              aria-hidden
              onClick={()=>setSelectedDelete(null)}
              style={{
                position:"fixed",inset:0,
                background:"rgba(0,0,0,.35)",
                zIndex:150,maxWidth:"480px",
                margin:"0 auto",left:0,right:0
              }}
            />
            <div style={{
              position:"fixed",
              left:"50%",
              bottom:"calc(84px + env(safe-area-inset-bottom,0px))",
              transform:"translateX(-50%)",
              width:"min(92vw, 360px)",
              background:"#fff",
              borderRadius:16,
              boxShadow:"0 10px 30px rgba(0,0,0,.22)",
              padding:16,
              zIndex:151
            }}>
              <p style={{
                margin:"0 0 12px",
                fontSize:15,fontWeight:700,color:"#1a1614"
              }}>
                {selectedDelete.kind === "message"
                  ? "Delete this message?"
                  : "Delete this attachment?"}
              </p>
              <p style={{
                margin:"0 0 14px",
                fontSize:12,color:"#8a7060",lineHeight:1.5
              }}>
                {selectedDelete.kind === "message"
                  ? "This cannot be undone. Delete is only available for your recent messages."
                  : "This cannot be undone."}
              </p>
              <div style={{
                display:"flex",justifyContent:"flex-end",gap:10
              }}>
                <button
                  type="button"
                  onClick={()=>setSelectedDelete(null)}
                  style={{
                    padding:"10px 14px",borderRadius:999,
                    border:"1px solid #d7cec3",background:"#fff",
                    color:"#4a3f38",fontWeight:700,cursor:"pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={()=>void (
                    selectedDelete.kind === "message"
                      ? handleDeleteMessage(selectedDelete.id)
                      : handleDeleteTaskAttachment(selectedDelete.id)
                  )}
                  style={{
                    padding:"10px 14px",borderRadius:999,
                    border:"none",background:"#dc2626",
                    color:"#fff",fontWeight:800,cursor:"pointer"
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </>
        )}

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
                This will permanently delete &ldquo;{activeTask.title}
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
        {subtaskLoading&&(
          <div style={{
            position:"fixed",inset:0,zIndex:160,
            background:"rgba(0,0,0,.2)",
            display:"flex",alignItems:"center",
            justifyContent:"center",maxWidth:"480px",
            margin:"0 auto"
          }}>
            <span style={{
              background:"#fff",padding:"12px 20px",
              borderRadius:"12px",fontWeight:600,
              color:"#075E54"
            }}>Loading…</span>
          </div>
        )}
      </div>
    </>
    );
  }

  // ── NOTIFICATIONS VIEW ────────────────────────────────
  if (view==="notifications") return (
    <>
      <style>{CSS}</style>
      {(() => {
        const pull = pullHandlers(refreshCurrentView);
        return (
      <div style={{
        height:"100dvh",maxHeight:"100dvh",
        display:"flex",flexDirection:"column",
        background:"#ECE5DD",
        maxWidth:"480px",margin:"0 auto",
        overflow:"hidden",width:"100%"
      }}>
        <div style={{flexShrink:0}}>
          <DetailHeader title="Notifications"
            onBack={goBack}>
            <button onClick={()=>void clearAllNotifications()}
              style={{
                background:"rgba(255,255,255,.15)",
                border:"none",color:"#fff",
                fontSize:"12px",fontWeight:700,
                padding:"8px 12px",borderRadius:"10px",
                cursor:"pointer",flexShrink:0,marginRight:6
              }}>
              Clear all
            </button>
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
        </div>

        <div style={{
          flex:1,minHeight:0,overflowY:"auto",
          WebkitOverflowScrolling:"touch",
          padding:"12px 16px",
          paddingBottom:SCROLL_BOTTOM_PAD
        }} {...pull}>
          <PullRefreshIndicator
            pullDistance={pullDistance}
            refreshing={refreshing}
          />
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
                onTouchStart={(e)=>{
                  swipeRef.current={
                    id:n.id,
                    startX:e.touches[0].clientX,
                    startY:e.touches[0].clientY
                  };
                }}
                onTouchEnd={(e)=>{
                  const s=swipeRef.current;
                  if (!s||s.id!==n.id) return;
                  const dx=e.changedTouches[0].clientX-s.startX;
                  if (dx<-60) void deleteNotification(n.id);
                  swipeRef.current=null;
                }}
                onClick={()=>void openTaskDetail(n.taskId,"notifications")}
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
                      <TimeAgo date={n.createdAt}/>
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
        <BottomNav embedded/>
      </div>
        );
      })()}
    </>
  );

  // ── PROFILE VIEW ──────────────────────────────────────
  if (view==="profile") return (
    <>
      <style>{CSS}</style>
      <input ref={avatarCameraRef} type="file"
        accept="image/*" capture="user"
        hidden
        onChange={e=>{
          const f = e.target.files?.[0];
          if (f) {
            void handleAvatarUpload(f);
            setShowAvatarPicker(false);
          }
          e.target.value="";
        }}/>
      <input ref={avatarGalleryRef} type="file"
        accept="image/*"
        hidden
        onChange={e=>{
          const f = e.target.files?.[0];
          if (f) {
            void handleAvatarUpload(f);
            setShowAvatarPicker(false);
          }
          e.target.value="";
        }}/>
      <div style={{
        height:"100dvh",maxHeight:"100dvh",
        display:"flex",flexDirection:"column",
        background:"#ECE5DD",
        maxWidth:"480px",margin:"0 auto",
        overflow:"hidden",width:"100%"
      }}>
        <div style={{flexShrink:0}}>
          <MainHeader/>
        </div>
        <div style={{
          flex:1,minHeight:0,overflowY:"auto",
          WebkitOverflowScrolling:"touch",
          padding:"16px",
          paddingBottom:SCROLL_BOTTOM_PAD
        }}>
          <div style={{
            background:"linear-gradient(135deg,#075E54,#128C7E)",
            borderRadius:"20px",padding:"28px 20px",
            display:"flex",flexDirection:"column",
            alignItems:"center",marginBottom:"16px"
          }}>
            <button type="button"
              onClick={()=>setShowAvatarPicker(true)}
              disabled={avatarUploading}
              style={{
                position:"relative",cursor:"pointer",
                background:"none",border:"none",padding:0
              }}>
              <Avatar
                name={myName} email={myEmail} size={72}
                avatarUrl={myAvatarUrl}
              />
              <div style={{
                position:"absolute",bottom:0,right:0,
                width:28,height:28,borderRadius:"50%",
                background:"#25D366",color:"#fff",
                display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:"14px",
                border:"2px solid #fff"
              }}>
                {avatarUploading?"…":"📷"}
              </div>
            </button>
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
            }}>
              {hasPassword?"Change Password":"Set Password"}
            </p>
            {!hasPassword&&(
              <p style={{
                fontSize:"12px",color:"#8a7060",
                marginBottom:"12px",lineHeight:1.5
              }}>
                You signed in with OTP. Set a password to
                also sign in with email and password.
              </p>
            )}
            <form onSubmit={e=>void handleChangePwd(e)}>
              {hasPassword&&(
                <div style={{
                  position:"relative",marginBottom:"10px"
                }}>
                  <input className="input"
                    type={showCurPwd?"text":"password"}
                    placeholder="Current password"
                    value={curPwd}
                    onChange={e=>setCurPwd(e.target.value)}
                    style={{paddingRight:"44px"}}
                  />
                  <button type="button"
                    onClick={()=>setShowCurPwd(p=>!p)}
                    style={{
                      position:"absolute",right:"12px",
                      top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",
                      cursor:"pointer",fontSize:"16px"
                    }}>
                    {showCurPwd?"🙈":"👁"}
                  </button>
                </div>
              )}
              <div style={{position:"relative",marginBottom:"10px"}}>
                <input className="input"
                  type={showNewPwd?"text":"password"}
                  placeholder="New password (min 8 chars)"
                  value={newPwd}
                  onChange={e=>setNewPwd(e.target.value)}
                  style={{paddingRight:"44px"}}
                />
                <button type="button"
                  onClick={()=>setShowNewPwd(p=>!p)}
                  style={{
                    position:"absolute",right:"12px",
                    top:"50%",transform:"translateY(-50%)",
                    background:"none",border:"none",
                    cursor:"pointer",fontSize:"16px"
                  }}>
                  {showNewPwd?"🙈":"👁"}
                </button>
              </div>
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
                {pwdSaving
                  ?"Saving..."
                  :hasPassword
                    ?"Change Password"
                    :"Set Password"}
              </button>
            </form>
          </div>

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
        <BottomNav embedded/>

        {showAvatarPicker&&(
          <div style={{
            position:"fixed",inset:0,
            background:"rgba(0,0,0,.5)",
            display:"flex",alignItems:"flex-end",
            justifyContent:"center",zIndex:300
          }}
            onClick={()=>setShowAvatarPicker(false)}>
            <div style={{
              background:"#fff",borderRadius:"20px 20px 0 0",
              width:"100%",maxWidth:"480px",
              padding:"20px 16px",
              paddingBottom:
                "calc(20px + env(safe-area-inset-bottom,0px))"
            }}
              onClick={e=>e.stopPropagation()}>
              <p style={{
                fontSize:"16px",fontWeight:700,
                color:"#1a1614",marginBottom:"16px",
                textAlign:"center"
              }}>Profile photo</p>
              <button type="button"
                onClick={()=>avatarCameraRef.current?.click()}
                style={{
                  display:"block",width:"100%",
                  padding:"14px",marginBottom:"8px",
                  borderRadius:"12px",border:"none",
                  background:"#075E54",color:"#fff",
                  fontWeight:700,fontSize:"15px",
                  cursor:"pointer"
                }}>
                📷 Take Photo
              </button>
              <button type="button"
                onClick={()=>avatarGalleryRef.current?.click()}
                style={{
                  display:"block",width:"100%",
                  padding:"14px",marginBottom:"8px",
                  borderRadius:"12px",
                  border:"1px solid #e0d8ce",
                  background:"#fff",color:"#075E54",
                  fontWeight:700,fontSize:"15px",
                  cursor:"pointer"
                }}>
                🖼 Choose from Gallery
              </button>
              <button type="button"
                onClick={()=>setShowAvatarPicker(false)}
                style={{
                  display:"block",width:"100%",
                  padding:"14px",
                  borderRadius:"12px",border:"none",
                  background:"#f0ece6",color:"#8a7060",
                  fontWeight:600,fontSize:"14px",
                  cursor:"pointer"
                }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return null;
}
