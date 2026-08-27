"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, GripVertical, Pencil, Trash2 } from "lucide-react";

import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import type { OptionAxisForm } from "@/lib/variant-admin";
import { slugifyAttribute } from "@/lib/variant-admin";

type Props = {
  axes: OptionAxisForm[];
  open: boolean;
  onToggle: () => void;
  onChange: (axes: OptionAxisForm[], opts?: { prune?: boolean }) => void;
};

const inputCls =
  "mt-1 w-full rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-input-bg,#fff)] px-3 py-2 text-sm text-[var(--admin-text,#2c2420)] [&_option]:bg-white [&_option]:text-[#2c2420]";

function EditOptionModal({
  open,
  initialValue,
  onSave,
  onClose
}: {
  open: boolean;
  initialValue: string;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(initialValue);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        padding: "16px",
        backdropFilter: "blur(4px)"
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-option-title"
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            background: "#f4f1ec",
            padding: "20px 24px 16px",
            borderBottom: "1px solid #e8e2d9"
          }}
        >
          <h2 id="edit-option-title" style={{ fontSize: "16px", fontWeight: 700, color: "#2c2420", margin: 0 }}>
            Edit option
          </h2>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
            Option name
          </label>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const next = draft.trim();
                if (next) onSave(next);
              }
              if (e.key === "Escape") onClose();
            }}
            className={inputCls}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
            padding: "16px 24px 20px",
            borderTop: "1px solid #f0ece6"
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!draft.trim()}
            onClick={() => {
              const next = draft.trim();
              if (next) onSave(next);
            }}
            className="rounded-lg bg-[#1e3a2f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d5040] disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function AxisValuesEditor({
  axis,
  onChange
}: {
  axis: OptionAxisForm;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);

  function addValue(raw: string) {
    const parts = raw
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...axis.values];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  function moveItem(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= axis.values.length || to >= axis.values.length) return;
    const next = [...axis.values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  }

  function renameAt(index: number, nextName: string) {
    const trimmed = nextName.trim();
    if (!trimmed) return;
    const dup = axis.values.some((v, i) => i !== index && v.toLowerCase() === trimmed.toLowerCase());
    if (dup) return;
    onChange(axis.values.map((v, i) => (i === index ? trimmed : v)));
    setEditIndex(null);
  }

  return (
    <div className="min-w-0 flex-[2]">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
        Dropdown options
      </label>
      <p className="mt-0.5 text-[11px] text-[var(--admin-text-muted,#8a7060)]">
        Drag to reorder (1 → n). First option is the default for this level.
      </p>

      <ul className="mt-2 space-y-1.5">
        {axis.values.length === 0 ? (
          <li className="rounded-lg border border-dashed border-stone-300 bg-white/60 px-3 py-3 text-xs text-stone-500 dark:border-stone-600 dark:bg-stone-950/40">
            Add choices shoppers can pick (e.g. Small, Red)
          </li>
        ) : (
          axis.values.map((val, index) => {
            const isDragging = dragIndex === index;
            const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
            return (
              <li
                key={`${val}-${index}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(index));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDragLeave={() => {
                  if (overIndex === index) setOverIndex(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  moveItem(Number.isFinite(from) ? from : (dragIndex ?? -1), index);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-sm dark:bg-stone-900 ${
                  isDragging
                    ? "opacity-50 border-amber-400"
                    : isOver
                      ? "border-amber-500 ring-1 ring-amber-300"
                      : "border-stone-200 dark:border-stone-600"
                }`}
              >
                <span
                  aria-hidden
                  className="cursor-grab touch-none text-stone-400 active:cursor-grabbing"
                >
                  <GripVertical size={16} />
                </span>
                <span className="w-6 shrink-0 text-center text-[11px] font-semibold text-stone-400">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-[var(--admin-text,#2c2420)]">
                  {val}
                </span>
                {index === 0 ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800">
                    Default
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Edit ${val}`}
                  onClick={() => setEditIndex(index)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#1e3a2f] hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${val}`}
                  onClick={() => setDeleteIndex(index)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addValue(draft);
            }
          }}
          placeholder="Type option, press Enter"
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => addValue(draft)}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          Add
        </button>
      </div>

      <AdminConfirmModal
        open={deleteIndex !== null}
        title="Delete option?"
        message={
          deleteIndex !== null
            ? `Remove “${axis.values[deleteIndex]}” from ${axis.name || "this level"}? Variants using this option may be pruned when you save or rebuild combinations.`
            : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onClose={() => setDeleteIndex(null)}
        onConfirm={() => {
          if (deleteIndex === null) return;
          onChange(axis.values.filter((_, i) => i !== deleteIndex));
          setDeleteIndex(null);
        }}
      />

      <EditOptionModal
        open={editIndex !== null}
        initialValue={editIndex !== null ? axis.values[editIndex] ?? "" : ""}
        onClose={() => setEditIndex(null)}
        onSave={(next) => {
          if (editIndex === null) return;
          renameAt(editIndex, next);
        }}
      />
    </div>
  );
}

function AxisNameInput({
  name,
  placeholder,
  onCommit
}: {
  name: string;
  placeholder: string;
  onCommit: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(name);
  }, [name]);

  return (
    <input
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        onCommit(draft);
      }}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

export function VariantOptionAxesEditor({ axes, open, onToggle, onChange }: Props) {
  return (
    <div className="rounded-lg border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-[var(--admin-text,#2c2420)]">Variant level</span>
          <span className="mt-0.5 block text-xs text-[var(--admin-text-muted,#8a7060)]">
            {open
              ? "Level 1 is Color or Size. Add another level for the next choice shoppers pick."
              : "Collapsed for a single SKU. Expand to add Color, Size, or other shopper choices."}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-xs font-medium text-amber-800 dark:text-amber-400">
          {open ? "Hide" : "Show"}
          <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </span>
      </button>
      {open ? (
        <>
          <div className="mt-3 space-y-4">
            {axes.map((axis, i) => (
              <div
                key={`variant-level-${i}`}
                className="space-y-3 rounded-lg border border-amber-200/60 bg-white/70 p-3 dark:border-amber-900/40 dark:bg-stone-950/40"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[140px] flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
                      Level {i + 1} name
                    </label>
                    <AxisNameInput
                      name={axis.name}
                      placeholder={i === 0 ? "Size" : "Color"}
                      onCommit={(name) =>
                        onChange(
                          axes.map((a, j) =>
                            j === i ? { ...a, name, slug: slugifyAttribute(name) } : a
                          ),
                          { prune: false }
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    disabled={axes.length <= 1}
                    onClick={() => onChange(axes.filter((_, j) => j !== i))}
                    className="mb-0.5 text-xs font-medium text-red-600 hover:underline disabled:opacity-40 dark:text-red-400"
                  >
                    Remove level
                  </button>
                </div>
                <AxisValuesEditor
                  axis={axis}
                  onChange={(values) =>
                    onChange(axes.map((a, j) => (j === i ? { ...a, values } : a)))
                  }
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              onChange([
                ...axes,
                { name: "", slug: `level-${axes.length + 1}`, values: [] }
              ])
            }
            className="mt-3 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            + Add variant level
          </button>
        </>
      ) : null}
    </div>
  );
}
