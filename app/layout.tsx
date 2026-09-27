import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SwRegister } from "./SwRegister";

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
  themeColor: "#0a0f1c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
