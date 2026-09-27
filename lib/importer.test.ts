import { describe, expect, it } from "vitest";
import { A9_FOLLOW_UP, A9_ID, BIDS_FOLLOW_UP, buildImport, importInto } from "./importer";
import { createStore } from "./store";
import { MemoryBackend } from "./store/memory";

const NOW = "2026-09-27T12:00:00.000Z";
const leads = [
  { id: "freelancer.com:40734895", source: "freelancer.com", title: "Freelancing Marketplace with Bidding Feature", desc: "d", url: "https://www.freelancer.com/projects/x", date: "2026-09-26T14:28:02.000Z", budget: "₹12500–₹37500", tags: ["php"], extra: "40 bids", isNew: true, score: 14, proposal: "template text" },
  { id: "remotive:7", source: "remotive", title: "React developer", desc: "", url: "https://remotive.com/x", date: "2026-09-20T00:00:00.000Z", budget: "", tags: [], extra: "", isNew: false, score: 3, proposal: "" },
];
const mapLeads = [
  { id: A9_ID, name: "A9 Digital Prints", area: "Andheri", catKey: "copyshop", catLabel: "print shop", addr: "", waNum: "919322214085", telNum: "", phoneDisplay: "+91 93222 14085", email: "sales@a9digitalprints.com", website: "", social: "", segment: "no_website", whatsapp: "old pitch on Google", email_subject: "old", email_body: "old", isNew: true },
  { id: "node/2", name: "Kalyan Hospital", area: "Kalyan", catKey: "hospital", catLabel: "hospital", addr: "Station Rd", waNum: "", telNum: "912512345678", phoneDisplay: "+91 2512345678", email: "", website: "", social: "", segment: "site_down", evidence: "it is not opening (the server is not responding)", whatsapp: "x", email_subject: "x", email_body: "x", isNew: true },
  { id: "node/3", name: "Hi-Tech Urology Centre", area: "Thane", catKey: "clinic", catLabel: "clinic", addr: "", waNum: "", telNum: "", phoneDisplay: "", email: "uro@example.com", website: "", social: "", segment: "no_website", whatsapp: "x", email_subject: "x", email_body: "x", isNew: true },
];
const hunt = {
  bids: [{ pid: "40734895", proposal: "You need a Job Posting & Bidding MVP…" }],
  warm: { final: { whatsappHinglish: "Namaste! Main Kalpesh…", whatsappEnglish: "Hello!…", emailSubject: "A9 Digital Prints - your free demo website is ready", emailBody: "Hello,…" } },
};
const seen = { "freelancer.com:40734895": "2026-09-26" };

describe("buildImport", () => {
  const { gigs, data } = buildImport({ leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW });

  it("imports gigs without the old dashboard fields, keeping first-seen dates", () => {
    expect(gigs.items).toHaveLength(2);
    const g = gigs.items.find((x) => x.id === "freelancer.com:40734895")!;
    expect(g.fetchedAt).toBe("2026-09-26T00:00:00.000Z");
    expect(gigs.items.find((x) => x.id === "remotive:7")!.fetchedAt).toBe(NOW);
    expect(Object.keys(g)).not.toContain("isNew");
    expect(Object.keys(g)).not.toContain("proposal");
    expect(g.extra).toBe("40 bids");
  });

  it("imports businesses with slugs, templates and fresh honest messages; A9 keeps the approved follow-up", () => {
    const a9 = data.local.find((b) => b.id === A9_ID)!;
    expect(a9).toMatchObject({ slug: "a9-digital-prints", template: "print", emailSubject: "A9 Digital Prints - your free demo website is ready" });
    expect(a9.whatsapp).toBe("Namaste! Main Kalpesh…");
    const hosp = data.local.find((b) => b.id === "node/2")!;
    expect(hosp.template).toBe("general");
    expect(hosp.whatsapp).toContain("https://cp.app/d/kalyan-hospital");
    expect(hosp.whatsapp).not.toMatch(/google/i);
    expect(hosp.evidence).toMatch(/not opening/);
    const uro = data.local.find((b) => b.id === "node/3")!;
    expect(uro.whatsapp).toMatch(/Should I\?/);
    expect(uro.emailSubject).toBe("A free demo website for Hi-Tech Urology Centre");
  });

  it("records the 4 placed bids and the A9 follow-up", () => {
    expect(data.state["freelancer.com:40734895"]).toMatchObject({ kind: "gig", status: "sent", bidAmount: 18000, bidCurrency: "INR", followUpAt: BIDS_FOLLOW_UP, proposal: "You need a Job Posting & Bidding MVP…" });
    expect(data.state["freelancer.com:40695993"]).toMatchObject({ status: "sent", bidAmount: 380, bidCurrency: "USD" });
    expect(Object.values(data.state).filter((s) => s.kind === "gig")).toHaveLength(4);
    expect(data.state[A9_ID]).toMatchObject({ kind: "local", status: "sent", followUpAt: A9_FOLLOW_UP });
    expect(data.state[A9_ID]!.notes).toMatch(/"\?"/);
  });
});

