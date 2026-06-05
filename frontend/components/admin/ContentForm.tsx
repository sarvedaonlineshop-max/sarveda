"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ContentImageUpload } from "@/components/admin/ContentImageUpload";
import { CourseCurriculumFields } from "@/components/admin/CourseCurriculumFields";
import { CourseFaqFields } from "@/components/admin/CourseFaqFields";
import { CourseMentorPicker } from "@/components/admin/CourseMentorPicker";
import { CourseScheduleFields } from "@/components/admin/CourseScheduleFields";
import { CourseSessionFields } from "@/components/admin/CourseSessionFields";
import { SeoAnalysisPanel } from "@/components/admin/SeoAnalysisPanel";
import {
  ADMIN_CONTENT_LABELS,
  type AdminContentType,
  createAdminContent,
  deleteAdminContent,
  fetchAdminContent,
  fetchAdminContentList,
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
import { sanitizeNonNegativeInput } from "@/lib/admin-form-numbers";

type Props = {
  type: AdminContentType;
  itemId?: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

const courseInputClass =
  "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

export function ContentForm({ type, itemId }: Props) {
  const isCourse = type === "courses";
  const router = useRouter();
  const isNew = !itemId;
  const label = ADMIN_CONTENT_LABELS[type];

  const [values, setValues] = useState<ContentFormValues>(emptyContentForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [seoAiLoading, setSeoAiLoading] = useState(false);
  const [seoAiNote, setSeoAiNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mentorOptions, setMentorOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!isCourse) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchAdminContentList("mentors", { limit: 200 });
        if (!cancelled) {
          setMentorOptions(data.items.map((m) => ({ id: m.id, name: m.title })));
        }
      } catch {
        /* picker loads its own list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isCourse]);

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
        teachers: values.mentorIds
          .map((id) => mentorOptions.find((m) => m.id === id)?.name)
          .filter(Boolean) as string[],
        duration: values.durationHours.trim()
          ? `${values.durationHours.trim()} hours`
          : ""
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

  const fieldInput = isCourse ? courseInputClass : inputClass;
  const formClass = isCourse
    ? "mx-auto w-full max-w-6xl space-y-5 pb-28 font-sans"
    : "mx-auto max-w-3xl space-y-6";
  const cardClass = isCourse
    ? "space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900"
    : "space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900";

  return (
    <form onSubmit={(e) => void onSubmit(e)} className={formClass}>
      <div>
        <Link
          href={isCourse ? "/admin/courses" : `/admin/content?type=${type}`}
          className={`text-sm hover:underline ${isCourse ? "text-blue-700 dark:text-blue-400" : "text-amber-700 dark:text-amber-400"}`}
        >
          ← {label}
        </Link>
        <h1
          className={
            isCourse
              ? "mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100"
              : "mt-2 font-serif text-3xl italic text-stone-800 dark:text-stone-100"
          }
        >
          {isNew ? `New ${label.slice(0, -1)}` : `Edit ${label.slice(0, -1)}`}
        </h1>
        {isCourse ? (
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Standard template for most courses. Choose Sessions or Curriculum layout when the
            course page needs structured modules.
          </p>
        ) : null}
      </div>

      {err ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          {err}
        </p>
      ) : null}

      <div className={cardClass}>
        <Field label={contentTitleLabel(type)} required>
          <input
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            className={fieldInput}
          />
        </Field>

        <Field label="Slug">
          <input
            value={values.slug}
            onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
            placeholder="auto-generated if empty"
            className={fieldInput}
          />
        </Field>

        <Field label="Status">
          <select
            value={values.status}
            onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}
            className={fieldInput}
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

        {type === "mentors" || type === "vaidyas" ? (
          <>
            <ContentImageUpload
              label="Profile photo"
              url={values.imageUrl}
              onUrlChange={(imageUrl) => setValues((v) => ({ ...v, imageUrl }))}
              folder={type === "mentors" ? "mentors" : "vaidyas"}
            />
            {type === "mentors" ? (
              <Field label="Expertise / designation">
                <input
                  value={values.expertise}
                  onChange={(e) => setValues((v) => ({ ...v, expertise: e.target.value }))}
                  placeholder="e.g. Yoga Therapy, Meditation"
                  className={inputClass}
                />
              </Field>
            ) : (
              <Field label="Speciality">
                <input
                  value={values.speciality}
                  onChange={(e) => setValues((v) => ({ ...v, speciality: e.target.value }))}
                  placeholder="e.g. Ayurveda, Panchakarma"
                  className={inputClass}
                />
              </Field>
            )}
          </>
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

            <Field label="Page layout">
              <select
                value={values.layoutTemplate}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    layoutTemplate: e.target.value as ContentFormValues["layoutTemplate"]
                  }))
                }
                className={fieldInput}
              >
                <option value="STANDARD">Standard — overview + description</option>
                <option value="SESSIONS">Sessions — numbered session curriculum</option>
                <option value="CURRICULUM">Curriculum — modules with hours &amp; pricing</option>
                <option value="CUSTOM">Custom — build the full page in HTML below</option>
              </select>
            </Field>

            <Field label="Facilitators (from Mentors)">
              <CourseMentorPicker
                selectedIds={values.mentorIds}
                onChange={(mentorIds) => setValues((v) => ({ ...v, mentorIds }))}
              />
            </Field>

            <Field label="Total duration (hours)">
              <input
                type="number"
                min={0}
                step={0.5}
                value={values.durationHours}
                onChange={(e) => setValues((v) => ({ ...v, durationHours: e.target.value }))}
                placeholder="e.g. 13.5"
                className={fieldInput}
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

            <Field label="Video URL (YouTube / Vimeo embed)">
              <input
                value={values.videoUrl}
                onChange={(e) => setValues((v) => ({ ...v, videoUrl: e.target.value }))}
                placeholder="https://www.youtube.com/embed/..."
                className={inputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Mode">
                <input
                  value={values.courseMode}
                  onChange={(e) => setValues((v) => ({ ...v, courseMode: e.target.value }))}
                  placeholder="Online / In-person"
                  className={inputClass}
                />
              </Field>
              <Field label="Venue / location">
                <input
                  value={values.courseVenue}
                  onChange={(e) => setValues((v) => ({ ...v, courseVenue: e.target.value }))}
                  placeholder="Zoom, Rishikesh…"
                  className={inputClass}
                />
              </Field>
              <Field label="Timings">
                <input
                  value={values.courseTimings}
                  onChange={(e) => setValues((v) => ({ ...v, courseTimings: e.target.value }))}
                  placeholder="Wed 7–8:30 PM IST"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="About the course (summary)">
              <textarea
                value={values.aboutTheCourse}
                onChange={(e) => setValues((v) => ({ ...v, aboutTheCourse: e.target.value }))}
                rows={4}
                placeholder="Short overview block (HTML allowed)"
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>

            <Field label="What&apos;s included">
              <textarea
                value={values.courseIncludes}
                onChange={(e) => setValues((v) => ({ ...v, courseIncludes: e.target.value }))}
                rows={4}
                placeholder="Bullet list or HTML"
                className={`${inputClass} font-mono text-xs`}
              />
            </Field>

            <Field label="Schedule / intake rows">
              <CourseScheduleFields
                rows={values.courseSchedule}
                onChange={(courseSchedule) => setValues((v) => ({ ...v, courseSchedule }))}
              />
            </Field>

            <Field label="FAQs">
              <CourseFaqFields
                faqs={values.courseFaqs}
                onChange={(courseFaqs) => setValues((v) => ({ ...v, courseFaqs }))}
              />
            </Field>

            {values.layoutTemplate === "SESSIONS" ? (
              <Field label="Sessions">
                <CourseSessionFields
                  sessions={values.courseSessions}
                  mentors={mentorOptions}
                  onChange={(courseSessions) => setValues((v) => ({ ...v, courseSessions }))}
                />
              </Field>
            ) : null}

            {values.layoutTemplate === "CURRICULUM" ? (
              <Field label="Curriculum modules">
                <CourseCurriculumFields
                  modules={values.courseCurriculum}
                  onChange={(courseCurriculum) => setValues((v) => ({ ...v, courseCurriculum }))}
                />
              </Field>
            ) : null}

            {values.layoutTemplate === "CUSTOM" ? (
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                Custom layout: use the page content field below for your full HTML. Optional blocks
                (FAQs, schedule, mentors) still render if you fill them.
              </p>
            ) : null}

            <div className="rounded-lg border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-950/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Pricing &amp; enrolment
              </p>

              <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
                <input
                  type="checkbox"
                  checked={values.courseIsFree}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      courseIsFree: e.target.checked,
                      priceInr: e.target.checked ? "" : v.priceInr
                    }))
                  }
                  className="rounded border-stone-300 text-amber-600"
                />
                Free course (no online payment)
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Price (INR, GST inclusive)">
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={values.courseIsFree}
                    value={values.priceInr}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        priceInr: sanitizeNonNegativeInput(e.target.value)
                      }))
                    }
                    placeholder={values.courseIsFree ? "Free" : "e.g. 4999"}
                    className={inputClass}
                  />
                </Field>
                <Field label="Price (USD, optional)">
                  <input
                    type="text"
                    inputMode="decimal"
                    disabled={values.courseIsFree}
                    value={values.priceUsd}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        priceUsd: sanitizeNonNegativeInput(e.target.value)
                      }))
                    }
                    placeholder="Optional"
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="How can people join?">
                <select
                  value={values.enrollmentMode}
                  onChange={(e) => setValues((v) => ({ ...v, enrollmentMode: e.target.value }))}
                  className={inputClass}
                >
                  <option value="ENQUIRY">Enquiry only (WhatsApp / email)</option>
                  <option value="CHECKOUT">Online payment only</option>
                  <option value="BOTH">Enquiry + online payment</option>
                </select>
              </Field>

              {!values.courseIsFree &&
              (values.enrollmentMode === "CHECKOUT" || values.enrollmentMode === "BOTH") ? (
                <Field label="Checkout product SKU">
                  <input
                    value={values.checkoutVariantSku}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, checkoutVariantSku: e.target.value }))
                    }
                    placeholder="Variant SKU used at Razorpay checkout"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                    Create a hidden catalog product variant in Products admin, then paste its SKU here.
                    Leave empty if you only want enquiries for now.
                  </p>
                </Field>
              ) : null}
            </div>
          </>
        ) : null}

        <Field
          label={
            isCourse
              ? values.layoutTemplate === "SESSIONS"
                ? "Additional page content (optional)"
                : values.layoutTemplate === "CUSTOM"
                  ? "Custom page content (HTML)"
                  : "Page content / description"
              : contentBodyLabel(type)
          }
        >
          {isCourse && values.layoutTemplate === "SESSIONS" ? (
            <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
              Session details belong in the Sessions section above — not here. Use this field only
              for intro text before the session list.
            </p>
          ) : null}
          <textarea
            value={values.body}
            onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
            rows={isCourse && values.layoutTemplate === "CUSTOM" ? 24 : 12}
            className={`${fieldInput} font-mono text-xs`}
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
