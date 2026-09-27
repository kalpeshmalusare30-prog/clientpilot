// One-time import of C:\kalpesh\kal\lead-hunter data into the private Blob store.
// It MERGES into what production already holds: stored gigs (cron output), lastRun, lead states, settings and
// businesses all win; only missing gigs/businesses/states are added. Safe to re-run. There is no --force.
// Usage: npm run import -- --origin https://<production domain>
// Dry run (nothing persisted): STORE_BACKEND=memory npx tsx scripts/import.ts --origin https://<domain> [--seed-sample]
//   --seed-sample (memory only) first fills the empty memory store with a cron-like gig, lastRun and a lead state,
//   so the dry run shows that they survive the import.
import { readFileSync } from "node:fs";
import { importInto } from "../lib/importer";
import { createStore } from "../lib/store";
import { BlobBackend } from "../lib/store/blob";
import { MemoryBackend } from "../lib/store/memory";

const args = process.argv.slice(2);
const origin = args[args.indexOf("--origin") + 1];
if (!args.includes("--origin") || !origin?.startsWith("https://")) {
  console.error("Pass --origin https://<production domain> (used for demo links in messages).");
  process.exit(1);
}
if (args.includes("--force")) {
  console.error("--force is gone: the import always merges and never overwrites stored data. Rerun without it.");
  process.exit(1);
}
const memory = process.env.STORE_BACKEND === "memory";
const seedSample = args.includes("--seed-sample");
if (seedSample && !memory) {
  console.error("--seed-sample is only for the memory dry run (STORE_BACKEND=memory).");
  process.exit(1);
}
const LH = new URL("../../lead-hunter/", import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, LH), "utf8"));

const store = createStore(memory ? new MemoryBackend() : new BlobBackend());
const now = new Date().toISOString();

if (seedSample) {
  await store.mutateGigs((d) => ({
    ...d,
    lastRun: { at: "2026-09-28T01:30:00.000Z", added: 3, failed: ["remoteok"] },
    items: [{ id: "sample:cron-1", source: "sample", title: "Cron gig (sample)", desc: "", url: "https://example.com/1", date: now, budget: "", tags: [], extra: "", score: 5, fetchedAt: now }],
  }));
  await store.mutateData((d) => ({
    ...d,
    settings: { ...d.settings, pricing: "sample prod pricing" },
    state: { "sample:cron-1": { kind: "gig", status: "drafted", proposal: "sample draft", updatedAt: now } },
  }));
}

const before = { gigs: await store.readGigs({ fresh: true }), data: await store.readData() };
const r = await importInto(store, {
  leads: read("leads.json"),
  mapLeads: read("map-leads.json"),
  hunt: read("hunts/2026-09-26.json"),
  seen: read("seen.json"),
  origin: origin.replace(/\/+$/, ""),
  now,
});
const after = await store.readData();
console.log(
  `${memory ? "[memory dry run, nothing persisted] " : ""}Before: ${before.gigs.items.length} gigs (lastRun ${before.gigs.lastRun?.at ?? "none"}), ` +
    `${before.data.local.length} businesses, ${Object.keys(before.data.state).length} lead states.`,
);
console.log(
  `After: ${r.gigsTotal} gigs (+${r.gigsAdded}, lastRun ${r.lastRunAt ?? "none"}), ${r.bizTotal} businesses (+${r.bizAdded}, ` +
    `${r.messagesRegenerated} messages rebuilt), ${r.states} lead states.`,
);
if (seedSample) {
  const g = await store.readGigs({ fresh: true });
  console.log(
    `Seeded sample survived: cron gig ${g.items.some((x) => x.id === "sample:cron-1") ? "kept" : "LOST"}, ` +
      `its state ${after.state["sample:cron-1"]?.proposal === "sample draft" ? "kept" : "LOST"}, ` +
      `settings ${after.settings.pricing === "sample prod pricing" ? "kept" : "LOST"}.`,
  );
}
