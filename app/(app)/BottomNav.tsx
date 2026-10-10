"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NAV } from "./nav";

export function isActive(href: string, path: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function BottomNav() {
  const path = usePathname() ?? "/";
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map((n) => {
        const active = isActive(n.href, path);
        return (
          <Link key={n.href} href={n.href} className={`bottom-nav__item${active ? " bottom-nav__item--active" : ""}`} aria-current={active ? "page" : undefined}>
            <span className="bottom-nav__icon"><Icon name={n.icon} size={21} /></span>
            <span>{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
