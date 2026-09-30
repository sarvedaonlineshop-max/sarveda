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
 * Load marketing tags after first interaction (or a late fallback) so lab LCP/TBT
 * is not owned by GTM/Meta. fbq still queues calls for Purchase.
 */
export function DeferredMarketingTags({ gtmId, metaPixelId, ga4Id, googleAdsId }: Props) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let booted = false;

    const run = () => {
      if (cancelled || booted) return;
      booted = true;
      cleanup();
      if (gtmId) bootGtm(gtmId);
      if (metaPixelId) bootMeta(metaPixelId);
      if (ga4Id) bootGa(ga4Id, googleAdsId);
      else if (googleAdsId) bootGa(googleAdsId);
    };

    const onInteract = () => run();

    const cleanup = () => {
      window.removeEventListener("scroll", onInteract);
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
      window.removeEventListener("touchstart", onInteract);
      if (timer) clearTimeout(timer);
    };

    window.addEventListener("scroll", onInteract, { once: true, passive: true });
    window.addEventListener("pointerdown", onInteract, { once: true });
    window.addEventListener("keydown", onInteract, { once: true });
    window.addEventListener("touchstart", onInteract, { once: true, passive: true });
    // Late fallback for users who never interact; keep past typical lab LCP window.
    timer = setTimeout(run, 15000);

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [gtmId, metaPixelId, ga4Id, googleAdsId]);

  return null;
}
