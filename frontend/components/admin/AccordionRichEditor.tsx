"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, RemoveFormatting } from "lucide-react";

import { sanitizeProductHtml } from "@/lib/sanitize-html";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

function runCmd(command: string, value?: string) {
  // contentEditable formatting for admin-only accordion sections (minimal Word-like toolbar).
  document.execCommand(command, false, value);
}

/**
 * Minimal product-section editor: Bold, Italic, bullets, numbered list.
 * Stores HTML (sanitized). Avoids a full Word/Office suite.
 */
export function AccordionRichEditor({ value, onChange, placeholder, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternal = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (lastExternal.current === value) return;
    if (document.activeElement === el) return;
    el.innerHTML = value?.trim() ? value : "";
    lastExternal.current = value;
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeProductHtml(el.innerHTML);
    lastExternal.current = html;
    onChange(html);
  }

  function wrapCmd(command: string, arg?: string) {
    ref.current?.focus();
    runCmd(command, arg);
    emit();
  }

  const btn =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-[var(--admin-text,#2c2420)] hover:border-[var(--admin-card-border,#e8e2d9)] hover:bg-white disabled:opacity-40";

  return (
    <div
      className={`overflow-hidden rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-input-bg,#fff)] ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-table-head,#f2ede5)] px-2 py-1.5">
        <button type="button" title="Bold" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapCmd("bold")}>
          <Bold size={15} />
        </button>
        <button type="button" title="Italic" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapCmd("italic")}>
          <Italic size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--admin-card-border,#e0d8ce)]" />
        <button
          type="button"
          title="Bulleted list"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrapCmd("insertUnorderedList")}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          title="Numbered list"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrapCmd("insertOrderedList")}
        >
          <ListOrdered size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--admin-card-border,#e0d8ce)]" />
        <button
          type="button"
          title="Clear formatting"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrapCmd("removeFormat")}
        >
          <RemoveFormatting size={15} />
        </button>
        <span className="ml-auto hidden text-[10px] text-[var(--admin-text-muted,#8a7060)] sm:inline">
          Bold · Italic · Lists
        </span>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write section content…"}
        className="min-h-[120px] px-3 py-2 text-sm leading-relaxed text-[var(--admin-text,#2c2420)] outline-none empty:before:pointer-events-none empty:before:text-[var(--admin-text-muted,#8a7060)] empty:before:content-[attr(data-placeholder)] [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_b]:font-semibold [&_strong]:font-semibold"
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}
