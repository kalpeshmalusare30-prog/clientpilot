// One-time import of C:\kalpesh\kal\lead-hunter data into the private Blob store.
// Usage: npm run import -- --origin https://<production domain> [--force]
// Dry run (nothing persisted): STORE_BACKEND=memory npx tsx scripts/import.ts --origin https://<domain>
import { readFileSync } from "node:fs";
import { buildImport } from "../lib/importer";
import { createStore } from "../lib/store";
import { BlobBackend } from "../lib/store/blob";
import { MemoryBackend } from "../lib/store/memory";

const args = process.argv.slice(2);
const origin = args[args.indexOf("--origin") + 1];
if (!args.includes("--origin") || !origin?.startsWith("https://")) {
  console.error("Pass --origin https://<production domain> (used for demo links in messages).");
  process.exit(1);
}
const force = args.includes("--force");
const memory = process.env.STORE_BACKEND === "memory";
const LH = new URL("../../lead-hunter/", import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, LH), "utf8"));

const store = createStore(memory ? new MemoryBackend() : new BlobBackend());
const existing = await store.readData();
const existingStates = Object.keys(existing.state).length;
if ((existing.local.length || existingStates) && !force) {
  console.error(
    `data.json already has ${existing.local.length} businesses and ${existingStates} lead states — rerun with --force to overwrite everything.`,
  );
  process.exit(1);
}
const { gigs, data } = buildImport({
  leads: read("leads.json"),
  mapLeads: read("map-leads.json"),
  hunt: read("hunts/2026-09-26.json"),
  seen: read("seen.json"),
  origin: origin.replace(/\/+$/, ""),
  now: new Date().toISOString(),
});
await store.writeAll(gigs, data);
const after = await store.readData();
console.log(
  `${memory ? "[memory dry run, nothing persisted] " : ""}Imported ${gigs.items.length} gigs, ${after.local.length} businesses, ${Object.keys(after.state).length} lead states.`,
);
