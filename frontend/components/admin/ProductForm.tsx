"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  checkAdminSkus,
  deleteAdminProduct,
  fetchAdminProduct,
  postAdminProduct,
  putAdminProduct,
  suggestProductSeo
} from "@/lib/admin-api";
import {
  generateUniqueSkus,
  SKU_FAMILY_OPTIONS,
  type SkuFamilyCode
} from "@/lib/sku-generate";
import { formatAccordionSection, htmlForAccordionEditor } from "@/lib/accordion-format";
import { applyApiError, tabForFieldPath } from "@/lib/admin-errors";
import { sanitizeProductHtml } from "@/lib/sanitize-html";
import { AccordionRichEditor } from "@/components/admin/AccordionRichEditor";
import { AdminToast } from "@/components/admin/AdminToast";
import { AdminConfirmModal } from "@/components/admin/AdminConfirmModal";
import { AdminLoadingOverlay } from "@/components/admin/AdminLoadingOverlay";
import { ProductAudioUpload } from "@/components/admin/ProductAudioUpload";
import { ProductBarcodeTab } from "@/components/admin/ProductBarcodeTab";
import { ProductGalleryOrderStrip } from "@/components/admin/ProductGalleryOrderStrip";
import { VariantPricingShippingTables } from "@/components/admin/VariantPricingShippingTables";
import { VariantMediaBlock, type VariantImageForm } from "@/components/admin/VariantMediaBlock";
import { VariantOptionAxesEditor } from "@/components/admin/VariantOptionAxesEditor";
import { ProductImageUpload } from "@/components/admin/ProductImageUpload";
import { parseNonNegativeNumber, sanitizeNonNegativeInput } from "@/lib/admin-form-numbers";
import { SeoAnalysisPanel } from "@/components/admin/SeoAnalysisPanel";
import { fetchCategoryTree } from "@/lib/api";
import { TAX_CLASS_OPTIONS, taxClassForForm } from "@/lib/tax-classes";
import type { CategoryNode } from "@/lib/types";
import {
  cartesianCombos,
  comboKey,
  deriveOptionAxes,
  optionsForAxis,
  pruneVariantRows,
  slugifyAttribute,
  syncVariantAttributesToAxes,
  type OptionAxisForm,
  type VariantAttributeForm
} from "@/lib/variant-admin";
import { VariantTreeNav } from "@/components/admin/VariantTreeNav";

const ZONES = ["IN", "US", "GB", "OTHER"] as const;
type Zone = (typeof ZONES)[number];

type ShippingRateForm = {
  country: Zone;
  standardPerProduct: string;
  standardAdditional: string;
  codPerProduct: string;
  codAdditional: string;
  estimatedDays: string;
};

type VariantForm = {
  id?: string;
  sku: string;
  /** When true, auto-SKU generation will not overwrite this row. */
  skuManual?: boolean;
  mrpInr: string;
  saleInr: string;
  mrpUsd: string;
  saleUsd: string;
  mrpGbp: string;
  saleGbp: string;
  weightGrams: string;
  onHand: string;
  isDefault: boolean;
  status: "ACTIVE" | "INACTIVE";
  /** Persisted row no longer matches current option axes — review required. */
  optionMismatch?: boolean;
  shippingRates: ShippingRateForm[];
  videoUrl: string;
  audioUrl: string;
  images: VariantImageForm[];
  attributes: VariantAttributeForm[];
};

