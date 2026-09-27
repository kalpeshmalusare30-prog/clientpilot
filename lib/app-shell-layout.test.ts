import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/page", () => ({ requirePageSession: async () => {} }));

import TodayPage from "@/app/(app)/page";
import LoginPage from "@/app/login/page";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

type El = ReactElement<{ children?: ReactNode; style?: CSSProperties; className?: string; href?: string }>;

function* walk(node: ReactNode): Generator<El> {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n as ReactNode);
    return;
  }
  if (!isValidElement(node)) return;
  const el = node as El;
  yield el;
  yield* walk(el.props.children);
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => text(n as ReactNode)).join("");
  if (isValidElement(node)) return text((node as El).props.children);
  return "";
}

const hasClass = (el: El, c: string) => (el.props.className ?? "").split(/\s+/).includes(c);

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
const additions = css.slice(css.indexOf("/* ---- ClientPilot additions ---- */"));
/** Declarations of every rule in the ClientPilot additions whose selector is exactly `selector`. */
const rulesFor = (selector: string) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...additions.matchAll(new RegExp(`(?:^|[}\\s])${esc}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]!);
};

describe("Aaj Gigs row at phone width (T11-1)", () => {
  beforeEach(async () => {
    const s = createStore(new MemoryBackend());
    await s.mutateGigs((g) => ({
      ...g,
      lastRun: { at: "2026-09-28T01:32:00.000Z", added: 12, failed: ["weworkremotely", "freelancer.com"] },
    }));
    setStoreForTests(s);
  });

  it("lets the text column shrink and the meta wrap, so every failed source shows without widening the page", async () => {
    const tree = await TodayPage();
    const row = [...walk(tree)].find((el) => el.props.href === "/gigs?f=new");
    expect(row).toBeDefined();
    const col = [...walk(row!.props.children)][0]!;
    // A flex item defaults to min-width:auto (its min-content width); without minWidth:0 a long meta line widens the page.
    expect(col.props.style).toMatchObject({ flex: 1, minWidth: 0 });

    const meta = [...walk(col.props.children)].find((el) => hasClass(el, "list-row__meta"));
    expect(meta).toBeDefined();
    expect(text(meta!.props.children)).toContain("failed: weworkremotely, freelancer.com");
    // The meta must wrap instead of being cut off with an ellipsis (spec: Aaj shows "sources failed: …").
    expect(hasClass(meta!, "list-row__meta--wrap")).toBe(true);
    const wrap = rulesFor(".list-row__meta.list-row__meta--wrap").join(";");
    expect(wrap).toMatch(/white-space:\s*normal/);
    expect(wrap).toMatch(/overflow-wrap:\s*anywhere/);
    expect(wrap).toMatch(/max-width:\s*none/);
  });
});

describe("iOS safe area under black-translucent status bar (T11-2)", () => {
  it("pads the sticky app bar below the status bar at every width", () => {
    const rules = rulesFor(".app-bar");
    const inset = /padding-top:\s*max\(\s*\d+px\s*,\s*env\(safe-area-inset-top\)\s*\)/;
    // One rule for the ReelPilot desktop padding (14px) and one for its <=640px padding (12px).
    expect(rules.filter((r) => inset.test(r)).length).toBeGreaterThanOrEqual(2);
    expect(additions).toMatch(/@media \(max-width: 640px\)\s*\{\s*\.app-bar\s*\{\s*padding-top:\s*max\(12px,\s*env\(safe-area-inset-top\)\)/);
    // No later rule may reset the padding without the inset.
    for (const r of rules) if (/padding(-top)?\s*:/.test(r)) expect(r).toMatch(inset);
  });

  it("pads the login page below the status bar", () => {
    const main = [...walk(LoginPage())].find((el) => el.type === "main");
    expect(main).toBeDefined();
    expect(String(main!.props.style?.paddingTop ?? "")).toMatch(/^max\(.+,\s*env\(safe-area-inset-top\)\)$/);
  });
});
