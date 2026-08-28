"use client";

import { useRef, useState } from "react";

import { uploadAdminMedia } from "@/lib/admin-api";

type Props = {
  url: string;
  altText: string;
  isPrimary: boolean;
  onUrlChange: (url: string) => void;
  onAltChange: (alt: string) => void;
  onPrimaryChange: () => void;
  onRemove: () => void;
  role: "primary" | "secondary";
  /** When set with onReorder, the card can be dragged among siblings. */
  index?: number;
  onReorder?: (from: number, to: number) => void;
};

export function ProductImageUpload({
  url,
  altText,
  isPrimary,
  onUrlChange,
  onAltChange,
  onPrimaryChange,
  onRemove,
  role,
  index,
  onReorder
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const canDrag = typeof index === "number" && typeof onReorder === "function";

  async function onFile(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
      const { url: uploaded } = await uploadAdminMedia({
        filename: file.name,
        contentType: file.type || "image/jpeg",
        base64,
        folder: "products"
      });
      onUrlChange(uploaded);
      if (!altText.trim()) onAltChange(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadErr(
        msg.includes("not found") || msg.includes("404")
          ? `${msg} — deploy backend on EC2: git pull && npm run build && pm2 restart sarveda-backend`
          : msg
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className={`rounded-lg border bg-[var(--admin-input-bg,#faf9f7)] p-4 ${
        dragOver
          ? "border-amber-500 ring-2 ring-amber-300"
          : "border-[var(--admin-card-border,#e8e2d9)]"
      }`}
      draggable={canDrag}
      onDragStart={
        canDrag
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(index));
            }
          : undefined
      }
      onDragOver={
        canDrag
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={canDrag ? () => setDragOver(false) : undefined}
      onDrop={
        canDrag
          ? (e) => {
              e.preventDefault();
              setDragOver(false);
              const from = Number(e.dataTransfer.getData("text/plain"));
              if (Number.isFinite(from) && from !== index) onReorder!(from, index!);
            }
          : undefined
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {canDrag ? (
            <span
              className="cursor-grab text-stone-400 active:cursor-grabbing"
              title="Drag to reorder"
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </span>
          ) : null}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
              isPrimary
                ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                : "bg-[var(--admin-input-bg,#e8e2d9)] text-[var(--admin-text,#2c2420)]"
            }`}
          >
            {role === "primary" ? "Primary image" : "Gallery image"}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Remove
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-card-bg,#fff)]">
          {url.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url.trim()} alt={altText || "Preview"} className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-[10px] text-stone-400">No image</span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
            >
              {uploading ? "Uploading to S3…" : "Upload image"}
            </button>
            <p className="mt-1 text-xs text-stone-500">JPEG, PNG, WebP or GIF · max 10MB</p>
            {uploadErr ? <p className="mt-1 text-xs text-red-600">{uploadErr}</p> : null}
          </div>

          {url.trim() ? (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
                CDN URL (auto-filled)
              </label>
              <input
                readOnly
                value={url}
                className="mt-1 w-full rounded-md border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#f5f0e8)] px-3 py-2 font-mono text-xs text-[var(--admin-text-muted,#8a7060)]"
              />
            </div>
          ) : null}

          <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
                Alt text
              </label>
            <input
              value={altText}
              onChange={(e) => onAltChange(e.target.value)}
              placeholder="Describe the image for accessibility"
              className="mt-1 w-full rounded-md border border-[var(--admin-input-border,#e0d8ce)] bg-[var(--admin-input-bg,#fff)] px-3 py-2 text-sm text-[var(--admin-text,#2c2420)] placeholder:text-[var(--admin-text-muted,#8a7060)]"
            />
          </div>

          {role === "secondary" ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="primaryImage"
                checked={isPrimary}
                onChange={onPrimaryChange}
                className="text-amber-600"
              />
              Use as primary image
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