type ImageForm = { url: string; altText: string; isPrimary: boolean };
type AccordionForm = { title: string; content: string };

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toPaise(rupees: string) {
  const n = parseFloat(rupees);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toCents(usd: string) {
  const n = parseFloat(usd);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toPence(gbp: string) {
  const n = parseFloat(gbp);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fromMinor(paise: number | null | undefined, divisor = 100) {
  if (paise == null) return "";
  return String(paise / divisor);
}

function emptyShipping(): ShippingRateForm[] {
  return ZONES.map((country) => ({
    country,
    standardPerProduct: "0",
    standardAdditional: "0",
    codPerProduct: country === "IN" ? "0" : "",
    codAdditional: country === "IN" ? "0" : "",
    estimatedDays: ""
  }));
}

function newVariant(): VariantForm {
  return {
    sku: "",
    skuManual: false,
    mrpInr: "0",
    saleInr: "0",
    mrpUsd: "",
    saleUsd: "",
    mrpGbp: "",
    saleGbp: "",
    weightGrams: "0",
    onHand: "0",
    isDefault: true,
    status: "ACTIVE",
    shippingRates: emptyShipping(),
    videoUrl: "",
    audioUrl: "",
    images: [{ url: "", altText: "", isPrimary: true }],
    attributes: []
  };
}

function CategoryCheckTree({
  nodes,
  selected,
  onToggle
}: {
  nodes: CategoryNode[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="space-y-1 pl-3 text-sm">
      {nodes.map((n) => (
        <li key={n.id}>
          <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[var(--admin-text,#2c2420)] hover:text-[#b98a3e]">
            <input
              type="checkbox"
              checked={selected.has(n.id)}
              onChange={() => onToggle(n.id)}
              className="rounded border-stone-400 text-amber-600 focus:ring-amber-500"
            />
            <span>{n.name}</span>
          </label>
          {n.children?.length ? (
            <CategoryCheckTree nodes={n.children} selected={selected} onToggle={onToggle} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const inputCls =
  "mt-1 w-full rounded-lg border border-[var(--admin-input-border,#e0d8ce)] bg-[var(--admin-input-bg,#fff)] px-3 py-2 text-sm text-[var(--admin-text,#2c2420)] transition-colors duration-150 focus:border-[#b98a3e] focus:ring-1 focus:ring-[rgba(185,138,62,0.15)] [&_option]:bg-white [&_option]:text-[#2c2420]";
const labelCls =
  "text-xs font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]";
const floatAddBtnCls =
  "rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b91c1c] disabled:opacity-60";
const fieldErrCls = "mt-1 text-xs text-red-600 dark:text-red-400";
const DRAFT_KEY = "sarveda_admin_new_product_draft";

function FieldErr({ message }: { message?: string }) {
  if (!message) return null;
  return <p className={fieldErrCls}>{message}</p>;
}

const FORM_TABS = [
  { id: "general" as const, label: "General", hint: "Name, slug, categories" },
  { id: "variants" as const, label: "Variants & shipping", hint: "Options, SKU, media" },
  { id: "media" as const, label: "Content & shared media", hint: "Accordion, shared gallery" },
  { id: "barcodes" as const, label: "Generate Bar Code", hint: "Labels & print" },
  { id: "seo" as const, label: "SEO", hint: "Search listing" }
];
type FormTab = (typeof FORM_TABS)[number]["id"];

function collectIssueLines(errors: Record<string, string>): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const [path, msg] of Object.entries(errors)) {
    if (!msg) continue;
    const tabLabel = FORM_TABS.find((t) => t.id === tabForFieldPath(path))?.label ?? "Form";
    const line = `${tabLabel} — ${msg}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const isNew = !productId;

  const [tab, setTab] = useState<FormTab>("general");
  const [tabLoading, setTabLoading] = useState(false);
  const [variantsBannerDismissed, setVariantsBannerDismissed] = useState(false);
  const tabSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savingIntent, setSavingIntent] = useState<"save" | "publish" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [publishIssues, setPublishIssues] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [productType, setProductType] = useState("SIMPLE");
  const [status, setStatus] = useState("DRAFT");
  const [taxClass, setTaxClass] = useState("standard");
  const [hsnCode, setHsnCode] = useState("");
  const [hasAudio, setHasAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [expressShippingEnabled, setExpressShippingEnabled] = useState(true);
  const [expressShippingIndia, setExpressShippingIndia] = useState(true);
  const [expressShippingIntl, setExpressShippingIntl] = useState(true);
  const [productCouponEnabled, setProductCouponEnabled] = useState(false);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoKeyword, setSeoKeyword] = useState("");
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [skuFamily, setSkuFamily] = useState<SkuFamilyCode | "">("");
  const [skuGenBusy, setSkuGenBusy] = useState(false);
  const [variants, setVariants] = useState<VariantForm[]>([newVariant()]);
  const [optionAxes, setOptionAxes] = useState<OptionAxisForm[]>([
    { name: "Size", slug: "size", values: [] }
  ]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [variantLevelsOpen, setVariantLevelsOpen] = useState(false);
  /** Explicit soft-deletes queued for the next Save (never inferred from omission). */
  const [deactivateVariantIds, setDeactivateVariantIds] = useState<string[]>([]);
  const [deactivateConfirmId, setDeactivateConfirmId] = useState<string | null>(null);
  const [images, setImages] = useState<ImageForm[]>([
    { url: "", altText: "", isPrimary: true }
  ]);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [seoAiLoading, setSeoAiLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [accordion, setAccordion] = useState<AccordionForm[]>([
    { title: "Description", content: "" }
  ]);

  useEffect(() => {
    fetchCategoryTree({ cache: "no-store" }).then(setCategoryTree).catch(() => {});
  }, []);

  const loadProduct = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setErr(null);
    try {
      const p = await fetchAdminProduct(productId);
      setName(String(p.name ?? ""));
      setSlug(String(p.slug ?? ""));
      setSlugTouched(true);
      setDescription(String(p.description ?? ""));
      setShortDescription(String(p.shortDescription ?? ""));
      setProductType(String(p.productType ?? "SIMPLE"));
      setStatus(String(p.status ?? "DRAFT"));
      setTaxClass(taxClassForForm(String(p.taxClass ?? "standard")));
      setHsnCode(String((p as { hsnCode?: string | null }).hsnCode ?? ""));
      setHasAudio(Boolean(p.hasAudio));
      setAudioUrl(String(p.audioUrl ?? ""));
      setVideoUrl(String((p as { videoUrl?: string | null }).videoUrl ?? ""));
      setExpressShippingEnabled(
        (p as { expressShippingEnabled?: boolean }).expressShippingEnabled !== false
      );
      const exOn = (p as { expressShippingEnabled?: boolean }).expressShippingEnabled !== false;
      setExpressShippingIndia(exOn);
      setExpressShippingIntl(exOn);
      setProductCouponEnabled(
        Boolean((p as { productCouponEnabled?: boolean }).productCouponEnabled)
      );
      setSeoTitle(String(p.seoTitle ?? ""));
      setSeoDescription(String(p.seoDescription ?? ""));
      setSeoKeyword(String(p.seoKeyword ?? ""));

      const cats = (
        (p.categories as Array<{ category: { id: string } }>) ?? []
      ).map((x) => x.category.id);
      setSelectedCats(new Set(cats));

      const savedAxisOrder = ((p as { variantAxisOrder?: string[] }).variantAxisOrder ??
        []) as string[];
      const savedValueOrder = ((p as { variantOptionValueOrder?: Record<string, string[]> })
        .variantOptionValueOrder ?? {}) as Record<string, string[]>;

      const vs = (p.variants as Array<Record<string, unknown>>) ?? [];
      const allImgs = (p.images as Array<Record<string, unknown>>) ?? [];

      let loadedVariants: VariantForm[] = [];
      if (vs.length) {
        loadedVariants = vs.map((v) => {
          const rates = (v.shippingRates as Array<Record<string, unknown>>) ?? [];
          const byZone = new Map(rates.map((r) => [String(r.country), r]));
          const attrRows =
            (v.attributeValues as Array<{
              attributeValue: {
                value: string;
                slug: string;
                attribute: { name: string; slug: string };
              };
            }>) ?? [];
          const attributes: VariantAttributeForm[] = attrRows.map((row) => ({
            name: row.attributeValue.attribute.name,
            slug: row.attributeValue.attribute.slug,
            value: row.attributeValue.value
          }));
          const vid = String(v.id);
          const variantImgs = allImgs.filter((im) => im.variantId === vid);
          return {
            id: vid,
            sku: String(v.sku),
            skuManual: true,
            mrpInr: fromMinor(v.mrpInPaise as number),
            saleInr: fromMinor(v.saleInPaise as number),
            mrpUsd: fromMinor(v.mrpUsdCents as number | null),
            saleUsd: fromMinor(v.saleUsdCents as number | null),
            mrpGbp: fromMinor(v.mrpGbpPence as number | null),
            saleGbp: fromMinor(v.saleGbpPence as number | null),
            weightGrams: String(v.weightGrams ?? 0),
            onHand: String((v.inventory as { onHand?: number })?.onHand ?? 0),
            isDefault: Boolean(v.isDefault),
            status: (v.status as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
            optionMismatch: false,
            videoUrl: String((v as { videoUrl?: string | null }).videoUrl ?? ""),
            audioUrl: String((v as { audioUrl?: string | null }).audioUrl ?? ""),
            attributes,
            images:
              variantImgs.length > 0
                ? variantImgs.map((im) => ({
                    url: String(im.url),
                    altText: String(im.altText ?? ""),
                    isPrimary: Boolean(im.isPrimary)
                  }))
                : [{ url: "", altText: "", isPrimary: true }],
            shippingRates: ZONES.map((country) => {
              const r = byZone.get(country);
              const fromShip =
                country === "US" || country === "OTHER"
                  ? (n: number | null | undefined) => fromMinor(n)
                  : country === "GB"
                    ? (n: number | null | undefined) => fromMinor(n)
                    : (n: number | null | undefined) => fromMinor(n);
              return {
                country,
                standardPerProduct: fromShip(r?.standardPerProduct as number),
                standardAdditional: fromShip(r?.standardAdditional as number),
                codPerProduct: fromShip(r?.codPerProduct as number | null),
                codAdditional: fromShip(r?.codAdditional as number | null),
                estimatedDays: String(r?.estimatedDays ?? "")
              };
            })
          };
        });
      setVariants(loadedVariants);
      setDeactivateVariantIds([]);
      setDeactivateConfirmId(null);
      const prefixes = loadedVariants
        .map((v) => v.sku.split("-")[0]?.toUpperCase() ?? "")
        .filter(Boolean);
        if (
          prefixes.length > 0 &&
          prefixes.every((p) => p === prefixes[0]) &&
          (prefixes[0] === "MI" || prefixes[0] === "YO" || prefixes[0] === "ME")
        ) {
          setSkuFamily(prefixes[0] as SkuFamilyCode);
        } else {
          setSkuFamily("");
        }
        const axes = deriveOptionAxes(loadedVariants, savedAxisOrder, savedValueOrder);
        setOptionAxes(
          axes.length > 0 ? axes : [{ name: "Size", slug: "size", values: [] }]
        );
        const hasLevelValues = axes.some((a) => a.values.some((v) => v.trim()));
        setVariantLevelsOpen(hasLevelValues || loadedVariants.length > 1);
        if (axes.length > 0) {
          setVariants((prev) =>
            prev.map((v) => ({
              ...v,
              attributes: syncVariantAttributesToAxes(v.attributes, axes)
            }))
          );
        }
      }

      const sharedImgs = allImgs.filter((im) => !im.variantId);
      setImages(
        sharedImgs.length
          ? sharedImgs.map((im) => ({
              url: String(im.url),
              altText: String(im.altText ?? ""),
              isPrimary: Boolean(im.isPrimary)
            }))
          : [{ url: "", altText: "", isPrimary: true }]
      );

      const acc = (p.accordionItems as Array<Record<string, unknown>>) ?? [];
      setAccordion(
        acc.length
          ? acc.map((a) => ({
              title: String(a.title),
              content: htmlForAccordionEditor(String(a.content))
            }))
          : [{ title: "Description", content: "" }]
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load product");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (productId) void loadProduct();
  }, [loadProduct, productId]);

  useEffect(() => {
    if (!slugTouched && isNew && name) setSlug(slugify(name));
  }, [name, slugTouched, isNew]);

  const variantAttrKey = useMemo(
    () =>
      variants
        .map(
          (v) =>
            `${v.skuManual ? "1" : "0"}:${v.attributes.map((a) => a.value.trim()).join("\u0001")}`
        )
        .join("\u0002"),
    [variants]
  );

  const applyGeneratedSkus = useCallback(
    async (opts?: { forceAll?: boolean }) => {
      if (!skuFamily || !name.trim() || variants.length === 0) return;
      setSkuGenBusy(true);
      try {
        const inputs = variants.map((v) => ({
          attributeValues: v.attributes.map((a) => a.value.trim()).filter(Boolean)
        }));
        const takenAccum = new Set<string>();
        let skus = generateUniqueSkus({
          family: skuFamily,
          productName: name,
          variants: inputs,
          takenSkus: takenAccum
        });
        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            const { taken } = await checkAdminSkus(skus, {
              excludeProductId: productId || undefined
            });
            if (!taken.length) break;
            for (const t of taken) takenAccum.add(t);
            skus = generateUniqueSkus({
              family: skuFamily,
              productName: name,
              variants: inputs,
              takenSkus: takenAccum
            });
          } catch {
            break;
          }
        }
        setVariants((prev) =>
          prev.map((v, i) => {
            if (!opts?.forceAll && v.skuManual) return v;
            const next = skus[i];
            if (!next) return v;
            return { ...v, sku: next, skuManual: opts?.forceAll ? false : v.skuManual };
          })
        );
      } finally {
        setSkuGenBusy(false);
      }
    },
    [skuFamily, name, variants, productId]
  );

  useEffect(() => {
    if (!isNew) return;
    if (!skuFamily || !name.trim()) return;
    const t = window.setTimeout(() => {
      void applyGeneratedSkus();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint drives regen; avoid SKU churn loops
  }, [isNew, skuFamily, name, variantAttrKey, variants.length]);

  const tabIndex = FORM_TABS.findIndex((t) => t.id === tab);

  function validateTab(target: FormTab): Record<string, string> {
    const errors: Record<string, string> = {};
    if (target === "general") {
      if (!name.trim()) errors.name = "Product name is required.";
      if (!slug.trim()) errors.slug = "Slug is required.";
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
        errors.slug = "Slug must be lowercase letters, numbers, and hyphens only.";
      }
      if (isNew && !skuFamily) {
        errors.skuFamily = "Select a product family for SKU generation.";
      }
      if (hasAudio && audioUrl.trim() && !/^https?:\/\/.+/i.test(audioUrl.trim())) {
        errors.audioUrl = "Audio URL must start with http:// or https://";
      }
    }
    if (target === "variants") {
      variants.forEach((v, i) => {
        if (!v.sku.trim()) errors[`variants.${i}.sku`] = "SKU is required.";
        if (variants.length > 1) {
          v.attributes.forEach((attr, ai) => {
            const axisHasValues = optionAxes[ai]?.values.some((val) => val.trim());
            if (axisHasValues && !attr.value.trim()) {
              const label = attr.name || `Variant level ${ai + 1}`;
              errors[`variants.${i}.attr.${ai}`] = `${label} is required.`;
            }
          });
        }
        const mrp = parseNonNegativeNumber(v.mrpInr);
        const sale = parseNonNegativeNumber(v.saleInr);
        if (v.mrpInr.trim() && mrp === null) errors[`variants.${i}.mrpInr`] = "MRP cannot be negative.";
        if (v.saleInr.trim() && sale === null) {
          errors[`variants.${i}.saleInr`] = "Sale price cannot be negative.";
        }
        if (mrp != null && sale != null && sale > mrp) {
          errors[`variants.${i}.saleInr`] = "Sale price cannot be higher than MRP.";
        }
        const oh = parseNonNegativeNumber(v.onHand, false);
        if (v.onHand.trim() && oh === null) errors[`variants.${i}.onHand`] = "Stock cannot be negative.";
        if (v.weightGrams.trim()) {
          const wg = parseInt(v.weightGrams, 10);
          if (!Number.isFinite(wg) || wg < 50) {
            errors[`variants.${i}.weightGrams`] = "Weight must be at least 50 grams.";
          }
        }
        v.shippingRates.forEach((r, ri) => {
          for (const [key, label] of [
            ["standardPerProduct", "First-item shipping"],
            ["standardAdditional", "Extra-item shipping"],
            ["codPerProduct", "COD first item"],
            ["codAdditional", "COD extra item"]
          ] as const) {
            const val = r[key];
            if (val.trim() && parseNonNegativeNumber(val) === null) {
              errors[`variants.${i}.shipping.${ri}.${key}`] = `${label} cannot be negative.`;
            }
          }
        });
      });
      if (variants.filter((v) => v.isDefault).length !== 1) {
        errors.variants = "Mark exactly one variant as default.";
      }
    }
    if (target === "media") {
      images.forEach((im, i) => {
        if (im.url.trim() && !/^https?:\/\/.+/i.test(im.url.trim())) {
          errors[`images.${i}.url`] = "Image URL must be a valid http(s) link (upload again if needed).";
        }
      });
    }
    return errors;
  }

  function validateAll(): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const t of FORM_TABS) {
      Object.assign(merged, validateTab(t.id));
    }
    return merged;
  }

  function applyClientErrors(errors: Record<string, string>) {
    setFieldErrors(errors);
    const first = Object.keys(errors)[0];
    if (first) {
      setErr(errors[first]!);
      selectTab(tabForFieldPath(first));
    }
  }

  function goNext() {
    const errors = validateTab(tab);
    if (Object.keys(errors).length > 0) {
      applyClientErrors(errors);
      return;
    }
    setErr(null);
    setFieldErrors({});
    if (tabIndex < FORM_TABS.length - 1) selectTab(FORM_TABS[tabIndex + 1]!.id);
  }

  function goBack() {
    setErr(null);
    if (tabIndex > 0) selectTab(FORM_TABS[tabIndex - 1]!.id);
  }

  function selectTab(next: FormTab) {
    if (next === tab) return;
    if (tabSwitchTimer.current) clearTimeout(tabSwitchTimer.current);
    setTabLoading(true);
    tabSwitchTimer.current = setTimeout(() => {
      setTab(next);
      setTabLoading(false);
      tabSwitchTimer.current = null;
    }, 220);
  }

  useEffect(() => {
    return () => {
      if (tabSwitchTimer.current) clearTimeout(tabSwitchTimer.current);
    };
  }, []);

  function toggleCat(catId: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        return [{ url: "", altText: "", isPrimary: true }];
      }
      if (removed?.isPrimary) {
        return next.map((im, i) => ({ ...im, isPrimary: i === 0 }));
      }
      return next;
    });
  }

  /** Drag reorder — first slot becomes primary (storefront hero). */
  function reorderImages(from: number, to: number) {
    if (from === to) return;
    setImages((prev) => {
      if (from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      const firstFilled = next.findIndex((im) => im.url.trim());
      return next.map((im, i) => ({
        ...im,
        isPrimary: firstFilled >= 0 ? i === firstFilled : i === 0
      }));
    });
  }

  function addImageRow() {
    setImages((prev) => [
      ...prev,
      { url: "", altText: "", isPrimary: prev.length === 0 && !prev.some((im) => im.isPrimary) }
    ]);
  }

  function handleOptionAxesChange(axes: OptionAxisForm[], _opts?: { prune?: boolean }) {
    setOptionAxes((prev) => {
      setVariants((rows) =>
        rows.map((row) => ({
          ...row,
          attributes: row.attributes.map((attr, ai) => {
            const oldAxis = prev[ai];
            const newAxis = axes[ai];
            if (!oldAxis || !newAxis) return attr;
            const removed = oldAxis.values.filter(
              (v) => !newAxis.values.some((n) => n.toLowerCase() === v.toLowerCase())
            );
            const added = newAxis.values.filter(
              (v) => !oldAxis.values.some((o) => o.toLowerCase() === v.toLowerCase())
            );
            if (removed.length === 1 && added.length === 1 && attr.value === removed[0]) {
              return { ...attr, name: newAxis.name, slug: newAxis.slug, value: added[0]! };
            }
            return {
              ...attr,
              name: newAxis.name || attr.name,
              slug: newAxis.slug || attr.slug
            };
          })
        }))
      );
      return axes;
    });
  }

  const axesValuesKey = optionAxes.map((a) => `${a.slug}:${a.values.join("\u0001")}`).join("|");
  const showVariantTree =
    variants.length > 1 || optionAxes.some((a) => a.values.some((v) => v.trim()));

  useEffect(() => {
    setVariants((prev) => {
      const next = pruneVariantRows(prev, optionAxes, newVariant);
      if (
        next.length === prev.length &&
        next.every((row, i) => {
          const cur = prev[i];
          if (!cur || row.isDefault !== cur.isDefault) return false;
          if (row.attributes.length !== cur.attributes.length) return false;
          return row.attributes.every(
            (a, ai) =>
              a.slug === cur.attributes[ai]?.slug &&
              a.value === cur.attributes[ai]?.value &&
              a.name === cur.attributes[ai]?.name
          );
        })
      ) {
        return prev;
      }
      return next;
    });
    // Only when dropdown options or slugs change — not while typing a level name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axesValuesKey]);

  useEffect(() => {
    if (selectedVariantIndex > variants.length - 1) {
      setSelectedVariantIndex(Math.max(0, variants.length - 1));
    }
  }, [variants.length, selectedVariantIndex]);

  function generateVariantsFromLevels() {
    const combos = cartesianCombos(optionAxes);
    if (!combos.length) return;
    setProductType("VARIABLE");
    setVariants((prev) => {
      const byKey = new Map(
        prev.map((v) => [comboKey(v.attributes.map((a) => a.value)), v] as const)
      );
      const next = combos.map((values, i) => {
        const key = comboKey(values);
        const existing = byKey.get(key);
        const attributes = optionAxes.map((axis, ai) => ({
          name: axis.name,
          slug: axis.slug,
          value: values[ai] ?? ""
        }));
        if (existing) return { ...existing, attributes };
        return { ...newVariant(), isDefault: i === 0 && !prev.some((p) => p.isDefault), attributes };
      });
      if (!next.some((v) => v.isDefault) && next[0]) next[0] = { ...next[0], isDefault: true };
      return next;
    });
    setSelectedVariantIndex(0);
  }

  async function fillSeoWithAi() {
    setSeoAiLoading(true);
    setErr(null);
    try {
      const catNames: string[] = [];
      const walkCats = (nodes: CategoryNode[]) => {
        for (const n of nodes) {
          if (selectedCats.has(n.id)) catNames.push(n.name);
          if (n.children?.length) walkCats(n.children);
        }
      };
      walkCats(categoryTree);
      const data = await suggestProductSeo({
        name: name.trim(),
        slug: slug.trim(),
        shortDescription: shortDescription.trim(),
        description: description.trim(),
        categoryNames: catNames
      });
      setSeoTitle(data.seoTitle.trim());
      setSeoDescription(data.seoDescription.trim());
      setSeoKeyword(data.seoKeyword.trim());
      setToast({
        message:
          data.source === "ai"
            ? "SEO fields filled with AI suggestions"
            : "SEO fields filled (smart defaults — add OPENAI_API_KEY for AI)"
      });
      setTab("seo");
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "SEO suggest failed",
        error: true
      });
    } finally {
      setSeoAiLoading(false);
    }
  }

  function removeAccordionSection(index: number) {
    setAccordion((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ title: "Description", content: "" }];
    });
  }

  function buildPayload() {
    return {
      slug: slug.trim(),
      name: name.trim(),
      description: description.trim() || null,
      shortDescription: shortDescription.trim() || null,
      productType: variants.length > 1 ? "VARIABLE" : productType,
      status,
      taxClass: taxClassForForm(taxClass.trim() || "standard"),
      hsnCode: hsnCode.trim() || null,
      hasAudio,
      audioUrl: hasAudio ? audioUrl.trim() || null : null,
      videoUrl: videoUrl.trim() || null,
      expressShippingEnabled,
      productCouponEnabled,
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      seoKeyword: seoKeyword.trim() || null,
      categoryIds: Array.from(selectedCats),
      variantAxisOrder: optionAxes.map((a) => a.slug).filter(Boolean),
      variantOptionValueOrder: (() => {
        const out: Record<string, string[]> = {};
        for (const axis of optionAxes) {
          const vals = axis.values.map((v) => v.trim()).filter(Boolean);
          if (!axis.slug || !vals.length) continue;
          out[axis.slug] = vals;
          // Mirror under pa_ / non-pa_ so storefront lookup matches Woo-style slugs.
          const stripped = axis.slug.replace(/^pa_/i, "");
          if (stripped && stripped !== axis.slug) out[stripped] = vals;
          if (!axis.slug.startsWith("pa_")) out[`pa_${axis.slug}`] = vals;
        }
        return out;
      })(),
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku.trim(),
        mrpInPaise: toPaise(v.mrpInr),
        saleInPaise: toPaise(v.saleInr),
        mrpUsdCents: v.mrpUsd ? toCents(v.mrpUsd) : null,
        saleUsdCents: v.saleUsd ? toCents(v.saleUsd) : null,
        mrpGbpPence: v.mrpGbp ? toPence(v.mrpGbp) : null,
        saleGbpPence: v.saleGbp ? toPence(v.saleGbp) : null,
        weightGrams: v.weightGrams.trim() ? Math.max(50, parseInt(v.weightGrams, 10) || 0) : null,
        isDefault: v.isDefault,
        status: v.status,
        onHand: parseInt(v.onHand, 10) || 0,
        videoUrl: v.videoUrl.trim() || null,
        audioUrl: v.audioUrl.trim() || null,
        attributes: v.attributes
          .filter((a) => a.value.trim())
          .map((a) => ({
            name: a.name.trim() || a.slug,
            slug: a.slug || slugifyAttribute(a.name),
            value: a.value.trim()
          })),
        images: v.images
          .filter((im) => im.url.trim())
          .map((im, i) => ({
            url: im.url.trim(),
            altText: im.altText.trim() || null,
            position: i,
            isPrimary: im.isPrimary,
            variantId: v.id ?? null,
            variantSku: v.id ? null : v.sku.trim()
          })),
        shippingRates: v.shippingRates.map((r) => {
          const toMinor =
            r.country === "US"
              ? toCents
              : r.country === "GB"
                ? toPence
                : toPaise;
          return {
            country: r.country,
            standardPerProduct: toMinor(r.standardPerProduct),
            standardAdditional: toMinor(r.standardAdditional),
            codPerProduct:
              r.country === "IN" && r.codPerProduct ? toPaise(r.codPerProduct) : null,
            codAdditional:
              r.country === "IN" && r.codAdditional ? toPaise(r.codAdditional) : null,
            estimatedDays: r.estimatedDays.trim() || null
          };
        })
      })),
      deactivateVariantIds: deactivateVariantIds.length
        ? Array.from(new Set(deactivateVariantIds))
        : undefined,
      images: (() => {
        const filled = images.filter((im) => im.url.trim());
        let primaryIdx = filled.findIndex((im) => im.isPrimary);
        if (primaryIdx < 0 && filled.length > 0) primaryIdx = 0;
        return filled.map((im, i) => ({
          url: im.url.trim(),
          altText: im.altText.trim() || null,
          position: i,
          isPrimary: i === primaryIdx,
          variantId: null,
          variantSku: null
        }));
      })(),
      accordionItems: accordion
        .filter((a) => a.title.trim())
        .map((a, i) => ({
          title: a.title.trim(),
          content: sanitizeProductHtml(formatAccordionSection(a.title, a.content)),
          position: i
        }))
    };
  }

  useEffect(() => {
    if (!isNew) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (typeof d.name === "string" && d.name) setName(d.name);
      if (typeof d.slug === "string" && d.slug) {
        setSlug(d.slug);
        setSlugTouched(true);
      }
      if (typeof d.description === "string") setDescription(d.description);
      if (typeof d.shortDescription === "string") setShortDescription(d.shortDescription);
      if (typeof d.productType === "string") setProductType(d.productType);
      if (typeof d.status === "string") setStatus(d.status);
      if (d.skuFamily === "MI" || d.skuFamily === "YO" || d.skuFamily === "ME" || d.skuFamily === "OTHER") {
        setSkuFamily(d.skuFamily);
      }
      if (typeof d.tab === "string") setTab(d.tab as FormTab);
      if (Array.isArray(d.images)) setImages(d.images as ImageForm[]);
      const restoredAxes = Array.isArray(d.optionAxes)
        ? (d.optionAxes as OptionAxisForm[]).map((a) => ({
            name: a.name ?? "",
            slug: a.slug ?? "",
            values: Array.isArray(a.values) ? a.values : []
          }))
        : null;
      if (restoredAxes) setOptionAxes(restoredAxes);
      const axesForPrune = restoredAxes ?? optionAxes;
      const restoredVariants = Array.isArray(d.variants) ? (d.variants as VariantForm[]) : null;
      const pruned = pruneVariantRows(restoredVariants ?? [newVariant()], axesForPrune, newVariant);
      if (restoredVariants || restoredAxes) setVariants(pruned);
      const hasLevelValues = axesForPrune.some((a) => a.values.some((v) => v.trim()));
      setVariantLevelsOpen(hasLevelValues || pruned.length > 1);
      if (typeof d.videoUrl === "string") setVideoUrl(d.videoUrl);
      if (Array.isArray(d.accordion)) setAccordion(d.accordion as AccordionForm[]);
      if (Array.isArray(d.categoryIds)) setSelectedCats(new Set(d.categoryIds as string[]));
    } catch {
      /* ignore corrupt draft */
    }
  }, [isNew]);

  useEffect(() => {
    if (!isNew) return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            name,
            slug,
            description,
            shortDescription,
            productType,
            status,
            skuFamily,
            tab,
            variants,
            images,
            optionAxes,
            videoUrl,
            accordion,
            categoryIds: Array.from(selectedCats),
            seoTitle,
            seoDescription,
            seoKeyword
          })
        );
      } catch {
        /* quota */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    isNew,
    name,
    slug,
    description,
    shortDescription,
    productType,
    status,
    skuFamily,
    tab,
    variants,
    images,
    accordion,
    selectedCats,
    seoTitle,
    seoDescription,
    seoKeyword
  ]);

  async function persistProduct(opts: {
    intent: "save" | "publish";
    skipValidation?: boolean;
  }) {
    const nextStatus = opts.intent === "publish" ? "ACTIVE" : isNew ? "DRAFT" : status;
    if (!name.trim() || !slug.trim()) {
      setErr("Enter a product name and slug before saving.");
      setFieldErrors({
        ...(!name.trim() ? { name: "Product name is required." } : {}),
        ...(!slug.trim() ? { slug: "Slug is required." } : {})
      });
      selectTab("general");
      setToast({ message: "Enter a product name and slug before saving.", error: true });
      return;
    }

    setSaving(true);
    setSavingIntent(opts.intent);
    setErr(null);
    if (!opts.skipValidation) setFieldErrors({});
    try {
      const payload = buildPayload() as Record<string, unknown> & {
        status: string;
        variants: Array<{ sku: string; variantSku?: string | null }>;
      };
      payload.status = nextStatus;
      if (opts.intent === "save" || opts.skipValidation) {
        const family = slug.trim() || "draft";
        payload.variants = payload.variants.map((v, i) => {
          const sku = v.sku.trim() || `${family}-${i + 1}`.slice(0, 120);
          return { ...v, sku };
        });
      }

      if (isNew) {
        const { product } = await postAdminProduct(payload);
        sessionStorage.removeItem(DRAFT_KEY);
        const id = String(product.id);
        setStatus(nextStatus);
        setPublishIssues(null);
        setToast({
          message:
            opts.intent === "publish"
              ? "Product published."
              : "Draft saved — you can keep editing.",
          error: false
        });
        setSavedAt(Date.now());
        router.replace(`/admin/products/${id}`);
        router.refresh();
      } else {
        await putAdminProduct(productId!, payload);
        setStatus(nextStatus);
        await loadProduct();
        setPublishIssues(null);
        setToast({
          message: opts.intent === "publish" ? "Product published." : "Changes saved.",
          error: false
        });
        setSavedAt(Date.now());
        setErr(null);
        setFieldErrors({});
      }
    } catch (ex) {
      applyApiError(ex, setErr, setFieldErrors, setTab);
      setToast({
        message: ex instanceof Error ? ex.message : "Save failed",
        error: true
      });
    } finally {
      setSaving(false);
      setSavingIntent(null);
    }
  }

  function handleSaveChanges() {
    void persistProduct({ intent: "save", skipValidation: true });
  }

  function handlePublishClick() {
    const issues = collectIssueLines(validateAll());
    if (issues.length) {
      setPublishIssues(issues);
      return;
    }
    void persistProduct({ intent: "publish" });
  }

  async function handleDelete() {
    if (!productId || !confirm("Archive this product? It will be hidden from the storefront.")) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAdminProduct(productId);
      router.push("/admin/products");
      router.refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const onLastTab = tabIndex === FORM_TABS.length - 1;

  const variantIssueMessages = useMemo(() => {
    const msgs: string[] = [];
    if (!skuFamily) msgs.push("Choose an SKU family on the General step first.");
    const errors = validateTab("variants");
    for (const m of Object.values(errors)) {
      if (m && !msgs.includes(m)) msgs.push(m);
    }
    return msgs;
    // validateTab closes over form fields in the dependency list
  }, [skuFamily, variants, name, optionAxes, productType]);

  const optionMismatchCount = useMemo(
    () => variants.filter((v) => v.id && v.optionMismatch).length,
    [variants]
  );

  useEffect(() => {
    setVariantsBannerDismissed(false);
  }, [variantIssueMessages.join("|"), optionMismatchCount]);

  const showVariantsBanner =
    tab === "variants" &&
    !variantsBannerDismissed &&
    (variantIssueMessages.length > 0 || optionMismatchCount > 0 || deactivateVariantIds.length > 0);

  if (loading) {
    return <p className="text-sm text-[var(--admin-text-muted,#8a7060)]">Loading product…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-5 pb-28 font-sans">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      <AdminConfirmModal
        open={Boolean(publishIssues?.length)}
        title="This product isn’t ready to publish"
        message="These items are missing or invalid. Cancel to keep editing, Ignore to save a draft, or Publish to put it on the store anyway."
        details={publishIssues ?? []}
        cancelLabel="Cancel"
        secondaryConfirmLabel="Ignore"
        confirmLabel="Publish"
        busy={saving}
        onClose={() => {
          if (!saving) setPublishIssues(null);
        }}
        onSecondaryConfirm={() => {
          void persistProduct({ intent: "save", skipValidation: true });
        }}
        onConfirm={() => {
          void persistProduct({ intent: "publish", skipValidation: true });
        }}
      />
      <AdminConfirmModal
        open={Boolean(deactivateConfirmId)}
        title="Deactivate this variant?"
        message="This queues an explicit deactivation. The variant stays active until you Save. Omitted variants are never deactivated automatically."
        details={
          deactivateConfirmId
            ? [
                variants.find((v) => v.id === deactivateConfirmId)?.sku || deactivateConfirmId,
                `After Save: ${deactivateVariantIds.includes(deactivateConfirmId) ? deactivateVariantIds.length : deactivateVariantIds.length + 1} variant(s) will be INACTIVE.`
              ]
            : []
        }
        cancelLabel="Cancel"
        confirmLabel="Queue deactivation"
        danger
        onClose={() => setDeactivateConfirmId(null)}
        onConfirm={() => {
          if (!deactivateConfirmId) return;
          const id = deactivateConfirmId;
          setDeactivateVariantIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
          setDeactivateConfirmId(null);
        }}
      />
      <div className="sticky top-0 z-20 -mx-1 mb-1 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-page-bg,#f7f4ef)] px-1 py-3">
        <div>
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
          >
            <ChevronLeft size={14} aria-hidden />
            Products
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--admin-text,#2c2420)]">
            {isNew ? "Add product" : "Edit product"}
          </h1>
          {savedAt ? (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isNew ? (
            <button
              type="button"
              disabled={deleting || saving}
              onClick={() => void handleDelete()}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 hover:shadow-sm disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              {deleting ? "Archiving…" : "Archive product"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveChanges}
            className="rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-card-bg,#fff)] px-4 py-2 text-sm font-semibold text-[var(--admin-text,#2c2420)] shadow-sm hover:bg-[var(--admin-row-hover,#faf5ec)] disabled:opacity-60"
          >
            {savingIntent === "save" ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handlePublishClick}
            className="rounded-lg bg-[#1c352a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#152820] disabled:opacity-60"
          >
            {savingIntent === "publish" ? "Publishing…" : "Publish product"}
          </button>
        </div>
      </div>

      <nav
        className="flex flex-wrap gap-2 rounded-xl border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-card-bg,#faf9f7)] p-2"
        aria-label="Product form steps"
      >
        {FORM_TABS.map((t, i) => {
          const active = tab === t.id;
          const tabOk = Object.keys(validateTab(t.id)).length === 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (isNew && i > tabIndex) {
                  const tabErrors = validateTab(tab);
                  if (Object.keys(tabErrors).length > 0) {
                    applyClientErrors(tabErrors);
                    return;
                  }
                }
                setErr(null);
                setFieldErrors({});
                selectTab(t.id);
              }}
              className={`min-w-[8rem] flex-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                active
                  ? "bg-[var(--admin-card-bg,#fff)] shadow-sm ring-1 ring-[#b98a3e]/50"
                  : "hover:bg-[var(--admin-row-hover,#faf5ec)]"
              }`}
              style={active ? { borderLeft: "2px solid #b98a3e" } : undefined}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                  active
                    ? tabOk
                      ? "bg-emerald-500 text-white admin-tick-pop shadow-sm"
                      : "bg-rose-500 text-white admin-x-pop shadow-sm"
                    : tabOk
                      ? "bg-emerald-500 text-white admin-tick-pop"
                      : "bg-rose-100 text-rose-600 admin-x-pop dark:bg-rose-950/50 dark:text-rose-400"
                }`}
                title={tabOk ? "All required fields look good" : "Something missing or invalid on this step"}
                aria-label={tabOk ? `${t.label}: complete` : `${t.label}: incomplete`}
              >
                {tabOk ? "✓" : "✕"}
              </span>
              <span className="mt-1 block text-sm font-semibold text-[var(--admin-text,#2c2420)]">
                {t.label}
              </span>
              <span className="block text-[11px] text-[var(--admin-text-muted,#8a7060)]">{t.hint}</span>
            </button>
          );
        })}
      </nav>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="relative space-y-5 rounded-xl border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-card-bg,#fff)] p-6 shadow-[0_2px_12px_rgba(44,36,32,0.06)]"
      >
        <AdminLoadingOverlay show={tabLoading} label="Loading section…" />
        {tab === "general" ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className={labelCls}>
                Name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((p) => {
                    const n = { ...p };
                    delete n.name;
                    return n;
                  });
                }}
                required
                className={inputCls}
                aria-invalid={Boolean(fieldErrors.name)}
              />
              <FieldErr message={fieldErrors.name} />
            </div>
            <div>
              <label htmlFor="slug" className={labelCls}>
                Slug
              </label>
              <input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                  setFieldErrors((p) => {
                    const n = { ...p };
                    delete n.slug;
                    return n;
                  });
                }}
                required
                className={`${inputCls} font-mono`}
                aria-invalid={Boolean(fieldErrors.slug)}
              />
              <FieldErr message={fieldErrors.slug} />
            </div>
            <div>
              <label htmlFor="short" className={labelCls}>
                Short description
              </label>
              <textarea
                id="short"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                rows={2}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="desc" className={labelCls}>
                Full description
              </label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className={inputCls}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="ptype" className={labelCls}>
                  Type
                </label>
                <select
                  id="ptype"
                  value={productType}
                  onChange={(e) => setProductType(e.target.value)}
                  className={inputCls}
                >
                  <option value="SIMPLE">Simple</option>
                  <option value="VARIABLE">Variable</option>
                  <option value="DIGITAL">Digital</option>
                </select>
              </div>
              <div>
                <label htmlFor="pst" className={labelCls}>
                  Status
                </label>
                <select
                  id="pst"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputCls}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <div>
                <label htmlFor="skuFamily" className={labelCls}>
                  SKU family
                </label>
                <select
                  id="skuFamily"
                  value={skuFamily}
                  onChange={(e) => setSkuFamily(e.target.value as SkuFamilyCode | "")}
                  className={inputCls}
                  aria-invalid={Boolean(fieldErrors.skuFamily)}
                >
                  <option value="">Select family…</option>
                  {SKU_FAMILY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--admin-text-muted,#8a7060)]">
                  Prefix for auto SKUs on the Variants step (Others = no prefix).
                </p>
                <FieldErr message={fieldErrors.skuFamily} />
              </div>
              <div>
                <label htmlFor="tax" className={labelCls}>
                  GST class
                </label>
                <select
                  id="tax"
                  value={taxClass}
                  onChange={(e) => setTaxClass(e.target.value)}
                  className={inputCls}
                >
                  {TAX_CLASS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="hsn" className={labelCls}>
                  HSN Code
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--admin-text-muted,#8a7060)]">
                    (GST invoice)
                  </span>
                </label>
                <input
                  id="hsn"
                  value={hsnCode}
                  onChange={(e) => setHsnCode(e.target.value)}
                  placeholder={process.env.NEXT_PUBLIC_DEFAULT_HSN_CODE ?? "9205"}
                  className={inputCls}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--admin-text,#2c2420)]">
              <input
                type="checkbox"
                checked={productCouponEnabled}
                onChange={(e) => setProductCouponEnabled(e.target.checked)}
                className="rounded text-amber-600"
              />
              Product-wise coupon eligible
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--admin-text,#2c2420)]">
              <input
                type="checkbox"
                checked={hasAudio}
                onChange={(e) => setHasAudio(e.target.checked)}
                className="rounded text-amber-600"
              />
              Product has audio preview
            </label>
            {hasAudio ? (
              <ProductAudioUpload
                url={audioUrl}
                onUrlChange={(url) => {
                  setAudioUrl(url);
                  setHasAudio(true);
                }}
                onClear={() => setAudioUrl("")}
              />
            ) : null}
            <div>
              <p className={labelCls}>Categories</p>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#faf9f7)] p-3 text-[var(--admin-text,#2c2420)]">
                <CategoryCheckTree nodes={categoryTree} selected={selectedCats} onToggle={toggleCat} />
              </div>
            </div>
            <div className="rounded-lg border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#faf9f7)] p-4">
              <p className={labelCls}>Shipping modes</p>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-[var(--admin-text,#2c2420)]">
                  <input
                    type="checkbox"
                    checked={expressShippingIndia}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setExpressShippingIndia(next);
                      setExpressShippingEnabled(next || expressShippingIntl);
                    }}
                    className="rounded text-amber-600"
                  />
                  India — Express 2–3 days
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--admin-text,#2c2420)]">
                  <input
                    type="checkbox"
                    checked={expressShippingIntl}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setExpressShippingIntl(next);
                      setExpressShippingEnabled(expressShippingIndia || next);
                    }}
                    className="rounded text-amber-600"
                  />
                  International — Express 5–7 days
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "variants" ? (
          <div className="relative space-y-6">
            {showVariantsBanner ? (
              <div
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/35 dark:bg-[rgba(185,138,62,0.12)]"
                role="alert"
              >
                <div className="min-w-0 flex-1 space-y-1 text-amber-950 dark:text-[#f0e2b8]">
                  {optionMismatchCount > 0 ? (
                    <p>
                      Changing these options affects {optionMismatchCount} existing variant
                      {optionMismatchCount === 1 ? "" : "s"}. They will NOT be deleted
                      automatically. Review mismatched rows before deactivating them.
                    </p>
                  ) : null}
                  {deactivateVariantIds.length > 0 ? (
                    <p>
                      {deactivateVariantIds.length} variant
                      {deactivateVariantIds.length === 1 ? "" : "s"} queued for explicit
                      deactivation on Save.
                    </p>
                  ) : null}
                  {variantIssueMessages.slice(0, 4).map((msg) => (
                    <p key={msg}>{msg}</p>
                  ))}
                  {variantIssueMessages.length > 4 ? (
                    <p className="text-xs opacity-80">+{variantIssueMessages.length - 4} more issues</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setVariantsBannerDismissed(true)}
                  className="shrink-0 rounded-md p-1 text-amber-800/70 transition-colors hover:bg-amber-100 hover:text-amber-950 dark:text-[#e8d9a8]/80 dark:hover:bg-[rgba(185,138,62,0.2)] dark:hover:text-[#fffbf5]"
                  aria-label="Dismiss"
                >
                  <X size={16} strokeWidth={2} />
                </button>
              </div>
            ) : null}
            <FieldErr message={fieldErrors.variants} />
            <div className="space-y-3">
              <VariantOptionAxesEditor
                axes={optionAxes}
                open={variantLevelsOpen}
                onToggle={() => setVariantLevelsOpen((v) => !v)}
                onChange={handleOptionAxesChange}
              />
              {variantLevelsOpen ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={generateVariantsFromLevels}
                    disabled={cartesianCombos(optionAxes).length === 0}
                    className="rounded-lg bg-[#1c352a] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#152820] disabled:opacity-40"
                  >
                    Create all combinations
                  </button>
                  <p className="text-xs text-[var(--admin-text-muted,#8a7060)]">
                    {cartesianCombos(optionAxes).length
                      ? `Builds ${cartesianCombos(optionAxes).length} SKU rows from the variant levels (keeps prices you already entered).`
                      : "Add values to every variant level first, then create the rows."}
                  </p>
                </div>
              ) : null}
            </div>
            <div
              className={
                showVariantTree
                  ? "grid items-start gap-5 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)]"
                  : ""
              }
            >
              {showVariantTree ? (
                <VariantTreeNav
                  axes={optionAxes}
                  variants={variants}
                  selectedIndex={selectedVariantIndex}
                  onSelect={setSelectedVariantIndex}
                />
              ) : null}
              <div className="min-w-0 space-y-6">
            {(showVariantTree ? [selectedVariantIndex] : variants.map((_, i) => i)).map((vi) => {
              const v = variants[vi];
              if (!v) return null;
              return (
              <div
                key={v.id ?? `new-${vi}`}
                className="rounded-xl border-2 border-[#1c352a]/35 bg-[var(--admin-card-bg,#fff)] p-5 shadow-sm transition-shadow duration-200 hover:shadow-md dark:border-[#b98a3e]/45"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--admin-text,#2c2420)]">
                    {showVariantTree && v.attributes.some((a) => a.value.trim())
                      ? v.attributes
                          .filter((a) => a.value.trim())
                          .map((a) => a.value)
                          .join(" / ")
                      : `Variant ${vi + 1}`}
                    {v.isDefault ? (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">(default)</span>
                    ) : null}
                    {v.optionMismatch ? (
                      <span className="ml-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        (options mismatch — review)
                      </span>
                    ) : null}
                    {v.id && deactivateVariantIds.includes(v.id) ? (
                      <span className="ml-2 text-xs font-semibold text-red-700 dark:text-red-400">
                        (deactivate on save)
                      </span>
                    ) : null}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs text-amber-700 hover:underline dark:text-amber-400"
                      onClick={() =>
                        setVariants((prev) =>
                          prev.map((x, i) => ({ ...x, isDefault: i === vi }))
                        )
                      }
                    >
                      Set default
                    </button>
                    {variants.length > 1 ? (
                      v.id ? (
                        <button
                          type="button"
                          className="text-xs text-red-600"
                          onClick={() => setDeactivateConfirmId(v.id!)}
                        >
                          Deactivate…
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-xs text-red-600"
                          onClick={() => setVariants((prev) => prev.filter((_, i) => i !== vi))}
                        >
                          Remove
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
                {showVariantTree && optionAxes.length > 0 ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {v.attributes.map((attr, ai) => {
                      const axis = optionAxes[ai];
                      const choices = axis ? optionsForAxis(axis, attr.value) : [];
                      const label = attr.name || axis?.name || `Level ${ai + 1}`;
                      return (
                        <div key={`${vi}-${attr.slug}-${ai}`}>
                          <label className={labelCls}>{label}</label>
                          {choices.length > 0 ? (
                            <select
                              value={attr.value}
                              onChange={(e) =>
                                setVariants((prev) =>
                                  prev.map((x, i) =>
                                    i === vi
                                      ? {
                                          ...x,
                                          attributes: x.attributes.map((a, j) =>
                                            j === ai ? { ...a, value: e.target.value } : a
                                          )
                                        }
                                      : x
                                  )
                                )
                              }
                              className={inputCls}
                            >
                              <option value="">Select {label}</option>
                              {choices.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="mt-1 rounded-lg border border-dashed border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-input-bg,#faf9f7)] px-3 py-2 text-xs text-[var(--admin-text-muted,#8a7060)]">
                              Add {label} options in Variant level above first.
                            </p>
                          )}
                          <FieldErr message={fieldErrors[`variants.${vi}.attr.${ai}`]} />
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Stock on hand</label>
                    <input
                      inputMode="numeric"
                      min={0}
                      value={v.onHand}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) =>
                            i === vi
                              ? { ...x, onHand: sanitizeNonNegativeInput(e.target.value, false) }
                              : x
                          )
                        )
                      }
                      className={inputCls}
                    />
                    <FieldErr message={fieldErrors[`variants.${vi}.onHand`]} />
                  </div>
                  <div>
                    <label className={labelCls}>Weight (grams)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={v.weightGrams}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) =>
                            i === vi ? { ...x, weightGrams: e.target.value.replace(/[^\d]/g, "") } : x
                          )
                        )
                      }
                      placeholder="500"
                      className={inputCls}
                      aria-invalid={Boolean(fieldErrors[`variants.${vi}.weightGrams`])}
                    />
                    <FieldErr message={fieldErrors[`variants.${vi}.weightGrams`]} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>SKU</label>
                    <input
                      value={v.sku}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) =>
                            i === vi
                              ? { ...x, sku: e.target.value, skuManual: true }
                              : x
                          )
                        )
                      }
                      className={inputCls}
                      aria-invalid={Boolean(fieldErrors[`variants.${vi}.sku`])}
                    />
                    {v.skuManual ? (
                      <p className="mt-1 text-xs text-[var(--admin-text-muted,#8a7060)]">Locked (edited manually).</p>
                    ) : null}
                    <FieldErr message={fieldErrors[`variants.${vi}.sku`]} />
                  </div>
                </div>
                <VariantPricingShippingTables
                  variant={v}
                  variantIndex={vi}
                  fieldErrors={fieldErrors}
                  onChange={(next) =>
                    setVariants((prev) => prev.map((x, i) => (i === vi ? { ...x, ...next } : x)))
                  }
                />
                <div className="mt-4">
                  <VariantMediaBlock
                    images={v.images}
                    videoUrl={v.videoUrl}
                    audioUrl={v.audioUrl}
                    fieldPrefix={`variants.${vi}`}
                    fieldErrors={fieldErrors}
                    showImages
                    showVideo
                    onImagesChange={(next) =>
                      setVariants((prev) =>
                        prev.map((x, i) => (i === vi ? { ...x, images: next } : x))
                      )
                    }
                    onVideoUrlChange={(url) =>
                      setVariants((prev) =>
                        prev.map((x, i) => (i === vi ? { ...x, videoUrl: url } : x))
                      )
                    }
                    onAudioUrlChange={(url) =>
                      setVariants((prev) =>
                        prev.map((x, i) => (i === vi ? { ...x, audioUrl: url } : x))
                      )
                    }
                  />
                </div>
              </div>
              );
            })}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "media" ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <p className={labelCls}>Shared product images</p>
                <p className="mt-0.5 text-[11px] text-[var(--admin-text-muted,#8a7060)]">
                  Drag the thumbnail strip (or cards) to set gallery order. Position 1 is primary.
                </p>
              </div>
              <ProductGalleryOrderStrip images={images} onReorder={reorderImages} />
              {images.map((im, ii) => (
                <ProductImageUpload
                  key={ii}
                  url={im.url}
                  altText={im.altText}
                  isPrimary={im.isPrimary}
                  index={ii}
                  onReorder={reorderImages}
                  onUrlChange={(url) =>
                    setImages((prev) => prev.map((x, i) => (i === ii ? { ...x, url } : x)))
                  }
                  onAltChange={(altText) =>
                    setImages((prev) => prev.map((x, i) => (i === ii ? { ...x, altText } : x)))
                  }
                  onPrimaryChange={() =>
                    setImages((prev) => prev.map((x, i) => ({ ...x, isPrimary: i === ii })))
                  }
                  onRemove={() => removeImage(ii)}
                  role={im.isPrimary ? "primary" : "secondary"}
                />
              ))}
              <FieldErr message={fieldErrors[`images.0.url`] || fieldErrors.images} />
              <button
                type="button"
                onClick={addImageRow}
                className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                + Add gallery image
              </button>
            </div>
            <div className="space-y-3 border-t border-[var(--admin-card-border,#e8e2d9)] pt-6">
              <div>
                <label htmlFor="sharedVideoUrl" className={labelCls}>
                  Shared product video URL
                </label>
                <input
                  id="sharedVideoUrl"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://… (fallback when variant has no video)"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="space-y-3 border-t border-[var(--admin-card-border,#e8e2d9)] pt-6">
              <div>
                <p className={labelCls}>Product page sections</p>
              </div>
              {accordion.map((a, ai) => (
                <div
                  key={ai}
                  className="space-y-2 rounded-lg border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#faf9f7)] p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]">
                      Section {ai + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAccordionSection(ai)}
                      className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove section
                    </button>
                  </div>
                  <input
                    placeholder="Section title (e.g. Description, How to use)"
                    value={a.title}
                    onChange={(e) =>
                      setAccordion((prev) =>
                        prev.map((x, i) => (i === ai ? { ...x, title: e.target.value } : x))
                      )
                    }
                    className={inputCls}
                  />
                  <AccordionRichEditor
                    value={a.content}
                    onChange={(content) =>
                      setAccordion((prev) =>
                        prev.map((x, i) => (i === ai ? { ...x, content } : x))
                      )
                    }
                    placeholder="Write content — use Bold / lists from the toolbar"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "barcodes" ? (
          <ProductBarcodeTab
            productName={name}
            variants={variants.map((v, vi) => ({
              key: v.id ?? `new-${vi}`,
              sku: v.sku,
              variantLabel: v.attributes
                .map((a) => a.value.trim())
                .filter(Boolean)
                .join(" / ")
            }))}
          />
        ) : null}

        {tab === "seo" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-input-bg,#faf9f7)] px-4 py-3">
              <p className="text-sm text-[var(--admin-text-muted,#8a7060)]">
                AI fills SEO title, meta description, and focus keyword (tuned to pass the checklist
                below).
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={seoAiLoading || !name.trim()}
                  onClick={() => void fillSeoWithAi()}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md bg-gradient-to-r from-[#1c352a] to-[#2d5040] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {seoAiLoading ? "Generating…" : "Fill SEO with AI"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSeoTitle("");
                    setSeoDescription("");
                    setSeoKeyword("");
                    setToast({ message: "SEO fields cleared" });
                  }}
                  className="rounded-md border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-card-bg,#fff)] px-4 py-2 text-sm font-medium text-[var(--admin-text,#2c2420)] hover:bg-[var(--admin-row-hover,#faf5ec)]"
                >
                  Reset SEO
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="seoTitle" className={labelCls}>
                SEO title
              </label>
              <input
                id="seoTitle"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="seoDesc" className={labelCls}>
                Meta description
              </label>
              <textarea
                id="seoDesc"
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="seoKw" className={labelCls}>
                Focus keyword
              </label>
              <input
                id="seoKw"
                value={seoKeyword}
                onChange={(e) => setSeoKeyword(e.target.value)}
                className={inputCls}
              />
            </div>
            <SeoAnalysisPanel
              seoTitle={seoTitle}
              seoDescription={seoDescription}
              seoKeyword={seoKeyword}
              productName={name}
              productDescription={shortDescription || description}
              slug={slug}
            />
          </div>
        ) : null}

      </form>

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--admin-card-border,#e8e2d9)] bg-[var(--admin-card-bg,#fff)]/95 px-4 py-3 backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {tab === "variants" ? (
              <button
                type="button"
                onClick={() => {
                  setProductType("VARIABLE");
                  setVariants((prev) => {
                    const next = [
                      ...prev.map((x) => ({ ...x, isDefault: false })),
                      {
                        ...newVariant(),
                        isDefault: prev.length === 0,
                        attributes: syncVariantAttributesToAxes([], optionAxes)
                      }
                    ];
                    setSelectedVariantIndex(next.length - 1);
                    return next;
                  });
                }}
                className={floatAddBtnCls}
              >
                + Add variant
              </button>
            ) : null}
            {tab === "variants" ? (
              <button
                type="button"
                disabled={!skuFamily || !name.trim() || skuGenBusy}
                onClick={() => void applyGeneratedSkus({ forceAll: true })}
                className="rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-card-bg,#fff)] px-4 py-2 text-sm font-semibold text-[var(--admin-text,#2c2420)] shadow-sm transition-colors hover:bg-[var(--admin-row-hover,#faf5ec)] disabled:opacity-50"
              >
                {skuGenBusy ? "Generating…" : "Regenerate SKUs"}
              </button>
            ) : null}
            {tab === "media" ? (
              <button
                type="button"
                onClick={() => setAccordion((prev) => [...prev, { title: "", content: "" }])}
                className={floatAddBtnCls}
              >
                + Add section
              </button>
            ) : null}
            {err ? (
              <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">
                {err}
              </p>
            ) : isNew ? (
              <p className="text-xs text-[var(--admin-text-muted,#8a7060)]">
                Step {tabIndex + 1} of {FORM_TABS.length} · {FORM_TABS[tabIndex]?.label}
                {typeof window !== "undefined" && sessionStorage.getItem(DRAFT_KEY)
                  ? " · draft saved in this browser"
                  : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/products"
              className="rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-card-bg,#fff)] px-4 py-2 text-sm font-medium text-[var(--admin-text,#2c2420)]"
            >
              Cancel
            </Link>
            {tabIndex > 0 ? (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-card-bg,#fff)] px-4 py-2 text-sm font-medium text-[var(--admin-text,#2c2420)]"
              >
                Back
              </button>
            ) : null}
            {isNew && !onLastTab ? (
              <button
                type="button"
                onClick={goNext}
                className="rounded-lg bg-gradient-to-r from-[#1c352a] to-[#2d5040] px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Next
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
