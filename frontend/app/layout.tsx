import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import Script from "next/script";

import { CartProvider } from "@/components/cart/CartProvider";
import { AttributionProvider } from "@/components/attribution/AttributionProvider";
import { LogoutTransitionOverlay } from "@/components/auth/LogoutTransitionOverlay";
import { Layout } from "@/components/layout/Layout";
import { getSiteUrl, isProductionSite } from "@/lib/site";

import "./globals.css";

const isProd = process.env.NODE_ENV === "production";
const ga4Id = process.env.NEXT_PUBLIC_GA4_ID?.trim();
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

/** Body / UI — designer: Manrope (was Inter; revert by swapping imports). */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

/** Headings — designer: Cormorant Garamond (was Fraunces; revert by swapping imports). */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap"
});

const defaultOgTitle = "Sarveda — Yoga, Ayurveda & Sound Healing";
const defaultOgDescription =
  "Authentic yoga, meditation, Ayurveda and sound healing products rooted in Indian wellness. Ships worldwide.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Sarveda",
    template: "%s | Sarveda"
  },
  description:
    "Yoga, meditation, Ayurveda, and sound healing — authentic, sustainable products rooted in Indian wellness.",
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
        alt: "Sarveda — Yoga, Ayurveda & Sound Healing"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    site: "@sarveda",
    title: defaultOgTitle,
    description:
      "Authentic yoga, meditation, Ayurveda and sound healing products rooted in Indian wellness.",
    images: ["/og-default.jpg"]
  },
  robots: isProductionSite() ? { index: true, follow: true } : { index: false, follow: false },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sarveda"
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
              `}
            </Script>
          </>
        ) : null}
        {isProd && metaPixelId ? (
          <Script id="meta-pixel" strategy="afterInteractive">
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
        ) : null}
        <CartProvider>
          <AttributionProvider>
            <LogoutTransitionOverlay />
            <Layout>{children}</Layout>
          </AttributionProvider>
        </CartProvider>
      </body>
    </html>
  );
}
