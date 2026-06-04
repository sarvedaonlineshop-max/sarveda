"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteAdminProduct,
  fetchAdminProduct,
  postAdminProduct,
  putAdminProduct,
  suggestProductSeo
} from "@/lib/admin-api";
import { formatAccordionSection, plainTextFromAccordionContent } from "@/lib/accordion-format";
import { applyApiError, tabForFieldPath } from "@/lib/admin-errors";
import { AdminToast } from "@/components/admin/AdminToast";
import { ProductAudioUpload } from "@/components/admin/ProductAudioUpload";
import { ProductImageUpload } from "@/components/admin/ProductImageUpload";
import { SeoAnalysisPanel } from "@/components/admin/SeoAnalysisPanel";
import { fetchCategoryTree } from "@/lib/api";
import type { CategoryNode } from "@/lib/types";

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
  shippingRates: ShippingRateForm[];
};

type ImageForm = { url: string; altText: string; isPrimary: boolean; variantKey: string };
type AccordionForm = { title: string; content: string };

function variantKeyForForm(v: VariantForm): string {
  if (v.id) return v.id;
  const sku = v.sku.trim();
  return sku ? `sku:${sku}` : "";
}

function imageVariantPayload(
  variantKey: string,
  variants: VariantForm[]
): { variantId?: string | null; variantSku?: string | null } {
  if (!variantKey) return { variantId: null, variantSku: null };
  const match = variants.find((v) => v.id === variantKey);
  if (match?.id) return { variantId: match.id, variantSku: null };
  if (variantKey.startsWith("sku:")) {
    return { variantId: null, variantSku: variantKey.slice(4) };
  }
  return { variantId: null, variantSku: variantKey };
}

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

