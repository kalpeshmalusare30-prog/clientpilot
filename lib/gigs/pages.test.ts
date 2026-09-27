import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/page", () => ({ requirePageSession: async () => {} }));
// GigPanel calls useRouter(), which needs a mounted app router; everything else in next/navigation stays real.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {}, push() {} }),
}));

import GigsPage from "@/app/(app)/gigs/page";
import GigPage from "@/app/(app)/gigs/[id]/page";
import { GigPanel } from "@/app/(app)/gigs/[id]/GigPanel";
import { MAX_PROPOSAL_CHARS } from "@/lib/ai/proposal";
import { GIG_LIST_CAP } from "@/lib/gigs/view";
import { toParam } from "@/lib/ids";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { Gig, LeadState } from "@/lib/types";

type El = ReactElement<{ children?: ReactNode; className?: string; href?: string } & Record<string, unknown>>;

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

const hasClass = (el: El, c: string) => String(el.props.className ?? "").split(/\s+/).includes(c);

const gig = (id: string, over: Partial<Gig> = {}): Gig => ({
  id,
  source: "freelancer.com",
  title: `Gig ${id}`,
  desc: "Build a dashboard",
  url: "https://www.freelancer.com/projects/x",
  date: "2026-09-27T00:00:00.000Z",
  budget: "₹12500–₹37500",
  tags: [],
  extra: "40 bids",
  score: 14,
  fetchedAt: "2026-09-27T01:30:00.000Z",
  ...over,
});
const st = (status: LeadState["status"]): LeadState => ({ kind: "gig", status, updatedAt: "2026-09-27T00:00:00.000Z" });

async function seed(items: Gig[], state: Record<string, LeadState> = {}) {
  const s = createStore(new MemoryBackend());
  await s.mutateGigs((g) => ({ ...g, items }));
  await s.mutateData((d) => ({ ...d, state }));
  setStoreForTests(s);
}

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("Gigs list page", () => {
  beforeEach(() =>
    seed([gig("freelancer.com:1"), gig("freelancer.com:2"), gig("remotive:3", { source: "remotive", budget: "" })], {
      "freelancer.com:2": st("sent"),
    }));

  it("lists the chosen filter and marks its chip active", async () => {
    const tree = await GigsPage({ searchParams: Promise.resolve({ f: "sent" }) });
    const rows = [...walk(tree)].filter((el) => hasClass(el, "list-row"));
    expect(rows.map((r) => r.props.href)).toEqual([`/gigs/${toParam("freelancer.com:2")}`]);
    const active = [...walk(tree)].filter((el) => hasClass(el, "chip--active"));
    expect(active.map((c) => c.props.href)).toEqual(["/gigs?f=sent"]);
  });

  it("shows source, budget, age and score in full: the row meta wraps instead of cutting the score off", async () => {
    const tree = await GigsPage({ searchParams: Promise.resolve({}) });
    const metas = [...walk(tree)].filter((el) => hasClass(el, "list-row__meta"));
    expect(metas).toHaveLength(2);
    for (const m of metas) expect(hasClass(m, "list-row__meta--wrap")).toBe(true);
    expect(text(metas[0]!.props.children)).toMatch(/^freelancer\.com · ₹12500–₹37500 · \d+[mhd] · score 14 · 40 bids$/);
    expect(text(metas[1]!.props.children)).toContain("remotive · no budget");
  });

  it("says when the list is cut at the cap", async () => {
    await seed(Array.from({ length: GIG_LIST_CAP + 10 }, (_, i) => gig(`freelancer.com:${i + 1}`)));
    const tree = await GigsPage({ searchParams: Promise.resolve({ f: "new" }) });
    expect([...walk(tree)].filter((el) => hasClass(el, "list-row"))).toHaveLength(GIG_LIST_CAP);
    const note = [...walk(tree)].find((el) => hasClass(el, "note"));
    expect(note).toBeDefined();
    expect(text(note!.props.children)).toContain(String(GIG_LIST_CAP));
    expect(text(note!.props.children)).toContain(String(GIG_LIST_CAP + 10));
  });
});

