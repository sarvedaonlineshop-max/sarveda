"use client";

import { useRef, useState } from "react";

import { uploadAdminMedia } from "@/lib/admin-api";

type Props = {
  url: string;
  onUrlChange: (url: string) => void;
  folder?: "products" | "courses" | "audio" | "mentors" | "vaidyas";
  label?: string;
};

export function ContentImageUpload({
  url,
  onUrlChange,
  folder = "courses",
  label = "Course image"
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
        folder
      });
      onUrlChange(uploaded);
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
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {label}
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-stone-600 dark:bg-stone-900">
          {url.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url.trim()} alt="" className="h-full w-full object-cover" />
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
            <>
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
              <button
                type="button"
                onClick={() => onUrlChange("")}
                className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Remove image
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
