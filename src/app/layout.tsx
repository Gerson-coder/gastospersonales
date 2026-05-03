import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kane — Tu plata, clara.",
  description:
    "Tu plata, clara. Captura gastos con foto, entendé en qué se te va el sueldo, sin complicaciones.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Kane",
    statusBarStyle: "default",
  },
  icons: {
    // `icon` array: el browser elige la size que mejor le sirve por
    // contexto (tab favicon, bookmarks, history, etc.). favicon-16/32
    // son específicos para tabs en desktop, los más grandes para
    // bookmarks panel y HD displays.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#015E2C",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${jakarta.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased [overflow-x:clip]`}
    >
      <body className="min-h-full flex flex-col overscroll-none">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
