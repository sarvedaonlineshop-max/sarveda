"use client";

import { useRef, useState } from "react";

import { ProductGalleryOrderStrip } from "@/components/admin/ProductGalleryOrderStrip";
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
  audioUrl?: string;
  onImagesChange: (images: VariantImageForm[]) => void;
  onVideoUrlChange: (url: string) => void;
  onAudioUrlChange?: (url: string) => void;
  fieldPrefix: string;
  fieldErrors: Record<string, string>;
  /** Show image gallery block */
  showImages?: boolean;
  /** Show video block */
  showVideo?: boolean;
};

const inputCls =
  "mt-1 w-full rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-input-bg,#fff)] px-3 py-2 text-sm text-[var(--admin-text,#2c2420)] placeholder:text-[var(--admin-text-muted,#8a7060)] [&_option]:bg-white [&_option]:text-[#2c2420]";

const MAX_VIDEO_BYTES = 10 * 1024 * 1024;

const sectionCls =
  "space-y-3 rounded-lg border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#faf9f7)] p-4";

export function VariantMediaBlock({
  images,
  videoUrl,
  audioUrl = "",
  onImagesChange,
  onVideoUrlChange,
  onAudioUrlChange,
  fieldPrefix,
  fieldErrors,
  showImages = true,
  showVideo = true
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

  function reorderImages(from: number, to: number) {
    if (from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    const firstFilled = next.findIndex((im) => im.url.trim());
    onImagesChange(
      next.map((im, i) => ({
        ...im,
        isPrimary: firstFilled >= 0 ? i === firstFilled : i === 0
      }))
    );
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
    <div className="space-y-4">
      {showImages ? (
        <div className={sectionCls}>
          <p className="text-sm font-semibold text-[var(--admin-text,#2c2420)]">
            This variant&apos;s images
          </p>
          <p className="text-[11px] text-[var(--admin-text-muted,#8a7060)]">
            Drag thumbnails or cards to reorder · position 1 is primary for this variant
          </p>
          <ProductGalleryOrderStrip images={images} onReorder={reorderImages} />
          {images.map((im, ii) => (
            <ProductImageUpload
              key={ii}
              url={im.url}
              altText={im.altText}
              isPrimary={im.isPrimary}
              index={ii}
              onReorder={reorderImages}
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
            className="text-sm font-medium text-[#b98a3e] hover:underline"
          >
            + Add variant image
          </button>
          {fieldErrors[`${fieldPrefix}.images`] ? (
            <p className="text-xs text-red-600">{fieldErrors[`${fieldPrefix}.images`]}</p>
          ) : null}
        </div>
      ) : null}

      {showVideo ? (
        <div className={sectionCls}>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
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
              className="rounded-md bg-[#b98a3e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c8960a] disabled:opacity-60"
            >
              {videoUploading ? "Uploading…" : "Upload video (MP4)"}
            </button>
            <span className="text-xs text-[var(--admin-text-muted,#8a7060)]">or paste URL · max 10MB</span>
          </div>
          {videoUploadErr ? <p className="mt-1 text-xs text-red-600">{videoUploadErr}</p> : null}
          <input
            value={videoUrl}
            onChange={(e) => onVideoUrlChange(e.target.value)}
            placeholder="https://… (optional)"
            className={inputCls}
          />
        </div>
      ) : null}

      {onAudioUrlChange ? (
        <div className={sectionCls}>
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
            Variant audio sample
          </label>
          <input
            value={audioUrl}
            onChange={(e) => onAudioUrlChange(e.target.value)}
            placeholder="https://… (plays when this variant is selected)"
            className={inputCls}
          />
        </div>
      ) : null}
    </div>
  );
}
