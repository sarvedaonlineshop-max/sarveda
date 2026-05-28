import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import { CartProvider } from "@/components/cart/CartProvider";
import { Layout } from "@/components/layout/Layout";
import { getSiteUrl, isProductionSite } from "@/lib/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
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
  themeColor: "#0c0a09",
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
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body className={`${inter.className} min-h-screen bg-stone-50 font-sans tracking-wide text-stone-900 antialiased`}>
        <CartProvider>
          <Layout>{children}</Layout>
        </CartProvider>
      </body>
    </html>
  );
}
