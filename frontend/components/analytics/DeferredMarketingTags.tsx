"use client";

import { useEffect } from "react";

type Props = {
  gtmId?: string;
  metaPixelId?: string;
  ga4Id?: string;
  googleAdsId?: string;
};

function injectScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function injectInline(id: string, code: string) {
  if (document.getElementById(id)) return;
  const s = document.createElement("script");
  s.id = id;
  s.text = code;
  document.head.appendChild(s);
}

function bootGtm(gtmId: string) {
  injectInline(
    "sarveda-gtm-boot",
    `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`
  );
}

function bootMeta(pixelId: string) {
  injectInline(
    "sarveda-meta-boot",
    `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${pixelId}');fbq('track','PageView');`
  );
}

function bootGa(ga4Id: string, googleAdsId?: string) {
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`, "sarveda-ga4-src");
  injectInline(
    "sarveda-ga4-boot",
    `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${ga4Id}',{page_path:window.location.pathname});
${googleAdsId ? `gtag('config','${googleAdsId}');` : ""}`
  );
}

/**
 * Load marketing tags after first paint / idle so they do not own mobile TBT/LCP.
 * fbq still queues calls, so Purchase on order-confirmed remains safe.
 */
export function DeferredMarketingTags({ gtmId, metaPixelId, ga4Id, googleAdsId }: Props) {
  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = () => {
      if (cancelled) return;
      if (gtmId) bootGtm(gtmId);
      if (metaPixelId) bootMeta(metaPixelId);
      if (ga4Id) bootGa(ga4Id, googleAdsId);
    };

    const schedule = () => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(() => run(), { timeout: 2500 });
      } else {
        timer = setTimeout(run, 1200);
      }
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      cancelled = true;
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timer) clearTimeout(timer);
    };
  }, [gtmId, metaPixelId, ga4Id, googleAdsId]);

  return null;
}
