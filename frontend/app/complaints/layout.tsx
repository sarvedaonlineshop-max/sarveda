import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#075E54",
};

export const metadata: Metadata = {
  title: "Sarveda Task Manager",
  description: "Internal task manager",
  manifest: "/complaints-manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sarveda Task Manager",
  },
  icons: {
    apple: "/brand/sarveda-logo.png",
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
      minHeight: "100dvh",
      background: "#ECE5DD",
      position: "relative",
    }}>
      {children}
    </div>
  );
}
