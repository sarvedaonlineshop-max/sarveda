import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";

import { CartProvider } from "@/components/cart/CartProvider";
import { MobileCartBar } from "@/components/layout/MobileCartBar";
import { SiteHeader } from "@/components/layout/SiteHeader";

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

export const metadata: Metadata = {
  title: {
    default: "Sarveda",
    template: "%s | Sarveda"
  },
  description:
    "Yoga, meditation, Ayurveda, and sound healing — authentic, sustainable products rooted in Indian wellness."
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
          <SiteHeader />
          <div className="pb-24 md:pb-0">{children}</div>
          <MobileCartBar />
        </CartProvider>
      </body>
    </html>
  );
}
