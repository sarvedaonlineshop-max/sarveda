import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#075E54",
  interactiveWidget: "resizes-content",
};

const complaintsOgTitle = "Sarveda – Sound. Yoga. Conscious Living.";
const complaintsOgDescription =
  "Sound. Yoga. Conscious Living. Authentic wellness · Ships worldwide.";

export const metadata: Metadata = {
  title: "Sarveda Task Manager",
  description: complaintsOgDescription,
  manifest: "/complaints-manifest.json",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Sarveda",
    title: complaintsOgTitle,
    description: complaintsOgDescription,
    images: [
      {
        url: "/og-complaints.jpg",
        width: 1200,
        height: 630,
        alt: "Sarveda – Sound. Yoga. Conscious Living."
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: complaintsOgTitle,
    description: complaintsOgDescription,
    images: ["/og-complaints.jpg"]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sarveda Task Manager",
  },
  icons: {
    apple: "/icons/icon-192.png",
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export default function ComplaintsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      maxWidth: "480px",
      margin: "0 auto",
      height: "100dvh",
      maxHeight: "100dvh",
      overflow: "hidden",
      background: "#ECE5DD",
      position: "relative",
    }}>
      {children}
    </div>
  );
}
