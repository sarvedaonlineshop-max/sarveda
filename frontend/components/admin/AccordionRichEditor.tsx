"use client";

import { useEffect, useRef } from "react";
import {
  Bold,
  Check,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting
} from "lucide-react";

import { sanitizeProductHtml } from "@/lib/sanitize-html";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** Full toolbar: headings, tick list, font size, hyperlink. */
  variant?: "basic" | "full";
};

function runCmd(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function closestElement(node: Node | null, tag: string): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.tagName === tag) return current;
    current = current.parentNode;
  }
  return null;
}

/**
 * Minimal product-section editor: Bold, Italic, bullets, numbered list.
 * `variant="full"` adds headings, tick bullets, font size, and links for courses.
 * Stores HTML (sanitized). Avoids a full Word/Office suite.
 */
export function AccordionRichEditor({
  value,
  onChange,
  placeholder,
  className,
  variant = "basic"
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternal = useRef<string | null>(null);
  const full = variant === "full";

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

  function applyHeading(tag: "h1" | "h2" | "h3" | "h4") {
    ref.current?.focus();
    runCmd("formatBlock", tag);
    emit();
  }

  function applyFontSize(px: string) {
    if (!px) return;
    ref.current?.focus();
    runCmd("fontSize", "7");
    const fonts = ref.current?.querySelectorAll('font[size="7"]') ?? [];
    fonts.forEach((font) => {
      const span = document.createElement("span");
      span.style.fontSize = px;
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    emit();
  }

  function applyLink() {
    const raw = window.prompt("Link URL", "https://");
    if (!raw?.trim()) return;
    const href = raw.trim();
    ref.current?.focus();
    runCmd("createLink", href);
    ref.current?.querySelectorAll("a[href]").forEach((anchor) => {
      const a = anchor as HTMLAnchorElement;
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
    emit();
  }

  function applyTickList() {
    ref.current?.focus();
    runCmd("insertUnorderedList");
    const sel = window.getSelection();
    const ul = closestElement(sel?.anchorNode ?? null, "UL");
    if (ul) ul.classList.add("tick-list");
    emit();
  }

  function applyDottedList() {
    ref.current?.focus();
    runCmd("insertUnorderedList");
    const sel = window.getSelection();
    const ul = closestElement(sel?.anchorNode ?? null, "UL");
    if (ul) ul.classList.remove("tick-list");
    emit();
  }

  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-transparent px-1 text-[11px] font-semibold text-[var(--admin-text,#2c2420)] hover:border-[var(--admin-card-border,#e8e2d9)] hover:bg-white disabled:opacity-40";

  return (
    <div
      className={`admin-rich-editor overflow-hidden rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-input-bg,#fff)] ${className ?? ""}`}
    >
      <style>{`
        .admin-rich-editor .tick-list { list-style: none; padding-left: 1.35rem; }
        .admin-rich-editor .tick-list li { position: relative; }
        .admin-rich-editor .tick-list li::before {
          content: "✓";
          position: absolute;
          left: -1.15rem;
          color: #1c352a;
          font-weight: 700;
        }
      `}</style>
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-table-head,#f2ede5)] px-2 py-1.5">
        <button type="button" title="Bold" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapCmd("bold")}>
          <Bold size={15} />
        </button>
        <button type="button" title="Italic" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapCmd("italic")}>
          <Italic size={15} />
        </button>
        {full ? (
          <>
            <span className="mx-1 h-5 w-px bg-[var(--admin-card-border,#e0d8ce)]" />
            <button type="button" title="Heading 1" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => applyHeading("h1")}>
              <Heading1 size={15} />
            </button>
            <button type="button" title="Heading 2" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => applyHeading("h2")}>
              <Heading2 size={15} />
            </button>
            <button type="button" title="Heading 3" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => applyHeading("h3")}>
              <Heading3 size={15} />
            </button>
            <button type="button" title="Heading 4" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => applyHeading("h4")}>
              <Heading4 size={15} />
            </button>
          </>
        ) : null}
        <span className="mx-1 h-5 w-px bg-[var(--admin-card-border,#e0d8ce)]" />
        {full ? (
          <button
            type="button"
            title="Tick bullets"
            className={btn}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyTickList()}
          >
            <Check size={15} />
          </button>
        ) : null}
        <button
          type="button"
          title="Dotted bullets"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (full ? applyDottedList() : wrapCmd("insertUnorderedList"))}
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
        {full ? (
          <>
            <span className="mx-1 h-5 w-px bg-[var(--admin-card-border,#e0d8ce)]" />
            <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--admin-text-muted,#8a7060)]">
              Size
              <select
                defaultValue=""
                className="h-8 rounded-md border border-[var(--admin-card-border,#e0d8ce)] bg-white px-1 text-[11px] text-[var(--admin-text,#2c2420)]"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  applyFontSize(e.target.value);
                  e.currentTarget.value = "";
                }}
              >
                <option value="" disabled>
                  —
                </option>
                <option value="13px">Small</option>
                <option value="15px">Body</option>
                <option value="18px">Medium</option>
                <option value="22px">Large</option>
                <option value="28px">Heading</option>
              </select>
            </label>
            <button type="button" title="Add link" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => applyLink()}>
              <Link2 size={15} />
            </button>
          </>
        ) : null}
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
          {full ? "Bold · Headings · Lists · Link" : "Bold · Italic · Lists"}
        </span>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write section content…"}
        className="min-h-[140px] px-3 py-2 text-sm leading-relaxed text-[var(--admin-text,#2c2420)] outline-none empty:before:pointer-events-none empty:before:text-[var(--admin-text-muted,#8a7060)] empty:before:content-[attr(data-placeholder)] [&_a]:text-[#b98a3e] [&_a]:underline [&_h1]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:my-1.5 [&_h4]:text-base [&_h4]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_strong]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul.tick-list]:list-none"
        onInput={emit}
        onBlur={emit}
      />
    </div>
  );
}
