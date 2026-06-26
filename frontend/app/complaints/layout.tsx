import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1e3a2f",
};

export const metadata: Metadata = {
  title: "Sarveda Tasks",
  description: "Internal task manager",
  manifest: "/complaints-manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sarveda Tasks",
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
      background: "#fdf6ed",
      position: "relative",
    }}>
      {children}
    </div>
  );
}
