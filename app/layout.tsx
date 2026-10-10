import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { SwRegister } from "./SwRegister";

// Self-hosted by next/font at build time: the phone never calls Google Fonts.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: "ClientPilot",
  description: "Gigs, local clients and follow-ups — from your phone",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "ClientPilot" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eff1f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0d10" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${bricolage.variable}`}>
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
