import { createElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/page", () => ({ requirePageSession: async () => {} }));
// The panels call useRouter(), which needs a mounted app router; everything else in next/navigation stays real.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {}, push() {} }),
}));
// pageOrigin() reads the request host when VERCEL_PROJECT_PRODUCTION_URL is not set.
const req = vi.hoisted(() => ({ headers: new Headers({ host: "localhost:3107" }) }));
vi.mock("next/headers", () => ({ headers: async () => req.headers }));

import LocalPage from "@/app/(app)/local/page";
import LocalBizPage from "@/app/(app)/local/[id]/page";
import { LocalPanel } from "@/app/(app)/local/[id]/LocalPanel";
import { SearchForm } from "@/app/(app)/local/SearchForm";
import { toParam } from "@/lib/ids";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { LeadState, LocalBiz } from "@/lib/types";

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

const biz = (id: string, over: Partial<LocalBiz> = {}): LocalBiz => ({
  id,
  slug: `biz-${id.replace(/\D/g, "")}`,
  name: `Biz ${id}`,
  area: "Andheri",
  catKey: "dentist",
  catLabel: "dental clinic",
  addr: "",
  waNum: "919876543210",
  telNum: "",
  phoneDisplay: "+91 98765 43210",
  email: "",
  website: "",
  social: "",
  segment: "no_website",
  evidence: "",
  whatsapp: "Hello!",
  emailSubject: "Subject",
  emailBody: "Body",
  template: "dental",
  createdAt: "2026-09-27T00:00:00.000Z",
  ...over,
});
const st = (status: LeadState["status"]): LeadState => ({ kind: "local", status, updatedAt: "2026-09-27T00:00:00.000Z" });

async function seed(local: LocalBiz[], state: Record<string, LeadState> = {}) {
  const s = createStore(new MemoryBackend());
  await s.mutateData((d) => ({ ...d, local, state }));
  setStoreForTests(s);
}

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

describe("Local list page", () => {
  const DOWN = "it shows an error page instead of your business";
  beforeEach(() =>
    seed(
      [
        biz("node/1", { name: "Smile Dental" }),
        biz("node/2", { name: "Down Clinic", segment: "site_down", evidence: DOWN, website: "https://down.example" }),
        biz("node/3", { name: "Won Co" }),
        biz("node/4", { name: "Asha Sent", waNum: "", telNum: "912226543210", phoneDisplay: "+91 2226543210" }),
      ],
      { "node/3": st("won"), "node/4": st("sent") },
    ));

  const labels = (tree: ReactNode) => [...walk(tree)].filter((el) => hasClass(el, "section-label")).map((el) => text(el.props.children));

  it("groups by segment, most urgent first, and hides closed leads until All", async () => {
    const open = await LocalPage({ searchParams: Promise.resolve({}) });
    expect(labels(open)).toEqual(["Site DOWN (1) · website band hai — sabse garam lead", "No website (2) · phone hai, website nahi"]);
    const rows = [...walk(open)].filter((el) => hasClass(el, "list-row"));
    expect(rows.map((r) => r.props.href)).toEqual(["node/2", "node/1", "node/4"].map((id) => `/local/${toParam(id)}`));
    expect([...walk(open)].filter((el) => hasClass(el, "chip--active")).map((c) => c.props.href)).toEqual(["/local"]);

    const all = await LocalPage({ searchParams: Promise.resolve({ show: "all" }) });
    expect(labels(all)[1]).toMatch(/^No website \(3\)/);
    expect([...walk(all)].filter((el) => hasClass(el, "chip--active")).map((c) => c.props.href)).toEqual(["/local?show=all"]);
  });

  it("shows each card's category, area, phone and evidence line in full", async () => {
    const tree = await LocalPage({ searchParams: Promise.resolve({}) });
    const rows = [...walk(tree)].filter((el) => hasClass(el, "list-row"));
    const metasOf = (row: El) => [...walk(row.props.children)].filter((el) => hasClass(el, "list-row__meta"));

    const down = metasOf(rows[0]!);
    expect(down.map((m) => text(m.props.children))).toEqual(["dental clinic · Andheri · +91 98765 43210", DOWN]);
    for (const m of down) expect(hasClass(m, "list-row__meta--wrap")).toBe(true);
    // No empty evidence line for a business the audit said nothing about.
    expect(metasOf(rows[1]!).map((m) => text(m.props.children))).toEqual(["dental clinic · Andheri · +91 98765 43210"]);
    expect([...walk(rows[2]!.props.children)].filter((el) => hasClass(el, "badge")).map((b) => text(b.props.children))).toEqual(["sent"]);
  });

  it("points to the search form when nothing is stored", async () => {
    await seed([]);
    const tree = await LocalPage({ searchParams: Promise.resolve({}) });
    const empty = [...walk(tree)].find((el) => hasClass(el, "empty"));
    expect(text(empty?.props.children)).toContain("Navin shodh");
    expect([...walk(tree)].some((el) => el.type === SearchForm)).toBe(true);
  });
});