describe("Gig detail page", () => {
  beforeEach(() =>
    seed([gig("freelancer.com:1"), gig("remotive:9", { source: "remotive", url: "javascript:alert(document.cookie)", budget: "$250–$750" })]));

  const open = (param: string) => GigPage({ params: Promise.resolve({ id: param }) });
  const panelOf = (tree: ReactNode) => [...walk(tree)].find((el) => el.type === GigPanel) as ReactElement<ComponentProps<typeof GigPanel>> | undefined;

  it("404s for a malformed or unknown id instead of throwing a 500", async () => {
    await expect(open("!!!")).rejects.toMatchObject(NOT_FOUND);
    await expect(open(toParam("freelancer.com:404"))).rejects.toMatchObject(NOT_FOUND);
  });

  it("hands the panel the proposal limit and a Freelancer gig's link", async () => {
    const panel = panelOf(await open(toParam("freelancer.com:1")));
    expect(panel?.props).toMatchObject({
      id: "freelancer.com:1",
      maxChars: MAX_PROPOSAL_CHARS,
      isFreelancer: true,
      url: "https://www.freelancer.com/projects/x",
      defaultCurrency: "INR",
    });
  });

  it("never turns a non-http gig URL into a link", async () => {
    const panel = panelOf(await open(toParam("remotive:9")));
    expect(panel?.props).toMatchObject({ url: "", isFreelancer: false, defaultCurrency: "USD" });
  });
});

describe("GigPanel", () => {
  const base: ComponentProps<typeof GigPanel> = {
    id: "freelancer.com:1",
    param: toParam("freelancer.com:1"),
    url: "https://www.freelancer.com/projects/x",
    isFreelancer: true,
    initialProposal: "",
    status: "new",
    defaultCurrency: "INR",
    maxChars: 1500,
  };
  const html = (p: Partial<ComponentProps<typeof GigPanel>> = {}) => renderToStaticMarkup(createElement(GigPanel, { ...base, ...p }));

  it("flags an over-limit proposal clearly, not only in the counter colour", () => {
    const over = html({ initialProposal: "x".repeat(1612) });
    expect(over).toContain("1612/1500");
    expect(over).toContain("counter--over");
    expect(over).toMatch(/role="alert"[^>]*>[^<]*112/);

    const fine = html({ initialProposal: "x".repeat(1500) });
    expect(fine).toContain("1500/1500");
    expect(fine).not.toContain("counter--over");
    expect(fine).not.toContain('role="alert"');
  });

  it("offers Live check and 'Open in Freelancer' only for Freelancer gigs", () => {
    const fl = html();
    expect(fl).toContain("Live check");
    expect(fl).toMatch(/<a [^>]*href="https:\/\/www\.freelancer\.com\/projects\/x"[^>]*>Open in Freelancer<\/a>/);

    const other = html({ isFreelancer: false, url: "https://remotive.com/job/1" });
    expect(other).not.toContain("Live check");
    expect(other).not.toContain("Open in Freelancer");
    expect(other).toMatch(/<a [^>]*href="https:\/\/remotive\.com\/job\/1"[^>]*>Open post<\/a>/);
  });

  it("renders no link at all when the gig has no usable URL", () => {
    expect(html({ url: "" })).not.toContain("<a ");
  });

  it("uses the spec's button names", () => {
    const h = html();
    for (const label of ["AI proposal lihi", "Copy", "Open in Freelancer", "Bid kela", "Skip"]) expect(h).toContain(label);
  });
});

describe("Gig detail at phone width", () => {
  const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
  const additions = css.slice(css.indexOf("/* ---- ClientPilot additions ---- */"));

  it("breaks long unbroken words (URLs) in the gig title and description instead of widening the page", () => {
    expect(additions).toMatch(/\.page-title\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(additions).toMatch(/\.desc\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it("keeps the toast inside the viewport", () => {
    expect(additions).toMatch(/\.toast\s*\{[^}]*max-width:\s*calc\(100vw - 32px\)/);
  });
});
