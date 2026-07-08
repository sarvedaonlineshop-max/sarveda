"use client";

import { useRef, useState } from "react";

import { ProductImageUpload } from "@/components/admin/ProductImageUpload";
import { uploadAdminMedia } from "@/lib/admin-api";

export type VariantImageForm = {
  url: string;
  altText: string;
  isPrimary: boolean;
};

type Props = {
  images: VariantImageForm[];
  videoUrl: string;
  onImagesChange: (images: VariantImageForm[]) => void;
  onVideoUrlChange: (url: string) => void;
  fieldPrefix: string;
  fieldErrors: Record<string, string>;
  prominent?: boolean;
};

const inputCls =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

export function VariantMediaBlock({
  images,
  videoUrl,
  onImagesChange,
  onVideoUrlChange,
  fieldPrefix,
  fieldErrors,
  prominent = false
}: Props) {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadErr, setVideoUploadErr] = useState<string | null>(null);

  function updateImage(index: number, patch: Partial<VariantImageForm>) {
    onImagesChange(images.map((im, i) => (i === index ? { ...im, ...patch } : im)));
  }

  function removeImage(index: number) {
    const next = images.filter((_, i) => i !== index);
    onImagesChange(next.length ? next : [{ url: "", altText: "", isPrimary: true }]);
  }

  async function onVideoFile(file: File) {
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoUploadErr(
        `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB — max 10MB. Paste a CDN URL instead.`
      );
      return;
    }
    setVideoUploading(true);
    setVideoUploadErr(null);
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
        folder: "products"
      });
      onVideoUrlChange(uploaded);
    } catch (e) {
      setVideoUploadErr(e instanceof Error ? e.message : "Video upload failed");
    } finally {
      setVideoUploading(false);
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  return (
    <div
      className={
        prominent
          ? "space-y-4 rounded-lg border-2 border-amber-400/70 bg-amber-50/60 p-4 dark:border-amber-700 dark:bg-amber-950/30"
          : "mt-4 space-y-4 border-t border-stone-200 pt-4 dark:border-stone-700"
      }
    >
      <div>
        <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">
          This variant&apos;s images &amp; video
        </p>
        <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">
          Shown on the product page when shoppers pick this variant. Shared product images are used
          only as fallback.
        </p>
      </div>
      {images.map((im, ii) => (
        <ProductImageUpload
          key={ii}
          url={im.url}
          altText={im.altText}
          isPrimary={im.isPrimary}
          onUrlChange={(url) => updateImage(ii, { url })}
          onAltChange={(altText) => updateImage(ii, { altText })}
          onPrimaryChange={() =>
            onImagesChange(images.map((x, i) => ({ ...x, isPrimary: i === ii })))
          }
          onRemove={() => removeImage(ii)}
          role={im.isPrimary ? "primary" : "secondary"}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          onImagesChange([
            ...images,
            { url: "", altText: "", isPrimary: images.length === 0 }
          ])
        }
        className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
      >
        + Add variant image
      </button>
      {fieldErrors[`${fieldPrefix}.images`] ? (
        <p className="text-xs text-red-600">{fieldErrors[`${fieldPrefix}.images`]}</p>
      ) : null}

      <div className="border-t border-amber-200/80 pt-4 dark:border-amber-900/50">
        <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Variant video
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onVideoFile(f);
            }}
          />
          <button
            type="button"
            disabled={videoUploading}
            onClick={() => videoInputRef.current?.click()}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
          >
            {videoUploading ? "Uploading…" : "Upload video (MP4)"}
          </button>
          <span className="text-xs text-stone-500">or paste URL below · max 10MB</span>
        </div>
        {videoUploadErr ? <p className="mt-1 text-xs text-red-600">{videoUploadErr}</p> : null}
        <input
          value={videoUrl}
          onChange={(e) => onVideoUrlChange(e.target.value)}
          placeholder="https://… (optional — overrides shared product video)"
          className={inputCls}
        />
      </div>
    </div>
  );
}