describe("importInto (F-1): merges into what production already holds, never wipes", () => {
  const cronGig = {
    id: "remoteok:99", source: "remoteok", title: "Next.js dev (cron)", desc: "", url: "https://remoteok.com/99", date: "2026-09-27T00:00:00.000Z",
    budget: "", tags: [], extra: "", score: 7, fetchedAt: "2026-09-27T01:30:00.000Z",
  };
  const cronCopyOfBid = { ...cronGig, id: "freelancer.com:40734895", source: "freelancer.com", title: "Cron's copy of the bid gig", score: 20 };
  const lastRun = { at: "2026-09-27T01:30:00.000Z", added: 3, failed: ["remoteok"] };
  const other = {
    id: "node/999", slug: "a9-digital-prints", name: "A9 Digital Prints", area: "Thane", catKey: "copyshop", catLabel: "print shop", addr: "",
    waNum: "919800000000", telNum: "", phoneDisplay: "", email: "", website: "", social: "", segment: "no_website" as const, evidence: "",
    whatsapp: "searched message", emailSubject: "s", emailBody: "b", template: "print" as const, createdAt: "2026-09-27T00:00:00.000Z",
  };

  async function seeded() {
    const store = createStore(new MemoryBackend());
    await store.mutateGigs((d) => ({ ...d, lastRun, items: [cronCopyOfBid, cronGig] }));
    await store.mutateData((d) => ({
      ...d,
      local: [other],
      settings: { ...d.settings, pricing: "my prod pricing" },
      state: {
        "freelancer.com:40734895": { kind: "gig", status: "replied", notes: "they replied", updatedAt: "2026-09-27T02:00:00.000Z" },
        "remoteok:99": { kind: "gig", status: "drafted", proposal: "my draft", updatedAt: "2026-09-27T02:00:00.000Z" },
      },
    }));
    return store;
  }

  it("keeps cron gigs + lastRun, adds only new gigs, sorted by score", async () => {
    const store = await seeded();
    const r = await importInto(store, { leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW });
    const g = await store.readGigs({ fresh: true });
    expect(g.lastRun).toEqual(lastRun);
    expect(g.items.map((x) => x.id)).toEqual(["freelancer.com:40734895", "remoteok:99", "remotive:7"]);
    expect(g.items[0]!.title).toBe("Cron's copy of the bid gig");
    expect(r).toMatchObject({ gigsAdded: 1, gigsTotal: 3 });
  });

  it("keeps existing state, settings and businesses; seeds slugs from them; adds the rest", async () => {
    const store = await seeded();
    const r = await importInto(store, { leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW });
    const d = await store.readData();
    expect(d.state["freelancer.com:40734895"]).toMatchObject({ status: "replied", notes: "they replied" });
    expect(d.state["remoteok:99"]).toMatchObject({ status: "drafted", proposal: "my draft" });
    expect(d.state["freelancer.com:40695993"]).toMatchObject({ status: "sent", bidAmount: 380 });
    expect(d.state[A9_ID]).toMatchObject({ status: "sent", followUpAt: A9_FOLLOW_UP });
    expect(d.settings.pricing).toBe("my prod pricing");
    expect(d.local.find((b) => b.id === "node/999")).toEqual(other);
    const a9 = d.local.find((b) => b.id === A9_ID)!;
    expect(a9.slug).toBe("a9-digital-prints-2");
    expect(new Set(d.local.map((b) => b.slug)).size).toBe(d.local.length);
    expect(d.local).toHaveLength(4);
    expect(r).toMatchObject({ bizAdded: 3, bizTotal: 4 });
  });

  it("is idempotent: a second run adds nothing and changes no stored business", async () => {
    const store = await seeded();
    await importInto(store, { leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW });
    const before = await store.readData();
    const r = await importInto(store, { leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW });
    const after = await store.readData();
    expect(r).toMatchObject({ gigsAdded: 0, bizAdded: 0 });
    expect(after.local.map((b) => b.slug)).toEqual(before.local.map((b) => b.slug));
    expect(after.state).toEqual(before.state);
  });
});

describe("F-7: imported outreach uses the honest builder", () => {
  it("dated site-down wording and no 'you do not have a website' claim", () => {
    const { data } = buildImport({ leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW });
    const hosp = data.local.find((b) => b.id === "node/2")!;
    expect(hosp.auditedAt).toBe("2026-09-19");
    expect(hosp.whatsapp).toMatch(/on 19 Sep and it is not opening/);
    expect(hosp.whatsapp).not.toMatch(/today/);
    expect(hosp.emailSubject).toBe("About the Kalyan Hospital website");
    for (const b of data.local) expect(b.whatsapp).not.toMatch(/do not have a website/);
  });
  it("re-running rebuilds messages of previously imported, never-contacted businesses (slug kept), not contacted ones", async () => {
    const store = createStore(new MemoryBackend());
    const old = buildImport({ leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW }).data;
    const stale = old.local.map((b) => (b.id === A9_ID ? b : { ...b, whatsapp: "noticed you do not have a website yet", slug: `${b.slug}-old` }));
    await store.mutateData((d) => ({ ...d, local: stale, state: { "node/2": { kind: "local", status: "replied", updatedAt: NOW } } }));
    const r = await importInto(store, { leads, mapLeads, hunt, seen, origin: "https://cp.app", now: NOW });
    const d = await store.readData();
    const uro = d.local.find((b) => b.id === "node/3")!;
    expect(uro.slug).toBe("hi-tech-urology-centre-old");
    expect(uro.whatsapp).not.toMatch(/do not have a website/);
    expect(d.local.find((b) => b.id === "node/2")!.whatsapp).toBe("noticed you do not have a website yet");
    expect(d.local.find((b) => b.id === A9_ID)!.whatsapp).toBe("Namaste! Main Kalpesh…");
    expect(r).toMatchObject({ bizAdded: 0, messagesRegenerated: 1 });
  });
});
