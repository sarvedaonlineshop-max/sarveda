"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { fetchMe, type PublicUser } from "@/lib/auth-client";
import { getApiBase } from "@/lib/api";
import { parseApiResponse } from "@/lib/parse-api-response";

type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
};

type Props = {
  slug: string;
};

function formatCommentDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

export function InsightCommentsSection({ slug }: Props) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribeMsg, setSubscribeMsg] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);

  const loginHref = `/login?next=${encodeURIComponent(`/${slug}`)}`;

  useEffect(() => {
    void fetchMe().then((me) => {
      setUser(me);
      if (me?.email) setEmail(me.email);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);
    void fetch(`${getApiBase()}/api/blog/${encodeURIComponent(slug)}/comments`, {
      credentials: "include"
    })
      .then(async (res) => {
        const json = await parseApiResponse<{ comments: CommentItem[]; count: number }>(res);
        if (!json.success) throw new Error(json.error);
        if (!cancelled) setComments(json.data.comments);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function onSubscribe(event: FormEvent) {
    event.preventDefault();
    setSubscribing(true);
    setSubscribeError(null);
    setSubscribeMsg(null);
    try {
      const res = await fetch(`${getApiBase()}/api/blog/${encodeURIComponent(slug)}/comment-subscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });
      const json = await parseApiResponse<{ message: string }>(res);
      if (!json.success) throw new Error(json.error);
      setSubscribeMsg(json.data.message);
    } catch (err) {
      setSubscribeError(err instanceof Error ? err.message : "Could not subscribe.");
    } finally {
      setSubscribing(false);
    }
  }

  async function onPostComment(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setPosting(true);
    setCommentError(null);
    try {
      const res = await fetch(`${getApiBase()}/api/blog/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() })
      });
      const json = await parseApiResponse<{ comment: CommentItem }>(res);
      if (!json.success) throw new Error(json.error);
      setComments((prev) => [json.data.comment, ...prev]);
      setCommentBody("");
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Could not post comment.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <section className="border-t border-brand-cream-dark pt-8">
      <div className="rounded-xl border border-brand-cream-dark bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-brand-cream-dark px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setSubscribeOpen((open) => !open)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-ink"
            aria-expanded={subscribeOpen}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#108967]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            Subscribe
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${subscribeOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {!user && authChecked ? (
            <Link href={loginHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:text-[#108967]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" strokeLinecap="round" />
                <path d="M10 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 12H3" strokeLinecap="round" />
              </svg>
              Login
            </Link>
          ) : null}
        </div>

        {subscribeOpen ? (
          <form onSubmit={(event) => void onSubscribe(event)} className="flex flex-col gap-3 border-b border-brand-cream-dark px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <p className="shrink-0 text-sm text-brand-muted">Notify of</p>
            <div className="min-h-[40px] rounded-md border border-brand-cream-dark bg-brand-cream/40 px-3 py-2 text-sm text-brand-ink">
              new follow-up comments
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="min-h-[40px] flex-1 rounded-md border border-brand-cream-dark bg-white px-3 text-sm text-brand-ink focus:border-[#108967] focus:outline-none focus:ring-2 focus:ring-[#108967]/20"
            />
            <button
              type="submit"
              disabled={subscribing}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#108967] text-white transition-colors hover:bg-[#0d6f54] disabled:opacity-60"
              aria-label="Subscribe"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        ) : null}

        {subscribeMsg ? <p className="px-4 pt-3 text-sm text-[#108967] sm:px-5">{subscribeMsg}</p> : null}
        {subscribeError ? <p className="px-4 pt-3 text-sm text-red-600 sm:px-5">{subscribeError}</p> : null}

        <div className="px-4 py-8 text-center sm:px-5">
          {!authChecked ? (
            <p className="text-sm text-brand-muted">Checking session…</p>
          ) : user ? (
            <form onSubmit={(event) => void onPostComment(event)} className="mx-auto max-w-xl space-y-3 text-left">
              <label htmlFor={`insight-comment-${slug}`} className="block text-sm font-medium text-brand-ink">
                Write a comment
              </label>
              <textarea
                id={`insight-comment-${slug}`}
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                required
                rows={4}
                placeholder="Share your thoughts…"
                className="w-full rounded-lg border border-brand-cream-dark bg-brand-ivory px-3 py-2.5 text-sm text-brand-ink focus:border-[#108967] focus:outline-none focus:ring-2 focus:ring-[#108967]/20"
              />
              {commentError ? (
                <p className="text-sm text-red-600" role="alert">
                  {commentError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={posting}
                className="inline-flex min-h-[42px] items-center justify-center rounded-full bg-[#108967] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0d6f54] disabled:opacity-60"
              >
                {posting ? "Posting…" : "Post comment"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-brand-muted">
              Please{" "}
              <Link href={loginHref} className="font-semibold text-[#108967] underline-offset-2 hover:underline">
                login
              </Link>{" "}
              to comment
            </p>
          )}
        </div>

        <div className="border-t border-brand-cream-dark px-4 py-4 sm:px-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-ink">
            {loadingComments ? "…" : `${comments.length} COMMENT${comments.length === 1 ? "" : "S"}`}
          </p>
          <div className="mt-1 h-0.5 w-16 bg-[#108967]" />

          {comments.length > 0 ? (
            <ul className="mt-5 space-y-4">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-lg border border-brand-cream-dark/80 bg-brand-cream/30 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-brand-ink">{comment.authorName}</p>
                    <p className="text-xs text-brand-muted">{formatCommentDate(comment.createdAt)}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-brand-ink/85">{comment.body}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
