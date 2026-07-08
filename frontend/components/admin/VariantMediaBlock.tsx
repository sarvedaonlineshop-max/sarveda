"use client";

import { ProductImageUpload } from "@/components/admin/ProductImageUpload";

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
};

const inputCls =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export function VariantMediaBlock({
  images,
  videoUrl,
  onImagesChange,
  onVideoUrlChange,
  fieldPrefix,
  fieldErrors
}: Props) {
  function updateImage(index: number, patch: Partial<VariantImageForm>) {
    onImagesChange(images.map((im, i) => (i === index ? { ...im, ...patch } : im)));
  }

  function removeImage(index: number) {
    const next = images.filter((_, i) => i !== index);
    onImagesChange(
      next.length ? next : [{ url: "", altText: "", isPrimary: true }]
    );
  }

  return (
    <div className="mt-4 space-y-4 border-t border-stone-200 pt-4 dark:border-stone-700">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Variant images
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Shown on the product page when this variant is selected. Shared product images are used as
          fallback.
        </p>
      </div>
      {images.map((im, ii) => (
        <ProductImageUpload
          key={ii}
          url={im.url}
          altText={im.altText}
          isPrimary={im.isPrimary}
          variantKey=""
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

      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Variant video URL
        </label>
        <input
          value={videoUrl}
          onChange={(e) => onVideoUrlChange(e.target.value)}
          placeholder="https://… (optional — overrides product video for this variant)"
          className={inputCls}
        />
      </div>
    </div>
  );
}
