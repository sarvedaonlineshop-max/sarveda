"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

import {
  formatFileSize,
  MAX_ENQUIRY_ATTACHMENT_BYTES,
  MAX_ENQUIRY_ATTACHMENTS,
  MAX_ENQUIRY_ATTACHMENT_MB
} from "@/lib/enquiry-limits";

/** Broad accept — strict MIME lists break picking on some mobile browsers / HEIC. */
const FILE_ACCEPT =
  "image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.heic,.heif,.mp4,.mov,.webm";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  onError?: (message: string | null) => void;
  disabled?: boolean;
};

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name);
}

export function EnquiryFilePicker({ files, onChange, onError, disabled }: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    const urls: string[] = [];
    files.forEach((file, index) => {
      if (!isImageFile(file)) return;
      const key = `${file.name}-${file.size}-${index}`;
      const url = URL.createObjectURL(file);
      next[key] = url;
      urls.push(url);
    });
    setPreviews(next);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const rejected: string[] = [];
    const merged: File[] = [];

    for (const file of [...files, ...incoming]) {
      if (merged.length >= MAX_ENQUIRY_ATTACHMENTS) break;
      if (file.size > MAX_ENQUIRY_ATTACHMENT_BYTES) {
        rejected.push(`${file.name} (over ${MAX_ENQUIRY_ATTACHMENT_MB} MB)`);
        continue;
      }
      merged.push(file);
    }

    onChange(merged);

    if (rejected.length) {
      onError?.(`Skipped: ${rejected.join(", ")}`);
    } else if (files.length + incoming.length > MAX_ENQUIRY_ATTACHMENTS) {
      onError?.(`Only the first ${MAX_ENQUIRY_ATTACHMENTS} files are kept.`);
    } else {
      onError?.(null);
    }
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-4">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={disabled || files.length >= MAX_ENQUIRY_ATTACHMENTS}
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:border-amber-400 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {files.length > 0 ? "Add more files" : "Choose files"}
        </button>
        <span className="text-sm text-stone-600">
          {files.length > 0 ? (
            <strong>
              {files.length} file{files.length > 1 ? "s" : ""} selected
            </strong>
          ) : (
            "No files added yet"
          )}
        </span>
        <span className="text-xs text-stone-500">
          Up to {MAX_ENQUIRY_ATTACHMENTS} files · {MAX_ENQUIRY_ATTACHMENT_MB} MB each
        </span>
      </div>

      {files.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {files.map((file, index) => {
            const previewKey = `${file.name}-${file.size}-${index}`;
            const thumb = previews[previewKey];
            return (
              <li
                key={previewKey}
                className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2"
              >
                {thumb ? (
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-stone-100">
                    <Image src={thumb} alt="" fill unoptimized className="object-cover" />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-stone-100 text-lg">
                    📎
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800">{file.name}</p>
                  <p className="text-xs text-stone-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
