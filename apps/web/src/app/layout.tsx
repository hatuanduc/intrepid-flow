import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import Providers from "../components/providers/Providers";
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
  title: {
    default: "Intrepid",
    template: "%s | Intrepid",
  },
  description: "Intrepid Flow - E-commerce accounting automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiBaseUrl =
    (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:4000').toString().trim();

  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <Script
          id="intrepid-config"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__INTREPID__ = { apiBaseUrl: ${JSON.stringify(apiBaseUrl)} };`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
