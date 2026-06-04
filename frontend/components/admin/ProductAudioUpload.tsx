"use client";

import { useRef, useState } from "react";

import { uploadAdminMedia } from "@/lib/admin-api";

type Props = {
  url: string;
  onUrlChange: (url: string) => void;
  onClear: () => void;
};

export function ProductAudioUpload({ url, onUrlChange, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const MAX_BYTES = 10 * 1024 * 1024;

  async function onFile(file: File) {
    if (file.size > MAX_BYTES) {
      setUploadErr(`File is ${(file.size / (1024 * 1024)).toFixed(1)}MB — max 10MB. Use a shorter clip or lower bitrate.`);
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
        contentType: file.type || "audio/mpeg",
        base64,
        folder: "audio"
      });
      onUrlChange(uploaded);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadErr(
        msg.toLowerCase().includes("too large") || msg.toLowerCase().includes("entity")
          ? `${msg} — try a file under 10MB, then redeploy backend if this persists.`
          : msg
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950/40">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Sound sample</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm"
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
          {uploading ? "Uploading…" : "Upload audio"}
        </button>
        {url.trim() ? (
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-stone-500">MP3, WAV, OGG · max 10MB · stored on S3</p>
      {uploadErr ? <p className="mt-1 text-xs text-red-600">{uploadErr}</p> : null}
      {url.trim() ? (
        <>
          <input
            readOnly
            value={url}
            className="mt-3 w-full rounded-md border border-stone-200 bg-stone-100 px-3 py-2 font-mono text-xs text-stone-600 dark:border-stone-600 dark:bg-stone-900"
          />
          <audio controls src={url} className="mt-2 w-full max-w-md" preload="metadata" />
        </>
      ) : null}
    </div>
  );
}
