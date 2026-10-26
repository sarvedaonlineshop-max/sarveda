"use client";

import { useRef, useState } from "react";

import { uploadAdminMedia } from "@/lib/admin-api";
import { isDirectCourseVideo } from "@/lib/content-meta";

const MAX_BYTES = 10 * 1024 * 1024;

type Props = {
  url: string;
  onUrlChange: (url: string) => void;
  posterUrl?: string;
  label?: string;
};

export function ContentVideoUpload({
  url,
  onUrlChange,
  posterUrl,
  label = "Course video"
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const trimmed = url.trim();
  const isFile = isDirectCourseVideo(trimmed);

  async function onFile(file: File) {
    if (file.size > MAX_BYTES) {
      setUploadErr(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB — max 10MB. Upload a shorter clip or paste a CDN / YouTube URL.`
      );
      return;
    }
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
        contentType: file.type || "video/mp4",
        base64,
        folder: "courses"
      });
      onUrlChange(uploaded);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Video upload failed");
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
        <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-black/80 dark:border-stone-600">
          {trimmed && isFile ? (
            <video
              src={trimmed}
              poster={posterUrl?.trim() || undefined}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          ) : trimmed ? (
            <span className="px-2 text-center text-[10px] text-stone-300">Linked video</span>
          ) : (
            <span className="px-2 text-center text-[10px] text-stone-400">No video</span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
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
              {uploading ? "Uploading to S3…" : "Upload video"}
            </button>
            <p className="mt-1 text-xs text-stone-500">MP4 or WebM · max 10MB · or paste YouTube / Vimeo / CDN URL</p>
            {uploadErr ? <p className="mt-1 text-xs text-red-600">{uploadErr}</p> : null}
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Video URL
            </label>
            <input
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/embed/… or uploaded file URL"
              className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 font-mono text-xs text-stone-700 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300"
            />
          </div>
          {trimmed ? (
            <button
              type="button"
              onClick={() => onUrlChange("")}
              className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Remove video
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
