"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export type EnquiryAntiSpamPayload = {
  website: string;
  formOpenedAt: number;
  turnstileToken?: string;
};

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

/**
 * Invisible honeypot + form timing + optional Cloudflare Turnstile.
 * Include `antiSpamPayload()` in every enquiry/contact JSON body.
 */
export function useEnquiryAntiSpam() {
  const formOpenedAt = useRef(Date.now());
  const [turnstileToken, setTurnstileToken] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const widgetHostId = useId();
  const widgetIdRef = useRef<string | null>(null);

  const resetTurnstile = useCallback(() => {
    setTurnstileToken("");
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (!SITE_KEY || !scriptReady) return;
    const el = document.getElementById(widgetHostId);
    if (!el || !window.turnstile || widgetIdRef.current) return;
    try {
      widgetIdRef.current = window.turnstile.render(el, {
        sitekey: SITE_KEY,
        callback: (token) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
        theme: "light"
      });
    } catch {
      /* ignore render races */
    }
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [scriptReady, widgetHostId]);

  function antiSpamPayload(): EnquiryAntiSpamPayload {
    return {
      website: "",
      formOpenedAt: formOpenedAt.current,
      ...(turnstileToken ? { turnstileToken } : {})
    };
  }

  const fields = (
    <>
      {/* Honeypot — hidden from humans; bots that auto-fill trip the backend. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>
      {SITE_KEY ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onLoad={() => setScriptReady(true)}
          />
          <div id={widgetHostId} className="my-2" />
        </>
      ) : null}
    </>
  );

  return {
    fields,
    antiSpamPayload,
    resetTurnstile,
    turnstileRequired: Boolean(SITE_KEY),
    turnstileReady: !SITE_KEY || Boolean(turnstileToken)
  };
}
