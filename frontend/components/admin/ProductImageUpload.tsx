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
};

export function ProductImageUpload({
  url,
  altText,
  isPrimary,
  onUrlChange,
  onAltChange,
  onPrimaryChange,
  onRemove,
  role
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

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
    <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
            isPrimary
              ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
              : "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200"
          }`}
        >
          {role === "primary" ? "Primary image" : "Gallery image"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        >
          Remove
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-900">
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
              <label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                CDN URL (auto-filled)
              </label>
              <input
                readOnly
                value={url}
                className="mt-1 w-full rounded-md border border-stone-200 bg-stone-100 px-3 py-2 font-mono text-xs text-stone-600 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-400"
              />
            </div>
          ) : null}

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Alt text
            </label>
            <input
              value={altText}
              onChange={(e) => onAltChange(e.target.value)}
              placeholder="Describe the image for accessibility"
              className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
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
