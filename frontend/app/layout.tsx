import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import Script from "next/script";

import { CartProvider } from "@/components/cart/CartProvider";
import { AttributionProvider } from "@/components/attribution/AttributionProvider";
import { LogoutTransitionOverlay } from "@/components/auth/LogoutTransitionOverlay";
import { GtmSpaTracker } from "@/components/analytics/GtmSpaTracker";
import { Layout } from "@/components/layout/Layout";
import { getSiteUrl, isProductionSite } from "@/lib/site";

import "./globals.css";

const isProd = process.env.NODE_ENV === "production";
const ga4Id = process.env.NEXT_PUBLIC_GA4_ID?.trim();
/** Ads Meta Pixel — website-code only (not GTM) to avoid double counting. */
const metaPixelId =
  process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ||
  (isProductionSite() ? "901430008340660" : "");
/** Ads team GTM container — override with NEXT_PUBLIC_GTM_ID if needed. */
const gtmId =
  process.env.NEXT_PUBLIC_GTM_ID?.trim() ||
  (isProductionSite() ? "GTM-N92L9537" : "");
/** Optional Google Ads account for direct conversion (AW-…). */
const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || "";

/** Body / UI — designer: Manrope (was Inter; revert by swapping imports). */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

/** Headings — designer: Cormorant Garamond (was Fraunces; revert by swapping imports). */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap"
});

const defaultOgTitle = "Sarveda — Music, Sound Healing, Yoga & Meditation";
const defaultOgDescription =
  "Authentic music, sound healing, yoga and meditation products rooted in Indian wellness. Ships worldwide.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Sarveda",
    template: "%s | Sarveda"
  },
  description:
    "Music, sound healing, yoga and meditation — authentic, sustainable products rooted in Indian wellness.",
  openGraph: {
    type: "website",
    siteName: "Sarveda",
    title: defaultOgTitle,
    description: defaultOgDescription,
    images: [
      {
        url: "/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "Sarveda — Music, Sound Healing, Yoga & Meditation"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    site: "@sarveda",
    title: defaultOgTitle,
    description:
      "Authentic music, sound healing, yoga and meditation products rooted in Indian wellness.",
    images: ["/og-default.jpg"]
  },
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png?v=sarveda-app-icon-3", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png?v=sarveda-app-icon-3", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png?v=sarveda-app-icon-3", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png?v=sarveda-app-icon-3", sizes: "180x180", type: "image/png" }],
    shortcut: "/favicon.ico?v=sarveda-app-icon-3"
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sarveda Admin"
  }
};

export const viewport: Viewport = {
  themeColor: "#1c352a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable}`}>
      <body className={`${manrope.className} min-h-screen bg-brand-cream font-sans tracking-wide text-brand-ink antialiased`}>
        {gtmId ? (
          <>
            <Script id="google-tag-manager" strategy="beforeInteractive">
              {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
            </Script>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
                height={0}
                width={0}
                style={{ display: "none", visibility: "hidden" }}
                title="Google Tag Manager"
              />
            </noscript>
          </>
        ) : null}
        {isProd && ga4Id ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${ga4Id}', {
                  page_path: window.location.pathname,
                });
                ${
                  googleAdsId
                    ? `gtag('config', '${googleAdsId}');`
                    : ""
                }
              `}
            </Script>
          </>
        ) : null}
        {isProd && !ga4Id && googleAdsId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${googleAdsId}`}
              strategy="afterInteractive"
            />
            <Script id="google-ads-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${googleAdsId}');
              `}
            </Script>
          </>
        ) : null}
        {isProd && metaPixelId ? (
          <>
            {/* beforeInteractive so fbq exists before order-confirmed fires Purchase */}
            <Script id="meta-pixel" strategy="beforeInteractive">
              {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${metaPixelId}');
              fbq('track', 'PageView');
            `}
            </Script>
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height={1}
                width={1}
                style={{ display: "none" }}
                src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        ) : null}
        <CartProvider>
          <AttributionProvider>
            {gtmId || (isProd && ga4Id) ? <GtmSpaTracker /> : null}
            <LogoutTransitionOverlay />
            <Layout>{children}</Layout>
          </AttributionProvider>
        </CartProvider>
      </body>
    </html>
  );
}
