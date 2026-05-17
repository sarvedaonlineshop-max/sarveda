"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  deleteAdminProduct,
  fetchAdminProduct,
  postAdminProduct,
  putAdminProduct
} from "@/lib/admin-api";
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
const labelCls = "text-xs font-semibold uppercase text-stone-500 dark:text-stone-400";

export function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const isNew = !productId;

  const [tab, setTab] = useState<"general" | "variants" | "media" | "seo">("general");
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
  const [images, setImages] = useState<ImageForm[]>([{ url: "", altText: "", isPrimary: true }]);
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
              isPrimary: Boolean(im.isPrimary)
            }))
          : [{ url: "", altText: "", isPrimary: true }]
      );

      const acc = (p.accordionItems as Array<Record<string, unknown>>) ?? [];
      setAccordion(
        acc.length
          ? acc.map((a) => ({ title: String(a.title), content: String(a.content) }))
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

  function toggleCat(catId: string) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
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
      images: images
        .filter((im) => im.url.trim())
        .map((im, i) => ({
          url: im.url.trim(),
          altText: im.altText.trim() || null,
          position: i,
          isPrimary: im.isPrimary
        })),
      accordionItems: accordion
        .filter((a) => a.title.trim())
        .map((a, i) => ({
          title: a.title.trim(),
          content: a.content,
          position: i
        }))
    };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = await postAdminProduct(payload);
        router.push(`/admin/products/${String(created.id)}`);
      } else {
        await putAdminProduct(productId!, payload);
        router.push("/admin/products");
      }
      router.refresh();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
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

  const tabs = [
    { id: "general" as const, label: "General" },
    { id: "variants" as const, label: "Variants & shipping" },
    { id: "media" as const, label: "Images & content" },
    { id: "seo" as const, label: "SEO" }
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link href="/admin/products" className="text-sm text-amber-700 hover:underline dark:text-amber-400">
        ← Products
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl italic text-stone-800 dark:text-stone-100">
          {isNew ? "Add product" : "Edit product"}
        </h1>
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

      <div className="flex flex-wrap gap-2 border-b border-stone-200 dark:border-stone-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-amber-500 text-amber-800 dark:text-amber-400"
                : "border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => void handleSave(e)}
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
                onChange={(e) => setName(e.target.value)}
                required
                className={inputCls}
              />
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
                }}
                required
                className={`${inputCls} font-mono`}
              />
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
              <div>
                <label htmlFor="audio" className={labelCls}>
                  Audio URL
                </label>
                <input
                  id="audio"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  placeholder="https://…"
                  className={inputCls}
                />
              </div>
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
                    />
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
              <p className={labelCls}>Product images (CDN URLs)</p>
              {images.map((im, ii) => (
                <div key={ii} className="grid gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Image URL"
                    value={im.url}
                    onChange={(e) =>
                      setImages((prev) =>
                        prev.map((x, i) => (i === ii ? { ...x, url: e.target.value } : x))
                      )
                    }
                    className={inputCls}
                  />
                  <input
                    placeholder="Alt text"
                    value={im.altText}
                    onChange={(e) =>
                      setImages((prev) =>
                        prev.map((x, i) => (i === ii ? { ...x, altText: e.target.value } : x))
                      )
                    }
                    className={inputCls}
                  />
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="radio"
                      name="primaryImage"
                      checked={im.isPrimary}
                      onChange={() =>
                        setImages((prev) => prev.map((x, i) => ({ ...x, isPrimary: i === ii })))
                      }
                    />
                    Primary image
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setImages((prev) => [...prev, { url: "", altText: "", isPrimary: false }])}
                className="text-sm text-amber-700 dark:text-amber-400"
              >
                + Add image
              </button>
            </div>
            <div className="space-y-3">
              <p className={labelCls}>Accordion sections (product page)</p>
              {accordion.map((a, ai) => (
                <div key={ai} className="space-y-2 rounded border border-stone-100 p-3 dark:border-stone-700">
                  <input
                    placeholder="Section title"
                    value={a.title}
                    onChange={(e) =>
                      setAccordion((prev) =>
                        prev.map((x, i) => (i === ai ? { ...x, title: e.target.value } : x))
                      )
                    }
                    className={inputCls}
                  />
                  <textarea
                    placeholder="HTML or plain text content"
                    value={a.content}
                    onChange={(e) =>
                      setAccordion((prev) =>
                        prev.map((x, i) => (i === ai ? { ...x, content: e.target.value } : x))
                      )
                    }
                    rows={4}
                    className={inputCls}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAccordion((prev) => [...prev, { title: "", content: "" }])}
                className="text-sm text-amber-700 dark:text-amber-400"
              >
                + Add section
              </button>
            </div>
          </div>
        ) : null}

        {tab === "seo" ? (
          <div className="space-y-4">
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
          </div>
        ) : null}

        {err ? <p className="text-sm text-red-600 dark:text-red-400">{err}</p> : null}

        <div className="flex gap-3 border-t border-stone-100 pt-4 dark:border-stone-700">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-60"
          >
            {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
          </button>
          <Link
            href="/admin/products"
            className="rounded-lg border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
