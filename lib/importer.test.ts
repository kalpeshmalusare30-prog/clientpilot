import { describe, expect, it } from "vitest";
import { A9_FOLLOW_UP, A9_ID, BIDS_FOLLOW_UP, buildImport } from "./importer";

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
