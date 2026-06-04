"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ContentImageUpload } from "@/components/admin/ContentImageUpload";
import { SeoAnalysisPanel } from "@/components/admin/SeoAnalysisPanel";
import {
  ADMIN_CONTENT_LABELS,
  type AdminContentType,
  createAdminContent,
  deleteAdminContent,
  fetchAdminContent,
  suggestCourseSeo,
  updateAdminContent
} from "@/lib/admin-api";
import {
  contentBodyLabel,
  contentStatusOptions,
  contentTitleLabel,
  emptyContentForm,
  formValuesToPayload,
  itemToFormValues,
  type ContentFormValues
} from "@/lib/admin-content";

type Props = {
  type: AdminContentType;
  itemId?: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export function ContentForm({ type, itemId }: Props) {
  const router = useRouter();
  const isNew = !itemId;
  const label = ADMIN_CONTENT_LABELS[type];

  const [values, setValues] = useState<ContentFormValues>(emptyContentForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [seoAiLoading, setSeoAiLoading] = useState(false);
  const [seoAiNote, setSeoAiNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setErr(null);
    try {
      const item = await fetchAdminContent(type, itemId);
      setValues(itemToFormValues(type, item));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [type, itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) {
      setErr(`${contentTitleLabel(type)} is required`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = formValuesToPayload(type, values);
      if (isNew) {
        const item = await createAdminContent(type, payload);
        router.push(`/admin/content/${type}/${item.id as string}`);
      } else {
        await updateAdminContent(type, itemId!, payload);
        await load();
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function fillCourseSeoWithAi() {
    if (type !== "courses") return;
    setSeoAiLoading(true);
    setSeoAiNote(null);
    setErr(null);
    try {
      const data = await suggestCourseSeo({
        name: values.title.trim(),
        slug: values.slug.trim(),
        shortDescription: values.shortDescription.trim(),
        description: values.body.trim(),
        teachers: values.teachers.map((t) => t.trim()).filter(Boolean),
        duration: values.duration.trim()
      });
      setValues((v) => ({
        ...v,
        seoTitle: data.seoTitle.trim(),
        seoDescription: data.seoDescription.trim(),
        seoKeyword: data.seoKeyword.trim()
      }));
      setSeoAiNote(
        data.source === "ai"
          ? "SEO fields filled with AI suggestions"
          : "SEO fields filled (smart defaults — add OPENAI_API_KEY on EC2 for AI)"
      );
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "SEO suggest failed");
    } finally {
      setSeoAiLoading(false);
    }
  }

  async function onDelete() {
    if (!itemId || !confirm(`Deactivate this ${label.slice(0, -1).toLowerCase()}?`)) return;
    setSaving(true);
    setErr(null);
    try {
      await deleteAdminContent(type, itemId);
      router.push(`/admin/content?type=${type}`);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>;
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/admin/content?type=${type}`}
          className="text-sm text-amber-700 hover:underline dark:text-amber-400"
        >
          ← {label}
        </Link>
        <h1 className="mt-2 font-serif text-3xl italic text-stone-800 dark:text-stone-100">
          {isNew ? `New ${label.slice(0, -1)}` : `Edit ${label.slice(0, -1)}`}
        </h1>
      </div>

      {err ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <Field label={contentTitleLabel(type)} required>
          <input
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            className={inputClass}
          />
        </Field>

        <Field label="Slug">
          <input
            value={values.slug}
            onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
            placeholder="auto-generated if empty"
            className={inputClass}
          />
        </Field>

        <Field label="Status">
          <select
            value={values.status}
            onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}
            className={inputClass}
          >
            {contentStatusOptions(type).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {type === "events" ? (
          <Field label="Start date & time">
            <input
              type="datetime-local"
              value={values.startDate}
              onChange={(e) => setValues((v) => ({ ...v, startDate: e.target.value }))}
              className={inputClass}
            />
          </Field>
        ) : null}

        {type === "courses" ? (
          <>
            <ContentImageUpload
              url={values.imageUrl}
              onUrlChange={(imageUrl) => setValues((v) => ({ ...v, imageUrl }))}
              folder="courses"
            />

            <Field label="Short description">
              <input
                value={values.shortDescription}
                onChange={(e) => setValues((v) => ({ ...v, shortDescription: e.target.value }))}
                className={inputClass}
              />
            </Field>

            <Field label="Teachers">
              <div className="mt-1 space-y-2">
                {values.teachers.map((name, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={name}
                      onChange={(e) =>
                        setValues((v) => {
                          const teachers = [...v.teachers];
                          teachers[index] = e.target.value;
                          return { ...v, teachers };
                        })
                      }
                      placeholder="Teacher name"
                      className={`${inputClass} mt-0 flex-1`}
                    />
                    <button
                      type="button"
                      disabled={values.teachers.length <= 1}
                      onClick={() =>
                        setValues((v) => ({
                          ...v,
                          teachers: v.teachers.filter((_, i) => i !== index)
                        }))
                      }
                      className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-40 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setValues((v) => ({ ...v, teachers: [...v.teachers, ""] }))}
                  className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
                >
                  + Add teacher
                </button>
              </div>
            </Field>

            <Field label="Duration">
              <input
                value={values.duration}
                onChange={(e) => setValues((v) => ({ ...v, duration: e.target.value }))}
                placeholder='e.g. "9 hours", "2 days"'
                className={inputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <input
                  type="date"
                  value={values.courseStartDate}
                  onChange={(e) => setValues((v) => ({ ...v, courseStartDate: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={values.courseEndDate}
                  onChange={(e) => setValues((v) => ({ ...v, courseEndDate: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>
          </>
        ) : null}

        <Field label={contentBodyLabel(type)}>
          <textarea
            value={values.body}
            onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
            rows={12}
            className={`${inputClass} font-mono text-xs`}
            placeholder="HTML or plain text"
          />
        </Field>
      </div>

      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          SEO
        </h2>

        {type === "courses" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-3 dark:border-stone-700 dark:bg-stone-950/40">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              AI fills SEO title, meta description, and focus keyword (tuned to pass the checklist
              below).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={seoAiLoading || !values.title.trim()}
                onClick={() => void fillCourseSeoWithAi()}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-stone-800 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900"
              >
                {seoAiLoading ? "Generating…" : "Fill SEO with AI"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setValues((v) => ({ ...v, seoTitle: "", seoDescription: "", seoKeyword: "" }));
                  setSeoAiNote("SEO fields cleared");
                }}
                className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200"
              >
                Reset SEO
              </button>
            </div>
          </div>
        ) : null}

        {seoAiNote && type === "courses" ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{seoAiNote}</p>
        ) : null}

        <Field label="SEO title">
          <input
            value={values.seoTitle}
            onChange={(e) => setValues((v) => ({ ...v, seoTitle: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <Field label="SEO description">
          <textarea
            value={values.seoDescription}
            onChange={(e) => setValues((v) => ({ ...v, seoDescription: e.target.value }))}
            rows={3}
            className={inputClass}
          />
        </Field>
        {type === "blog" || type === "courses" ? (
          <Field label="Focus keyword">
            <input
              value={values.seoKeyword}
              onChange={(e) => setValues((v) => ({ ...v, seoKeyword: e.target.value }))}
              className={inputClass}
              placeholder="2-word phrase for SEO checks"
            />
          </Field>
        ) : null}

        {type === "courses" ? (
          <SeoAnalysisPanel
            seoTitle={values.seoTitle}
            seoDescription={values.seoDescription}
            seoKeyword={values.seoKeyword}
            itemName={values.title}
            itemDescription={values.shortDescription || values.body}
            slug={values.slug}
            serpPath="course"
            itemLabel="course"
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-stone-900 hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : isNew ? "Create" : "Save changes"}
        </button>
        {!isNew ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void onDelete()}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          >
            Deactivate
          </button>
        ) : null}
        <Link
          href={`/admin/content?type=${type}`}
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 dark:border-stone-600 dark:text-stone-200"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase text-stone-500 dark:text-stone-400">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}
