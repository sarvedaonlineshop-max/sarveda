import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import { DeferredMarketingTags } from "@/components/analytics/DeferredMarketingTags";
import { CartProvider } from "@/components/cart/CartProvider";
import { AttributionProvider } from "@/components/attribution/AttributionProvider";
import { DeferredLogoutOverlay } from "@/components/auth/DeferredLogoutOverlay";
import { GtmSpaTracker } from "@/components/analytics/GtmSpaTracker";
import { Layout } from "@/components/layout/Layout";
import { getSiteUrl, isProductionSite } from "@/lib/site";

import "./globals.css";

const isProd = process.env.NODE_ENV === "production";

/** Ignore empty / placeholder env values like G-XXXXXXXXXX so we never preload junk tags. */
function publicMeasurementId(raw: string | undefined): string {
  const id = raw?.trim() || "";
  if (!id) return "";
  if (/X{4,}/i.test(id) || /placeholder/i.test(id)) return "";
  return id;
}

const ga4Id = publicMeasurementId(process.env.NEXT_PUBLIC_GA4_ID);
/** Ads Meta Pixel — website-code only (not GTM) to avoid double counting. */
const metaPixelId =
  publicMeasurementId(process.env.NEXT_PUBLIC_META_PIXEL_ID) ||
  (isProductionSite() ? "901430008340660" : "");
/** Ads team GTM container — override with NEXT_PUBLIC_GTM_ID if needed. */
const gtmId =
  publicMeasurementId(process.env.NEXT_PUBLIC_GTM_ID) ||
  (isProductionSite() ? "GTM-N92L9537" : "");
/** Optional Google Ads account for direct conversion (AW-…). */
const googleAdsId = publicMeasurementId(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);

/** Body / UI — designer: Manrope (was Inter; revert by swapping imports). */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

/** Headings — designer: Cormorant Garamond (was Fraunces; revert by swapping imports). */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
  // Body/LCP image first — heading font can swap in without blocking hero paint.
  preload: false
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
  const marketingEnabled = Boolean(gtmId || (isProd && (ga4Id || metaPixelId || googleAdsId)));

  return (
    <html lang="en" className={`${manrope.variable} ${cormorant.variable}`}>
      <body className={`${manrope.className} min-h-screen bg-brand-cream font-sans tracking-wide text-brand-ink antialiased`}>
        {gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height={0}
              width={0}
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        ) : null}
        {isProd && metaPixelId ? (
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
        ) : null}
        {marketingEnabled ? (
          <DeferredMarketingTags
            gtmId={gtmId || undefined}
            metaPixelId={isProd ? metaPixelId || undefined : undefined}
            ga4Id={isProd ? ga4Id || undefined : undefined}
            googleAdsId={isProd ? googleAdsId || undefined : undefined}
          />
        ) : null}
        <CartProvider>
          <AttributionProvider>
            {gtmId || (isProd && ga4Id) ? <GtmSpaTracker /> : null}
            <DeferredLogoutOverlay />
            <Layout>{children}</Layout>
          </AttributionProvider>
        </CartProvider>
      </body>
    </html>
  );
}
