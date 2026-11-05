"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AccordionRichEditor } from "@/components/admin/AccordionRichEditor";
import { ContentImageUpload } from "@/components/admin/ContentImageUpload";
import { ContentVideoUpload } from "@/components/admin/ContentVideoUpload";
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
  suggestMentorSeo,
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
import { revalidatePublicContent } from "@/lib/revalidate-public-content";

type Props = {
  type: AdminContentType;
  itemId?: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-[var(--admin-input-border,#e0d8ce)] bg-[var(--admin-input-bg,#fff)] px-3 py-2 text-sm text-[var(--admin-text,#2c2420)] transition-colors duration-150 focus:border-[#b98a3e] focus:ring-1 focus:ring-[rgba(185,138,62,0.15)] dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-[var(--admin-label,#4a3728)]";

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
  const [saveBarReady, setSaveBarReady] = useState(false);
  const [saveOkOpen, setSaveOkOpen] = useState(false);

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

  useEffect(() => {
    setSaveBarReady(true);
  }, []);

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
        void revalidatePublicContent(type, String(item.slug ?? values.slug));
        router.push(`/admin/content/${type}/${item.id as string}`);
      } else {
        await updateAdminContent(type, itemId!, payload);
        void revalidatePublicContent(type, values.slug);
        setSaveOkOpen(true);
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

  async function fillMentorSeoWithAi() {
    if (type !== "mentors") return;
    setSeoAiLoading(true);
    setSeoAiNote(null);
    setErr(null);
    try {
      const data = await suggestMentorSeo({
        name: values.title.trim(),
        slug: values.slug.trim(),
        description: values.body.trim(),
        expertise: values.expertise.trim()
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
      await revalidatePublicContent(type, values.slug);
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

  const fieldInput = inputClass;
  const formClass = "mx-auto w-full max-w-[1680px] space-y-5 pb-32 font-sans";
  const cardClass =
    "space-y-4 rounded-xl border border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-card-bg,#fff)] p-6 shadow-[0_2px_12px_rgba(44,36,32,0.06)] dark:border-stone-700 dark:bg-stone-900";

  return (
    <form id="admin-content-form" onSubmit={(e) => void onSubmit(e)} className={formClass}>
      <div>
        <Link
          href={
            isCourse
              ? "/admin/content?type=courses"
              : type === "events"
                ? "/admin/content?type=events"
                : `/admin/content?type=${type}`
          }
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#b98a3e] hover:underline dark:text-amber-400"
        >
          <ChevronLeft size={14} aria-hidden />
          {label}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--admin-text,#2c2420)] dark:text-stone-100">
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

      <div className={cardClass} style={{ borderTop: "3px solid #b98a3e" }}>
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
          <div className="flex items-center gap-2">
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
            <span
              className={`text-xs ${
                values.status.toUpperCase() === "PUBLISHED"
                  ? "text-emerald-600"
                  : "text-amber-600"
              }`}
              aria-hidden
            >
              ●
            </span>
          </div>
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
              label="Page background"
              url={values.imageUrl}
              onUrlChange={(imageUrl) => setValues((v) => ({ ...v, imageUrl }))}
              folder="courses"
              preview="wide"
              hint="Wide banner at the top of the course page · JPEG, PNG or WebP · max 10MB"
            />
            <ContentImageUpload
              label="Poster"
              url={values.posterUrl}
              onUrlChange={(posterUrl) => setValues((v) => ({ ...v, posterUrl }))}
              folder="courses"
              preview="square"
              hint="Square card on the courses list and when sharing the link · JPEG, PNG or WebP · max 10MB"
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
                <option value="SESSIONS">Sessions — multi-session programme (session cards)</option>
                <option value="CURRICULUM">Modules — topic breakdown (Yoga Therapy style)</option>
                <option value="CUSTOM">Custom — full page in HTML below</option>
                <option value="STANDARD">Simple overview (legacy import)</option>
              </select>
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
                {values.layoutTemplate === "SESSIONS"
                  ? "Add each session below. Dates, venue and timings go in session fields — not the schedule table."
                  : values.layoutTemplate === "CURRICULUM"
                    ? "Overall course price is set under Pricing. Module prices are optional reference breakdown only."
                    : values.layoutTemplate === "CUSTOM"
                      ? "Build the page body in HTML. Teachers, pricing sidebar, and optional FAQs still appear on the live page."
                      : "Short overview + main description. For new courses prefer Sessions or Custom."}
              </p>
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

            <ContentVideoUpload
              url={values.videoUrl}
              onUrlChange={(videoUrl) => setValues((v) => ({ ...v, videoUrl }))}
              posterUrl={values.posterUrl || values.imageUrl}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mode">
                <input
                  value={values.courseMode}
                  onChange={(e) => setValues((v) => ({ ...v, courseMode: e.target.value }))}
                  placeholder="Online / In-person"
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

            {values.layoutTemplate === "SESSIONS" ? (
              <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50/70 p-4 dark:border-stone-700 dark:bg-stone-950/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Location</p>
                <p className="text-xs text-stone-500">
                  Photo, title, and map/link. Shoppers click the photo to open the location URL.
                </p>
                <ContentImageUpload
                  label="Location photo"
                  url={values.courseVenueImageUrl}
                  onUrlChange={(courseVenueImageUrl) => setValues((v) => ({ ...v, courseVenueImageUrl }))}
                  folder="courses"
                  preview="wide"
                  hint="JPEG, PNG or WebP · max 10MB"
                />
                <Field label="Location title">
                  <input
                    value={values.courseVenue}
                    onChange={(e) => setValues((v) => ({ ...v, courseVenue: e.target.value }))}
                    placeholder="e.g. Mysore ashram"
                    className={inputClass}
                  />
                </Field>
                <Field label="Location URL">
                  <input
                    value={values.courseVenueUrl}
                    onChange={(e) => setValues((v) => ({ ...v, courseVenueUrl: e.target.value }))}
                    placeholder="https://maps.google.com/…"
                    className={inputClass}
                  />
                </Field>
              </div>
            ) : (
              <Field label="Venue / location">
                <input
                  value={values.courseVenue}
                  onChange={(e) => setValues((v) => ({ ...v, courseVenue: e.target.value }))}
                  placeholder="Zoom, Rishikesh…"
                  className={inputClass}
                />
              </Field>
            )}

            {values.layoutTemplate !== "CUSTOM" ? (
              <Field label="About the course">
                <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
                  Narrative overview — what the programme is about. Distinct from &quot;What&apos;s
                  included&quot; (deliverables list).
                </p>
                <AccordionRichEditor
                  variant="full"
                  value={values.aboutTheCourse}
                  onChange={(aboutTheCourse) => setValues((v) => ({ ...v, aboutTheCourse }))}
                  placeholder="Overview, headings, lists, links…"
                />
              </Field>
            ) : null}

            {values.layoutTemplate !== "CUSTOM" ? (
              <Field label="What&apos;s included">
                <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
                  Bullet list of materials, access, certificates, etc. — not the course story.
                </p>
                <AccordionRichEditor
                  variant="full"
                  value={values.courseIncludes}
                  onChange={(courseIncludes) => setValues((v) => ({ ...v, courseIncludes }))}
                  placeholder="Materials, access, certificates…"
                />
              </Field>
            ) : null}

            {values.layoutTemplate === "STANDARD" || values.layoutTemplate === "CUSTOM" ? (
              <Field label="Schedule / intake rows">
                <p className="mb-2 text-xs text-stone-500 dark:text-stone-400">
                  Optional batch dates when not using session or module dates.
                </p>
                <CourseScheduleFields
                  rows={values.courseSchedule}
                  onChange={(courseSchedule) => setValues((v) => ({ ...v, courseSchedule }))}
                />
              </Field>
            ) : null}

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
                Custom layout: use the page content field below for your full HTML. Teachers appear
                last on the live page. Investment sidebar is always shown.
              </p>
            ) : null}

            <div
              className="rounded-lg p-4 dark:border-stone-700 dark:bg-stone-950/40"
              style={{
                background: "linear-gradient(135deg, #faf9f6, #f5f1e8)",
                border: "1px solid #e8e2d9",
                borderRadius: "12px",
                borderLeft: "3px solid #b98a3e"
              }}
            >
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
                <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                  A hidden checkout product (5% GST) is created automatically when you save — no SKU
                  needed. SKU:{" "}
                  {values.checkoutVariantSku.trim() ? (
                    <span className="font-mono">{values.checkoutVariantSku}</span>
                  ) : (
                    <span className="italic">assigned on save</span>
                  )}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        {isCourse && values.layoutTemplate === "SESSIONS" ? null : (
        <Field
          label={
            isCourse
              ? values.layoutTemplate === "CUSTOM"
                ? "Custom page content (HTML)"
                : "Page content / description"
              : contentBodyLabel(type)
          }
        >
          <textarea
            value={values.body}
            onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
            rows={isCourse && values.layoutTemplate === "CUSTOM" ? 24 : 12}
            className={`${fieldInput} font-mono text-xs`}
            placeholder="HTML or plain text"
          />
        </Field>
        )}
      </div>

      <div
        className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-[0_2px_12px_rgba(44,36,32,0.06)] dark:border-stone-700 dark:bg-stone-900"
        style={{ borderTop: "3px solid rgba(185,138,62,0.3)" }}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          SEO
        </h2>

        {type === "courses" || type === "mentors" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50/80 px-4 py-3 dark:border-stone-700 dark:bg-stone-950/40">
            <p className="text-sm text-stone-600 dark:text-stone-400">
              AI fills SEO title, meta description, and focus keyword (tuned to pass the checklist
              below).
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={seoAiLoading || !values.title.trim()}
                onClick={() =>
                  void (type === "courses" ? fillCourseSeoWithAi() : fillMentorSeoWithAi())
                }
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-gradient-to-r from-[#1c352a] to-[#2d5040] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
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

        {seoAiNote && (type === "courses" || type === "mentors") ? (
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
        {type === "blog" || type === "courses" || type === "mentors" ? (
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

        {type === "mentors" ? (
          <SeoAnalysisPanel
            seoTitle={values.seoTitle}
            seoDescription={values.seoDescription}
            seoKeyword={values.seoKeyword}
            itemName={values.title}
            itemDescription={values.expertise || values.body}
            slug={values.slug}
            serpPath="mentor"
            itemLabel="mentor"
          />
        ) : null}
      </div>

      {saveBarReady
        ? createPortal(
            <>
              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] md:left-[240px]">
                <div
                  className="pointer-events-auto border-t border-[var(--admin-card-border,#e0d8ce)] bg-[var(--admin-page-bg,#f7f3eb)]/95 px-4 py-3 shadow-[0_-8px_24px_rgba(44,36,32,0.08)] backdrop-blur dark:border-stone-700 dark:bg-stone-950/95 md:px-8"
                  style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
                >
                  <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-end gap-3">
                    {!isNew ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void onDelete()}
                        className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 transition-colors duration-150 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Deactivate
                      </button>
                    ) : null}
                    <Link
                      href={`/admin/content?type=${type}`}
                      className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:text-stone-200"
                    >
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      form="admin-content-form"
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-[#fffbf5] transition-all duration-150 disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, #1c352a, #2d5040)",
                        boxShadow: "0 2px 8px rgba(28,53,42,0.25)"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = "0 4px 14px rgba(28,53,42,0.35)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = "0 2px 8px rgba(28,53,42,0.25)";
                      }}
                    >
                      {saving ? (
                        <>
                          <span
                            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                            aria-hidden
                          />
                          Saving…
                        </>
                      ) : isNew ? (
                        "Create"
                      ) : (
                        "Save changes"
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {saveOkOpen ? (
                <div
                  className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="admin-save-ok-title"
                >
                  <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-[0_18px_50px_rgba(44,36,32,0.22)]">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" aria-hidden />
                      <div>
                        <p
                          id="admin-save-ok-title"
                          className="text-base font-semibold text-stone-900"
                        >
                          Changes saved successfully
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-stone-600">
                          Changes may take 2 to 3 minutes to reflect in frontend
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-[#fffbf5]"
                      style={{ background: "linear-gradient(135deg, #1c352a, #2d5040)" }}
                      onClick={() => setSaveOkOpen(false)}
                    >
                      OK
                    </button>
                  </div>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
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
      <label className={`block ${labelClass}`}>
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}