function newVariant(skuPrefix: string): VariantForm {
  return {
    sku: `${skuPrefix}-v1`,
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
    shippingRates: emptyShipping()
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
          <label className="flex cursor-pointer items-center gap-2 py-0.5 hover:text-amber-700 dark:text-stone-200 dark:hover:text-amber-400">
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
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";
const labelCls = "text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400";
const fieldErrCls = "mt-1 text-xs text-red-600 dark:text-red-400";
const DRAFT_KEY = "sarveda_admin_new_product_draft";

function FieldErr({ message }: { message?: string }) {
  if (!message) return null;
  return <p className={fieldErrCls}>{message}</p>;
}

const FORM_TABS = [
  { id: "general" as const, label: "General", hint: "Name, slug, categories" },
  { id: "variants" as const, label: "Variants & shipping", hint: "SKU, prices, delivery" },
  { id: "media" as const, label: "Images & content", hint: "Gallery, accordion" },
  { id: "seo" as const, label: "SEO", hint: "Search listing" }
];
type FormTab = (typeof FORM_TABS)[number]["id"];

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const isNew = !productId;

  const [tab, setTab] = useState<FormTab>("general");
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  const [hasAudio, setHasAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoKeyword, setSeoKeyword] = useState("");
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [variants, setVariants] = useState<VariantForm[]>([newVariant("product")]);
  const [images, setImages] = useState<ImageForm[]>([
    { url: "", altText: "", isPrimary: true, variantKey: "" }
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
      setTaxClass(String(p.taxClass ?? "standard"));
      setHasAudio(Boolean(p.hasAudio));
      setAudioUrl(String(p.audioUrl ?? ""));
      setSeoTitle(String(p.seoTitle ?? ""));
      setSeoDescription(String(p.seoDescription ?? ""));
      setSeoKeyword(String(p.seoKeyword ?? ""));

      const cats = (
        (p.categories as Array<{ category: { id: string } }>) ?? []
      ).map((x) => x.category.id);
      setSelectedCats(new Set(cats));

      const vs = (p.variants as Array<Record<string, unknown>>) ?? [];
      if (vs.length) {
        setVariants(
          vs.map((v) => {
            const rates = (v.shippingRates as Array<Record<string, unknown>>) ?? [];
            const byZone = new Map(rates.map((r) => [String(r.country), r]));
            return {
              id: String(v.id),
              sku: String(v.sku),
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
          })
        );
      }

      const imgs = (p.images as Array<Record<string, unknown>>) ?? [];
      setImages(
        imgs.length
          ? imgs.map((im) => ({
              url: String(im.url),
              altText: String(im.altText ?? ""),
              isPrimary: Boolean(im.isPrimary),
              variantKey: im.variantId ? String(im.variantId) : ""
            }))
          : [{ url: "", altText: "", isPrimary: true, variantKey: "" }]
      );

      const acc = (p.accordionItems as Array<Record<string, unknown>>) ?? [];
      setAccordion(
        acc.length
          ? acc.map((a) => ({
              title: String(a.title),
              content: plainTextFromAccordionContent(String(a.content))
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

  useEffect(() => {
    if (!isNew || !slug.trim()) return;
    setVariants((prev) => {
      if (prev.length !== 1 || prev[0]?.id) return prev;
      const nextSku = `${slug.trim()}-v1`.slice(0, 120);
      if (prev[0]?.sku === nextSku) return prev;
      return [{ ...prev[0]!, sku: nextSku }];
    });
  }, [slug, isNew]);

  const tabIndex = FORM_TABS.findIndex((t) => t.id === tab);

  function validateTab(target: FormTab): Record<string, string> {
    const errors: Record<string, string> = {};
    if (target === "general") {
      if (!name.trim()) errors.name = "Product name is required.";
      if (!slug.trim()) errors.slug = "Slug is required.";
      else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
        errors.slug = "Slug must be lowercase letters, numbers, and hyphens only.";
      }
      if (hasAudio && audioUrl.trim() && !/^https?:\/\/.+/i.test(audioUrl.trim())) {
        errors.audioUrl = "Audio URL must start with http:// or https://";
      }
    }
    if (target === "variants") {
      variants.forEach((v, i) => {
        if (!v.sku.trim()) errors[`variants.${i}.sku`] = "SKU is required.";
        if (toPaise(v.mrpInr) < 0 || toPaise(v.saleInr) < 0) {
          errors[`variants.${i}.saleInr`] = "Prices cannot be negative.";
        }
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
      setTab(tabForFieldPath(first));
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
    if (tabIndex < FORM_TABS.length - 1) setTab(FORM_TABS[tabIndex + 1]!.id);
  }

  function goBack() {
    setErr(null);
    if (tabIndex > 0) setTab(FORM_TABS[tabIndex - 1]!.id);
  }

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
        return [{ url: "", altText: "", isPrimary: true, variantKey: "" }];
      }
      if (removed?.isPrimary) {
        return next.map((im, i) => ({ ...im, isPrimary: i === 0 }));
      }
      return next;
    });
  }

  function addImageRow() {
    setImages((prev) => [
      ...prev,
      { url: "", altText: "", isPrimary: prev.length === 0 && !prev.some((im) => im.isPrimary), variantKey: "" }
    ]);
  }

  const variantImageOptions = useMemo(() => {
    const opts = [{ key: "", label: "All variants (shared gallery)" }];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]!;
      opts.push({
        key: variantKeyForForm(v),
        label: v.sku.trim() ? `Variant: ${v.sku}` : `Variant ${i + 1}`
      });
    }
    return opts;
  }, [variants]);

  const showVariantImages = productType === "VARIABLE" && variants.length > 1;

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
      setSeoTitle(data.seoTitle);
      setSeoDescription(data.seoDescription);
      setSeoKeyword(data.seoKeyword);
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
      productType,
      status,
      taxClass: taxClass.trim() || "standard",
      hasAudio,
      audioUrl: hasAudio ? audioUrl.trim() || null : null,
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      seoKeyword: seoKeyword.trim() || null,
      categoryIds: Array.from(selectedCats),
      variants: variants.map((v) => ({
        id: v.id,
        sku: v.sku.trim(),
        mrpInPaise: toPaise(v.mrpInr),
        saleInPaise: toPaise(v.saleInr),
        mrpUsdCents: v.mrpUsd ? toCents(v.mrpUsd) : null,
        saleUsdCents: v.saleUsd ? toCents(v.saleUsd) : null,
        mrpGbpPence: v.mrpGbp ? toPence(v.mrpGbp) : null,
        saleGbpPence: v.saleGbp ? toPence(v.saleGbp) : null,
        weightGrams: parseInt(v.weightGrams, 10) || 0,
        isDefault: v.isDefault,
        status: v.status,
        onHand: parseInt(v.onHand, 10) || 0,
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
      images: (() => {
        const filled = images.filter((im) => im.url.trim());
        let primaryIdx = filled.findIndex((im) => im.isPrimary);
        if (primaryIdx < 0 && filled.length > 0) primaryIdx = 0;
        return filled.map((im, i) => ({
          url: im.url.trim(),
          altText: im.altText.trim() || null,
          position: i,
          isPrimary: i === primaryIdx,
          ...imageVariantPayload(im.variantKey, variants)
        }));
      })(),
      accordionItems: accordion
        .filter((a) => a.title.trim())
        .map((a, i) => ({
          title: a.title.trim(),
          content: formatAccordionSection(a.title, a.content),
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
      if (typeof d.tab === "string") setTab(d.tab as FormTab);
      if (Array.isArray(d.variants)) setVariants(d.variants as VariantForm[]);
      if (Array.isArray(d.images)) setImages(d.images as ImageForm[]);
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
            tab,
            variants,
            images,
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
    tab,
    variants,
    images,
    accordion,
    selectedCats,
    seoTitle,
    seoDescription,
    seoKeyword
  ]);

  async function handleSave() {
    const clientErrors = validateAll();
    if (Object.keys(clientErrors).length > 0) {
      applyClientErrors(clientErrors);
      return;
    }
    setSaving(true);
    setErr(null);
    setFieldErrors({});
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = await postAdminProduct(payload);
        sessionStorage.removeItem(DRAFT_KEY);
        const id = String(created.id);
        setToast({ message: "Product created — you can keep editing" });
        setSavedAt(Date.now());
        router.replace(`/admin/products/${id}`);
        router.refresh();
      } else {
        await putAdminProduct(productId!, payload);
        await loadProduct();
        setToast({ message: "Changes saved" });
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
    }
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

  if (loading) {
    return <p className="text-sm text-stone-500">Loading product…</p>;
  }

  const onLastTab = tabIndex === FORM_TABS.length - 1;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-28 font-sans">
      <AdminToast toast={toast} onDismiss={() => setToast(null)} />
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-700">
        <div>
          <Link
            href="/admin/products"
            className="text-sm font-medium text-stone-600 hover:text-amber-700 dark:text-stone-400 dark:hover:text-amber-400"
          >
            ← Products
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            {isNew ? "Add product" : "Edit product"}
          </h1>
          {savedAt ? (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </p>
          ) : null}
          {isNew ? (
            <p className="mt-1 max-w-xl text-sm text-stone-600 dark:text-stone-400">
              Work through each step — nothing is saved until you click{" "}
              <strong className="font-medium text-stone-800 dark:text-stone-200">Create product</strong> on
              the SEO step. You can move back anytime to change earlier sections.
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Use the tabs to navigate. Save applies all sections at once.
            </p>
          )}
        </div>
        {!isNew ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleDelete()}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            {deleting ? "Archiving…" : "Archive product"}
          </button>
        ) : null}
      </div>

      <nav
        className="flex flex-wrap gap-2 rounded-xl border border-stone-200 bg-stone-50/80 p-2 dark:border-stone-700 dark:bg-stone-950/50"
        aria-label="Product form steps"
      >
        {FORM_TABS.map((t, i) => {
          const active = tab === t.id;
          const done = i < tabIndex;
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
                setTab(t.id);
              }}
              className={`min-w-[8rem] flex-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                active
                  ? "bg-white shadow-sm ring-1 ring-amber-200 dark:bg-stone-900 dark:ring-amber-900/60"
                  : "hover:bg-white/70 dark:hover:bg-stone-900/60"
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  active
                    ? "bg-amber-500 text-stone-900"
                    : done
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300"
                }`}
              >
                {done && !active ? "✓" : i + 1}
              </span>
              <span className="mt-1 block text-sm font-semibold text-stone-800 dark:text-stone-100">
                {t.label}
              </span>
              <span className="block text-[11px] text-stone-500">{t.hint}</span>
            </button>
          );
        })}
      </nav>

      <form
        onSubmit={(e) => e.preventDefault()}
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900"
      >
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
                <label htmlFor="tax" className={labelCls}>
                  GST class
                </label>
                <select
                  id="tax"
                  value={taxClass}
                  onChange={(e) => setTaxClass(e.target.value)}
                  className={inputCls}
                >
                  <option value="standard">18% (standard)</option>
                  <option value="gst18">gst18</option>
                  <option value="gst12">12%</option>
                  <option value="gst-5">5%</option>
                  <option value="gst-zero-rate">0%</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
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
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-600 dark:bg-stone-950/60">
                <CategoryCheckTree nodes={categoryTree} selected={selectedCats} onToggle={toggleCat} />
              </div>
            </div>
          </div>
        ) : null}

        {tab === "variants" ? (
          <div className="space-y-6">
            <FieldErr message={fieldErrors.variants} />
            {variants.map((v, vi) => (
              <div
                key={v.id ?? `new-${vi}`}
                className="rounded-lg border border-stone-200 p-4 dark:border-stone-600"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-stone-800 dark:text-stone-100">
                    Variant {vi + 1}
                    {v.isDefault ? (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">(default)</span>
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
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => setVariants((prev) => prev.filter((_, i) => i !== vi))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>SKU</label>
                    <input
                      value={v.sku}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, sku: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                      aria-invalid={Boolean(fieldErrors[`variants.${vi}.sku`])}
                    />
                    <FieldErr message={fieldErrors[`variants.${vi}.sku`]} />
                  </div>
                  <div>
                    <label className={labelCls}>Stock on hand</label>
                    <input
                      type="number"
                      min={0}
                      value={v.onHand}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, onHand: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase text-stone-500">Pricing</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2 rounded border border-stone-100 p-2 dark:border-stone-700">
                    <p className="text-xs font-medium text-stone-600 dark:text-stone-300">India (INR)</p>
                    <input
                      placeholder="MRP ₹"
                      value={v.mrpInr}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, mrpInr: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                    />
                    <input
                      placeholder="Sale ₹"
                      value={v.saleInr}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, saleInr: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-2 rounded border border-stone-100 p-2 dark:border-stone-700">
                    <p className="text-xs font-medium text-stone-600 dark:text-stone-300">US (USD)</p>
                    <input
                      placeholder="MRP $"
                      value={v.mrpUsd}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, mrpUsd: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                    />
                    <input
                      placeholder="Sale $"
                      value={v.saleUsd}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, saleUsd: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="space-y-2 rounded border border-stone-100 p-2 dark:border-stone-700">
                    <p className="text-xs font-medium text-stone-600 dark:text-stone-300">UK (GBP)</p>
                    <input
                      placeholder="MRP £"
                      value={v.mrpGbp}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, mrpGbp: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                    />
                    <input
                      placeholder="Sale £"
                      value={v.saleGbp}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) => (i === vi ? { ...x, saleGbp: e.target.value } : x))
                        )
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase text-stone-500">
                  Shipping (IN ₹, US $, GB £, OTHER $)
                </p>
                {v.shippingRates.map((r, ri) => (
                  <div
                    key={r.country}
                    className="mt-2 grid gap-2 rounded border border-dashed border-stone-200 p-2 sm:grid-cols-4 dark:border-stone-600"
                  >
                    <p className="text-sm font-medium text-stone-700 dark:text-stone-200">{r.country}</p>
                    <input
                      placeholder="Standard 1st"
                      value={r.standardPerProduct}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) =>
                            i === vi
                              ? {
                                  ...x,
                                  shippingRates: x.shippingRates.map((sr, j) =>
                                    j === ri ? { ...sr, standardPerProduct: e.target.value } : sr
                                  )
                                }
                              : x
                          )
                        )
                      }
                      className={inputCls}
                    />
                    <input
                      placeholder="Standard extra"
                      value={r.standardAdditional}
                      onChange={(e) =>
                        setVariants((prev) =>
                          prev.map((x, i) =>
                            i === vi
                              ? {
                                  ...x,
                                  shippingRates: x.shippingRates.map((sr, j) =>
                                    j === ri ? { ...sr, standardAdditional: e.target.value } : sr
                                  )
                                }
                              : x
                          )
                        )
                      }
                      className={inputCls}
                    />
                    {r.country === "IN" ? (
                      <input
                        placeholder="COD 1st"
                        value={r.codPerProduct}
                        onChange={(e) =>
                          setVariants((prev) =>
                            prev.map((x, i) =>
                              i === vi
                                ? {
                                    ...x,
                                    shippingRates: x.shippingRates.map((sr, j) =>
                                      j === ri ? { ...sr, codPerProduct: e.target.value } : sr
                                    )
                                  }
                                : x
                            )
                          )
                        }
                        className={inputCls}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setVariants((prev) => [
                  ...prev.map((x) => ({ ...x, isDefault: false })),
                  newVariant(slug || "product")
                ])
              }
              className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
            >
              + Add variant
            </button>
          </div>
        ) : null}

        {tab === "media" ? (
          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <p className={labelCls}>Product images</p>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Upload to S3. Mark one primary image. With multiple variants, link each image to a
                  variant so the gallery switches on the product page.
                </p>
              </div>
              {images.map((im, ii) => (
                <ProductImageUpload
                  key={ii}
                  url={im.url}
                  altText={im.altText}
                  isPrimary={im.isPrimary}
                  variantKey={im.variantKey}
                  variantOptions={showVariantImages ? variantImageOptions : undefined}
                  onVariantChange={
                    showVariantImages
                      ? (variantKey) =>
                          setImages((prev) =>
                            prev.map((x, i) => (i === ii ? { ...x, variantKey } : x))
                          )
                      : undefined
                  }
                  role={im.isPrimary ? "primary" : "secondary"}
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
            <div className="space-y-3">
              <div>
                <p className={labelCls}>Product page sections</p>
                <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  Type plain text or bullet lists (lines starting with -). Styling is applied
                  automatically on the storefront — no HTML needed.
                </p>
              </div>
              {accordion.map((a, ai) => (
                <div
                  key={ai}
                  className="space-y-2 rounded-lg border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
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
                  <textarea
                    placeholder="Write content here. Use blank lines between paragraphs. Use - for bullet points."
                    value={a.content}
                    onChange={(e) =>
                      setAccordion((prev) =>
                        prev.map((x, i) => (i === ai ? { ...x, content: e.target.value } : x))
                      )
                    }
                    rows={5}
                    className={inputCls}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAccordion((prev) => [...prev, { title: "", content: "" }])}
                className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                + Add section
              </button>
            </div>
          </div>
        ) : null}

        {tab === "seo" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-3 dark:border-stone-700 dark:bg-stone-950/40">
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Not an SEO expert? Let AI draft title, description, and keyword from your product copy.
              </p>
              <button
                type="button"
                disabled={seoAiLoading || !name.trim()}
                onClick={() => void fillSeoWithAi()}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
              >
                {seoAiLoading ? "Generating…" : "Fill SEO with AI"}
              </button>
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

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur md:left-64 dark:border-stone-700 dark:bg-stone-900/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {err ? (
              <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">
                {err}
              </p>
            ) : isNew ? (
              <p className="text-xs text-stone-500">
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
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
            >
              Cancel
            </Link>
            {tabIndex > 0 ? (
              <button
                type="button"
                onClick={goBack}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              >
                Back
              </button>
            ) : null}
            {isNew && !onLastTab ? (
              <button
                type="button"
                onClick={goNext}
                className="rounded-lg bg-stone-800 px-5 py-2 text-sm font-semibold text-white hover:bg-stone-700 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-white"
              >
                Next
              </button>
            ) : null}
            {isNew && onLastTab ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
              >
                {saving ? "Creating…" : "Create product"}
              </button>
            ) : null}
            {!isNew ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-md bg-amber-500 px-5 py-2 text-sm font-semibold text-stone-900 shadow-sm hover:bg-amber-400 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
