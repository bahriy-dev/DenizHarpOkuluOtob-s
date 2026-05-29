import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Deniz Harp Okulu • Otobüs Kalkış Saatleri",
  description:
    "İstanbul Tuzla - Deniz Harp Okulu durağı canlı otobüs kalkış takip ekranı. Gerçek zamanlı sefer saatleri ve geri sayım.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DHO Otobüs",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${inter.variable} dark h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh bg-[#0a0a0a] text-white font-[family-name:var(--font-inter)]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
