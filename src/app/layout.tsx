import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lumi — Tu plata, clara.",
  description:
    "Tu plata, clara. Captura gastos con foto, entendé en qué se te va el sueldo, sin complicaciones.",
  manifest: "/manifest.json",
  themeColor: "#10b981",
  appleWebApp: {
    capable: true,
    title: "Lumi",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