describe("Local business page", () => {
  beforeEach(() =>
    seed([
      biz("node/1", { name: "Smile Dental", slug: "smile-dental", email: "hi@smile.example" }),
      biz("node/2", { name: "Landline Co", slug: "landline-co", waNum: "", telNum: "912226543210", phoneDisplay: "+91 2226543210" }),
      biz("way/3", { name: "Mail Only", slug: "mail-only", waNum: "", phoneDisplay: "", email: "a@b.example", website: "javascript:alert(document.cookie)", segment: "social_only" }),
    ]));
  afterEach(() => vi.unstubAllEnvs());

  const open = (param: string) => LocalBizPage({ params: Promise.resolve({ id: param }) });
  const panelOf = (tree: ReactNode) => [...walk(tree)].find((el) => el.type === LocalPanel) as ReactElement<ComponentProps<typeof LocalPanel>> | undefined;

  it("404s for a malformed or unknown id instead of throwing a 500", async () => {
    await expect(open("!!!")).rejects.toMatchObject(NOT_FOUND);
    await expect(open(toParam("node/404"))).rejects.toMatchObject(NOT_FOUND);
  });

  it("links the demo on the production domain, for a business with a mobile number", async () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "clientpilot.example.app");
    const panel = panelOf(await open(toParam("node/1")));
    expect(panel?.props).toMatchObject({
      param: toParam("node/1"),
      phone: "919876543210",
      isMobile: true,
      email: "hi@smile.example",
      demoUrl: "https://clientpilot.example.app/d/smile-dental",
    });
  });

  it("builds the demo link from the request host off Vercel, and flags a landline", async () => {
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const panel = panelOf(await open(toParam("node/2")));
    expect(panel?.props).toMatchObject({ phone: "912226543210", isMobile: false, demoUrl: "http://localhost:3107/d/landline-co" });
  });

  it("offers no demo without a phone (the demo page needs a number) and never turns the OSM website into a link", async () => {
    const tree = await open(toParam("way/3"));
    expect(panelOf(tree)?.props).toMatchObject({ phone: "", demoUrl: null });
    const hrefs = [...walk(tree)].map((el) => el.props.href).filter((h) => h !== undefined);
    expect(hrefs).toEqual(["/local"]);
    expect(text(tree)).toContain("javascript:alert(document.cookie)");
  });
});

describe("LocalPanel", () => {
  const base: ComponentProps<typeof LocalPanel> = {
    param: toParam("node/1"),
    phone: "919876543210",
    isMobile: true,
    email: "",
    whatsapp: "Hello!",
    emailSubject: "Subject",
    emailBody: "Body",
    demoUrl: "https://clientpilot.example.app/d/smile-dental",
  };
  const html = (p: Partial<ComponentProps<typeof LocalPanel>> = {}) => renderToStaticMarkup(createElement(LocalPanel, { ...base, ...p }));

  it("opens and copies the demo, and says why there is none without a phone", () => {
    const h = html();
    expect(h).toMatch(/<a [^>]*href="https:\/\/clientpilot\.example\.app\/d\/smile-dental"[^>]*>Demo bagh<\/a>/);
    expect(h).toContain("Copy demo link");
    const none = html({ demoUrl: null, phone: "" });
    expect(none).not.toContain("<a ");
    expect(none).toContain("Phone number nahi, mhanun demo page nahi.");
  });

  it("uses the spec's WhatsApp button name, and disables it without a number", () => {
    expect(html()).toMatch(/<button[^>]*>WhatsApp var pathav<\/button>/);
    expect(html()).not.toMatch(/<button[^>]*disabled[^>]*>WhatsApp var pathav/);
    expect(html({ phone: "" })).toMatch(/<button[^>]*disabled[^>]*>WhatsApp var pathav/);
  });

  it("warns that a landline may not have WhatsApp", () => {
    expect(html()).not.toContain("landline");
    expect(html({ isMobile: false, phone: "912226543210" })).toContain("Ha landline number ahe");
  });

  it("offers email only when the business has an address", () => {
    expect(html()).not.toContain("Email pathav");
    expect(html({ email: "hi@smile.example" })).toContain("Email pathav");
  });

  it("F-8: a landline gets a Call link instead of WhatsApp", () => {
    const h = html({ isMobile: false, phone: "912226543210" });
    expect(h).not.toContain("WhatsApp var pathav");
    expect(h).toMatch(/<a [^>]*href="tel:\+912226543210"[^>]*>Call kar<\/a>/);
  });
  it("F-8: every lead has a visible way to record contact made outside the app", () => {
    for (const p of [{}, { isMobile: false, phone: "912226543210" }, { phone: "", email: "hi@smile.example" }]) {
      expect(html(p)).toMatch(/<button[^>]*>Contact kela \(sent mark kar\)<\/button>/);
    }
  });
  it("F-11: hides Email pathav for an address that could inject mailto headers", () => {
    expect(html({ email: "shop@x.com?bcc=spy%40evil.com" })).not.toContain("Email pathav");
  });

  it("caps the message at the length the server accepts, so an edit can always be saved", () => {
    expect(html()).toMatch(/<textarea[^>]*maxLength="4000"/);
  });
});

describe("SearchForm", () => {
  it("offers every category and the spec's button name, disabled until an area is typed", () => {
    const h = renderToStaticMarkup(createElement(SearchForm));
    for (const c of CATEGORY_OPTIONS) expect(h).toMatch(new RegExp(`<option value="${c.key}"[^>]*>${c.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</option>`));
    expect(h).toMatch(/<button[^>]*disabled[^>]*>Navin shodh<\/button>/);
  });
});
