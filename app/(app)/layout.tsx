import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { requirePageSession } from "@/lib/auth/page";
import { BottomNav } from "./BottomNav";
import { NAV } from "./nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requirePageSession();
  return (
    <>
      <header className="app-bar">
        <Link href="/" className="app-bar__brand">
          <span className="brand-mark"><Icon name="plane" size={18} /></span>
          ClientPilot
        </Link>
        <nav className="app-bar__links">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="app-bar__link">{n.label}</Link>
          ))}
        </nav>
      </header>
      <main className="wrap">{children}</main>
      <BottomNav />
    </>
  );
}
