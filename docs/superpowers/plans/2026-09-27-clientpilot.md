# ClientPilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first PWA on Vercel that lets Kalpesh find freelance gigs, get honest AI-drafted proposals, find local businesses without websites, message them on WhatsApp with a free demo site, and track follow-ups, all with his PC switched off.

**Architecture:** Next.js 15 App Router app on Vercel Hobby. State lives in two JSON documents in a private Vercel Blob store (`gigs.json` written by a daily Vercel Cron job, `data.json` written by user actions) with ETag-conditional writes. Gemini drafts proposals; OpenStreetMap finds local businesses; demo sites are rendered from HTML templates at a public `/d/<slug>` route. Password login with an HMAC-signed session cookie.

**Tech Stack:** Next.js 16.3 (App Router, `proxy.ts`), React 19, TypeScript ~5.9.3 (strict), `@vercel/blob` ^2.8 (private stores), `@google/genai` ^2, `zod` 3, Vitest 2, `tsx` (scripts). Plain CSS (design system copied from ReelPilot).

**Spec:** `docs/superpowers/specs/2026-09-26-clientpilot-design.md`

## Global Constraints

- Node 24 locally; `"type": "module"`; TypeScript `strict: true`; imports use the `@/` alias for the repo root.
- `next@16` (16.3.x): Next 15 leaves maintenance on 2026-10-21. The route gate is `proxy.ts` exporting `async function proxy` (Next 16's rename of middleware; it always runs on the Node.js runtime). Route handler `params` and `cookies()` are Promises.
- `typescript@~5.9.3` exactly — npm `latest` is 7.x (Go-native, no JS compiler API), which Next cannot use.
- `@vercel/blob` ^2.8 (private storage needs ≥ 2.3). Every Blob call passes `access: 'private'`. The SDK imports `undici`/`stream`: never import `lib/store` from `proxy.ts`.
- Exactly two Blob documents: `gigs.json` and `data.json`. Leave `cacheControlMaxAge` at its default (an overwrite still propagates within 60 s, and a long TTL maximises free cache hits). `data.json` is always read with `useCache: false`; `gigs.json` is read with the cache except inside the cron. `get()` returns `null` for a missing blob.
- Writes are conditional (`ifMatch: <etag>`), retried up to 3 times on `PreconditionFailed`. Never write to Blob on a login attempt.
- Hobby Blob quota is 2,000 writes and 10,000 origin reads per month; exceeding it blocks Blob for 30 days. One write per user action; no background writes other than the daily cron.
- Cron: `30 1 * * *` → `GET /api/cron/gigs`, authorised only by `Authorization: Bearer ${CRON_SECRET}`. Hobby cron precision is ±59 min, so it fires between 06:30 and 07:29 IST; UI copy says "around 7 AM". The handler is idempotent (Vercel may deliver twice or skip).
- Vercel CLI is not on PATH: always run it as `npx vercel@60.1.3 …` with `--scope kalpeshmalusare30-7671`. Functions and the Blob store live in `bom1` (Mumbai).
- Env vars: `APP_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`; Blob credentials come from connecting the store (`BLOB_STORE_ID` + OIDC on Vercel, `vercel env pull` locally). `STORE_BACKEND=memory` switches to an in-memory store for local UI work and tests.
- Session cookie `cp_session` = `<expiryMs>.<hex HMAC-SHA256(SESSION_SECRET, expiryMs)>`, 30 days, `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- Login lockout: 5 failures per client IP within 15 min → locked 15 min; in memory only; client IP = `x-real-ip`, else first `x-forwarded-for` entry, else `"local"`.
- Public (no session) paths: `/login`, `/api/login`, `/d/*`, `/api/cron/gigs` (own bearer check), `/manifest.webmanifest`, `/sw.js`, `/offline.html`, `/pwa-icon*`, `/apple-icon*`, `/icon*`, `/favicon.ico`, `/robots.txt`. Everything else requires a session, checked in middleware **and** again inside each route handler / page via `requireSession()`.
- "Today" means the IST (UTC+05:30) calendar day.
- AI output: proposals ≤ 1500 characters; the only links allowed are `https://agentbandhu.com`, `https://kalpesh-malusare.vercel.app`, `https://demos-kal1201.vercel.app` (and their subpaths); past-tense claims only from the Settings facts.
- Demo pages HTML-escape every substituted value (names come from OpenStreetMap), carry the "Demo preview — made for <name>" badge and `X-Robots-Tag: noindex`.
- UI copy is Roman-script Hinglish where the spec names it: tabs **Aaj, Gigs, Local, Pipeline, Settings**; buttons **"AI proposal lihi"**, **"Copy"**, **"Open in Freelancer"**, **"Bid kela"**, **"Skip"**, **"WhatsApp var pathav"**, **"Navin shodh"**.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; git identity `Kalpesh Malusare <kalpeshmalusare30@gmail.com>`.

---

## File Map

```
clientpilot/
  package.json · tsconfig.json · next.config.ts · vitest.config.ts · vercel.json · .env.example
  proxy.ts                           route gate (redirect to /login, 401 for /api) — Next 16 "proxy"
  lib/
    types.ts                         all shared types
    time.ts                          IST day math, follow-up state, labels
    defaults.ts                      default Settings (facts, NEVER list, links, pricing, WA template)
    ids.ts                           base64url id <-> URL param
    store/backend.ts                 Backend interface + PreconditionFailed
    store/memory.ts                  in-memory Backend (tests, STORE_BACKEND=memory)
    store/blob.ts                    Vercel Blob Backend (private store)
    store/index.ts                   createStore(): readGigs/readData/mutateGigs/mutateData/writeAll; getStore()
    auth/crypto.ts                   constantTimeEqual, signSession, verifySession (Web Crypto, edge-safe)
    auth/lockout.ts                  in-memory per-IP lockout
    auth/guard.ts                    clientIp(), checkPassword(), readCookie(), requireSession()
    auth/page.ts                     requirePageSession() for server components
    auth/public.ts                   isPublicPath()
    state.ts                         applyAction() — pure LeadState transitions + ActionSchema
    origin.ts                        publicOrigin(req), pageOrigin() — base URL for demo links
    dashboard.ts                     summarize() for the Aaj screen, leadHref()
    pipeline.ts                      buildPipeline() stage columns
    importer.ts                      lead-hunter files → GigsDoc + DataDoc
    client/api.ts                    browser fetch helpers (postJSON, patchJSON, putJSON, getJSON, patchState)
    gigs/text.ts                     decodeEntities, strip, safeIso
    gigs/lead.ts                     KEYWORDS, makeLead, keywordHits, score, isTooOld
    gigs/parsers.ts                  pure parsers per source payload → LeadDraft[]
    gigs/sources.ts                  fetchers + SOURCES list (network)
    gigs/merge.ts                    filterFetched, mergeGigs
    gigs/cron.ts                     runGigCron()
    gigs/live.ts                     Freelancer live status/bid count
    gigs/view.ts                     list filters, currency guess
    ai/gemini.ts                     GeminiProvider (text + JSON, model fallback)
    ai/proposal.ts                   prompts, stripDisallowedLinks, draftProposal
    local/categories.ts              search picker → Overpass selectors
    local/classify.ts                categoryOf, normalizePhone, exclusions, toCandidate, segments
    local/biz.ts                     templateFor, slugify, uniqueSlug, demoUrl, hasPhone
    local/geo.ts                     Nominatim geocode, Overpass query + tiling
    local/audit.ts                   website audit (judgePage pure rules + auditSite)
    local/messages.ts                benefitOf, introFor, buildMessages, waLink, mailtoLink
    local/search.ts                  searchLocal() orchestrator with a deadline
    local/view.ts                    groupLocal() for the Local screen
    demo/templates/*.html            print, dental, cafe (copied) + general (new)
    demo/templates.gen.ts            GENERATED from the .html files (scripts/gen-templates.mjs)
    demo/render.ts                   escapeHtml, demoVarsFor, renderDemo
  app/
    globals.css · layout.tsx · manifest.ts · pwa-icon/route.tsx · apple-icon.tsx · SwRegister.tsx
    login/page.tsx · login/LoginForm.tsx
    (app)/nav.ts · (app)/layout.tsx · (app)/BottomNav.tsx
    (app)/page.tsx                   Aaj
    (app)/gigs/page.tsx · (app)/gigs/[id]/page.tsx · (app)/gigs/[id]/GigPanel.tsx
    (app)/local/page.tsx · (app)/local/SearchForm.tsx · (app)/local/[id]/page.tsx · (app)/local/[id]/LocalPanel.tsx
    (app)/pipeline/page.tsx · (app)/pipeline/StageControls.tsx
    (app)/settings/page.tsx · (app)/settings/SettingsForm.tsx
    d/[slug]/route.ts                public demo page
    api/login · api/logout · api/cron/gigs · api/gigs/[id]/live · api/ai/proposal
    api/state/[id] · api/local/search · api/local/[id] · api/settings        (each route.ts)
  public/sw.js · public/offline.html · public/robots.txt
  scripts/gen-templates.mjs · scripts/import.ts
```

---

### Task 1: Project scaffold, shared types, time and id helpers

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `lib/types.ts`, `lib/time.ts`, `lib/ids.ts`
- Test: `lib/time.test.ts`, `lib/ids.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task):
  - `lib/types.ts`: `Status`, `STATUSES`, `Gig`, `GigsDoc`, `LastRun`, `LeadKind`, `LeadState`, `Segment`, `TemplateKey`, `LocalBiz`, `Settings`, `DataDoc`.
  - `lib/time.ts`: `DAY_MS`, `addDaysISO(iso, days): string`, `istDayEnd(now: number): number`, `followUpState(followUpAt: string | undefined, now: number): 'overdue' | 'today' | 'later' | 'none'`, `formatIST(iso: string): string`, `ageLabel(iso: string, now: number): string`.
  - `lib/ids.ts`: `toParam(id: string): string`, `fromParam(param: string): string`.

- [ ] **Step 1: Initialise the project and install dependencies**

Run in `C:\kalpesh\kal\clientpilot` (the repo already exists with the spec committed):

```bash
npm init -y
npm install next@16 react@19 react-dom@19 @vercel/blob@2 @google/genai@2 zod@3
npm install -D typescript@~5.9.3 vitest@2 tsx@4 @types/node@22 @types/react@19 @types/react-dom@19
```

Then replace `package.json` with (keep the exact versions npm resolved in `dependencies` / `devDependencies`; only the fields below change):

```json
{
  "name": "clientpilot",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Verify: `node -p "require('./node_modules/@vercel/blob/package.json').version"` prints `2.8.0` or higher, `npx next --version` prints `16.x`, and `npx tsc --version` prints `5.9.x`.

- [ ] **Step 2: Config files**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowJs": true,
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
```

`next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["lib/**/*.test.ts"], environment: "node" },
});
```

`.env.example`:

```bash
# Login passphrase (4 random words + a number). Only in Vercel env, never committed.
APP_PASSWORD=
# 64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=
# Vercel sends this as "Authorization: Bearer <value>" to the cron route.
CRON_SECRET=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-flash-lite-latest,gemini-3.6-flash,gemini-flash-latest,gemini-3.5-flash
# "memory" = no Blob (local UI work). Leave unset on Vercel.
STORE_BACKEND=
```

- [ ] **Step 3: Shared types**

`lib/types.ts`:

```ts
export type Status = "new" | "drafted" | "sent" | "replied" | "won" | "lost" | "skipped";
export const STATUSES: Status[] = ["new", "drafted", "sent", "replied", "won", "lost", "skipped"];

/** One freelance gig. `id` is "<source>:<source id>", e.g. "freelancer.com:40734895". */
export interface Gig {
  id: string;
  source: string;
  title: string;
  desc: string;
  url: string;
  /** ISO timestamp of the post, or "" when the source gave none. */
  date: string;
  budget: string;
  tags: string[];
  /** Source-specific note, e.g. "12 bids", "low-bids (4 bids)", company name. */
  extra: string;
  score: number;
  /** ISO timestamp of the cron run that first stored this gig. */
  fetchedAt: string;
}

export interface LastRun {
  at: string;
  added: number;
  /** Source keys that threw during this run. */
  failed: string[];
}

export interface GigsDoc {
  updatedAt: string;
  lastRun: LastRun | null;
  items: Gig[];
}

export type LeadKind = "gig" | "local";

export interface LeadState {
  kind: LeadKind;
  status: Status;
  proposal?: string;
  bidAmount?: number;
  bidCurrency?: string;
  sentAt?: string;
  followUpAt?: string;
  notes?: string;
  updatedAt: string;
}

export type Segment = "site_down" | "no_website" | "old_site" | "social_only";
export type TemplateKey = "print" | "dental" | "cafe" | "general";

export interface LocalBiz {
  id: string;
  slug: string;
  name: string;
  area: string;
  catKey: string;
  catLabel: string;
  /** Street address from OpenStreetMap, "" when unknown. */
  addr: string;
  /** Digits only, with country code, e.g. "919322214085". "" when unknown. */
  waNum: string;
  telNum: string;
  phoneDisplay: string;
  email: string;
  website: string;
  social: string;
  segment: Segment;
  evidence: string;
  whatsapp: string;
  emailSubject: string;
  emailBody: string;
  template: TemplateKey;
  createdAt: string;
}

export interface Settings {
  /** The only facts the AI may state about Kalpesh. */
  facts: string;
  /** Claims the AI must never make, one per line. */
  never: string;
  allowedLinks: string[];
  pricing: string;
  /** WhatsApp template; placeholders {intro} {name} {area} {category} {benefit} {demo_line}. */
  waTemplate: string;
}

export interface DataDoc {
  state: Record<string, LeadState>;
  local: LocalBiz[];
  settings: Settings;
  updatedAt: string;
}
```

- [ ] **Step 4: Write the failing tests for time and ids**

`lib/time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addDaysISO, ageLabel, followUpState, istDayEnd } from "./time";

// 2026-09-27T20:00:00Z is 28 Sep 01:30 IST.
const NOW = Date.parse("2026-09-27T20:00:00Z");

describe("istDayEnd", () => {
  it("returns the last millisecond of the IST day containing now", () => {
    expect(new Date(istDayEnd(NOW)).toISOString()).toBe("2026-09-28T18:29:59.999Z");
  });
  it("handles a time just before IST midnight", () => {
    const t = Date.parse("2026-09-27T18:29:00Z"); // 27 Sep 23:59 IST
    expect(new Date(istDayEnd(t)).toISOString()).toBe("2026-09-27T18:29:59.999Z");
  });
});

describe("followUpState", () => {
  it("is none when unset or invalid", () => {
    expect(followUpState(undefined, NOW)).toBe("none");
    expect(followUpState("nope", NOW)).toBe("none");
  });
  it("is overdue before the start of today (IST)", () => {
    expect(followUpState("2026-09-27T18:00:00Z", NOW)).toBe("overdue"); // 27 Sep 23:30 IST
  });
  it("is today within the IST day", () => {
    expect(followUpState("2026-09-28T05:30:00Z", NOW)).toBe("today"); // 28 Sep 11:00 IST
  });
  it("is later after today", () => {
    expect(followUpState("2026-09-28T19:00:00Z", NOW)).toBe("later"); // 29 Sep 00:30 IST
  });
});

describe("addDaysISO / ageLabel", () => {
  it("adds whole days", () => {
    expect(addDaysISO("2026-09-26T10:00:00.000Z", 3)).toBe("2026-09-29T10:00:00.000Z");
  });
  it("labels ages in minutes, hours and days", () => {
    expect(ageLabel(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("5m");
    expect(ageLabel(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe("3h");
    expect(ageLabel(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe("2d");
    expect(ageLabel("", NOW)).toBe("");
  });
});
```

`lib/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fromParam, toParam } from "./ids";

describe("id params", () => {
  it("round-trips ids with slashes, colons and unicode", () => {
    for (const id of [
      "freelancer.com:40734895",
      "weworkremotely:https://weworkremotely.com/remote-jobs/x-y",
      "node/12395684120",
      "ä/ü:?&#",
    ]) {
      const p = toParam(id);
      expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(fromParam(p)).toBe(id);
    }
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run lib/time.test.ts lib/ids.test.ts`
Expected: FAIL — cannot resolve `./time` / `./ids`.

- [ ] **Step 6: Implement time and id helpers**

`lib/time.ts`:

```ts
export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

/** Epoch ms of the last millisecond of the IST calendar day that contains `now`. */
export function istDayEnd(now: number): number {
  const ist = now + IST_OFFSET_MS;
  const dayStart = Math.floor(ist / DAY_MS) * DAY_MS;
  return dayStart + DAY_MS - 1 - IST_OFFSET_MS;
}

export type FollowUpState = "overdue" | "today" | "later" | "none";

export function followUpState(followUpAt: string | undefined, now: number): FollowUpState {
  if (!followUpAt) return "none";
  const t = Date.parse(followUpAt);
  if (!Number.isFinite(t)) return "none";
  const end = istDayEnd(now);
  const start = end - DAY_MS + 1;
  if (t < start) return "overdue";
  if (t <= end) return "today";
  return "later";
}

export function formatIST(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Compact age: "5m", "3h", "2d". Empty string for a missing/invalid date. */
export function ageLabel(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!iso || !Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
```

`lib/ids.ts`:

```ts
/** Lead ids contain ":" and "/" (e.g. "node/123", "weworkremotely:https://..."),
 * so they are base64url-encoded when used as a URL path segment.
 * Uses btoa/atob (not Buffer) so client components can use it too. */
export function toParam(id: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(id)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromParam(param: string): string {
  const b64 = param.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((param.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run lib/time.test.ts lib/ids.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts vitest.config.ts .env.example lib/types.ts lib/time.ts lib/time.test.ts lib/ids.ts lib/ids.test.ts
git commit -m "Scaffold ClientPilot: Next.js 15 + TS config, shared types, IST time and id helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Document store (Blob + memory backends, conditional writes) and default settings

**Files:**
- Create: `lib/defaults.ts`, `lib/store/backend.ts`, `lib/store/memory.ts`, `lib/store/blob.ts`, `lib/store/index.ts`
- Test: `lib/store/store.test.ts`, `lib/defaults.test.ts`

**Interfaces:**
- Consumes: `Settings`, `DataDoc`, `GigsDoc` (Task 1).
- Produces:
  - `lib/defaults.ts`: `DEFAULT_FACTS`, `DEFAULT_NEVER`, `DEFAULT_ALLOWED_LINKS`, `DEFAULT_PRICING`, `DEFAULT_WA_TEMPLATE`, `defaultSettings(): Settings`, `emptyData(nowIso): DataDoc`, `emptyGigs(nowIso): GigsDoc`, `normalizeData(doc: DataDoc): DataDoc`.
  - `lib/store/backend.ts`: `interface Backend { get(path, { fresh }): Promise<{ text; etag } | null>; put(path, text, { ifMatch? }): Promise<{ etag }> }`, `class PreconditionFailed extends Error`.
  - `lib/store/memory.ts`: `class MemoryBackend implements Backend` with test hooks `set(path, text)` and `beforeNextPut: (() => void) | null`.
  - `lib/store/index.ts`: `GIGS_PATH = "gigs.json"`, `DATA_PATH = "data.json"`, `interface Store { readGigs(opts?: { fresh?: boolean }): Promise<GigsDoc>; readData(opts?: { fresh?: boolean }): Promise<DataDoc>; mutateGigs(fn: (d: GigsDoc) => GigsDoc): Promise<GigsDoc>; mutateData(fn: (d: DataDoc) => DataDoc): Promise<DataDoc>; writeAll(gigs: GigsDoc, data: DataDoc): Promise<void> }`, `createStore(backend, nowIso?)`, `getStore()`, `setStoreForTests(store)`.
  - Read defaults: `readData()` is fresh (origin) unless `{ fresh: false }`; `readGigs()` is cached unless `{ fresh: true }`. `mutate*` always reads fresh, passes the callback a deep copy, sets `updatedAt`, and writes with `ifMatch`.

- [ ] **Step 1: Write the failing tests**

`lib/defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultSettings, emptyData, normalizeData } from "./defaults";

describe("defaults", () => {
  it("default settings carry the facts, NEVER list, links and a WA template with all placeholders", () => {
    const s = defaultSettings();
    expect(s.facts).toContain("Kaizen Infotech Solutions");
    expect(s.facts).toContain("https://agentbandhu.com");
    expect(s.never).toMatch(/React Native/);
    expect(s.allowedLinks).toEqual([
      "https://agentbandhu.com",
      "https://kalpesh-malusare.vercel.app",
      "https://demos-kal1201.vercel.app",
    ]);
    for (const p of ["{intro}", "{name}", "{benefit}", "{demo_line}"]) expect(s.waTemplate).toContain(p);
    expect(s.waTemplate).not.toMatch(/google/i);
  });
  it("normalizeData fills missing settings fields and collections", () => {
    const d = normalizeData({ updatedAt: "x" } as never);
    expect(d.state).toEqual({});
    expect(d.local).toEqual([]);
    expect(d.settings.facts).toBe(defaultSettings().facts);
    const custom = normalizeData({ ...emptyData("t"), settings: { facts: "mine" } as never });
    expect(custom.settings.facts).toBe("mine");
    expect(custom.settings.allowedLinks.length).toBe(3);
  });
});
```

`lib/store/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createStore, DATA_PATH, GIGS_PATH } from "./index";
import { MemoryBackend } from "./memory";
import { PreconditionFailed } from "./backend";
import { emptyData } from "../defaults";

let tick = 0;
const clock = () => `2026-09-27T00:00:${String(tick++ % 60).padStart(2, "0")}.000Z`;

describe("store", () => {
  it("returns empty documents when nothing is stored", async () => {
    const s = createStore(new MemoryBackend(), clock);
    const d = await s.readData();
    expect(d.local).toEqual([]);
    expect(d.settings.allowedLinks.length).toBe(3);
    const g = await s.readGigs();
    expect(g.items).toEqual([]);
    expect(g.lastRun).toBeNull();
  });

  it("persists a mutation and stamps updatedAt", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    await s.mutateData((d) => {
      d.state["x"] = { kind: "gig", status: "sent", updatedAt: "t" };
      return d;
    });
    const again = await s.readData();
    expect(again.state["x"]?.status).toBe("sent");
    expect(again.updatedAt).toMatch(/^2026-09-27T/);
  });

  it("re-applies the change on a concurrent write instead of losing either", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    await s.mutateData((d) => d); // create the document
    b.beforeNextPut = () => {
      const other = emptyData("t");
      other.state["other"] = { kind: "local", status: "replied", updatedAt: "t" };
      b.set(DATA_PATH, JSON.stringify(other)); // someone else wrote first
    };
    await s.mutateData((d) => {
      d.state["mine"] = { kind: "gig", status: "skipped", updatedAt: "t" };
      return d;
    });
    const d = await s.readData();
    expect(d.state["other"]?.status).toBe("replied");
    expect(d.state["mine"]?.status).toBe("skipped");
  });

  it("gives up after 3 conflicting attempts", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    await s.mutateGigs((g) => g);
    const arm = () => {
      b.beforeNextPut = () => {
        b.set(GIGS_PATH, JSON.stringify({ updatedAt: "z", lastRun: null, items: [] }));
        arm();
      };
    };
    arm();
    await expect(s.mutateGigs((g) => g)).rejects.toBeInstanceOf(PreconditionFailed);
  });

  it("writeAll overwrites both documents", async () => {
    const b = new MemoryBackend();
    const s = createStore(b, clock);
    const data = emptyData("t");
    data.state["a"] = { kind: "gig", status: "won", updatedAt: "t" };
    await s.writeAll({ updatedAt: "t", lastRun: null, items: [] }, data);
    expect((await s.readData()).state["a"]?.status).toBe("won");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/defaults.test.ts lib/store`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/defaults.ts`**

The facts, NEVER list and links are copied from the Sept 26 bid workflow's facts sheet; pricing from `lead-hunter/GUIDE.md` §6. The WhatsApp template deliberately does **not** claim the business was found "on Google" (leads come from OpenStreetMap) and tells the owner that details on the demo are samples.

```ts
import type { DataDoc, GigsDoc, Settings } from "./types";

export const DEFAULT_FACTS = `KALPESH MALUSARE — Mumbai, India.
- ~4 years professional experience (since Jun 2022).
- Oct 2022–present: Frontend Developer & UI/UX Designer at Kaizen Infotech Solutions, Mumbai — leads frontend work on React + TypeScript products, from Figma prototypes to production. His portfolio states he builds "React platforms used across five countries".
- Jun 2022–Oct 2022: Web Designer & Developer at Swami Product Search Infotech, Mumbai — managed client projects end to end on WordPress.
- BSc Information Technology, University of Mumbai.
- Stack (portfolio): React, Next.js, TypeScript, Tailwind CSS, Node.js, Express, Redux, React Query, Framer Motion, Figma, Adobe XD, REST APIs, WordPress.
- Flagship shipped product: Agent Bandhu — WhatsApp-based CRM for Indian insurance agents (tracks renewals, birthdays, every client conversation in one dashboard). React, TypeScript, dashboard UI, WhatsApp API. Live: https://agentbandhu.com
- Portfolio: https://kalpesh-malusare.vercel.app
- Recent self-built projects (Sept 2026):
  * Live responsive business-website demos: https://demos-kal1201.vercel.app
  * ReelPilot — AI video automation platform: Next.js dashboard + Node.js worker + SQLite + Remotion programmatic video rendering + Gemini LLM + YouTube Data API (OAuth, scheduled publishing). Private dashboard, no public URL.
  * ProspectPilot — B2B prospecting CRM: Next.js 14 + TypeScript + Prisma/SQLite, lead search, kanban pipeline, tasks, CSV import/export. Not publicly deployed.
  * Lead Hunter — Node.js aggregator of 9 public job APIs/RSS feeds with a dashboard.`;

export const DEFAULT_NEVER = `Shipped React Native / native mobile apps
Payment or payout systems (Stripe/PayPal/Wise) in production
PHP/Laravel, Python/Django, DevOps/Kubernetes, blockchain
Named clients other than the employers above
Reviews, ratings or testimonials (he is a new Freelancer.com account with zero reviews)
An agency or a team`;

export const DEFAULT_ALLOWED_LINKS = [
  "https://agentbandhu.com",
  "https://kalpesh-malusare.vercel.app",
  "https://demos-kal1201.vercel.app",
];

export const DEFAULT_PRICING = `Freelancer.com profile rate: $15/hr.
Stage | International | Local (India)
0 reviews (first 5 projects) | $8–12/hr or small fixed ($50–300) | ₹10k–25k per website
5+ reviews | $15–25/hr | ₹30k–75k
15+ reviews / niche expert | $30–50/hr | ₹1L+
Always take 30–50% advance from direct clients. Discounts are fine, free work is not.`;

export const DEFAULT_WA_TEMPLATE = `{intro} I am Kalpesh, a web developer from Mumbai.

A simple website would help {name}:
- People in {area} can find you online, with your timings and location
- {benefit}
- Inquiries come straight to your WhatsApp, even after closing hours

{demo_line}`;

export function defaultSettings(): Settings {
  return {
    facts: DEFAULT_FACTS,
    never: DEFAULT_NEVER,
    allowedLinks: [...DEFAULT_ALLOWED_LINKS],
    pricing: DEFAULT_PRICING,
    waTemplate: DEFAULT_WA_TEMPLATE,
  };
}

export function emptyGigs(nowIso: string): GigsDoc {
  return { updatedAt: nowIso, lastRun: null, items: [] };
}

export function emptyData(nowIso: string): DataDoc {
  return { state: {}, local: [], settings: defaultSettings(), updatedAt: nowIso };
}

/** Fills anything a stored document is missing (older shape, partial settings). */
export function normalizeData(doc: DataDoc): DataDoc {
  const d = defaultSettings();
  const s: Partial<Settings> = doc.settings ?? {};
  return {
    state: doc.state ?? {},
    local: doc.local ?? [],
    updatedAt: doc.updatedAt ?? "",
    settings: {
      facts: s.facts ?? d.facts,
      never: s.never ?? d.never,
      allowedLinks: Array.isArray(s.allowedLinks) && s.allowedLinks.length ? s.allowedLinks : d.allowedLinks,
      pricing: s.pricing ?? d.pricing,
      waTemplate: s.waTemplate ?? d.waTemplate,
    },
  };
}
```

- [ ] **Step 4: Implement the backends**

`lib/store/backend.ts`:

```ts
export interface StoredDoc {
  text: string;
  etag: string;
}

export interface Backend {
  /** `fresh: true` must return the latest write (bypassing any cache). null = not stored yet. */
  get(path: string, opts: { fresh: boolean }): Promise<StoredDoc | null>;
  /** With `ifMatch`, throws PreconditionFailed if the stored etag differs. */
  put(path: string, text: string, opts: { ifMatch?: string }): Promise<{ etag: string }>;
}

export class PreconditionFailed extends Error {
  constructor(path: string) {
    super(`precondition failed for ${path}`);
    this.name = "PreconditionFailed";
  }
}
```

`lib/store/memory.ts`:

```ts
import { type Backend, PreconditionFailed, type StoredDoc } from "./backend";

/** In-memory backend for tests and STORE_BACKEND=memory local runs. */
export class MemoryBackend implements Backend {
  private files = new Map<string, StoredDoc>();
  private n = 0;
  /** Test hook: runs once right before the next put (simulates a concurrent writer). */
  public beforeNextPut: (() => void) | null = null;

  async get(path: string): Promise<StoredDoc | null> {
    const f = this.files.get(path);
    return f ? { ...f } : null;
  }

  async put(path: string, text: string, opts: { ifMatch?: string } = {}): Promise<{ etag: string }> {
    const hook = this.beforeNextPut;
    this.beforeNextPut = null;
    hook?.();
    const cur = this.files.get(path);
    if (opts.ifMatch !== undefined && cur?.etag !== opts.ifMatch) throw new PreconditionFailed(path);
    return this.set(path, text);
  }

  /** Unconditional write that bypasses hooks. */
  set(path: string, text: string): { etag: string } {
    const etag = `"m${++this.n}"`;
    this.files.set(path, { text, etag });
    return { etag };
  }
}
```

`lib/store/blob.ts` (private store; OIDC credentials are picked up automatically on Vercel and after `vercel env pull` locally):

```ts
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { type Backend, PreconditionFailed, type StoredDoc } from "./backend";

export class BlobBackend implements Backend {
  async get(path: string, opts: { fresh: boolean }): Promise<StoredDoc | null> {
    // get() resolves to null for a missing blob; useCache:false reads from origin (private stores only).
    const res = await get(path, { access: "private", useCache: !opts.fresh });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    return { text, etag: res.blob.etag };
  }

  async put(path: string, text: string, opts: { ifMatch?: string }): Promise<{ etag: string }> {
    try {
      const r = await put(path, text, {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
        ...(opts.ifMatch ? { ifMatch: opts.ifMatch } : {}),
      });
      return { etag: r.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) throw new PreconditionFailed(path);
      throw e;
    }
  }
}
```

Verified against `@vercel/blob` 2.8.0: `put()` returns `PutBlobResult` with `etag`; `get()` returns `GetBlobResult | null` (`statusCode: 200` carries `stream` and `blob.etag`); `ifMatch` mismatch throws `BlobPreconditionFailedError`; `ifMatch` with `allowOverwrite: true` is valid (only `allowOverwrite: false` contradicts it). Credentials: OIDC (`BLOB_STORE_ID` + auto-refreshed token) on Vercel and after `vercel env pull`; never pass `oidcToken` yourself.

- [ ] **Step 5: Implement `lib/store/index.ts`**

```ts
import { emptyData, emptyGigs, normalizeData } from "@/lib/defaults";
import type { DataDoc, GigsDoc } from "@/lib/types";
import { type Backend, PreconditionFailed } from "./backend";
import { BlobBackend } from "./blob";
import { MemoryBackend } from "./memory";

export const GIGS_PATH = "gigs.json";
export const DATA_PATH = "data.json";
const MAX_TRIES = 3;

export interface Store {
  readGigs(opts?: { fresh?: boolean }): Promise<GigsDoc>;
  readData(opts?: { fresh?: boolean }): Promise<DataDoc>;
  mutateGigs(fn: (doc: GigsDoc) => GigsDoc): Promise<GigsDoc>;
  mutateData(fn: (doc: DataDoc) => DataDoc): Promise<DataDoc>;
  writeAll(gigs: GigsDoc, data: DataDoc): Promise<void>;
}

export function createStore(backend: Backend, nowIso: () => string = () => new Date().toISOString()): Store {
  async function read<T>(path: string, fresh: boolean, empty: () => T, normalize: (x: T) => T) {
    const got = await backend.get(path, { fresh });
    return { doc: got ? normalize(JSON.parse(got.text) as T) : empty(), etag: got?.etag };
  }

  async function mutate<T extends { updatedAt: string }>(
    path: string,
    empty: () => T,
    normalize: (x: T) => T,
    fn: (doc: T) => T,
  ): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < MAX_TRIES; i++) {
      const { doc, etag } = await read(path, true, empty, normalize);
      const next = fn(structuredClone(doc));
      next.updatedAt = nowIso();
      try {
        await backend.put(path, JSON.stringify(next), { ifMatch: etag });
        return next;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof PreconditionFailed)) throw e;
      }
    }
    throw lastErr;
  }

  const same = <T,>(x: T) => x;
  return {
    readGigs: async (o) => (await read(GIGS_PATH, o?.fresh ?? false, () => emptyGigs(nowIso()), same)).doc,
    readData: async (o) => (await read(DATA_PATH, o?.fresh ?? true, () => emptyData(nowIso()), normalizeData)).doc,
    mutateGigs: (fn) => mutate(GIGS_PATH, () => emptyGigs(nowIso()), same, fn),
    mutateData: (fn) => mutate(DATA_PATH, () => emptyData(nowIso()), normalizeData, fn),
    async writeAll(gigs, data) {
      await backend.put(GIGS_PATH, JSON.stringify(gigs), {});
      await backend.put(DATA_PATH, JSON.stringify(data), {});
    },
  };
}

let current: Store | null = null;

export function getStore(): Store {
  if (!current) {
    current = createStore(process.env.STORE_BACKEND === "memory" ? new MemoryBackend() : new BlobBackend());
  }
  return current;
}

export function setStoreForTests(store: Store): void {
  current = store;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/defaults.test.ts lib/store`
Expected: PASS (7 tests).

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors (this also confirms the `@vercel/blob` imports and option names exist in the installed version).

```bash
git add lib/defaults.ts lib/defaults.test.ts lib/store
git commit -m "Store: private Blob and in-memory backends, ETag-conditional mutate with retry, default settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---


### Task 3: Authentication — session crypto, lockout, guards, login/logout, proxy

**Files:**
- Create: `lib/auth/crypto.ts`, `lib/auth/lockout.ts`, `lib/auth/guard.ts`, `lib/auth/page.ts`, `lib/auth/public.ts`, `app/api/login/route.ts`, `app/api/logout/route.ts`, `proxy.ts`
- Test: `lib/auth/crypto.test.ts`, `lib/auth/lockout.test.ts`, `lib/auth/guard.test.ts`, `lib/auth/login-route.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `lib/auth/crypto.ts`: `COOKIE_NAME = "cp_session"`, `SESSION_MAX_AGE_S`, `constantTimeEqual(a, b): boolean`, `signSession(now?: number): Promise<string>`, `verifySession(token: string | undefined, now?: number): Promise<boolean>` — edge-safe (Web Crypto only).
  - `lib/auth/lockout.ts`: `retryAfterMs(key, now?)`, `recordFailure(key, now?)`, `recordSuccess(key)`, `MAX_FAILS = 5`.
  - `lib/auth/guard.ts`: `clientIp(req: Request): string`, `checkPassword(input: string): boolean`, `readCookie(req: Request, name: string): string | undefined`, `requireSession(req: Request): Promise<Response | null>` (null = authorised).
  - `lib/auth/page.ts`: `requirePageSession(): Promise<void>` (redirects to `/login`).
  - `lib/auth/public.ts`: `isPublicPath(pathname: string): boolean`.

- [ ] **Step 1: Write the failing tests**

`lib/auth/crypto.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { constantTimeEqual, signSession, verifySession } from "./crypto";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

describe("constantTimeEqual", () => {
  it("compares strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});

describe("session tokens", () => {
  const now = 1_800_000_000_000;
  it("verifies a token it signed", async () => {
    const t = await signSession(now);
    expect(t).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(await verifySession(t, now + 1000)).toBe(true);
  });
  it("rejects expired, tampered, empty and foreign tokens", async () => {
    const t = await signSession(now);
    const [exp, sig] = t.split(".");
    expect(await verifySession(t, Number(exp) + 1)).toBe(false);
    expect(await verifySession(`${Number(exp) + 999}.${sig}`, now)).toBe(false);
    expect(await verifySession(undefined, now)).toBe(false);
    expect(await verifySession("garbage", now)).toBe(false);
    process.env.SESSION_SECRET = "another-secret";
    expect(await verifySession(t, now)).toBe(false);
    process.env.SESSION_SECRET = "test-secret-0123456789";
  });
  it("rejects everything when SESSION_SECRET is empty", async () => {
    const t = await signSession(now);
    process.env.SESSION_SECRET = "";
    expect(await verifySession(t, now)).toBe(false);
    process.env.SESSION_SECRET = "test-secret-0123456789";
  });
});
```

`lib/auth/lockout.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { recordFailure, recordSuccess, retryAfterMs } from "./lockout";

let n = 0;
let key = "";
beforeEach(() => {
  key = `k${n++}`;
});
const t = 1_000_000;
const LOCK = 15 * 60 * 1000;

describe("login lockout", () => {
  it("does not lock before 5 failures", () => {
    for (let i = 0; i < 4; i++) recordFailure(key, t + i);
    expect(retryAfterMs(key, t + 10)).toBe(0);
  });
  it("locks on the 5th failure for 15 minutes", () => {
    for (let i = 0; i < 5; i++) recordFailure(key, t);
    const left = retryAfterMs(key, t);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(LOCK);
    expect(retryAfterMs(key, t + LOCK + 1)).toBe(0);
  });
  it("forgets isolated failures after 15 idle minutes", () => {
    let now = t;
    for (let i = 0; i < 20; i++) {
      recordFailure(key, now);
      now += LOCK + 1;
    }
    expect(retryAfterMs(key, now)).toBe(0);
  });
  it("clears on success", () => {
    for (let i = 0; i < 4; i++) recordFailure(key, t);
    recordSuccess(key);
    recordFailure(key, t);
    expect(retryAfterMs(key, t)).toBe(0);
  });
});
```

`lib/auth/guard.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { checkPassword, clientIp, readCookie, requireSession } from "./guard";
import { COOKIE_NAME, signSession } from "./crypto";
import { isPublicPath } from "./public";

beforeAll(() => {
  process.env.APP_PASSWORD = "river lamp tiger 42";
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

const req = (headers: Record<string, string>) => new Request("https://x.test/api/y", { headers });

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry, then 'local'", () => {
    expect(clientIp(req({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" }))).toBe("1.1.1.1");
    expect(clientIp(req({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(req({}))).toBe("local");
  });
});

describe("checkPassword", () => {
  it("accepts only the exact APP_PASSWORD", () => {
    expect(checkPassword("river lamp tiger 42")).toBe(true);
    expect(checkPassword("river lamp tiger 43")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });
  it("rejects everything when APP_PASSWORD is unset", () => {
    const saved = process.env.APP_PASSWORD;
    process.env.APP_PASSWORD = "";
    expect(checkPassword("")).toBe(false);
    process.env.APP_PASSWORD = saved;
  });
});

describe("readCookie / requireSession", () => {
  it("reads a cookie by name", () => {
    expect(readCookie(req({ cookie: "a=1; cp_session=xyz.abc; b=2" }), "cp_session")).toBe("xyz.abc");
    expect(readCookie(req({}), "cp_session")).toBeUndefined();
  });
  it("returns 401 without a valid session and null with one", async () => {
    const denied = await requireSession(req({}));
    expect(denied?.status).toBe(401);
    const token = await signSession();
    expect(await requireSession(req({ cookie: `${COOKIE_NAME}=${token}` }))).toBeNull();
  });
});

describe("isPublicPath", () => {
  it("allows only the public paths", () => {
    for (const p of ["/login", "/api/login", "/api/cron/gigs", "/d/a9-digital-prints", "/manifest.webmanifest", "/sw.js", "/offline.html", "/pwa-icon", "/apple-icon", "/favicon.ico", "/robots.txt"]) {
      expect(isPublicPath(p)).toBe(true);
    }
    for (const p of ["/", "/gigs", "/api/state/abc", "/api/settings", "/dashboard", "/login-bypass"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});
```

`lib/auth/login-route.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/login/route";

beforeAll(() => {
  process.env.APP_PASSWORD = "river lamp tiger 42";
  process.env.SESSION_SECRET = "test-secret-0123456789";
});

const login = (password: string, ip: string) =>
  POST(
    new Request("https://x.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ password }),
    }),
  );

describe("POST /api/login", () => {
  it("sets the session cookie on the right password", async () => {
    const res = await login("river lamp tiger 42", "10.0.0.1");
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/cp_session=\d+\.[0-9a-f]{64}/);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });
  it("returns 401 on a wrong password and 429 after 5 failures from one IP", async () => {
    for (let i = 0; i < 5; i++) expect((await login("wrong", "10.0.0.2")).status).toBe(401);
    const locked = await login("river lamp tiger 42", "10.0.0.2");
    expect(locked.status).toBe(429);
    expect(locked.headers.get("retry-after")).toBeTruthy();
    // another IP is unaffected
    expect((await login("river lamp tiger 42", "10.0.0.3")).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/auth`
Expected: FAIL — modules `./crypto`, `./lockout`, `./guard`, `./public`, `@/app/api/login/route` not found.

- [ ] **Step 3: Implement `lib/auth/crypto.ts`**

```ts
export const COOKIE_NAME = "cp_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
const SESSION_MS = SESSION_MAX_AGE_S * 1000;
const enc = new TextEncoder();

/** Constant-time string compare (edge-safe, no node:crypto). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token = "<expiry ms>.<HMAC-SHA256(SESSION_SECRET, expiry)>". */
export async function signSession(now: number = Date.now()): Promise<string> {
  const exp = String(now + SESSION_MS);
  return `${exp}.${await hmacHex(process.env.SESSION_SECRET ?? "", exp)}`;
}

export async function verifySession(token: string | undefined, now: number = Date.now()): Promise<boolean> {
  const secret = process.env.SESSION_SECRET ?? "";
  if (!token || !secret) return false;
  const [exp, sig, extra] = token.split(".");
  if (extra !== undefined || !exp || !sig || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  return constantTimeEqual(sig, await hmacHex(secret, exp));
}
```

- [ ] **Step 4: Implement `lib/auth/lockout.ts`**

```ts
/**
 * In-memory login throttle per client IP. Lives in the function instance's
 * memory on purpose: writing counters to Blob would let failed logins burn the
 * Hobby Blob quota. A cold start resets it, which is acceptable because the
 * passphrase (4 random words + a number) cannot be brute-forced online.
 */
type Bucket = { fails: number; lockedUntil: number; last: number };

const buckets = new Map<string, Bucket>();

export const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const DECAY_MS = 15 * 60 * 1000;
const MAX_KEYS = 5000;

export function retryAfterMs(key: string, now: number = Date.now()): number {
  const b = buckets.get(key);
  if (!b) return 0;
  return b.lockedUntil > now ? b.lockedUntil - now : 0;
}

export function recordFailure(key: string, now: number = Date.now()): void {
  if (buckets.size > MAX_KEYS) buckets.clear();
  let b = buckets.get(key);
  if (!b || now - b.last > DECAY_MS) b = { fails: 0, lockedUntil: 0, last: now };
  b.fails += 1;
  b.last = now;
  if (b.fails >= MAX_FAILS) {
    b.lockedUntil = now + LOCK_MS;
    b.fails = 0;
  }
  buckets.set(key, b);
}

export function recordSuccess(key: string): void {
  buckets.delete(key);
}
```

- [ ] **Step 5: Implement guards and public paths**

`lib/auth/guard.ts`:

```ts
import { COOKIE_NAME, constantTimeEqual, verifySession } from "./crypto";

/** Vercel sets x-real-ip at its edge; clients cannot forge it. */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "local";
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  return expected.length > 0 && constantTimeEqual(input, expected);
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Route-handler guard. Returns a 401 Response when unauthorised, otherwise null. */
export async function requireSession(req: Request): Promise<Response | null> {
  if (await verifySession(readCookie(req, COOKIE_NAME))) return null;
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
```

`lib/auth/page.ts`:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySession } from "./crypto";

/** Server-component guard: sends the visitor to /login without a valid session. */
export async function requirePageSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!(await verifySession(token))) redirect("/login");
}
```

`lib/auth/public.ts`:

```ts
const PUBLIC_EXACT = new Set([
  "/login",
  "/api/login",
  "/api/cron/gigs",
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/favicon.ico",
  "/robots.txt",
]);
const PUBLIC_PREFIX = ["/d/", "/pwa-icon", "/apple-icon", "/icon"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}
```

- [ ] **Step 6: Implement the login and logout routes**

`app/api/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_MAX_AGE_S, signSession } from "@/lib/auth/crypto";
import { checkPassword, clientIp } from "@/lib/auth/guard";
import { recordFailure, recordSuccess, retryAfterMs } from "@/lib/auth/lockout";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const lockMs = retryAfterMs(ip);
  if (lockMs > 0) {
    return NextResponse.json(
      { ok: false, error: `Too many attempts. Try again in ${Math.ceil(lockMs / 60000)} min.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil(lockMs / 1000)) } },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !checkPassword(password)) {
    recordFailure(ip);
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }
  recordSuccess(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await signSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
```

`app/api/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 7: Implement `proxy.ts`** (Next 16's name for middleware; Node.js runtime; must not import `lib/store`)

```ts
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth/crypto";
import { isPublicPath } from "@/lib/auth/public";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (await verifySession(req.cookies.get(COOKIE_NAME)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run lib/auth`
Expected: PASS (all tests in the 4 files).

- [ ] **Step 9: Commit**

```bash
git add lib/auth app/api/login app/api/logout proxy.ts
git commit -m "Auth: HMAC session cookie, in-memory login lockout, route and page guards, proxy gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Lead state transitions and the state API

**Files:**
- Create: `lib/state.ts`, `app/api/state/[id]/route.ts`
- Test: `lib/state.test.ts`, `lib/state-route.test.ts`

**Interfaces:**
- Consumes: `LeadState`, `LeadKind`, `Status`, `STATUSES` (Task 1); `addDaysISO` (Task 1); `fromParam` (Task 1); `getStore()`, `setStoreForTests()` and `Store.mutateData` (Task 2); `requireSession` (Task 3).
- Produces:
  - `Action` (discriminated union) and `ActionSchema` (zod) — used by the gig, local and pipeline UI (Tasks 12–14).
  - `applyAction(prev: LeadState | undefined, kind: LeadKind, action: Action, nowIso: string): LeadState`.
  - `FOLLOW_UP_DAYS = 3`.
  - `PATCH /api/state/[id]?kind=gig|local` with a JSON `Action` body → `{ ok: true, state: LeadState }`. `[id]` is `toParam(leadId)`.

- [ ] **Step 1: Write the failing tests**

`lib/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ActionSchema, applyAction } from "./state";

const NOW = "2026-09-26T10:00:00.000Z";

describe("applyAction", () => {
  it("creates state for a new lead and moves new → drafted on proposal", () => {
    const s = applyAction(undefined, "gig", { type: "proposal", proposal: "Hi" }, NOW);
    expect(s).toMatchObject({ kind: "gig", status: "drafted", proposal: "Hi", updatedAt: NOW });
  });
  it("keeps a later status when the proposal is edited", () => {
    const sent = applyAction(undefined, "gig", { type: "bid", amount: 18000, currency: "INR" }, NOW);
    const edited = applyAction(sent, "gig", { type: "proposal", proposal: "v2" }, NOW);
    expect(edited.status).toBe("sent");
    expect(edited.proposal).toBe("v2");
  });
  it("records a bid with a follow-up in 3 days", () => {
    const s = applyAction(undefined, "gig", { type: "bid", amount: 18000, currency: "INR" }, NOW);
    expect(s).toMatchObject({
      status: "sent",
      bidAmount: 18000,
      bidCurrency: "INR",
      sentAt: NOW,
      followUpAt: "2026-09-29T10:00:00.000Z",
    });
  });
  it("marks a WhatsApp send the same way", () => {
    const s = applyAction(undefined, "local", { type: "sent" }, NOW);
    expect(s).toMatchObject({ kind: "local", status: "sent", sentAt: NOW, followUpAt: "2026-09-29T10:00:00.000Z" });
  });
  it("clears the follow-up for closed stages and skip", () => {
    const sent = applyAction(undefined, "gig", { type: "sent" }, NOW);
    for (const status of ["won", "lost", "skipped"] as const) {
      expect(applyAction(sent, "gig", { type: "stage", status }, NOW).followUpAt).toBeUndefined();
    }
    expect(applyAction(sent, "gig", { type: "skip" }, NOW)).toMatchObject({ status: "skipped", followUpAt: undefined });
    expect(applyAction(sent, "gig", { type: "stage", status: "replied" }, NOW).followUpAt).toBe(sent.followUpAt);
  });
  it("sets and clears follow-up dates and notes", () => {
    const a = applyAction(undefined, "local", { type: "followUp", followUpAt: "2026-09-28T05:30:00.000Z" }, NOW);
    expect(a.followUpAt).toBe("2026-09-28T05:30:00.000Z");
    expect(applyAction(a, "local", { type: "followUp", followUpAt: null }, NOW).followUpAt).toBeUndefined();
    expect(applyAction(a, "local", { type: "notes", notes: "call Monday" }, NOW).notes).toBe("call Monday");
  });
});

describe("ActionSchema", () => {
  it("accepts valid actions and rejects bad ones", () => {
    expect(ActionSchema.safeParse({ type: "bid", amount: 380, currency: "USD" }).success).toBe(true);
    expect(ActionSchema.safeParse({ type: "stage", status: "won" }).success).toBe(true);
    expect(ActionSchema.safeParse({ type: "stage", status: "bogus" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "bid", amount: -1, currency: "INR" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "proposal", proposal: "x".repeat(5001) }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});
```

`lib/state-route.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/state/[id]/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { toParam } from "@/lib/ids";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(() => setStoreForTests(createStore(new MemoryBackend())));

const call = (id: string, kind: string, body: unknown, withCookie = true) =>
  PATCH(
    new Request(`https://x.test/api/state/${toParam(id)}?kind=${kind}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: toParam(id) }) },
  );

describe("PATCH /api/state/[id]", () => {
  it("requires a session", async () => {
    expect((await call("freelancer.com:1", "gig", { type: "skip" }, false)).status).toBe(401);
  });
  it("rejects a bad kind or body", async () => {
    expect((await call("freelancer.com:1", "other", { type: "skip" })).status).toBe(400);
    expect((await call("freelancer.com:1", "gig", { type: "nope" })).status).toBe(400);
  });
  it("applies the action and persists it", async () => {
    const res = await call("freelancer.com:1", "gig", { type: "bid", amount: 7000, currency: "INR" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { state: { status: string; bidAmount: number } };
    expect(json.state).toMatchObject({ status: "sent", bidAmount: 7000 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/state.test.ts lib/state-route.test.ts`
Expected: FAIL — `./state` and the route module do not exist.

- [ ] **Step 3: Implement `lib/state.ts`**

```ts
import { z } from "zod";
import { STATUSES, type LeadKind, type LeadState, type Status } from "./types";
import { addDaysISO } from "./time";

export const FOLLOW_UP_DAYS = 3;
const CLOSED: Status[] = ["won", "lost", "skipped"];

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("proposal"), proposal: z.string().max(5000) }),
  z.object({ type: z.literal("bid"), amount: z.number().positive().max(100_000_000), currency: z.string().min(1).max(8) }),
  z.object({ type: z.literal("sent") }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("stage"), status: z.enum(STATUSES as [Status, ...Status[]]) }),
  z.object({ type: z.literal("followUp"), followUpAt: z.string().datetime().nullable() }),
  z.object({ type: z.literal("notes"), notes: z.string().max(2000) }),
]);
export type Action = z.infer<typeof ActionSchema>;

export function applyAction(prev: LeadState | undefined, kind: LeadKind, action: Action, nowIso: string): LeadState {
  const s: LeadState = { ...(prev ?? { kind, status: "new", updatedAt: nowIso }), updatedAt: nowIso };
  switch (action.type) {
    case "proposal":
      s.proposal = action.proposal;
      if (s.status === "new") s.status = "drafted";
      break;
    case "bid":
      s.status = "sent";
      s.bidAmount = action.amount;
      s.bidCurrency = action.currency;
      s.sentAt = nowIso;
      s.followUpAt = addDaysISO(nowIso, FOLLOW_UP_DAYS);
      break;
    case "sent":
      s.status = "sent";
      s.sentAt = nowIso;
      s.followUpAt = addDaysISO(nowIso, FOLLOW_UP_DAYS);
      break;
    case "skip":
      s.status = "skipped";
      delete s.followUpAt;
      break;
    case "stage":
      s.status = action.status;
      if (CLOSED.includes(action.status)) delete s.followUpAt;
      break;
    case "followUp":
      if (action.followUpAt) s.followUpAt = action.followUpAt;
      else delete s.followUpAt;
      break;
    case "notes":
      s.notes = action.notes;
      break;
  }
  return s;
}
```

- [ ] **Step 4: Implement `app/api/state/[id]/route.ts`**

```ts
import { requireSession } from "@/lib/auth/guard";
import { fromParam } from "@/lib/ids";
import { ActionSchema, applyAction } from "@/lib/state";
import { getStore } from "@/lib/store";
import type { LeadKind, LeadState } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind !== "gig" && kind !== "local") {
    return Response.json({ ok: false, error: "kind must be gig or local" }, { status: 400 });
  }
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid action" }, { status: 400 });
  const id = fromParam((await ctx.params).id);
  const now = new Date().toISOString();
  let state: LeadState | undefined;
  await getStore().mutateData((d) => {
    state = applyAction(d.state[id], kind as LeadKind, parsed.data, now);
    d.state[id] = state;
    return d;
  });
  return Response.json({ ok: true, state });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/state.test.ts lib/state-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/state.ts lib/state.test.ts lib/state-route.test.ts "app/api/state/[id]/route.ts"
git commit -m "Lead state transitions (bid, sent, stage, follow-up, notes) and PATCH /api/state/[id]

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Gig engine — text utils, scoring, source parsers, fetchers, merge, live status

Ported from `C:/kalpesh/kal/lead-hunter/bot.js` (lines 20–122 and 126–293) with these deliberate changes: every source parser is a pure function over the payload (testable offline); an invalid date becomes `""` instead of throwing (bot.js lost the whole WWR/Jobicy source on one bad date); items without a stable id or URL are skipped (bot.js fell back to the array index); the Freelancer budget uses one currency prefix for both ends (bot.js could print "undefined"); the four Freelancer queries run in parallel; per-request timeout 15 s. Reddit (blocks cloud IPs) and Arbeitnow (disabled in bot.js as German full-time noise) are not ported.

**Files:**
- Create: `lib/gigs/text.ts`, `lib/gigs/lead.ts`, `lib/gigs/parsers.ts`, `lib/gigs/sources.ts`, `lib/gigs/merge.ts`, `lib/gigs/live.ts`
- Test: `lib/gigs/lead.test.ts`, `lib/gigs/parsers.test.ts`, `lib/gigs/merge.test.ts`, `lib/gigs/sources.test.ts`, `lib/gigs/live.test.ts`

**Interfaces:**
- Consumes: `Gig` (Task 1), `DAY_MS` (Task 1).
- Produces:
  - `text.ts`: `decodeEntities(s)`, `strip(html: unknown): string`, `safeIso(value: unknown, unit?: "iso" | "s"): string`.
  - `lead.ts`: `type LeadDraft = Omit<Gig, "score" | "fetchedAt">`, `KEYWORDS`, `FREELANCER_QUERIES`, `MAX_AGE_DAYS = 21`, `makeLead(o: RawLead): LeadDraft | null`, `keywordHits(l)`, `score(l: LeadDraft, now: number): number`, `isTooOld(iso, now, maxAgeDays?)`.
  - `parsers.ts`: `parseFreelancer`, `findHNThreadId`, `parseHNThread`, `parseRemotive`, `parseRemoteOK`, `parseWWR`, `parseWorkingNomads`, `parseJobicy`, `parseHimalayas` — each `(payload) => LeadDraft[]` except `findHNThreadId(payload) => string | null`.
  - `sources.ts`: `fetchText(url, timeoutMs?)`, `fetchJSON(url, timeoutMs?)`, `interface Source { key: string; run: () => Promise<LeadDraft[]> }`, `SOURCES: Source[]`, `fetchAll(sources?: Source[]): Promise<{ leads: LeadDraft[]; failed: string[] }>`.
  - `merge.ts`: `filterFetched(leads, now): LeadDraft[]`, `mergeGigs(existing: Gig[], fresh: LeadDraft[], now: number, opts?: { keepDays?: number; cap?: number; keepIds?: Set<string> }): { items: Gig[]; added: number }`.
  - `live.ts`: `freelancerProjectId(gigId): number | null`, `interface LiveInfo { open: boolean; status: string; bidCount: number | null; bidAvg: number | null; currency: string }`, `parseLive(payload, pid): LiveInfo | null`, `fetchLive(pid): Promise<LiveInfo | null>`.

- [ ] **Step 1: Write the failing tests**

`lib/gigs/lead.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTooOld, keywordHits, makeLead, score } from "./lead";
import { safeIso, strip } from "./text";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;

describe("text helpers", () => {
  it("strips tags and decodes entities", () => {
    expect(strip("<p>React &amp; Node&#39;s</p>  <br>x")).toBe("React & Node's x");
    expect(strip(undefined)).toBe("");
  });
  it("safeIso never throws", () => {
    expect(safeIso(1790000000, "s")).toBe(new Date(1790000000 * 1000).toISOString());
    expect(safeIso("Fri, 25 Sep 2026 10:00:00 +0000")).toBe("2026-09-25T10:00:00.000Z");
    expect(safeIso("garbage")).toBe("");
    expect(safeIso(undefined)).toBe("");
    expect(safeIso("")).toBe("");
  });
});

describe("makeLead", () => {
  it("builds a lead and lowercases/trims tags", () => {
    expect(makeLead({ source: "remotive", id: 7, title: "<b>Dev</b>", url: " https://a.b/c ", tags: [" React ", "", null] })).toEqual({
      id: "remotive:7", source: "remotive", title: "Dev", desc: "", url: "https://a.b/c", date: "", budget: "", tags: ["react"], extra: "",
    });
  });
  it("skips items without a stable id or url", () => {
    expect(makeLead({ source: "x", id: undefined, url: "https://a" })).toBeNull();
    expect(makeLead({ source: "x", id: "", url: "https://a" })).toBeNull();
    expect(makeLead({ source: "x", id: 1, url: "" })).toBeNull();
  });
});

describe("score", () => {
  const base = { id: "freelancer.com:1", source: "freelancer.com", title: "React developer for dashboard", desc: "Need node and typescript", url: "https://x", tags: [], budget: "$100–$200", extra: "low-bids (3 bids)", date: new Date(NOW - DAY).toISOString() };
  it("counts keywords in title (x3, max 9) and body (max 5)", () => {
    expect(keywordHits(base)).toEqual({ inTitle: 2, inBody: 2 });
  });
  it("adds recency, budget, freelance-source and low-bid bonuses", () => {
    expect(score(base, NOW)).toBe(19); // 6 + 2 + 4 + 2 + 3 + 2
    expect(score({ ...base, source: "remotive", budget: "", extra: "", date: new Date(NOW - 10 * DAY).toISOString() }, NOW)).toBe(9); // 6 + 2 + 1
    expect(score({ ...base, source: "remotive", budget: "", extra: "", date: "" }, NOW)).toBe(8);
  });
  it("isTooOld keeps undated and unparseable dates", () => {
    expect(isTooOld(new Date(NOW - 22 * DAY).toISOString(), NOW)).toBe(true);
    expect(isTooOld(new Date(NOW - 20 * DAY).toISOString(), NOW)).toBe(false);
    expect(isTooOld("nope", NOW)).toBe(false);
  });
});
```

`lib/gigs/parsers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  findHNThreadId, parseFreelancer, parseHimalayas, parseHNThread, parseJobicy,
  parseRemoteOK, parseRemotive, parseWorkingNomads, parseWWR,
} from "./parsers";

const S = 1790000000; // epoch seconds
const ISO_S = new Date(S * 1000).toISOString();

describe("parseFreelancer", () => {
  it("maps projects, budget, tags and bid counts; skips projects without a URL", () => {
    const out = parseFreelancer({ result: { projects: [
      { id: 101, title: "React <b>dashboard</b>", description: "Build &amp; ship", seo_url: "react/React-dashboard", submitdate: S, budget: { minimum: 250, maximum: 750 }, currency: { sign: "$", code: "USD" }, type: "fixed", jobs: [{ name: "React.js" }, { name: "Node.js" }], bid_stats: { bid_count: 4 } },
      { id: 102, title: "Hourly", description: "", preview_description: "Preview text", seo_url: "x/Hourly", submitdate: S, budget: { minimum: 10 }, currency: { code: "INR" }, type: "hourly", jobs: [], bid_stats: { bid_count: 25 } },
      { id: 103, title: "No url" },
    ] } });
    expect(out).toEqual([
      { id: "freelancer.com:101", source: "freelancer.com", title: "React dashboard", desc: "Build & ship", url: "https://www.freelancer.com/projects/react/React-dashboard", date: ISO_S, budget: "$250–$750", tags: ["react.js", "node.js"], extra: "low-bids (4 bids)" },
      { id: "freelancer.com:102", source: "freelancer.com", title: "Hourly", desc: "Preview text", url: "https://www.freelancer.com/projects/x/Hourly", date: ISO_S, budget: "INR10+/hr", tags: [], extra: "25 bids" },
    ]);
  });
  it("tolerates an empty payload", () => {
    expect(parseFreelancer({})).toEqual([]);
  });
});

describe("Hacker News", () => {
  it("finds the monthly freelancer thread and keeps only SEEKING FREELANCER comments", () => {
    expect(findHNThreadId({ hits: [{ title: "Ask HN: Who is hiring?", objectID: "1" }, { title: "Ask HN: Freelancer? Seeking freelancer? (October 2026)", objectID: "42" }] })).toBe("42");
    expect(findHNThreadId({ hits: [] })).toBeNull();
    const out = parseHNThread({ children: [
      { id: 1, text: "<p>SEEKING FREELANCER | React dev</p>", created_at: "2026-10-01T10:00:00.000Z", author: "acme" },
      { id: 2, text: "SEEKING WORK - me" },
    ] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "hn-thread:1", title: "SEEKING FREELANCER | React dev", url: "https://news.ycombinator.com/item?id=1", date: "2026-10-01T10:00:00.000Z", extra: "by acme" });
  });
});

describe("job boards", () => {
  it("parseRemotive", () => {
    expect(parseRemotive({ jobs: [{ id: 7, title: "Full Stack Engineer", description: "<p>Node</p>", url: "https://remotive.com/x", publication_date: "2026-09-20T08:00:00Z", salary: "$50k", tags: ["react"], company_name: "Acme", job_type: "contract" }] })).toEqual([
      { id: "remotive:7", source: "remotive", title: "Full Stack Engineer", desc: "Node", url: "https://remotive.com/x", date: "2026-09-20T08:00:00.000Z", budget: "$50k", tags: ["react"], extra: "Acme · contract" },
    ]);
  });
  it("parseRemoteOK skips the legal notice row", () => {
    const out = parseRemoteOK([{ legal: "terms" }, { id: "9", position: "Senior React Dev", description: "d", url: "https://remoteok.com/remote-jobs/9", date: "2026-09-25T00:00:00+00:00", salary_min: 80000, salary_max: 120000, tags: ["React"], company: "Co" }]);
    expect(out).toEqual([
      { id: "remoteok:9", source: "remoteok", title: "Senior React Dev", desc: "d", url: "https://remoteok.com/remote-jobs/9", date: "2026-09-25T00:00:00.000Z", budget: "$80000–$120000/yr", tags: ["react"], extra: "Co" },
    ]);
  });
  it("parseWWR reads RSS items, unwraps CDATA and survives bad dates", () => {
    const xml = `<rss><channel>
<item><title><![CDATA[Acme: Full-Stack Developer]]></title><link>https://weworkremotely.com/remote-jobs/acme-fs</link><pubDate>Fri, 25 Sep 2026 10:00:00 +0000</pubDate><description><![CDATA[<p>React &amp; Node</p>]]></description><category>Full-Stack Programming</category><region>Anywhere in the World</region></item>
<item><title>No link</title></item>
<item><title>Bad date</title><link>https://weworkremotely.com/remote-jobs/bad</link><pubDate>garbage</pubDate></item>
</channel></rss>`;
    expect(parseWWR(xml)).toEqual([
      { id: "weworkremotely:https://weworkremotely.com/remote-jobs/acme-fs", source: "weworkremotely", title: "Acme: Full-Stack Developer", desc: "React & Node", url: "https://weworkremotely.com/remote-jobs/acme-fs", date: "2026-09-25T10:00:00.000Z", budget: "", tags: ["full-stack programming"], extra: "Anywhere in the World" },
      { id: "weworkremotely:https://weworkremotely.com/remote-jobs/bad", source: "weworkremotely", title: "Bad date", desc: "", url: "https://weworkremotely.com/remote-jobs/bad", date: "", budget: "", tags: [], extra: "" },
    ]);
  });
  it("parseWorkingNomads splits comma tags and skips items without a url", () => {
    expect(parseWorkingNomads([{ url: "https://www.workingnomads.com/jobs/1", title: "React Dev", description: "d", pub_date: "2026-09-24T00:00:00Z", tags: "react, node", company_name: "C", location: "Remote" }, { title: "no url" }])).toEqual([
      { id: "workingnomads:https://www.workingnomads.com/jobs/1", source: "workingnomads", title: "React Dev", desc: "d", url: "https://www.workingnomads.com/jobs/1", date: "2026-09-24T00:00:00.000Z", budget: "", tags: ["react", "node"], extra: "C · Remote" },
    ]);
  });
  it("parseJobicy", () => {
    expect(parseJobicy({ jobs: [{ id: 5, jobTitle: "Frontend Dev", jobExcerpt: "x", url: "https://jobicy.com/jobs/5", pubDate: "2026-09-23T10:00:00Z", annualSalaryMin: 60000, annualSalaryMax: 90000, salaryCurrency: "USD", jobIndustry: ["Dev"], jobType: ["contract"], companyName: "J" }] })).toEqual([
      { id: "jobicy:5", source: "jobicy", title: "Frontend Dev", desc: "x", url: "https://jobicy.com/jobs/5", date: "2026-09-23T10:00:00.000Z", budget: "USD60000–90000/yr", tags: ["dev", "contract"], extra: "J" },
    ]);
  });
  it("parseHimalayas uses epoch seconds", () => {
    expect(parseHimalayas({ jobs: [{ guid: "g1", title: "Full stack", excerpt: "e", applicationLink: "https://himalayas.app/jobs/g1", pubDate: S, minSalary: 50000, maxSalary: 70000, currency: "USD", salaryPeriod: "year", categories: ["Engineering"], companyName: "H" }] })).toEqual([
      { id: "himalayas:g1", source: "himalayas", title: "Full stack", desc: "e", url: "https://himalayas.app/jobs/g1", date: ISO_S, budget: "USD50000–70000/year", tags: ["engineering"], extra: "H" },
    ]);
  });
});
```

`lib/gigs/merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterFetched, mergeGigs } from "./merge";
import type { LeadDraft } from "./lead";
import type { Gig } from "@/lib/types";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const lead = (id: string, over: Partial<LeadDraft> = {}): LeadDraft => ({
  id, source: "remotive", title: "React developer", desc: "", url: `https://x/${id}`, date: iso(1), budget: "", tags: [], extra: "", ...over,
});

describe("filterFetched", () => {
  it("drops duplicates, stale gigs and gigs with no keyword; keeps undated ones", () => {
    const out = filterFetched([
      lead("a"),
      lead("a"),                                   // same id
      lead("b", { url: "https://x/a" }),           // same url
      lead("c", { date: iso(22) }),                // older than 21 days
      lead("d", { title: "Chef wanted" }),         // no keyword
      lead("e", { date: "" }),                     // undated → kept
    ], NOW);
    expect(out.map((l) => l.id)).toEqual(["a", "e"]);
  });
});

describe("mergeGigs", () => {
  const old = (id: string, over: Partial<Gig> = {}): Gig => ({ ...lead(id), score: 1, fetchedAt: iso(5), ...over });

  it("adds new gigs with fetchedAt=now and refreshes existing ones in place", () => {
    const { items, added } = mergeGigs([old("a", { extra: "3 bids" })], [lead("a", { extra: "40 bids" }), lead("b")], NOW);
    expect(added).toBe(1);
    const a = items.find((g) => g.id === "a")!;
    expect(a.extra).toBe("40 bids");
    expect(a.fetchedAt).toBe(iso(5));
    expect(items.find((g) => g.id === "b")!.fetchedAt).toBe(new Date(NOW).toISOString());
    expect(items.every((g) => g.score > 1)).toBe(true); // rescored
  });

  it("drops gigs older than 30 days unless pinned by keepIds", () => {
    const stale = old("s", { date: iso(40), fetchedAt: iso(40) });
    const pinned = old("p", { date: iso(40), fetchedAt: iso(40) });
    const { items } = mergeGigs([stale, pinned], [], NOW, { keepIds: new Set(["p"]) });
    expect(items.map((g) => g.id)).toEqual(["p"]);
  });

  it("caps the list by score but never drops pinned gigs", () => {
    const many = Array.from({ length: 10 }, (_, i) => old(`g${i}`, { title: i < 5 ? "React node dashboard saas api" : "React" }));
    const { items } = mergeGigs(many, [], NOW, { cap: 3, keepIds: new Set(["g9"]) });
    expect(items).toHaveLength(3);
    expect(items.map((g) => g.id)).toContain("g9");
  });
});
```

`lib/gigs/sources.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fetchAll, SOURCES } from "./sources";

describe("fetchAll", () => {
  it("collects leads from sources that succeed and names the ones that fail", async () => {
    const res = await fetchAll([
      { key: "ok", run: async () => [{ id: "ok:1", source: "ok", title: "t", desc: "", url: "https://u", date: "", budget: "", tags: [], extra: "" }] },
      { key: "bad", run: async () => { throw new Error("HTTP 500"); } },
    ]);
    expect(res.leads.map((l) => l.id)).toEqual(["ok:1"]);
    expect(res.failed).toEqual(["bad"]);
  });
  it("wires exactly the eight ported sources", () => {
    expect(SOURCES.map((s) => s.key)).toEqual([
      "freelancer.com", "hn-thread", "remotive", "remoteok", "weworkremotely", "workingnomads", "jobicy", "himalayas",
    ]);
  });
});
```

`lib/gigs/live.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { freelancerProjectId, parseLive } from "./live";

describe("live status", () => {
  it("extracts the Freelancer project id", () => {
    expect(freelancerProjectId("freelancer.com:40734895")).toBe(40734895);
    expect(freelancerProjectId("remotive:7")).toBeNull();
  });
  it("parses an open project", () => {
    expect(parseLive({ result: { id: 5, status: "active", frontend_project_status: "open", bid_stats: { bid_count: 52, bid_avg: 24640.4 }, currency: { code: "INR" } } }, 5)).toEqual({
      open: true, status: "open", bidCount: 52, bidAvg: 24640, currency: "INR",
    });
  });
  it("reports closed projects and rejects a payload for another project", () => {
    expect(parseLive({ result: { id: 5, status: "closed", frontend_project_status: "closed", bid_stats: {} , currency: {} } }, 5)).toEqual({
      open: false, status: "closed", bidCount: null, bidAvg: null, currency: "",
    });
    expect(parseLive({ result: { id: 6 } }, 5)).toBeNull();
    expect(parseLive({}, 5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/gigs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/gigs/text.ts`**

```ts
export function decodeEntities(s: unknown): string {
  return String(s ?? "")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Remove tags, decode entities, collapse whitespace. */
export function strip(html: unknown): string {
  return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** ISO string from a date string (unit "iso") or epoch seconds (unit "s"); "" when missing or invalid. */
export function safeIso(value: unknown, unit: "iso" | "s" = "iso"): string {
  if (value === undefined || value === null || value === "") return "";
  const t = unit === "s" ? Number(value) * 1000 : Date.parse(String(value));
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString();
}
```

- [ ] **Step 4: Implement `lib/gigs/lead.ts`**

```ts
import type { Gig } from "@/lib/types";
import { DAY_MS } from "@/lib/time";
import { strip } from "./text";

export type LeadDraft = Omit<Gig, "score" | "fetchedAt">;

export const KEYWORDS = [
  "full stack", "fullstack", "full-stack",
  "react", "next.js", "nextjs", "node", "express",
  "javascript", "typescript", "mern", "mongodb", "postgres", "mysql",
  "web app", "web develop", "website", "frontend", "front-end",
  "backend", "back-end", "api", "dashboard", "saas", "wordpress", "shopify",
];
export const FREELANCER_QUERIES = ["full stack", "react", "node.js", "website"];
export const MAX_AGE_DAYS = 21;
const FREELANCE_SOURCES = new Set(["freelancer.com", "hn-thread", "reddit"]);

export interface RawLead {
  source: string;
  id: string | number | null | undefined;
  title?: unknown;
  desc?: unknown;
  url?: unknown;
  date?: string;
  budget?: string;
  tags?: unknown[];
  extra?: string;
}

/** Normalise one source item. Returns null when it has no stable id or no URL. */
export function makeLead(o: RawLead): LeadDraft | null {
  if (o.id === undefined || o.id === null || o.id === "") return null;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) return null;
  return {
    id: `${o.source}:${o.id}`,
    source: o.source,
    title: strip(o.title).slice(0, 160) || "(untitled)",
    desc: strip(o.desc).slice(0, 700),
    url,
    date: o.date || "",
    budget: o.budget || "",
    tags: (o.tags ?? [])
      .filter((t) => t !== null && t !== undefined)
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8),
    extra: o.extra || "",
  };
}

/** Plain substring matching, same as bot.js ("api" also matches "rapid"). */
export function keywordHits(l: Pick<LeadDraft, "title" | "desc" | "tags">): { inTitle: number; inBody: number } {
  const title = l.title.toLowerCase();
  const body = `${l.desc} ${l.tags.join(" ")}`.toLowerCase();
  let inTitle = 0;
  let inBody = 0;
  for (const k of KEYWORDS) {
    if (title.includes(k)) inTitle++;
    else if (body.includes(k)) inBody++;
  }
  return { inTitle, inBody };
}

export function score(l: LeadDraft, now: number): number {
  const { inTitle, inBody } = keywordHits(l);
  let s = Math.min(inTitle * 3, 9) + Math.min(inBody, 5);
  const t = l.date ? Date.parse(l.date) : NaN;
  const age = Number.isFinite(t) ? (now - t) / DAY_MS : 99;
  if (age <= 2) s += 4;
  else if (age <= 7) s += 2;
  else if (age <= 14) s += 1;
  if (l.budget) s += 2;
  if (FREELANCE_SOURCES.has(l.source)) s += 3;
  if (l.extra.includes("low-bids")) s += 2;
  return s;
}

export function isTooOld(iso: string, now: number, maxAgeDays: number = MAX_AGE_DAYS): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t > maxAgeDays * DAY_MS;
}
```

- [ ] **Step 5: Implement `lib/gigs/parsers.ts`**

```ts
/* External payloads are untyped JSON; each field is checked where it is read. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeLead, type LeadDraft } from "./lead";
import { safeIso, strip } from "./text";

type Json = any;
const keep = (x: LeadDraft | null): x is LeadDraft => x !== null;

export function parseFreelancer(j: Json): LeadDraft[] {
  return ((j?.result?.projects ?? []) as Json[])
    .map((p) => {
      const b = p.budget ?? {};
      const cur = p.currency ?? {};
      const sign = cur.sign || cur.code || "";
      const budget = b.minimum
        ? `${sign}${b.minimum}${b.maximum ? "–" + sign + b.maximum : "+"}${p.type === "hourly" ? "/hr" : ""}`
        : "";
      const bids = p.bid_stats?.bid_count;
      return makeLead({
        source: "freelancer.com",
        id: p.id,
        title: p.title,
        desc: p.description || p.preview_description,
        url: p.seo_url ? "https://www.freelancer.com/projects/" + p.seo_url : "",
        date: safeIso(p.submitdate, "s"),
        budget,
        tags: ((p.jobs ?? []) as Json[]).map((x) => x?.name),
        extra: typeof bids === "number" ? (bids < 10 ? `low-bids (${bids} bids)` : `${bids} bids`) : "",
      });
    })
    .filter(keep);
}

export function findHNThreadId(search: Json): string | null {
  const hit = ((search?.hits ?? []) as Json[]).find((h) => /freelancer\? seeking freelancer\?/i.test(h?.title ?? ""));
  return hit ? String(hit.objectID) : null;
}

export function parseHNThread(thread: Json): LeadDraft[] {
  return ((thread?.children ?? []) as Json[])
    .map((c) => {
      const text = strip(c?.text);
      if (!/SEEKING\s+FREELANCER/i.test(text)) return null; // "SEEKING WORK" posts are freelancers
      return makeLead({
        source: "hn-thread",
        id: c.id,
        title: text.slice(0, 110),
        desc: text,
        url: "https://news.ycombinator.com/item?id=" + c.id,
        date: safeIso(c.created_at),
        extra: "by " + (c.author || "?"),
      });
    })
    .filter(keep);
}

export function parseRemotive(j: Json): LeadDraft[] {
  return ((j?.jobs ?? []) as Json[])
    .map((x) =>
      makeLead({
        source: "remotive", id: x.id, title: x.title, desc: x.description, url: x.url,
        date: safeIso(x.publication_date), budget: x.salary || "", tags: x.tags ?? [],
        extra: [x.company_name, x.job_type].filter(Boolean).join(" · "),
      }),
    )
    .filter(keep);
}

export function parseRemoteOK(arr: Json): LeadDraft[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(1) // first element is the API's legal notice
    .map((x: Json) =>
      makeLead({
        source: "remoteok", id: x.id || x.slug, title: x.position, desc: x.description, url: x.url,
        date: safeIso(x.date),
        budget: x.salary_min ? `$${x.salary_min}–$${x.salary_max || "?"}/yr` : "",
        tags: x.tags ?? [], extra: x.company || "",
      }),
    )
    .filter(keep);
}

export function parseWWR(xml: string): LeadDraft[] {
  const items = String(xml ?? "").match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const pick = (block: string, tag: string) => {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1]!.replace(/^<!\[CDATA\[|\]\]>$/g, "") : "";
  };
  return items
    .map((it) => {
      const link = pick(it, "link").trim();
      return makeLead({
        source: "weworkremotely", id: link, title: pick(it, "title"), desc: pick(it, "description"), url: link,
        date: safeIso(pick(it, "pubDate")),
        tags: [pick(it, "category")].filter(Boolean),
        extra: pick(it, "region"),
      });
    })
    .filter(keep);
}

export function parseWorkingNomads(arr: Json): LeadDraft[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x: Json) =>
      makeLead({
        source: "workingnomads", id: x.url, title: x.title, desc: x.description, url: x.url,
        date: safeIso(x.pub_date),
        tags: String(x.tags ?? "").split(","),
        extra: [x.company_name, x.location].filter(Boolean).join(" · "),
      }),
    )
    .filter(keep);
}

export function parseJobicy(j: Json): LeadDraft[] {
  return ((j?.jobs ?? []) as Json[])
    .map((x) =>
      makeLead({
        source: "jobicy", id: x.id || x.url, title: x.jobTitle, desc: x.jobExcerpt, url: x.url,
        date: safeIso(x.pubDate),
        budget: x.annualSalaryMin ? `${x.salaryCurrency || "$"}${x.annualSalaryMin}–${x.annualSalaryMax || "?"}/yr` : "",
        tags: [...(x.jobIndustry ?? []), ...(x.jobType ?? [])],
        extra: x.companyName || "",
      }),
    )
    .filter(keep);
}

export function parseHimalayas(j: Json): LeadDraft[] {
  return ((j?.jobs ?? []) as Json[])
    .map((x) =>
      makeLead({
        source: "himalayas", id: x.guid || x.applicationLink, title: x.title, desc: x.excerpt || x.description,
        url: x.applicationLink, date: safeIso(x.pubDate, "s"),
        budget: x.minSalary ? `${x.currency || "$"}${x.minSalary}–${x.maxSalary || "?"}/${x.salaryPeriod || "yr"}` : "",
        tags: x.categories ?? [], extra: x.companyName || "",
      }),
    )
    .filter(keep);
}
```

- [ ] **Step 6: Implement `lib/gigs/sources.ts`**

```ts
import { FREELANCER_QUERIES, type LeadDraft } from "./lead";
import {
  findHNThreadId, parseFreelancer, parseHimalayas, parseHNThread, parseJobicy,
  parseRemoteOK, parseRemotive, parseWorkingNomads, parseWWR,
} from "./parsers";

const UA = "Mozilla/5.0 (compatible; ClientPilot/1.0; personal job aggregator)";

export async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function fetchJSON(url: string, timeoutMs?: number): Promise<unknown> {
  return JSON.parse(await fetchText(url, timeoutMs));
}

export interface Source {
  key: string;
  run: () => Promise<LeadDraft[]>;
}

const freelancerUrl = (q: string) =>
  "https://www.freelancer.com/api/projects/0.1/projects/active/?query=" +
  encodeURIComponent(q) + "&limit=30&full_description=true&job_details=true";

export const SOURCES: Source[] = [
  {
    key: "freelancer.com",
    run: async () => {
      const pages = await Promise.all(FREELANCER_QUERIES.map((q) => fetchJSON(freelancerUrl(q))));
      const seen = new Set<string>();
      return pages.flatMap(parseFreelancer).filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
    },
  },
  {
    key: "hn-thread",
    run: async () => {
      const id = findHNThreadId(await fetchJSON("https://hn.algolia.com/api/v1/search_by_date?query=%22Seeking%20freelancer%22&tags=story&hitsPerPage=5"));
      return id ? parseHNThread(await fetchJSON("https://hn.algolia.com/api/v1/items/" + id)) : [];
    },
  },
  { key: "remotive", run: async () => parseRemotive(await fetchJSON("https://remotive.com/api/remote-jobs?search=" + encodeURIComponent("full stack") + "&limit=50")) },
  { key: "remoteok", run: async () => parseRemoteOK(await fetchJSON("https://remoteok.com/api")) },
  { key: "weworkremotely", run: async () => parseWWR(await fetchText("https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss")) },
  { key: "workingnomads", run: async () => parseWorkingNomads(await fetchJSON("https://www.workingnomads.com/api/exposed_jobs/")) },
  { key: "jobicy", run: async () => parseJobicy(await fetchJSON("https://jobicy.com/api/v2/remote-jobs?count=50&industry=dev")) },
  { key: "himalayas", run: async () => parseHimalayas(await fetchJSON("https://himalayas.app/jobs/api?limit=100")) },
];

/** Runs every source in parallel; one failing source never stops the others. */
export async function fetchAll(sources: Source[] = SOURCES): Promise<{ leads: LeadDraft[]; failed: string[] }> {
  const results = await Promise.allSettled(sources.map((s) => s.run()));
  const leads: LeadDraft[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") leads.push(...r.value);
    else failed.push(sources[i]!.key);
  });
  return { leads, failed };
}
```

- [ ] **Step 7: Implement `lib/gigs/merge.ts`**

```ts
import type { Gig } from "@/lib/types";
import { DAY_MS } from "@/lib/time";
import { isTooOld, keywordHits, score, type LeadDraft } from "./lead";

/** Same filter as bot.js: needs a URL, first occurrence of an id/url wins, ≤ 21 days old, ≥ 1 keyword hit. */
export function filterFetched(leads: LeadDraft[], now: number): LeadDraft[] {
  const seen = new Set<string>();
  return leads.filter((l) => {
    if (!l.url || seen.has(l.id) || seen.has(l.url)) return false;
    seen.add(l.id);
    seen.add(l.url);
    if (l.date && isTooOld(l.date, now)) return false;
    const { inTitle, inBody } = keywordHits(l);
    return inTitle + inBody > 0;
  });
}

const when = (g: Gig) => Date.parse(g.date || g.fetchedAt);
const byRank = (a: Gig, b: Gig) => b.score - a.score || (when(b) || 0) - (when(a) || 0);

/**
 * Merge a cron run into the stored list. Existing gigs keep their first fetchedAt;
 * everything is rescored; gigs older than `keepDays` are dropped and the list is
 * capped at `cap` — except `keepIds` (gigs Kalpesh has acted on), which always stay.
 */
export function mergeGigs(
  existing: Gig[],
  fresh: LeadDraft[],
  now: number,
  opts: { keepDays?: number; cap?: number; keepIds?: Set<string> } = {},
): { items: Gig[]; added: number } {
  const keepDays = opts.keepDays ?? 30;
  const cap = opts.cap ?? 600;
  const keepIds = opts.keepIds ?? new Set<string>();
  const nowIso = new Date(now).toISOString();

  const byId = new Map(existing.map((g) => [g.id, g]));
  let added = 0;
  for (const f of fresh) {
    const prev = byId.get(f.id);
    if (prev) byId.set(f.id, { ...prev, ...f, fetchedAt: prev.fetchedAt, score: 0 });
    else {
      byId.set(f.id, { ...f, fetchedAt: nowIso, score: 0 });
      added++;
    }
  }

  const cutoff = now - keepDays * DAY_MS;
  const rescored = [...byId.values()].map((g) => ({ ...g, score: score(g, now) }));
  const alive = rescored.filter((g) => keepIds.has(g.id) || !Number.isFinite(when(g)) || when(g) >= cutoff);
  const pinned = alive.filter((g) => keepIds.has(g.id));
  const rest = alive
    .filter((g) => !keepIds.has(g.id))
    .sort(byRank)
    .slice(0, Math.max(0, cap - pinned.length));
  return { items: [...pinned, ...rest].sort(byRank), added };
}
```

- [ ] **Step 8: Implement `lib/gigs/live.ts`**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface LiveInfo {
  open: boolean;
  status: string;
  bidCount: number | null;
  bidAvg: number | null;
  currency: string;
}

export function freelancerProjectId(gigId: string): number | null {
  const m = /^freelancer\.com:(\d+)$/.exec(gigId);
  return m ? Number(m[1]) : null;
}

function toLive(p: any): LiveInfo {
  const status = String(p.frontend_project_status || p.status || "");
  const count = p.bid_stats?.bid_count;
  const avg = p.bid_stats?.bid_avg;
  return {
    open: p.frontend_project_status ? p.frontend_project_status === "open" : p.status === "active",
    status,
    bidCount: typeof count === "number" ? count : null,
    bidAvg: typeof avg === "number" ? Math.round(avg) : null,
    currency: p.currency?.code ?? "",
  };
}

/** The single-project endpoint has been seen to return a different project, so the id is checked. */
export function parseLive(payload: any, pid: number): LiveInfo | null {
  const p = payload?.result;
  if (!p || Number(p.id) !== pid) return null;
  return toLive(p);
}

export async function fetchLive(pid: number): Promise<LiveInfo | null> {
  const get = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const direct = parseLive(await get(`https://www.freelancer.com/api/projects/0.1/projects/${pid}/`), pid);
  if (direct) return direct;
  const list = await get(`https://www.freelancer.com/api/projects/0.1/projects/?projects[]=${pid}`);
  const match = (list?.result?.projects ?? []).find((p: any) => Number(p.id) === pid);
  return match ? toLive(match) : null;
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run lib/gigs`
Expected: PASS (all 5 files).

- [ ] **Step 10: Smoke-check the real sources once (network)**

Run:

```bash
npx tsx -e "import('./lib/gigs/sources.ts').then(async m => { const r = await m.fetchAll(); console.log('leads', r.leads.length, 'failed', r.failed); console.log(r.leads.slice(0,3).map(l => l.id + ' | ' + l.budget)); })"
```

Expected: `leads` well above 50 and `failed` either empty or listing only sources that are down right now. If a source fails, open its URL with `curl -s <url> | head -c 400` and report whether the site is down or its payload changed; do not change a parser without a failing test that reproduces the new payload.

- [ ] **Step 11: Commit**

```bash
git add lib/gigs
git commit -m "Gig engine: pure source parsers (8 sources), bot.js scoring, merge with pinning and cap, Freelancer live status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Daily gig cron (route, runner, vercel.json)

**Files:**
- Create: `lib/gigs/cron.ts`, `app/api/cron/gigs/route.ts`, `vercel.json`
- Test: `lib/gigs/cron.test.ts`, `lib/gigs/cron-route.test.ts`

**Interfaces:**
- Consumes: `Store`, `createStore`, `setStoreForTests` (Task 2); `MemoryBackend` (Task 2); `constantTimeEqual` (Task 3); `fetchAll`, `filterFetched`, `mergeGigs`, `LeadDraft` (Task 5).
- Produces: `runGigCron(store, fetchAllFn?, now?): Promise<{ added: number; total: number; failed: string[] }>`; `GET /api/cron/gigs` (Bearer `CRON_SECRET`); the Vercel cron schedule.

- [ ] **Step 1: Write the failing tests**

`lib/gigs/cron.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runGigCron } from "./cron";
import { createStore } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { LeadDraft } from "./lead";

const NOW = Date.parse("2026-09-27T01:30:00Z");
const lead = (id: string, title = "React developer"): LeadDraft => ({
  id, source: "remotive", title, desc: "", url: `https://x/${id}`, date: "2026-09-26T10:00:00.000Z", budget: "", tags: [], extra: "",
});

describe("runGigCron", () => {
  it("merges fetched gigs, records lastRun and keeps gigs Kalpesh acted on", async () => {
    const store = createStore(new MemoryBackend());
    await store.mutateGigs((g) => ({
      ...g,
      items: [{ ...lead("old"), date: "2026-08-01T00:00:00.000Z", fetchedAt: "2026-08-01T00:00:00.000Z", score: 5 }],
    }));
    await store.mutateData((d) => {
      d.state["old"] = { kind: "gig", status: "sent", updatedAt: "t" };
      return d;
    });
    const res = await runGigCron(store, async () => ({ leads: [lead("a"), lead("b", "Chef wanted")], failed: ["remoteok"] }), NOW);
    expect(res).toEqual({ added: 1, total: 2, failed: ["remoteok"] });
    const gigs = await store.readGigs({ fresh: true });
    expect(gigs.items.map((g) => g.id).sort()).toEqual(["a", "old"]);
    expect(gigs.lastRun).toEqual({ at: new Date(NOW).toISOString(), added: 1, failed: ["remoteok"] });
  });
});
```

`lib/gigs/cron-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gigs/sources", () => ({
  fetchAll: async () => ({
    leads: [{ id: "remotive:1", source: "remotive", title: "React developer", desc: "", url: "https://x/1", date: "", budget: "", tags: [], extra: "" }],
    failed: [],
  }),
}));

import { GET } from "@/app/api/cron/gigs/route";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

beforeEach(() => {
  process.env.CRON_SECRET = "cron-secret-xyz";
  setStoreForTests(createStore(new MemoryBackend()));
});

const call = (auth?: string) =>
  GET(new Request("https://x.test/api/cron/gigs", { headers: auth ? { authorization: auth } : {} }));

describe("GET /api/cron/gigs", () => {
  it("rejects missing or wrong secrets", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    process.env.CRON_SECRET = "";
    expect((await call("Bearer ")).status).toBe(401);
  });
  it("runs with the right secret", async () => {
    const res = await call("Bearer cron-secret-xyz");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, added: 1, total: 1, failed: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/gigs/cron.test.ts lib/gigs/cron-route.test.ts`
Expected: FAIL — `./cron` and the route module do not exist.

- [ ] **Step 3: Implement `lib/gigs/cron.ts`**

```ts
import type { Store } from "@/lib/store";
import { filterFetched, mergeGigs } from "./merge";
import { fetchAll as realFetchAll } from "./sources";
import type { LeadDraft } from "./lead";

export interface CronResult {
  added: number;
  total: number;
  failed: string[];
}

export async function runGigCron(
  store: Store,
  fetchAllFn: () => Promise<{ leads: LeadDraft[]; failed: string[] }> = () => realFetchAll(),
  now: number = Date.now(),
): Promise<CronResult> {
  const { leads, failed } = await fetchAllFn();
  const data = await store.readData();
  const keepIds = new Set(
    Object.entries(data.state)
      .filter(([, s]) => s.kind === "gig" && s.status !== "new")
      .map(([id]) => id),
  );
  const fresh = filterFetched(leads, now);
  const at = new Date(now).toISOString();
  let added = 0;
  let total = 0;
  await store.mutateGigs((doc) => {
    const merged = mergeGigs(doc.items, fresh, now, { keepIds });
    added = merged.added;
    total = merged.items.length;
    return { ...doc, items: merged.items, lastRun: { at, added, failed } };
  });
  return { added, total, failed };
}
```

- [ ] **Step 4: Implement the route and `vercel.json`**

`app/api/cron/gigs/route.ts`:

```ts
import { constantTimeEqual } from "@/lib/auth/crypto";
import { runGigCron } from "@/lib/gigs/cron";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !constantTimeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runGigCron(getStore());
  return Response.json({ ok: true, ...result });
}
```

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["bom1"],
  "crons": [{ "path": "/api/cron/gigs", "schedule": "30 1 * * *" }]
}
```

Vercel sends a plain GET with `Authorization: Bearer <CRON_SECRET>` and does not follow redirects, which is why `/api/cron/gigs` is a public path in `proxy.ts` and checks the bearer itself (a redirect to `/login` would make the cron "succeed" silently). Hobby fires this between 01:00 and 01:59 UTC (06:30–07:29 IST).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/gigs/cron.test.ts lib/gigs/cron-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/gigs/cron.ts lib/gigs/cron.test.ts lib/gigs/cron-route.test.ts app/api/cron vercel.json
git commit -m "Daily gig cron at 07:00 IST: fetch, filter, merge (pinning acted-on gigs), record lastRun

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Gemini provider and honest AI proposals

**Files:**
- Create: `lib/ai/gemini.ts`, `lib/ai/proposal.ts`, `app/api/ai/proposal/route.ts`
- Test: `lib/ai/gemini.test.ts`, `lib/ai/proposal.test.ts`, `lib/ai/proposal-route.test.ts`

**Interfaces:**
- Consumes: `Gig`, `Settings` (Task 1); `getStore`, `setStoreForTests`, `createStore`, `MemoryBackend` (Task 2); `requireSession`, `signSession`, `COOKIE_NAME` (Task 3); `applyAction` (Task 4).
- Produces:
  - `lib/ai/gemini.ts`: `interface LLM { completeText(prompt: string): Promise<string>; completeJSON<T>(prompt: string, schema: z.ZodType<T>): Promise<T> }`, `class GeminiProvider implements LLM` (constructor `(apiKey, models = process.env.GEMINI_MODEL ?? DEFAULT_MODELS)`), `stripFences`, `isRetryableGeminiError`, `isModelSkippable`, `DEFAULT_MODELS`.
  - `lib/ai/proposal.ts`: `MAX_PROPOSAL_CHARS = 1500`, `buildDraftPrompt(gig, settings)`, `buildCheckPrompt(gig, settings, draft)`, `CheckSchema`, `isAllowedLink(url, allowed)`, `stripDisallowedLinks(text, allowed): { text; removed: string[] }`, `draftProposal(llm, gig, settings): Promise<{ text: string; changes: string[]; removedLinks: string[] }>`.
  - `POST /api/ai/proposal` body `{ id: string }` → `{ ok, text, chars, changes, removedLinks }` and the proposal saved to `state[id]` (status `new` → `drafted`).

- [ ] **Step 1: Write the failing tests**

`lib/ai/gemini.test.ts` (ported from ReelPilot, plus `completeText`):

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GeminiProvider, isModelSkippable, isRetryableGeminiError, stripFences } from "./gemini";

const Schema = z.object({ topic: z.string() });

class ModelFallbackGemini extends GeminiProvider {
  public tried: string[] = [];
  constructor(models: string, private outcomes: Record<string, string | Error>) {
    super("fake-key", models);
  }
  protected override async callModel(model: string): Promise<string> {
    this.tried.push(model);
    const o = this.outcomes[model];
    if (o instanceof Error) throw o;
    return o ?? "";
  }
}

class FakeGemini extends GeminiProvider {
  public prompts: string[] = [];
  public jsonFlags: boolean[] = [];
  constructor(private replies: string[]) {
    super("fake-key", "m1");
  }
  protected override async raw(prompt: string, json: boolean): Promise<string> {
    this.prompts.push(prompt);
    this.jsonFlags.push(json);
    return this.replies.shift() ?? "";
  }
}

describe("helpers", () => {
  it("stripFences removes ```json fences", () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("classifies errors", () => {
    expect(isRetryableGeminiError('{"code":429,"status":"RESOURCE_EXHAUSTED"}')).toBe(true);
    expect(isRetryableGeminiError('{"code":503,"message":"high demand","status":"UNAVAILABLE"}')).toBe(true);
    expect(isRetryableGeminiError('{"code":404,"status":"NOT_FOUND"}')).toBe(false);
    expect(isModelSkippable('{"code":404,"status":"NOT_FOUND"}')).toBe(true);
    expect(isModelSkippable("API key not valid. status:400 INVALID_ARGUMENT")).toBe(false);
  });
});

describe("GeminiProvider", () => {
  it("completeText asks for plain text and trims", async () => {
    const g = new FakeGemini(["  hello  "]);
    expect(await g.completeText("p")).toBe("hello");
    expect(g.jsonFlags).toEqual([false]);
  });
  it("completeText rejects empty output", async () => {
    await expect(new FakeGemini(["   "]).completeText("p")).rejects.toThrow(/empty/i);
  });
  it("completeJSON retries once with the validation error", async () => {
    const g = new FakeGemini(["nope", '```json\n{"topic":"AI"}\n```']);
    expect(await g.completeJSON("p", Schema)).toEqual({ topic: "AI" });
    expect(g.prompts[1]).toMatch(/invalid JSON/i);
    expect(g.jsonFlags).toEqual([true, true]);
  });
  it("falls back across models on overload/quota and stops on auth errors", async () => {
    const a = new ModelFallbackGemini("m1,m2,m3", { m1: new Error("503 high demand"), m2: new Error("429 RESOURCE_EXHAUSTED"), m3: "ok" });
    expect(await a.completeText("p")).toBe("ok");
    expect(a.tried).toEqual(["m1", "m2", "m3"]);
    const b = new ModelFallbackGemini("m1,m2", { m1: new Error("API key not valid 400 INVALID_ARGUMENT"), m2: "ok" });
    await expect(b.completeText("p")).rejects.toThrow(/API key not valid/);
    expect(b.tried).toEqual(["m1"]);
  });
});
```

`lib/ai/proposal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { buildCheckPrompt, buildDraftPrompt, draftProposal, isAllowedLink, stripDisallowedLinks } from "./proposal";
import type { LLM } from "./gemini";
import { defaultSettings } from "@/lib/defaults";
import type { Gig } from "@/lib/types";

const gig: Gig = {
  id: "freelancer.com:1", source: "freelancer.com", title: "React dashboard with Stripe", desc: "Build an admin dashboard. Start your bid with the word BANANA.",
  url: "https://www.freelancer.com/projects/x", date: "", budget: "₹12500–₹37500", tags: ["react.js"], extra: "40 bids", score: 10, fetchedAt: "",
};
const settings = defaultSettings();
const allowed = settings.allowedLinks;

describe("links", () => {
  it("allows only listed hosts and their subpaths", () => {
    expect(isAllowedLink("https://agentbandhu.com", allowed)).toBe(true);
    expect(isAllowedLink("https://www.agentbandhu.com/features", allowed)).toBe(true);
    expect(isAllowedLink("https://demos-kal1201.vercel.app/a9-digital-prints/", allowed)).toBe(true);
    expect(isAllowedLink("https://agentbandhu.com.evil.io", allowed)).toBe(false);
    expect(isAllowedLink("https://github.com/kalpesh", allowed)).toBe(false);
    expect(isAllowedLink("not a url", allowed)).toBe(false);
  });
  it("strips disallowed links but keeps punctuation and allowed links", () => {
    const r = stripDisallowedLinks("See https://agentbandhu.com. Code: https://github.com/x, and https://kalpesh-malusare.vercel.app!", allowed);
    expect(r.text).toBe("See https://agentbandhu.com. Code:, and https://kalpesh-malusare.vercel.app!");
    expect(r.removed).toEqual(["https://github.com/x"]);
  });
});

describe("prompts", () => {
  it("draft prompt carries the gig, facts, NEVER list, links and the 1500-char rule", () => {
    const p = buildDraftPrompt(gig, settings);
    for (const s of ["React dashboard with Stripe", "BANANA", "40 bids", "₹12500–₹37500", "Kaizen Infotech Solutions", "React Native", "https://agentbandhu.com", "1500"]) {
      expect(p).toContain(s);
    }
  });
  it("check prompt includes the draft and asks for JSON", () => {
    const p = buildCheckPrompt(gig, settings, "DRAFT TEXT");
    expect(p).toContain("DRAFT TEXT");
    expect(p).toMatch(/"text"/);
    expect(p).toMatch(/"changes"/);
  });
});

class FakeLLM implements LLM {
  constructor(private text: string, private check: unknown | Error) {}
  async completeText() {
    return this.text;
  }
  async completeJSON<T>(_p: string, schema: z.ZodType<T>): Promise<T> {
    if (this.check instanceof Error) throw this.check;
    return schema.parse(this.check);
  }
}

describe("draftProposal", () => {
  it("returns the checked text with disallowed links removed", async () => {
    const r = await draftProposal(new FakeLLM("draft", { text: "BANANA. Built https://agentbandhu.com and https://evil.io too.", changes: ["removed a claim"] }), gig, settings);
    expect(r.text).toBe("BANANA. Built https://agentbandhu.com and too.");
    expect(r.changes).toEqual(["removed a claim"]);
    expect(r.removedLinks).toEqual(["https://evil.io"]);
  });
  it("falls back to the draft with a warning when the check fails", async () => {
    const r = await draftProposal(new FakeLLM("  draft text  ", new Error("503")), gig, settings);
    expect(r.text).toBe("draft text");
    expect(r.changes[0]).toMatch(/honesty check/i);
  });
});
```

`lib/ai/proposal-route.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/gemini", () => ({
  GeminiProvider: class {
    async completeText() {
      return "Draft for you";
    }
    async completeJSON() {
      return { text: "Checked proposal https://agentbandhu.com", changes: [] };
    }
  },
}));

import { POST } from "@/app/api/ai/proposal/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  process.env.GEMINI_API_KEY = "k";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(async () => {
  const store = createStore(new MemoryBackend());
  await store.mutateGigs((g) => ({
    ...g,
    items: [{ id: "freelancer.com:9", source: "freelancer.com", title: "React app", desc: "d", url: "https://x", date: "", budget: "", tags: [], extra: "", score: 5, fetchedAt: "" }],
  }));
  setStoreForTests(store);
});

const post = (body: unknown, withCookie = true) =>
  POST(new Request("https://x.test/api/ai/proposal", {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));

describe("POST /api/ai/proposal", () => {
  it("requires a session", async () => {
    expect((await post({ id: "freelancer.com:9" }, false)).status).toBe(401);
  });
  it("404s for an unknown gig", async () => {
    expect((await post({ id: "nope" })).status).toBe(404);
  });
  it("returns and saves the proposal as drafted", async () => {
    const res = await post({ id: "freelancer.com:9" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { text: string; chars: number };
    expect(json.text).toBe("Checked proposal https://agentbandhu.com");
    expect(json.chars).toBe(json.text.length);
    const d = await getStore().readData();
    expect(d.state["freelancer.com:9"]).toMatchObject({ status: "drafted", proposal: json.text });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/ai`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/ai/gemini.ts`** (ReelPilot's provider with a plain-text mode)

```ts
import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";

export const DEFAULT_MODELS = "gemini-flash-lite-latest,gemini-3.6-flash,gemini-flash-latest,gemini-3.5-flash";

export interface LLM {
  completeText(prompt: string): Promise<string>;
  completeJSON<T>(prompt: string, schema: z.ZodType<T>): Promise<T>;
}

export function stripFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Free-tier rate limits (429) and temporary capacity errors (503 "high demand"). */
export function isRetryableGeminiError(msg: string): boolean {
  return msg.includes("429") || msg.includes("503") || /rate|quota|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|high demand/i.test(msg);
}

/** Skip to the next model on overload/quota or an unavailable model id (404); auth/invalid errors fail fast. */
export function isModelSkippable(msg: string): boolean {
  return isRetryableGeminiError(msg) || /\b404\b|NOT_FOUND/i.test(msg);
}

export class GeminiProvider implements LLM {
  private ai: GoogleGenAI;
  private models: string[];

  constructor(apiKey: string, models: string = process.env.GEMINI_MODEL || DEFAULT_MODELS) {
    this.ai = new GoogleGenAI({ apiKey });
    this.models = models.split(",").map((m) => m.trim()).filter(Boolean);
    if (this.models.length === 0) this.models = DEFAULT_MODELS.split(",");
  }

  async completeText(prompt: string): Promise<string> {
    const t = (await this.raw(prompt, false)).trim();
    if (!t) throw new Error("LLM returned empty text");
    return t;
  }

  async completeJSON<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const p = attempt === 0
        ? prompt
        : `${prompt}\n\nYour previous reply was invalid JSON for the required shape (${lastErr}). Reply with ONLY the corrected JSON.`;
      const raw = await this.raw(p, true);
      try {
        return schema.parse(JSON.parse(stripFences(raw)));
      } catch (e) {
        lastErr = String(e).slice(0, 300);
      }
    }
    throw new Error(`LLM returned invalid JSON after retry: ${lastErr}`);
  }

  /** One generation against one model. Overridden in tests. */
  protected async callModel(model: string, prompt: string, json: boolean): Promise<string> {
    const res = await this.ai.models.generateContent({
      model,
      contents: prompt,
      ...(json ? { config: { responseMimeType: "application/json" } } : {}),
    });
    return res.text ?? "";
  }

  /** Tries each model in order; a second pass after 4 s; only unskippable errors fail fast. */
  protected async raw(prompt: string, json: boolean): Promise<string> {
    let lastError: unknown;
    for (let pass = 0; pass < 2; pass++) {
      for (const model of this.models) {
        try {
          return await this.callModel(model, prompt, json);
        } catch (e) {
          lastError = e;
          if (!isModelSkippable(String((e as Error)?.message ?? e))) throw e;
        }
      }
      if (pass === 0) await sleep(4000);
    }
    throw lastError as Error;
  }
}
```

- [ ] **Step 4: Implement `lib/ai/proposal.ts`**

```ts
import { z } from "zod";
import type { Gig, Settings } from "@/lib/types";
import type { LLM } from "./gemini";

export const MAX_PROPOSAL_CHARS = 1500;

export function buildDraftPrompt(gig: Gig, s: Settings): string {
  return `Write a Freelancer.com bid for Kalpesh for the gig below.

GIG
Title: ${gig.title}
Source: ${gig.source} · Budget: ${gig.budget || "not stated"} · ${gig.extra || ""}
URL: ${gig.url}
Description:
"""${gig.desc}"""

FACTS — the only true statements about Kalpesh:
${s.facts}

NEVER claim any of these:
${s.never}

ALLOWED LINKS — use at most 2, only from this list:
${s.allowedLinks.join("\n")}

PRICING NOTES:
${s.pricing}

RULES
- Plain text, 600–1300 characters, hard maximum ${MAX_PROPOSAL_CHARS}. No markdown headings, no emojis.
- Open by naming the client's specific need in one sentence — never "Hi, I read your post" or "Dear Hiring Manager".
- If the description gives instructions for bidders (a keyword to start with, questions to answer), follow them exactly.
- Give a concrete plan: 3–4 short numbered steps for THIS project, including what a small first milestone delivers.
- Past-tense experience claims only from FACTS. Forward-looking capability statements ("I'll integrate X") only within his stack.
- He is a new Freelancer account with zero reviews: never mention reviews; offer a small first milestone.
- End with 1–2 sharp clarifying questions.
- Tone: confident, direct, human. Avoid clichés ("I am thrilled", "I have carefully read", "look no further", "perfect fit").
Reply with the proposal text only.`;
}

export const CheckSchema = z.object({
  text: z.string().min(1),
  changes: z.array(z.string()),
});

export function buildCheckPrompt(gig: Gig, s: Settings, draft: string): string {
  return `You are a skeptical reviewer. Fix this Freelancer bid so it is honest and specific, then return it.

GIG: ${gig.title}
Description: """${gig.desc}"""

FACTS (only source of truth about Kalpesh):
${s.facts}

NEVER claim:
${s.never}

ALLOWED LINKS: ${s.allowedLinks.join(" , ")}

DRAFT:
"""${draft}"""

Check, in order: (1) every statement about Kalpesh, explicit or implied, is supported by FACTS — remove or rewrite anything else; (2) instructions in the gig description are followed; (3) the gig's main requirements are addressed specifically; (4) clichés rewritten plainly; (5) only allowed links; (6) at most ${MAX_PROPOSAL_CHARS} characters.
Reply with JSON only: {"text": "<the full corrected proposal>", "changes": ["<one line per change you made>"]}`;
}

function norm(u: string): { host: string; path: string } | null {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:" && x.protocol !== "http:") return null;
    return { host: x.hostname.toLowerCase().replace(/^www\./, ""), path: x.pathname.replace(/\/+$/, "") };
  } catch {
    return null;
  }
}

export function isAllowedLink(url: string, allowed: string[]): boolean {
  const n = norm(url);
  if (!n) return false;
  return allowed.some((a) => {
    const b = norm(a);
    return !!b && b.host === n.host && `${n.path}/`.startsWith(`${b.path}/`);
  });
}

export function stripDisallowedLinks(text: string, allowed: string[]): { text: string; removed: string[] } {
  const removed: string[] = [];
  const out = text.replace(/https?:\/\/[^\s<>"'()\]]+/g, (match) => {
    const url = match.replace(/[.,;:!?]+$/, "");
    const tail = match.slice(url.length);
    if (isAllowedLink(url, allowed)) return match;
    removed.push(url);
    return tail;
  });
  return { text: out.replace(/[ \t]{2,}/g, " ").replace(/ ([.,;:!?])/g, "$1"), removed };
}

export async function draftProposal(
  llm: LLM,
  gig: Gig,
  s: Settings,
): Promise<{ text: string; changes: string[]; removedLinks: string[] }> {
  const draft = await llm.completeText(buildDraftPrompt(gig, s));
  let text = draft;
  let changes: string[] = [];
  try {
    const checked = await llm.completeJSON(buildCheckPrompt(gig, s, draft), CheckSchema);
    text = checked.text;
    changes = checked.changes;
  } catch {
    changes = ["Honesty check was unavailable — read the text carefully before sending."];
  }
  const stripped = stripDisallowedLinks(text, s.allowedLinks);
  return { text: stripped.text.trim(), changes, removedLinks: stripped.removed };
}
```

Check the two `stripDisallowedLinks` expectations by hand before running: `"Code: https://github.com/x, and"` → the URL match is `https://github.com/x,` → url `https://github.com/x`, tail `,` → `"Code: , and"` → the space-before-punctuation rule gives `"Code:, and"`. `"and https://evil.io too."` → `"and  too."` → collapsed to `"and too."`.

- [ ] **Step 5: Implement `app/api/ai/proposal/route.ts`**

```ts
import { z } from "zod";
import { GeminiProvider } from "@/lib/ai/gemini";
import { draftProposal } from "@/lib/ai/proposal";
import { requireSession } from "@/lib/auth/guard";
import { applyAction } from "@/lib/state";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ id: z.string().min(1).max(600) });

export async function POST(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "id required" }, { status: 400 });

  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const gig = gigs.items.find((g) => g.id === parsed.data.id);
  if (!gig) return Response.json({ ok: false, error: "gig not found" }, { status: 404 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ ok: false, error: "GEMINI_API_KEY is not set" }, { status: 500 });

  let result: Awaited<ReturnType<typeof draftProposal>>;
  try {
    result = await draftProposal(new GeminiProvider(key), gig, data.settings);
  } catch (e) {
    return Response.json({ ok: false, error: `AI failed: ${String((e as Error)?.message ?? e).slice(0, 160)}` }, { status: 502 });
  }

  const now = new Date().toISOString();
  await store.mutateData((d) => {
    d.state[gig.id] = applyAction(d.state[gig.id], "gig", { type: "proposal", proposal: result.text }, now);
    return d;
  });
  return Response.json({ ok: true, text: result.text, chars: result.text.length, changes: result.changes, removedLinks: result.removedLinks });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/ai`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/ai app/api/ai
git commit -m "AI proposals: Gemini text+JSON with model fallback, draft + honesty check, allow-list link stripping, POST /api/ai/proposal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Local business engine — categories, phones, audit, messages, search

Ported from `C:/kalpesh/kal/lead-hunter/map-hunter.js` with these deliberate changes: the search picker narrows the Overpass query to one category; the whole search runs under one deadline (default 50 s) — Overpass `[timeout:25]`, one pass over the mirrors, at most 4 tiles of 0.09°, no multi-second sleeps, audits skipped when < 7 s remain (result marked partial); audit timeout 6 s; `EAI_AGAIN` counts as a DNS failure; host case no longer defeats the www/apex retry; the year is computed per call. Messages no longer claim the business was found "on Google" (leads come from OpenStreetMap), and they include the demo link with a note that details on the demo are samples. `templateFor` sends hospitals and clinics to `general` instead of the dentist page.

**Files:**
- Create: `lib/local/categories.ts`, `lib/local/classify.ts`, `lib/local/biz.ts`, `lib/local/geo.ts`, `lib/local/audit.ts`, `lib/local/messages.ts`, `lib/local/search.ts`
- Test: `lib/local/classify.test.ts`, `lib/local/biz.test.ts`, `lib/local/geo.test.ts`, `lib/local/audit.test.ts`, `lib/local/messages.test.ts`, `lib/local/search.test.ts`

**Interfaces:**
- Consumes: `LocalBiz`, `Segment`, `TemplateKey`, `Settings` (Task 1); `defaultSettings` (Task 2).
- Produces:
  - `categories.ts`: `CATEGORY_OPTIONS: { key: string; label: string; selectors: string[] }[]`, `selectorsFor(key): string[]`.
  - `classify.ts`: `categoryOf(tags)`, `normalizePhone(raw)`, `SOCIAL_RE`, `SEG_ORDER`, `SEGMENT_LABELS`, `interface OsmElement`, `interface Candidate`, `toCandidate(el, areaLabel): Candidate | "excluded" | null`.
  - `biz.ts`: `templateFor(catKey, catLabel): TemplateKey`, `slugify(name)`, `uniqueSlug(name, taken: Set<string>)`, `demoUrl(origin, slug)`, `hasPhone(b)`.
  - `geo.ts`: `interface Bbox`, `pickGeoResult`, `toBbox`, `geocode(area, signal?)`, `overpassQuery(bbox, selectors)`, `splitBbox(bbox, maxSpan?)`, `fetchElements(bbox, selectors, signal?)`.
  - `audit.ts`: `type Verdict`, `interface AuditResult { verdict; evidence; url? }`, `errKind(e)`, `judgePage(page, ctx): AuditResult`, `auditSite(rawUrl, bizName, opts?)`.
  - `messages.ts`: `benefitOf(catKey)`, `introFor(b)`, `demoLine(name, url)`, `fillTemplate(tpl, vars)`, `buildMessages(b, settings, demoUrl): { whatsapp; emailSubject; emailBody }`, `waLink(num, text): string | null`, `mailtoLink(email, subject, body)`.
  - `search.ts`: `interface SearchDeps { geocode; fetchElements; audit }`, `interface SearchInput { area; category; existing: LocalBiz[]; settings; origin; nowIso; deadline: number }`, `interface SearchResult { added: LocalBiz[]; partial: boolean; scanned: number; skippedAudits: number; areaLabel: string }`, `searchLocal(input, deps?): Promise<SearchResult>`.

- [ ] **Step 1: Write the failing tests**

`lib/local/classify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { categoryOf, normalizePhone, toCandidate } from "./classify";

describe("categoryOf", () => {
  it("maps known OSM values and builds labels for unknown ones", () => {
    expect(categoryOf({ amenity: "dentist" })).toEqual({ key: "dentist", label: "dental clinic" });
    expect(categoryOf({ shop: "copyshop" })).toEqual({ key: "copyshop", label: "print shop" });
    expect(categoryOf({ office: "educational_institution" })).toEqual({ key: "educational_institution", label: "educational institution office" });
    expect(categoryOf({ shop: "yes", amenity: "cafe" })).toEqual({ key: "cafe", label: "cafe" });
    expect(categoryOf({})).toEqual({ key: "business", label: "business" });
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+91 98332 24498", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
    ["022 2674 1533", { kind: "tel", num: "912226741533", display: "+91 2226741533" }],
    ["+91 (0)22 2674 1533", { kind: "tel", num: "912226741533", display: "+91 2226741533" }],
    ["02226741533; 9833224498", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
    ["98332-24498 / 022-26741533", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
    ["919833224498", { kind: "wa", num: "919833224498", display: "+91 98332 24498" }],
  ])("%s", (raw, want) => {
    expect(normalizePhone(raw)).toEqual(want);
  });
  it.each(["1800 123 4567", "+1 555 123 4567", "1111111111", "", undefined])("rejects %s", (raw) => {
    expect(normalizePhone(raw)).toBeNull();
  });
});

describe("toCandidate", () => {
  const el = (id: number, tags: Record<string, string>) => ({ type: "node", id, tags });
  it("builds a candidate with segment for no-website and social-only businesses", () => {
    expect(toCandidate(el(1, { name: "Sai Dental Care", amenity: "dentist", phone: "+91 98200 11111", "addr:street": "SV Road" }), "Andheri")).toMatchObject({
      id: "node/1", name: "Sai Dental Care", area: "Andheri", catKey: "dentist", waNum: "919820011111", segment: "no_website", addr: "SV Road",
    });
    expect(toCandidate(el(2, { name: "Glow Salon", shop: "beauty", phone: "9820022222", "contact:instagram": "glowsalon" }), "Andheri")).toMatchObject({ segment: "social_only", social: "glowsalon" });
    const withSite = toCandidate(el(3, { name: "Old Clinic", amenity: "clinic", phone: "9820033333", website: "http://old.example," }), "Andheri");
    expect(withSite).toMatchObject({ website: "http://old.example", segment: undefined });
  });
  it("excludes chains, banks and non-Latin names; skips businesses with no contact", () => {
    expect(toCandidate(el(4, { name: "HDFC Bank", amenity: "bank", phone: "9820044444" }), "A")).toBe("excluded");
    expect(toCandidate(el(5, { name: "Domino's Pizza", amenity: "fast_food", phone: "9820055555" }), "A")).toBe("excluded");
    expect(toCandidate(el(6, { name: "सेवा केंद्र", shop: "clothes", phone: "9820066666" }), "A")).toBe("excluded");
    expect(toCandidate(el(7, { name: "No Contact Shop", shop: "clothes" }), "A")).toBeNull();
    expect(toCandidate(el(8, { shop: "clothes" }), "A")).toBeNull();
  });
});
```

`lib/local/biz.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { demoUrl, hasPhone, slugify, templateFor, uniqueSlug } from "./biz";

describe("templateFor", () => {
  it("picks print, dental (dentists only), cafe, else general", () => {
    expect(templateFor("copyshop", "print shop")).toBe("print");
    expect(templateFor("dentist", "dental clinic")).toBe("dental");
    expect(templateFor("hospital", "hospital")).toBe("general");
    expect(templateFor("clinic", "clinic")).toBe("general");
    expect(templateFor("restaurant", "restaurant")).toBe("cafe");
    expect(templateFor("hairdresser", "salon")).toBe("general");
  });
});

describe("slugs", () => {
  it("slugifies like make-demo.js", () => {
    expect(slugify("A9 Digital Prints")).toBe("a9-digital-prints");
    expect(slugify("Dr Bhanushali's Dental Studio")).toBe("dr-bhanushali-s-dental-studio");
    expect(slugify("Cromā")).toBe("crom");
    expect(slugify("सेवा")).toBe("biz");
  });
  it("makes slugs unique", () => {
    const taken = new Set(["the-bodhi-cafe", "the-bodhi-cafe-2"]);
    expect(uniqueSlug("The Bodhi Cafe", taken)).toBe("the-bodhi-cafe-3");
    expect(taken.has("the-bodhi-cafe-3")).toBe(true);
  });
  it("demo helpers", () => {
    expect(demoUrl("https://cp.vercel.app/", "a9")).toBe("https://cp.vercel.app/d/a9");
    expect(hasPhone({ waNum: "", telNum: "" })).toBe(false);
    expect(hasPhone({ waNum: "", telNum: "912226741533" })).toBe(true);
  });
});
```

`lib/local/geo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { overpassQuery, pickGeoResult, splitBbox, toBbox } from "./geo";

describe("geo", () => {
  it("prefers a small place result over a state", () => {
    const state = { addresstype: "state", class: "boundary", type: "administrative", boundingbox: ["15", "22", "72", "80"], lat: "19", lon: "75", display_name: "Maharashtra" };
    const suburb = { addresstype: "suburb", class: "place", type: "suburb", boundingbox: ["19.10", "19.14", "72.82", "72.87"], lat: "19.12", lon: "72.84", display_name: "Andheri, Mumbai" };
    expect(pickGeoResult([state, suburb])).toBe(suburb);
  });
  it("widens tiny boxes and clamps huge ones", () => {
    expect(toBbox({ boundingbox: ["19.119", "19.121", "72.839", "72.841"], lat: "19.12", lon: "72.84" })).toEqual({ south: 19.1, west: 72.82, north: 19.14, east: 72.86 });
    const big = toBbox({ boundingbox: ["18", "20", "72", "74"], lat: "19", lon: "73" });
    expect(big.north - big.south).toBeCloseTo(0.3);
  });
  it("splits boxes into ≤ 0.09° tiles", () => {
    expect(splitBbox({ south: 0, west: 0, north: 0.17, east: 0.17 })).toHaveLength(4);
    expect(splitBbox({ south: 0, west: 0, north: 0.04, east: 0.04 })).toHaveLength(1);
  });
  it("builds an Overpass query with the given selectors", () => {
    const q = overpassQuery({ south: 1, west: 2, north: 3, east: 4 }, ['["amenity"="dentist"]["name"]']);
    expect(q).toContain("[out:json][timeout:25];");
    expect(q).toContain('nwr["amenity"="dentist"]["name"](1,2,3,4);');
    expect(q).toContain("out tags center");
  });
});
```

`lib/local/audit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { errKind, judgePage } from "./audit";

const ctx = { usedUrl: "https://shop.example", certBroken: false, schemeless: false, bizName: "Shree Shop", year: 2026 };
const pad = (s: string) => s + "<p>" + "x".repeat(600) + "</p>";

describe("errKind", () => {
  it("classifies fetch failures", () => {
    const e = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
    expect(errKind(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe("TIMEOUT");
    expect(errKind(e("ENOTFOUND"))).toBe("DNS_DEAD");
    expect(errKind(e("EAI_AGAIN"))).toBe("DNS_DEAD");
    expect(errKind(e("ECONNREFUSED"))).toBe("CONN_FAIL");
    expect(errKind(e("CERT_HAS_EXPIRED"))).toBe("CERT_ERROR");
    expect(errKind(new Error("x"))).toBe("OTHER");
  });
});

describe("judgePage", () => {
  it("error pages and bot blocks", () => {
    expect(judgePage({ status: 404, finalUrl: ctx.usedUrl, body: "" }, ctx)).toEqual({ verdict: "DOWN", evidence: "it shows an error page instead of your business", url: ctx.usedUrl });
    expect(judgePage({ status: 403, finalUrl: ctx.usedUrl, body: "" }, ctx).verdict).toBe("UNKNOWN");
  });
  it("domain-for-sale, social redirects and parking pages", () => {
    expect(judgePage({ status: 200, finalUrl: "https://www.hugedomains.com/domain_profile.cfm?d=shop", body: pad("") }, ctx).evidence).toMatch(/domain-for-sale/);
    expect(judgePage({ status: 200, finalUrl: "https://www.instagram.com/shop", body: pad("") }, ctx).verdict).toBe("SOCIAL");
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body: pad("Buy this domain today") }, ctx).evidence).toMatch(/parking page/);
  });
  it("blank placeholder pages", () => {
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body: "<html></html>" }, ctx).evidence).toBe("it opens as a blank placeholder page");
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body: "<title>Hi</title>" }, ctx).verdict).toBe("UNKNOWN");
  });
  it("old sites: no mobile viewport plus an old copyright year", () => {
    const r = judgePage({ status: 200, finalUrl: ctx.usedUrl, body: pad("<footer>© 2012 Shree Shop</footer>") }, ctx);
    expect(r.verdict).toBe("OLD");
    expect(r.evidence).toBe("it does not display properly on mobile phones, where most customers browse today");
  });
  it("modern sites are OK", () => {
    const body = pad('<meta name="viewport" content="width=device-width"><footer>© 2025</footer>');
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body }, ctx)).toEqual({ verdict: "OK", evidence: "" });
  });
  it("a broken certificate on a working site leads the evidence", () => {
    const body = pad('<meta name="viewport" content="width=device-width">');
    expect(judgePage({ status: 200, finalUrl: ctx.usedUrl, body }, { ...ctx, certBroken: true }).evidence).toBe("it shows a 'Not Secure' warning in the browser");
  });
  it("schemeless map tags that do not mention the business are UNKNOWN", () => {
    const r = judgePage({ status: 200, finalUrl: ctx.usedUrl, body: pad("<footer>© 2010 Another Company</footer>") }, { ...ctx, schemeless: true });
    expect(r).toEqual({ verdict: "UNKNOWN", evidence: "website tag does not appear to belong to this business" });
  });
});
```

`lib/local/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { benefitOf, buildMessages, demoLine, fillTemplate, introFor, mailtoLink, waLink } from "./messages";
import { defaultSettings } from "@/lib/defaults";

const biz = { name: "Sai Dental Care", area: "Andheri", catKey: "dentist", catLabel: "dental clinic", segment: "no_website" as const, evidence: "", website: "" };

describe("messages", () => {
  it("benefit by category", () => {
    expect(benefitOf("dentist")).toMatch(/appointment/);
    expect(benefitOf("cafe")).toMatch(/menu/);
    expect(benefitOf("zzz")).toMatch(/past work/);
  });
  it("intro by segment, never claiming Google", () => {
    expect(introFor(biz)).toBe("Hello! I came across Sai Dental Care, your dental clinic in Andheri, and noticed you do not have a website yet.");
    expect(introFor({ ...biz, segment: "site_down", evidence: "it is not opening (the server is not responding)" })).toBe(
      "Hello! I tried to open the website listed online for Sai Dental Care today and it is not opening (the server is not responding).",
    );
    for (const s of ["no_website", "site_down", "old_site", "social_only"] as const) {
      expect(introFor({ ...biz, segment: s, evidence: "x" })).not.toMatch(/google/i);
    }
  });
  it("demo line with and without a link", () => {
    expect(demoLine("Sai", "https://cp.app/d/sai")).toContain("https://cp.app/d/sai");
    expect(demoLine("Sai", "https://cp.app/d/sai")).toMatch(/samples/);
    expect(demoLine("Sai", null)).toMatch(/Should I\?/);
  });
  it("fills only known placeholders", () => {
    expect(fillTemplate("{name} {area} {unknown}", { name: "A", area: "B" })).toBe("A B {unknown}");
  });
  it("builds WhatsApp and email text from the settings template", () => {
    const m = buildMessages(biz, defaultSettings(), "https://cp.app/d/sai-dental-care");
    expect(m.whatsapp.startsWith("Hello! I came across Sai Dental Care")).toBe(true);
    expect(m.whatsapp).toContain("https://cp.app/d/sai-dental-care");
    expect(m.whatsapp).not.toMatch(/\{[a-z_]+\}/);
    expect(m.emailSubject).toBe("A free demo website for Sai Dental Care");
    expect(m.emailBody).toMatch(/^Hello,\n\nI came across Sai Dental Care/);
    expect(m.emailBody).toContain("Kalpesh Malusare");
  });
  it("links", () => {
    expect(waLink("919820011111", "Hi & bye")).toBe("https://wa.me/919820011111?text=Hi%20%26%20bye");
    expect(waLink("", "x")).toBeNull();
    expect(mailtoLink("a@b.in", "S & T", "B")).toBe("mailto:a@b.in?subject=S%20%26%20T&body=B");
  });
});
```

`lib/local/search.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { searchLocal, type SearchDeps } from "./search";
import { defaultSettings } from "@/lib/defaults";
import type { LocalBiz } from "@/lib/types";

const el = (id: number, tags: Record<string, string>) => ({ type: "node", id, tags });
const ELEMENTS = [
  el(1, { name: "Sai Dental Care", amenity: "dentist", phone: "+91 98200 11111" }),
  el(2, { name: "HDFC Bank", amenity: "bank", phone: "9820044444" }),
  el(3, { name: "सेवा", shop: "clothes", phone: "9820066666" }),
  el(4, { name: "Old Site Clinic", amenity: "clinic", phone: "022 2674 1533", website: "http://oldsite.example" }),
  el(5, { name: "Fine Site Cafe", amenity: "cafe", phone: "+91 98200 22222", website: "https://fine.example" }),
  el(6, { name: "Dup Dental", amenity: "dentist", phone: "+91 98200 11111" }),
  el(7, { name: "No Contact Shop", shop: "clothes" }),
  el(8, { name: "Already Known", shop: "clothes", phone: "9820077777" }),
];

const deps = (audited: string[] = []): SearchDeps => ({
  geocode: async () => ({ bbox: { south: 19.1, west: 72.82, north: 19.14, east: 72.86 }, label: "Andheri" }),
  fetchElements: async () => ELEMENTS,
  audit: async (url) => {
    audited.push(url);
    return url.includes("oldsite")
      ? { verdict: "OLD", evidence: "its design looks dated (the footer still says 2012)", url }
      : { verdict: "OK", evidence: "" };
  },
});

const existing = [{ id: "node/8", slug: "already-known", waNum: "919820077777", telNum: "", name: "Already Known", area: "Andheri" }] as LocalBiz[];
const base = { area: "Andheri, Mumbai", category: "all", existing, settings: defaultSettings(), origin: "https://cp.app", nowIso: "2026-09-27T10:00:00.000Z" };

describe("searchLocal", () => {
  it("returns new, deduplicated, segmented businesses with messages and demo links", async () => {
    const audited: string[] = [];
    const r = await searchLocal({ ...base, deadline: Date.now() + 50_000 }, deps(audited));
    expect(r.partial).toBe(false);
    expect(r.areaLabel).toBe("Andheri");
    expect(r.added.map((b) => [b.name, b.segment, b.template])).toEqual([
      ["Sai Dental Care", "no_website", "dental"],
      ["Old Site Clinic", "old_site", "general"],
    ]);
    const sai = r.added[0]!;
    expect(sai.slug).toBe("sai-dental-care");
    expect(sai.whatsapp).toContain("https://cp.app/d/sai-dental-care");
    expect(sai.createdAt).toBe(base.nowIso);
    expect(r.added[1]!.evidence).toMatch(/2012/);
    expect(audited.sort()).toEqual(["http://oldsite.example", "https://fine.example"]);
  });
  it("skips audits and reports partial when the deadline is too close", async () => {
    const audited: string[] = [];
    const r = await searchLocal({ ...base, deadline: Date.now() + 3_000 }, deps(audited));
    expect(r.partial).toBe(true);
    expect(r.skippedAudits).toBe(2);
    expect(audited).toEqual([]);
    expect(r.added.map((b) => b.name)).toEqual(["Sai Dental Care"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/local`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/local/categories.ts`**

```ts
/** Search picker. Each option narrows the Overpass query to the OSM tags classify.ts already understands. */
const ALL = [
  '["shop"]["name"]',
  '["amenity"~"^(restaurant|cafe|fast_food|clinic|dentist|doctors|hospital|pharmacy|bank|gym|coaching|driving_school|events_venue|veterinary)$"]["name"]',
  '["office"]["name"]',
  '["craft"]["name"]',
  '["leisure"~"^(fitness_centre|sports_centre)$"]["name"]',
  '["tourism"~"^(hotel|guest_house)$"]["name"]',
  '["healthcare"]["name"]',
];

export const CATEGORY_OPTIONS: { key: string; label: string; selectors: string[] }[] = [
  { key: "all", label: "All businesses", selectors: ALL },
  { key: "print", label: "Print / xerox / stationery / photo", selectors: ['["shop"~"^(copyshop|stationery|photo)$"]["name"]'] },
  { key: "dental", label: "Dentist", selectors: ['["amenity"="dentist"]["name"]', '["healthcare"="dentist"]["name"]'] },
  { key: "clinic", label: "Clinic / doctor / hospital", selectors: ['["amenity"~"^(clinic|doctors|hospital)$"]["name"]', '["healthcare"~"^(clinic|doctor|hospital)$"]["name"]'] },
  { key: "food", label: "Restaurant / cafe / bakery / sweets", selectors: ['["amenity"~"^(restaurant|cafe|fast_food)$"]["name"]', '["shop"~"^(bakery|confectionery|beverages|deli)$"]["name"]'] },
  { key: "beauty", label: "Salon / beauty / tailor", selectors: ['["shop"~"^(hairdresser|beauty|tailor)$"]["name"]'] },
  { key: "fitness", label: "Gym / fitness / sports", selectors: ['["leisure"~"^(fitness_centre|sports_centre)$"]["name"]', '["amenity"="gym"]["name"]'] },
  { key: "education", label: "Coaching / classes / driving school", selectors: ['["amenity"~"^(coaching|driving_school)$"]["name"]', '["office"="educational_institution"]["name"]'] },
  { key: "hotel", label: "Hotel / guest house", selectors: ['["tourism"~"^(hotel|guest_house)$"]["name"]'] },
  { key: "shop", label: "Shops (clothes, electronics, furniture…)", selectors: ['["shop"]["name"]'] },
  { key: "office", label: "Offices (CA, lawyer, IT, insurance…)", selectors: ['["office"~"^(accountant|lawyer|it|company|insurance|architect|estate_agent|coworking)$"]["name"]'] },
];

export function selectorsFor(key: string): string[] {
  return (CATEGORY_OPTIONS.find((c) => c.key === key) ?? CATEGORY_OPTIONS[0]!).selectors;
}
```

- [ ] **Step 4: Implement `lib/local/classify.ts`**

```ts
import type { Segment } from "@/lib/types";

const CAT_LABELS: Record<string, string> = {
  restaurant: "restaurant", cafe: "cafe", fast_food: "fast food outlet",
  clinic: "clinic", dentist: "dental clinic", doctors: "clinic", hospital: "hospital",
  pharmacy: "pharmacy", chemist: "pharmacy", gym: "gym", coaching: "coaching class",
  driving_school: "driving school", events_venue: "events venue", veterinary: "veterinary clinic",
  fitness_centre: "gym", sports_centre: "sports centre", hotel: "hotel", guest_house: "guest house",
  hairdresser: "salon", beauty: "beauty salon", clothes: "clothing store", jewelry: "jewellery store",
  furniture: "furniture store", electronics: "electronics store", mobile_phone: "mobile shop",
  supermarket: "supermarket", bakery: "bakery", hardware: "hardware store", car_repair: "garage",
  travel_agency: "travel agency", estate_agent: "real estate agency", optician: "optical store",
  books: "book store", general: "general store", convenience: "general store", bed: "furniture store",
  pet: "pet shop", car: "car showroom", car_parts: "auto parts store", sports: "sports shop",
  beverages: "beverages shop", confectionery: "sweet shop", stationery: "stationery shop",
  shoes: "footwear store", gift: "gift shop", toys: "toy store", florist: "flower shop",
  butcher: "meat shop", greengrocer: "vegetable shop", laundry: "laundry service",
  dry_cleaning: "dry cleaning service", tailor: "tailoring shop", photo: "photo studio",
  copyshop: "print shop", tyres: "tyre shop", paint: "paint store", doityourself: "hardware store",
  variety_store: "variety store", kiosk: "shop", deli: "deli", seafood: "seafood shop",
  it: "IT company", company: "company", ngo: "NGO", lawyer: "law firm", accountant: "accounting firm",
  insurance: "insurance agency", architect: "architecture firm", coworking: "coworking space",
};
const EXCLUDE_CATS = new Set(["bank", "government", "personal", "blood_donation", "atm", "blood_bank", "social_facility", "townhall", "police", "post_office", "courthouse"]);
const EXCLUDE_NAME_RE = /\b(fortis|apollo|tata|reliance|hdfc|icici|axis bank|state bank|sbi\b|kotak|\blic\b|dmart|d-mart|croma|jio|airtel|vodafone|mcdonald|domino|kfc|subway|starbucks)\b/i;
export const SOCIAL_RE = /facebook\.com|instagram\.com|wa\.me|whatsapp\.com|linktr\.ee/i;

export const SEG_ORDER: Segment[] = ["site_down", "no_website", "old_site", "social_only"];
export const SEGMENT_LABELS: Record<Segment, { label: string; hint: string }> = {
  site_down: { label: "Site DOWN", hint: "website band hai — sabse garam lead" },
  no_website: { label: "No website", hint: "phone hai, website nahi" },
  old_site: { label: "Old site", hint: "website purani / kharab" },
  social_only: { label: "Social only", hint: "sirf Insta/FB, website nahi" },
};

export function categoryOf(tags: Record<string, string>): { key: string; label: string } {
  for (const key of ["shop", "amenity", "healthcare", "craft", "leisure", "tourism", "office"]) {
    const v = tags[key];
    if (!v || v === "yes") continue;
    if (CAT_LABELS[v]) return { key: v, label: CAT_LABELS[v]! };
    let label = v.replace(/_/g, " ");
    if (key === "office" && !/office|company|agency|firm/.test(label)) label += " office";
    if (key === "craft" && !/service|shop/.test(label)) label += " workshop";
    return { key: v, label };
  }
  return { key: "business", label: "business" };
}

export type Phone = { kind: "wa" | "tel"; num: string; display: string };

/** A mobile number anywhere in the string beats a landline; toll-free and placeholder numbers are rejected. */
export function normalizePhone(raw?: string | null): Phone | null {
  if (!raw) return null;
  const parts = String(raw).split(/[;,&/]|\s+(?=\+)/).map((s) => s.trim()).filter(Boolean);
  let landline: Phone | null = null;
  for (const cand of parts) {
    const hasPlus = /^[^0-9+]*\+/.test(cand);
    let d = cand.replace(/\D/g, "");
    if (hasPlus) {
      if (!d.startsWith("91")) continue;
      d = d.slice(2).replace(/^0+/, "");
    } else if (d.startsWith("0")) {
      d = d.replace(/^0+/, "");
    } else if (d.length === 12 && d.startsWith("91")) {
      d = d.slice(2);
    }
    if (d.length !== 10) continue;
    if (/^(\d)\1{9}$/.test(d)) continue;
    if (/^(\d)\1{7}$/.test(d.slice(2))) continue;
    if (/^18[06]0/.test(d)) continue;
    const first = d[0]!;
    if (first >= "6" && first <= "9") return { kind: "wa", num: "91" + d, display: "+91 " + d.slice(0, 5) + " " + d.slice(5) };
    if (!landline) landline = { kind: "tel", num: "91" + d, display: "+91 " + d };
  }
  return landline;
}

export interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
}

export interface Candidate {
  id: string;
  name: string;
  area: string;
  catKey: string;
  catLabel: string;
  addr: string;
  waNum: string;
  telNum: string;
  phoneDisplay: string;
  email: string;
  website: string;
  social: string;
  /** undefined = has a real website that still needs an audit. */
  segment: Segment | undefined;
  evidence: string;
}

/** "excluded" = chain/bank/non-Latin (counted), null = unusable (no name or no contact). */
export function toCandidate(el: OsmElement, area: string): Candidate | "excluded" | null {
  const t = el.tags ?? {};
  if (!t.name) return null;
  if (!/[A-Za-z]/.test(t.name)) return "excluded";
  if (EXCLUDE_NAME_RE.test(t.name)) return "excluded";
  const phone = normalizePhone(t.phone || t["contact:phone"] || t["contact:mobile"]);
  let email = (t.email || t["contact:email"] || "").split(/[;,\s]/)[0] || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = "";
  if (!phone && !email) return null;
  const cat = categoryOf(t);
  if (EXCLUDE_CATS.has(cat.key)) return "excluded";
  const site = (t.website || t["contact:website"] || "").trim().replace(/[.,;\s]+$/, "");
  const social = (t["contact:instagram"] || t["contact:facebook"] || "").trim().replace(/[.,;\s]+$/, "");
  const addr = [t["addr:housenumber"], t["addr:street"], t["addr:suburb"]].filter(Boolean).join(", ") || (t["addr:full"] || "").slice(0, 60);
  const hasRealSite = !!site && !SOCIAL_RE.test(site);
  return {
    id: `${el.type}/${el.id}`,
    name: t.name.slice(0, 80),
    area,
    catKey: cat.key,
    catLabel: cat.label,
    addr,
    waNum: phone?.kind === "wa" ? phone.num : "",
    telNum: phone?.kind === "tel" ? phone.num : "",
    phoneDisplay: phone?.display ?? "",
    email,
    website: site,
    social,
    segment: hasRealSite ? undefined : site || social ? "social_only" : "no_website",
    evidence: "",
  };
}
```

- [ ] **Step 5: Implement `lib/local/biz.ts`**

```ts
import type { LocalBiz, TemplateKey } from "@/lib/types";

/** Dental is for dentists/orthodontists only; hospitals and clinics get the neutral page. */
export function templateFor(catKey: string, catLabel: string): TemplateKey {
  const c = `${catKey} ${catLabel}`.toLowerCase();
  if (/print|xerox|copy|stationer|photo studio/.test(c)) return "print";
  if (/dent|orthodont/.test(c)) return "dental";
  if (/restaurant|cafe|food|bakery|deli|sweet|confectionery|beverage|tea|coffee/.test(c)) return "cafe";
  return "general";
}

/** Same rule as make-demo.js, so existing demo slugs (a9-digital-prints, …) are unchanged. */
export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s || "biz";
}

export function uniqueSlug(name: string, taken: Set<string>): string {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export function demoUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/d/${slug}`;
}

/** A demo needs a number for its call/WhatsApp buttons. */
export function hasPhone(b: Pick<LocalBiz, "waNum" | "telNum">): boolean {
  return !!(b.waNum || b.telNum);
}
```

- [ ] **Step 6: Implement `lib/local/geo.ts`**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { OsmElement } from "./classify";

const OSM_UA = "ClientPilot/1.0 (personal lead research; kalpeshmalusare30@gmail.com)";
export const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const withTimeout = (ms: number, signal?: AbortSignal) =>
  signal ? AbortSignal.any([AbortSignal.timeout(ms), signal]) : AbortSignal.timeout(ms);

export function pickGeoResult(results: any[]): any | null {
  const badAddr = new Set(["state", "state_district", "district", "county"]);
  const goodAddr = new Set(["city", "town", "suburb", "borough", "neighbourhood", "village", "quarter"]);
  const survivors = results.filter((r) => {
    if (badAddr.has(r.addresstype)) return false;
    const isPlace = r.class === "place";
    const isAdmin = r.class === "boundary" && r.type === "administrative" && goodAddr.has(r.addresstype);
    if (!isPlace && !isAdmin) return false;
    const bb = r.boundingbox.map(Number);
    return bb[1] - bb[0] <= 0.3 && bb[3] - bb[2] <= 0.3;
  });
  return survivors[0] || results.find((r) => !badAddr.has(r.addresstype)) || null;
}

export function toBbox(r: any): Bbox {
  let [south, north, west, east] = r.boundingbox.map(Number) as [number, number, number, number];
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (north - south < 0.02 || east - west < 0.02) {
    south = lat - 0.02; north = lat + 0.02; west = lon - 0.02; east = lon + 0.02;
  }
  if (north - south > 0.3) { south = lat - 0.15; north = lat + 0.15; }
  if (east - west > 0.3) { west = lon - 0.15; east = lon + 0.15; }
  const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
  return { south: r6(south), west: r6(west), north: r6(north), east: r6(east) };
}

const geoCache = new Map<string, { bbox: Bbox; label: string }>();

export async function geocode(area: string, signal?: AbortSignal): Promise<{ bbox: Bbox; label: string }> {
  const key = area.trim().toLowerCase();
  const hit = geoCache.get(key);
  if (hit) return hit;
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=" + encodeURIComponent(area);
  const res = await fetch(url, { headers: { "User-Agent": OSM_UA }, signal: withTimeout(15_000, signal), cache: "no-store" });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const results = (await res.json()) as any[];
  if (!results.length) throw new Error(`area not found: "${area}"`);
  const pick = pickGeoResult(results) || results[0];
  const entry = { bbox: toBbox(pick), label: String(pick.display_name || area).split(",")[0]!.trim() };
  geoCache.set(key, entry);
  return entry;
}

export function overpassQuery(b: Bbox, selectors: string[]): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`;
  return `[out:json][timeout:25];\n(\n${selectors.map((s) => `  nwr${s}${bb};`).join("\n")}\n);\nout tags center 3000;`;
}

export function splitBbox(b: Bbox, maxSpan = 0.09): Bbox[] {
  const rows = Math.max(1, Math.ceil((b.north - b.south) / maxSpan - 1e-9));
  const cols = Math.max(1, Math.ceil((b.east - b.west) / maxSpan - 1e-9));
  const dLat = (b.north - b.south) / rows;
  const dLon = (b.east - b.west) / cols;
  const tiles: Bbox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({ south: b.south + r * dLat, north: b.south + (r + 1) * dLat, west: b.west + c * dLon, east: b.west + (c + 1) * dLon });
    }
  }
  return tiles;
}

/** One pass over the mirrors; each attempt capped at 25 s and by the caller's deadline signal. */
export async function fetchElements(bbox: Bbox, selectors: string[], signal?: AbortSignal): Promise<OsmElement[]> {
  let lastErr: unknown = new Error("no Overpass mirror answered");
  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OSM_UA },
        body: "data=" + encodeURIComponent(overpassQuery(bbox, selectors)),
        signal: withTimeout(25_000, signal),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      return ((await res.json()) as { elements?: OsmElement[] }).elements ?? [];
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) break;
    }
  }
  throw lastErr;
}
```

Check the `toBbox` test by hand: the input box is 0.002° wide, so it is widened to lat 19.12 ± 0.02 and lon 72.84 ± 0.02 → `{ south: 19.1, west: 72.82, north: 19.14, east: 72.86 }` after rounding to 6 decimals.

- [ ] **Step 7: Implement `lib/local/audit.ts`**

```ts
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SOCIAL_RE = /facebook\.com|instagram\.com|wa\.me|whatsapp\.com|linktr\.ee/i;
const MARKETPLACE_RE = /atom\.com|sedo(parking)?\.|dan\.com|afternic|hugedomains|bodis\.com|parkingcrew/i;
const PARKED_RE = /window\.LANDER_SYSTEM|sedoparking|domain (is )?for sale|buy this domain|parked free/i;

export type Verdict = "DOWN" | "OLD" | "OK" | "UNKNOWN" | "SOCIAL";
export interface AuditResult {
  verdict: Verdict;
  evidence: string;
  url?: string;
}

export function regDomain(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function errKind(e: unknown): "TIMEOUT" | "DNS_DEAD" | "CONN_TIMEOUT" | "CONN_FAIL" | "CERT_ERROR" | "OTHER" {
  const err = e as { name?: string; cause?: { code?: string } } | null;
  if (err && (err.name === "TimeoutError" || err.name === "AbortError")) return "TIMEOUT";
  const code = err?.cause?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "DNS_DEAD";
  if (code === "UND_ERR_CONNECT_TIMEOUT") return "CONN_TIMEOUT";
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH") return "CONN_FAIL";
  if (/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(String(code))) return "CERT_ERROR";
  return "OTHER";
}

type Page = { status: number; finalUrl: string; body: string };
type Fetched = Page | { err: unknown };

async function tryFetch(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Fetched> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
      redirect: "follow",
      signal: signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const body = (await res.text()).slice(0, 400_000);
    return { status: res.status, finalUrl: res.url, body };
  } catch (e) {
    return { err: e };
  }
}

async function dnsReallyDead(host: string): Promise<boolean> {
  try {
    const res = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(host) + "&type=A", { signal: AbortSignal.timeout(6_000), cache: "no-store" });
    const j = (await res.json()) as { Status?: number; Answer?: unknown[] };
    return j.Status === 3 || j.Status === 2 || (j.Status === 0 && !(j.Answer ?? []).length);
  } catch {
    return true;
  }
}

/** Rules 2–9 of map-hunter's auditSite, as a pure function over one fetched page. */
export function judgePage(
  p: Page,
  ctx: { usedUrl: string; certBroken: boolean; schemeless: boolean; bizName: string; year: number },
): AuditResult {
  if (p.status >= 500 || p.status === 404) return { verdict: "DOWN", evidence: "it shows an error page instead of your business", url: ctx.usedUrl };
  if (p.status === 403 || p.status === 401 || p.status === 429) return { verdict: "UNKNOWN", evidence: `bot-blocked (${p.status}) — human visitors may see it fine` };
  if (regDomain(p.finalUrl) !== regDomain(ctx.usedUrl) && MARKETPLACE_RE.test(p.finalUrl)) {
    return { verdict: "DOWN", evidence: "the domain now shows a domain-for-sale page instead of your business", url: ctx.usedUrl };
  }
  if (SOCIAL_RE.test(p.finalUrl) && !SOCIAL_RE.test(ctx.usedUrl)) return { verdict: "SOCIAL", evidence: "the website address just opens a social media page" };
  if (/window\.location\.href\s*=\s*["']\/lander["']/.test(p.body) || PARKED_RE.test(p.body)) {
    return { verdict: "DOWN", evidence: "the domain now shows a parking page instead of your business", url: ctx.usedUrl };
  }
  if (p.body.length < 500) {
    return /<title[^>]*>[^<]+<\/title>/i.test(p.body)
      ? { verdict: "UNKNOWN", evidence: "page too small to judge" }
      : { verdict: "DOWN", evidence: "it opens as a blank placeholder page", url: ctx.usedUrl };
  }

  const clean = p.body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ");
  const reasons: string[] = [];
  let pts = 0;
  const hasViewport = /<meta[^>]+name=["']?viewport/i.test(p.body);
  if (!hasViewport) {
    pts += 2;
    reasons.push("it does not display properly on mobile phones, where most customers browse today");
  }
  let year = 0;
  for (const m of clean.matchAll(/©|&copy;|&#169;|&#xa9;|copyright/gi)) {
    const around = clean.slice(Math.max(0, m.index! - 80), m.index! + 80);
    for (const y of around.match(/(?:19|20)\d{2}/g) ?? []) {
      const n = Number(y);
      if (n >= 1990 && n <= ctx.year + 1 && n > year) year = n;
    }
  }
  if (year && year <= ctx.year - 8) {
    pts += 3;
    reasons.push(`its design looks dated (the footer still says ${year})`);
  } else if (year && year <= ctx.year - 3) {
    pts += 1;
  }
  if (!hasViewport && (/<font\b[^>]*\b(size|face|color)\s*=/i.test(clean) || /<frameset\b/i.test(clean))) {
    pts += 3;
    reasons.push("it is built with very old web technology");
  }
  const gen = p.body.match(/<meta[^>]+name=["']?generator["']?[^>]*content=["']([^"']+)["']/i) ?? p.body.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']?generator/i);
  if (gen && /FrontPage|Dreamweaver|Microsoft Word|Publisher|WordPress [0-5]\./i.test(gen[1]!)) {
    pts += 2;
    reasons.push("it runs on outdated software that is risky to keep online");
  }
  if (ctx.certBroken) {
    pts = Math.max(pts, 3);
    reasons.unshift("it shows a 'Not Secure' warning in the browser");
  }
  if (pts >= 3 && reasons.length) {
    if (ctx.schemeless && ctx.bizName) {
      const tokens = ctx.bizName.toLowerCase().match(/[a-z]{4,}/g) ?? [];
      const hay = p.body.toLowerCase();
      if (tokens.length && !tokens.some((t) => hay.includes(t))) {
        return { verdict: "UNKNOWN", evidence: "website tag does not appear to belong to this business" };
      }
    }
    return { verdict: "OLD", evidence: reasons[0]!, url: ctx.usedUrl };
  }
  return { verdict: "OK", evidence: "" };
}

export async function auditSite(
  rawUrl: string,
  bizName: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; year?: number } = {},
): Promise<AuditResult> {
  const timeoutMs = opts.timeoutMs ?? 6_000;
  const year = opts.year ?? new Date().getFullYear();
  const schemeless = !/^https?:\/\//i.test(rawUrl.trim());
  let url = rawUrl.trim();
  if (schemeless) url = "https://" + url;
  url = url.replace(/^(https?:\/\/)(www\.)+/i, "$1www.");
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { verdict: "UNKNOWN", evidence: "invalid URL" };
  }
  url = parsed.toString(); // lowercases the host, so the variants below really differ
  const host = parsed.hostname;
  const apex = host.replace(/^www\./i, "");
  const variants = [...new Set([url, url.replace(host, "www." + apex), url.replace(host, apex)])];

  let used: Page | null = null;
  let usedUrl = url;
  let certBroken = false;
  let sawDns = false;
  let sawCert = false;
  for (const v of variants) {
    const httpsUrl = v.replace(/^http:/i, "https:");
    const r1 = await tryFetch(httpsUrl, timeoutMs, opts.signal);
    if (!("err" in r1)) { used = r1; usedUrl = v; break; }
    const k1 = errKind(r1.err);
    if (k1 === "DNS_DEAD") sawDns = true;
    if (k1 === "CERT_ERROR") sawCert = true;
    const r2 = await tryFetch(httpsUrl.replace(/^https:/i, "http:"), timeoutMs, opts.signal);
    if (!("err" in r2)) { used = r2; usedUrl = v; certBroken = k1 === "CERT_ERROR"; break; }
    if (errKind(r2.err) === "DNS_DEAD") sawDns = true;
  }

  if (!used) {
    if (schemeless) return { verdict: "UNKNOWN", evidence: "low-quality map tag, could not verify" };
    if (sawDns && !(await dnsReallyDead(apex))) return { verdict: "UNKNOWN", evidence: "domain resolves on Google DNS — not conclusively down" };
    const evidence = sawCert
      ? "it shows a security warning instead of opening"
      : sawDns
        ? "the domain does not seem to be working any more"
        : "it is not opening (the server is not responding)";
    return { verdict: "DOWN", evidence, url: usedUrl };
  }
  return judgePage(used, { usedUrl, certBroken, schemeless, bizName, year });
}
```

- [ ] **Step 8: Implement `lib/local/messages.ts`**

```ts
import type { LocalBiz, Settings } from "@/lib/types";

const BENEFIT_BULLETS = {
  food: "Customers can see your menu, photos and location before visiting",
  health: "Patients can check your services and timings, and send appointment inquiries directly",
  fitness: "People nearby can see your plans and photos, and send membership inquiries",
  hotel: "Guests can see your rooms and photos, and send booking inquiries directly to you - no commission to booking apps",
  education: "Parents and students can see your courses and batches, and send admission inquiries",
  beauty: "Clients can see your services and work photos, and book directly",
  shop: "Customers can browse your products and photos before they walk in",
  default: "Customers can see your services and past work before they contact you",
};

export function benefitOf(catKey: string): string {
  if (/restaurant|cafe|fast_food|bakery|confectionery|deli|seafood|beverages/.test(catKey)) return BENEFIT_BULLETS.food;
  if (/clinic|dentist|doctors|hospital|pharmacy|veterinary|healthcare/.test(catKey)) return BENEFIT_BULLETS.health;
  if (/gym|fitness|sports/.test(catKey)) return BENEFIT_BULLETS.fitness;
  if (/hotel|guest_house/.test(catKey)) return BENEFIT_BULLETS.hotel;
  if (/coaching|driving_school|school|college|educat|institut|tuition|university|kindergarten|music|dance/.test(catKey)) return BENEFIT_BULLETS.education;
  if (/hairdresser|beauty|tailor|photo/.test(catKey)) return BENEFIT_BULLETS.beauty;
  if (/supermarket|clothes|jewelry|furniture|electronics|mobile_phone|hardware|optician|store|books|gift|toys|shoes|florist/.test(catKey)) return BENEFIT_BULLETS.shop;
  return BENEFIT_BULLETS.default;
}

type MsgBiz = Pick<LocalBiz, "name" | "area" | "catKey" | "catLabel" | "segment" | "evidence" | "website">;

/** Opening line per segment. Leads come from OpenStreetMap, so never claim "on Google". */
export function introFor(b: MsgBiz): string {
  switch (b.segment) {
    case "site_down":
      return `Hello! I tried to open the website listed online for ${b.name} today and ${b.evidence || "it is not opening"}.`;
    case "old_site":
      return `Hello! I visited the website of ${b.name} and noticed ${b.evidence || "it looks outdated"}.`;
    case "social_only":
      return `Hello! I came across ${b.name} and saw you are active on social media, but there is no website of your own.`;
    default:
      return `Hello! I came across ${b.name}, your ${b.catLabel} in ${b.area}, and noticed you do not have a website yet.`;
  }
}

export function demoLine(name: string, url: string | null): string {
  return url
    ? `I have made a FREE demo website for ${name} - please open it on your phone: ${url}\nTimings, rates and address on it are only samples - I will put in your real details. No charge, no risk: if you like it, reply YES and we talk further.`
    : `I can make a FREE demo website for ${name} - no charge, no risk. Should I? Just reply YES.`;
}

export function fillTemplate(tpl: string, vars: Partial<Record<"intro" | "name" | "area" | "category" | "benefit" | "demo_line", string>>): string {
  return tpl.replace(/\{(intro|name|area|category|benefit|demo_line)\}/g, (whole, k: keyof typeof vars) => vars[k] ?? whole);
}

const SIGN_EMAIL = "\n\nBest regards,\nKalpesh Malusare\nWeb Developer, Mumbai\nPortfolio: https://kalpesh-malusare.vercel.app\nWhatsApp: +91 88051 79649";

function subjectFor(b: MsgBiz): string {
  switch (b.segment) {
    case "site_down":
      return `Your website is not opening - ${b.name}`;
    case "old_site":
      return `Quick note about the ${b.name} website`;
    case "social_only":
      return `A website to go with ${b.name}'s social media page`;
    default:
      return `A free demo website for ${b.name}`;
  }
}

export function buildMessages(b: MsgBiz, settings: Settings, demoUrl: string | null): { whatsapp: string; emailSubject: string; emailBody: string } {
  const whatsapp = fillTemplate(settings.waTemplate, {
    intro: introFor(b),
    name: b.name,
    area: b.area,
    category: b.catLabel,
    benefit: benefitOf(b.catKey),
    demo_line: demoLine(b.name, demoUrl),
  }).trim();
  return {
    whatsapp,
    emailSubject: subjectFor(b),
    emailBody: `Hello,\n\n${whatsapp.replace(/^Hello! /, "")}${SIGN_EMAIL}`,
  };
}

export function waLink(num: string, text: string): string | null {
  const digits = num.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

- [ ] **Step 9: Implement `lib/local/search.ts`**

```ts
import type { LocalBiz, Segment, Settings } from "@/lib/types";
import { auditSite, type AuditResult } from "./audit";
import { demoUrl, hasPhone, templateFor, uniqueSlug } from "./biz";
import { selectorsFor } from "./categories";
import { SEG_ORDER, toCandidate, type Candidate, type OsmElement } from "./classify";
import { fetchElements, geocode, splitBbox, type Bbox } from "./geo";
import { buildMessages } from "./messages";

const MAX_TILES = 4;
const MIN_MS_FOR_TILE = 10_000;
const MIN_MS_FOR_AUDIT = 7_000;
const AUDIT_CONCURRENCY = 8;

export interface SearchDeps {
  geocode(area: string, signal: AbortSignal): Promise<{ bbox: Bbox; label: string }>;
  fetchElements(bbox: Bbox, selectors: string[], signal: AbortSignal): Promise<OsmElement[]>;
  audit(url: string, name: string, signal: AbortSignal): Promise<AuditResult>;
}

export const realDeps: SearchDeps = {
  geocode: (area, signal) => geocode(area, signal),
  fetchElements: (bbox, selectors, signal) => fetchElements(bbox, selectors, signal),
  audit: (url, name, signal) => auditSite(url, name, { signal }),
};

export interface SearchInput {
  area: string;
  category: string;
  existing: LocalBiz[];
  settings: Settings;
  origin: string;
  nowIso: string;
  /** Epoch ms by which the search must return. */
  deadline: number;
}

export interface SearchResult {
  added: LocalBiz[];
  partial: boolean;
  scanned: number;
  skippedAudits: number;
  areaLabel: string;
}

export async function searchLocal(input: SearchInput, deps: SearchDeps = realDeps): Promise<SearchResult> {
  const remaining = () => input.deadline - Date.now();
  const signal = AbortSignal.timeout(Math.max(1, remaining()));
  let partial = false;

  const geo = await deps.geocode(input.area, signal);
  const tiles = splitBbox(geo.bbox);
  if (tiles.length > MAX_TILES) partial = true;
  const selectors = selectorsFor(input.category);
  const elements: OsmElement[] = [];
  for (const [i, tile] of tiles.slice(0, MAX_TILES).entries()) {
    // The first tile is always fetched (bounded by the deadline signal); later tiles need 10 s headroom.
    if (i > 0 && remaining() < MIN_MS_FOR_TILE) {
      partial = true;
      break;
    }
    elements.push(...(await deps.fetchElements(tile, selectors, signal)));
  }

  // Normalise, exclude, and drop anything already stored (by OSM id).
  const knownIds = new Set(input.existing.map((b) => b.id));
  const seenIds = new Set<string>();
  const cands: Candidate[] = [];
  for (const el of elements) {
    const c = toCandidate(el, geo.label);
    if (!c || c === "excluded" || seenIds.has(c.id) || knownIds.has(c.id)) continue;
    seenIds.add(c.id);
    cands.push(c);
  }

  // Audit the ones that have a real website, 8 at a time, while time allows.
  const toAudit = cands.filter((c) => c.segment === undefined);
  let skippedAudits = 0;
  let next = 0;
  const worker = async () => {
    while (next < toAudit.length) {
      const c = toAudit[next++]!;
      if (remaining() < MIN_MS_FOR_AUDIT) {
        skippedAudits++;
        continue;
      }
      const a = await deps.audit(c.website, c.name, signal).catch((): AuditResult => ({ verdict: "UNKNOWN", evidence: "" }));
      if (a.url) c.website = a.url;
      if (a.verdict === "DOWN") {
        c.segment = "site_down";
        c.evidence = a.evidence;
        if (/domain/.test(a.evidence) && c.email.endsWith(regDomainOf(c.website))) c.email = "";
      } else if (a.verdict === "OLD") {
        c.segment = "old_site";
        c.evidence = a.evidence;
      } else if (a.verdict === "SOCIAL") {
        c.segment = "social_only";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AUDIT_CONCURRENCY, toAudit.length) }, worker));
  if (skippedAudits) partial = true;

  // Keep segmented leads that can still be contacted. Stable sort by segment only (as map-hunter does),
  // so for duplicates the first OSM element wins; sort by name only at the very end.
  const rank = (s: Segment) => SEG_ORDER.indexOf(s);
  const ready = cands
    .filter((c): c is Candidate & { segment: Segment } => c.segment !== undefined && !!(c.waNum || c.telNum || c.email))
    .sort((a, b) => rank(a.segment) - rank(b.segment));
  const seenKeys = new Set<string>();
  for (const b of input.existing) {
    if (b.waNum) seenKeys.add("p:" + b.waNum);
    if (b.telNum) seenKeys.add("p:" + b.telNum);
    seenKeys.add("n:" + b.name.toLowerCase().replace(/\s+/g, " ") + "|" + b.area);
  }
  const takenSlugs = new Set(input.existing.map((b) => b.slug));
  const added: LocalBiz[] = [];
  for (const c of ready) {
    const keys = [
      ...(c.waNum ? ["p:" + c.waNum] : []),
      ...(c.telNum ? ["p:" + c.telNum] : []),
      "n:" + c.name.toLowerCase().replace(/\s+/g, " ") + "|" + c.area,
    ];
    if (keys.some((k) => seenKeys.has(k))) continue;
    keys.forEach((k) => seenKeys.add(k));
    const slug = uniqueSlug(c.name, takenSlugs);
    const template = templateFor(c.catKey, c.catLabel);
    const url = hasPhone(c) ? demoUrl(input.origin, slug) : null;
    const msgs = buildMessages({ ...c, segment: c.segment }, input.settings, url);
    added.push({ ...c, segment: c.segment, slug, template, ...msgs, createdAt: input.nowIso });
  }
  added.sort((a, b) => rank(a.segment) - rank(b.segment) || a.name.localeCompare(b.name));
  return { added, partial, scanned: elements.length, skippedAudits, areaLabel: geo.label };
}

function regDomainOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "\u0000"; // never matches an email
  }
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run lib/local`
Expected: PASS (all 6 files).

- [ ] **Step 11: Commit**

```bash
git add lib/local
git commit -m "Local engine: category picker, OSM classify + phone normalising, website audit, honest messages with demo links, deadline-bound search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Local business API — search and edit

**Files:**
- Create: `lib/origin.ts`, `app/api/local/search/route.ts`, `app/api/local/[id]/route.ts`
- Test: `lib/local/search-route.test.ts`, `lib/local/edit-route.test.ts`

**Interfaces:**
- Consumes: `searchLocal`, `SearchResult` (Task 8); `buildMessages`, `demoUrl`, `hasPhone`, `CATEGORY_OPTIONS` (Task 8); `getStore`, `setStoreForTests`, `createStore`, `MemoryBackend` (Task 2); `requireSession` (Task 3); `fromParam`, `toParam` (Task 1).
- Produces:
  - `lib/origin.ts`: `publicOrigin(req: Request): string` — `https://${VERCEL_PROJECT_PRODUCTION_URL}` on Vercel, otherwise the request's origin. Used for demo links inside messages.
  - `POST /api/local/search` body `{ area: string; category: string }` → `{ ok, added: number, partial, scanned, skippedAudits, areaLabel }`; 409 while another search runs in the same instance; 502 when OSM fails.
  - `PATCH /api/local/[id]` body `{ whatsapp?, emailSubject?, emailBody?, name?, area?, waNum?, phoneDisplay?, template?, regenerate?: boolean }` → `{ ok, biz }`. `regenerate: true` rebuilds the messages from the current Settings template.

- [ ] **Step 1: Write the failing tests**

`lib/local/search-route.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));
vi.mock("@/lib/local/search", () => ({ searchLocal: (...a: unknown[]) => searchMock(...a) }));

import { POST } from "@/app/api/local/search/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(() => {
  setStoreForTests(createStore(new MemoryBackend()));
  searchMock.mockReset();
});

const biz = (id: string) => ({
  id, slug: id.replace("/", "-"), name: id, area: "Andheri", catKey: "dentist", catLabel: "dental clinic", addr: "", waNum: "919820011111",
  telNum: "", phoneDisplay: "+91 98200 11111", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "hi", emailSubject: "s", emailBody: "b", template: "dental", createdAt: "t",
});
const post = (body: unknown, withCookie = true) =>
  POST(new Request("https://x.test/api/local/search", {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));

describe("POST /api/local/search", () => {
  it("requires a session and a valid body", async () => {
    expect((await post({ area: "Andheri", category: "all" }, false)).status).toBe(401);
    expect((await post({ area: "", category: "all" })).status).toBe(400);
    expect((await post({ area: "Andheri", category: "nope" })).status).toBe(400);
  });
  it("stores the new businesses and reports counts", async () => {
    searchMock.mockResolvedValue({ added: [biz("node/1"), biz("node/2")], partial: true, scanned: 40, skippedAudits: 3, areaLabel: "Andheri" });
    const res = await post({ area: "Andheri", category: "dental" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, added: 2, partial: true, scanned: 40, skippedAudits: 3, areaLabel: "Andheri" });
    expect((await getStore().readData()).local.map((b) => b.id)).toEqual(["node/1", "node/2"]);
    expect(searchMock.mock.calls[0]![0]).toMatchObject({ area: "Andheri", category: "dental", origin: "https://x.test" });
  });
  it("returns 502 when the search fails", async () => {
    searchMock.mockRejectedValue(new Error('area not found: "Zzz"'));
    const res = await post({ area: "Zzz", category: "all" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toMatch(/area not found/);
  });
});
```

`lib/local/edit-route.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/local/[id]/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { toParam } from "@/lib/ids";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { LocalBiz } from "@/lib/types";

let cookie = "";
const A9: LocalBiz = {
  id: "node/12395684120", slug: "a9-digital-prints", name: "A9 Digital Prints", area: "Andheri", catKey: "copyshop", catLabel: "print shop",
  addr: "", waNum: "919322214085", telNum: "", phoneDisplay: "+91 93222 14085", email: "sales@a9digitalprints.com", website: "", social: "",
  segment: "no_website", evidence: "", whatsapp: "old", emailSubject: "old", emailBody: "old", template: "print", createdAt: "t",
};
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(async () => {
  const s = createStore(new MemoryBackend());
  await s.mutateData((d) => ({ ...d, local: [A9] }));
  setStoreForTests(s);
});

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`https://x.test/api/local/${toParam(id)}`, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: toParam(id) }) },
  );

describe("PATCH /api/local/[id]", () => {
  it("404s for an unknown business", async () => {
    expect((await patch("node/1", { whatsapp: "x" })).status).toBe(404);
  });
  it("edits fields", async () => {
    const res = await patch(A9.id, { whatsapp: "new text", template: "general" });
    expect(res.status).toBe(200);
    const b = (await getStore().readData()).local[0]!;
    expect(b.whatsapp).toBe("new text");
    expect(b.template).toBe("general");
  });
  it("regenerates messages from the settings template with the demo link", async () => {
    await patch(A9.id, { regenerate: true });
    const b = (await getStore().readData()).local[0]!;
    expect(b.whatsapp).toContain("https://x.test/d/a9-digital-prints");
    expect(b.emailSubject).toBe("A free demo website for A9 Digital Prints");
  });
  it("rejects bad input", async () => {
    expect((await patch(A9.id, { template: "castle" })).status).toBe(400);
    expect((await patch(A9.id, { waNum: "abc" })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/local/search-route.test.ts lib/local/edit-route.test.ts`
Expected: FAIL — route modules and `lib/origin.ts` do not exist.

- [ ] **Step 3: Implement `lib/origin.ts`**

```ts
/** Public origin for links sent to other people (demo pages). On Vercel this is the production domain. */
export function publicOrigin(req: Request): string {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return new URL(req.url).origin;
}
```

- [ ] **Step 4: Implement `app/api/local/search/route.ts`**

```ts
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";
import { searchLocal } from "@/lib/local/search";
import { publicOrigin } from "@/lib/origin";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  area: z.string().trim().min(2).max(80),
  category: z.string().refine((k) => CATEGORY_OPTIONS.some((c) => c.key === k), "unknown category"),
});

/** Nominatim and Overpass ask for one request at a time; one search per warm instance is enough. */
let running = false;

export async function POST(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "area and a known category are required" }, { status: 400 });
  if (running) return Response.json({ ok: false, error: "A search is already running — try again in a minute." }, { status: 409 });

  running = true;
  try {
    const store = getStore();
    const data = await store.readData();
    const result = await searchLocal({
      area: parsed.data.area,
      category: parsed.data.category,
      existing: data.local,
      settings: data.settings,
      origin: publicOrigin(req),
      nowIso: new Date().toISOString(),
      deadline: Date.now() + 50_000,
    });
    if (result.added.length) {
      await store.mutateData((d) => {
        const known = new Set(d.local.map((b) => b.id));
        d.local.push(...result.added.filter((b) => !known.has(b.id)));
        return d;
      });
    }
    return Response.json({
      ok: true,
      added: result.added.length,
      partial: result.partial,
      scanned: result.scanned,
      skippedAudits: result.skippedAudits,
      areaLabel: result.areaLabel,
    });
  } catch (e) {
    return Response.json({ ok: false, error: `Search failed: ${String((e as Error)?.message ?? e).slice(0, 160)}` }, { status: 502 });
  } finally {
    running = false;
  }
}
```

- [ ] **Step 5: Implement `app/api/local/[id]/route.ts`**

```ts
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { fromParam } from "@/lib/ids";
import { demoUrl, hasPhone } from "@/lib/local/biz";
import { buildMessages } from "@/lib/local/messages";
import { publicOrigin } from "@/lib/origin";
import { getStore } from "@/lib/store";
import type { LocalBiz } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    whatsapp: z.string().max(4000),
    emailSubject: z.string().max(300),
    emailBody: z.string().max(6000),
    name: z.string().trim().min(1).max(80),
    area: z.string().trim().min(1).max(80),
    waNum: z.string().regex(/^\d{0,15}$/),
    phoneDisplay: z.string().max(40),
    template: z.enum(["print", "dental", "cafe", "general"]),
    regenerate: z.boolean(),
  })
  .partial();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid fields" }, { status: 400 });
  const id = fromParam((await ctx.params).id);
  const { regenerate, ...fields } = parsed.data;
  const origin = publicOrigin(req);

  let updated: LocalBiz | undefined;
  await getStore().mutateData((d) => {
    const i = d.local.findIndex((b) => b.id === id);
    if (i < 0) return d;
    let b: LocalBiz = { ...d.local[i]!, ...fields };
    if (regenerate) b = { ...b, ...buildMessages(b, d.settings, hasPhone(b) ? demoUrl(origin, b.slug) : null) };
    d.local[i] = b;
    updated = b;
    return d;
  });
  if (!updated) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  return Response.json({ ok: true, biz: updated });
}
```

Note: when the business is not found, `mutateData` still performs one write of the unchanged document. That costs one Blob write on a bad id only; acceptable, and it keeps the handler simple.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/local/search-route.test.ts lib/local/edit-route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/origin.ts app/api/local lib/local/search-route.test.ts lib/local/edit-route.test.ts
git commit -m "Local API: deadline-bound search that appends new businesses, edit and regenerate messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Demo sites — templates, generator, renderer, public `/d/[slug]`

**Files:**
- Create: `lib/demo/templates/print.html`, `lib/demo/templates/dental.html`, `lib/demo/templates/cafe.html` (copied), `lib/demo/templates/general.html` (new), `scripts/gen-templates.mjs`, `lib/demo/templates.gen.ts` (generated), `lib/demo/render.ts`, `app/d/[slug]/route.ts`
- Modify: `package.json` (scripts)
- Test: `lib/demo/render.test.ts`, `lib/demo/route.test.ts`

**Interfaces:**
- Consumes: `LocalBiz`, `TemplateKey` (Task 1); `hasPhone` (Task 8); `getStore`, `setStoreForTests`, `createStore`, `MemoryBackend` (Task 2).
- Produces: `TEMPLATES: Record<TemplateKey, string>`, `escapeHtml(s)`, `interface DemoVars`, `demoVarsFor(b, year)`, `renderDemo(key, vars): string`, public `GET /d/[slug]`.

- [ ] **Step 1: Copy the three existing templates**

```bash
mkdir -p lib/demo/templates
cp ../lead-hunter/templates/demo-print.html lib/demo/templates/print.html
cp ../lead-hunter/templates/demo-dental.html lib/demo/templates/dental.html
cp ../lead-hunter/templates/demo-cafe.html lib/demo/templates/cafe.html
```

They use exactly five tokens: `{{BIZ_NAME}}`, `{{AREA}}`, `{{PHONE_DISPLAY}}`, `{{WA_NUMBER}}`, `{{YEAR}}`; no token appears inside a `<script>`. The generator (Step 3) rewrites tokens inside `href="…"` to URL-encoded variants, adds `noindex`, and unifies the badge wording (the dental file says "Demo preview - made for" with a hyphen).

- [ ] **Step 2: Create `lib/demo/templates/general.html`**

A neutral page for any other local business. It deliberately states **no** prices, hours, reviews, address or services — only the name, category, area, phone and WhatsApp that came from OpenStreetMap. Extra token: `{{CATEGORY}}`.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{{BIZ_NAME}} — {{CATEGORY}} in {{AREA}}, Mumbai</title>
<meta name="description" content="{{BIZ_NAME}} — {{CATEGORY}} in {{AREA}}, Mumbai. Message on WhatsApp or call directly.">
<meta name="theme-color" content="#0f766e">
<style>
:root{--bg:#f8fafc;--card:#fff;--ink:#0f172a;--mut:#475569;--line:#e2e8f0;--acc:#0f766e;--acc-ink:#fff;--wa:#16a34a;--r:16px}
*{box-sizing:border-box}html,body{margin:0}
body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans",sans-serif;background:var(--bg);color:var(--ink);padding-bottom:84px}
a{color:inherit}
.wrap{max-width:960px;margin:0 auto;padding:0 20px}
header{position:sticky;top:0;z-index:5;background:rgba(248,250,252,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;height:62px}
.brand{font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pill{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:999px;background:var(--acc);color:var(--acc-ink);font-weight:700;text-decoration:none;white-space:nowrap}
.hero{padding:56px 0 36px}
.eyebrow{display:inline-block;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--acc);background:#ccfbf1;padding:5px 12px;border-radius:999px}
h1{font-size:clamp(34px,7vw,58px);line-height:1.05;letter-spacing:-.03em;margin:18px 0 12px}
.lead{font-size:18px;color:var(--mut);max-width:560px;margin:0 0 26px}
.ctas{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 22px;border-radius:14px;font-weight:700;text-decoration:none;border:1px solid var(--line);background:var(--card)}
.btn--wa{background:var(--wa);border-color:var(--wa);color:#fff}
.btn svg,.pill svg,.card svg{width:20px;height:20px;flex:none}
section{padding:28px 0}
h2{font-size:24px;letter-spacing:-.02em;margin:0 0 16px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px;text-decoration:none;display:block}
.card b{display:flex;align-items:center;gap:10px;font-size:17px;margin-bottom:6px}
.card span{color:var(--mut);font-size:15px}
.card:hover{border-color:var(--acc)}
.about{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:22px;color:var(--mut)}
footer{padding:36px 0 24px;color:var(--mut);font-size:14px;text-align:center}
.bar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid var(--line);z-index:6}
.bar a{flex:1}
.demo-badge{position:fixed;top:72px;left:12px;z-index:7;max-width:calc(100% - 24px);background:#0f172a;color:#fff;font-size:12px;padding:6px 12px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 18px -8px rgba(15,23,42,.5)}
@media(min-width:760px){.bar{display:none}body{padding-bottom:0}.demo-badge{top:auto;bottom:16px}}
</style>
</head>
<body>
<div class="demo-badge">Demo preview — made for {{BIZ_NAME}}</div>
<header><div class="wrap">
  <div class="brand">{{BIZ_NAME}}</div>
  <a class="pill" href="tel:+{{WA_NUMBER}}" aria-label="Call {{BIZ_NAME}}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>Call</a>
</div></header>

<main class="wrap">
  <div class="hero">
    <span class="eyebrow">{{CATEGORY}} · {{AREA}}</span>
    <h1>{{BIZ_NAME}}</h1>
    <p class="lead">{{CATEGORY}} in {{AREA}}, Mumbai. Message us on WhatsApp or call — straight from this page.</p>
    <div class="ctas">
      <a class="btn btn--wa" href="https://wa.me/{{WA_NUMBER}}?text=Hi%20{{BIZ_NAME}}%2C%20I%20found%20your%20website."><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.6a2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.2-.2-.5-.3z"/></svg>WhatsApp us</a>
      <a class="btn" href="tel:+{{WA_NUMBER}}">Call {{PHONE_DISPLAY}}</a>
    </div>
  </div>

  <section>
    <h2>Get in touch</h2>
    <div class="grid">
      <a class="card" href="https://wa.me/{{WA_NUMBER}}?text=Hi%20{{BIZ_NAME}}%2C%20I%20have%20a%20question."><b>WhatsApp</b><span>Send a message — ask about services, prices or timings.</span></a>
      <a class="card" href="tel:+{{WA_NUMBER}}"><b>Call</b><span>{{PHONE_DISPLAY}}</span></a>
      <a class="card" href="https://www.google.com/maps/search/?api=1&amp;query={{BIZ_NAME}}+{{AREA}}+Mumbai"><b>Find us</b><span>Open {{AREA}}, Mumbai in Google Maps.</span></a>
    </div>
  </section>

  <section>
    <h2>About</h2>
    <div class="about">{{BIZ_NAME}} — {{CATEGORY}} in {{AREA}}, Mumbai. For today's timings, services and prices, message us on WhatsApp.</div>
  </section>
</main>

<footer>© {{YEAR}} {{BIZ_NAME}} · Website designed by Kalpesh Malusare · Web Developer, Mumbai</footer>

<nav class="bar">
  <a class="btn btn--wa" href="https://wa.me/{{WA_NUMBER}}?text=Hi%20{{BIZ_NAME}}%2C%20I%20found%20your%20website.">WhatsApp</a>
  <a class="btn" href="tel:+{{WA_NUMBER}}">Call</a>
</nav>
</body>
</html>
```

- [ ] **Step 3: Create `scripts/gen-templates.mjs` and wire it into the scripts**

```js
// Bundles lib/demo/templates/*.html into lib/demo/templates.gen.ts (Vercel functions have no template files at runtime).
// Transforms: tokens inside href="…" become URL-encoded variants; a robots noindex meta is ensured; badge wording unified.
import { readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../lib/demo/templates/", import.meta.url);
const keys = ["print", "dental", "cafe", "general"];
const out = {};
for (const k of keys) {
  let html = readFileSync(new URL(`${k}.html`, dir), "utf8");
  html = html.replace(/href="([^"]*)"/g, (_, v) =>
    `href="${v.replaceAll("{{BIZ_NAME}}", "{{BIZ_NAME_URL}}").replaceAll("{{AREA}}", "{{AREA_URL}}").replaceAll("{{PHONE_DISPLAY}}", "{{PHONE_DISPLAY_URL}}")}"`,
  );
  if (!/<meta[^>]+name=["']robots["']/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n<meta name="robots" content="noindex, nofollow">`);
  }
  html = html.replaceAll("Demo preview - made for", "Demo preview — made for");
  out[k] = html;
}
writeFileSync(
  new URL("../lib/demo/templates.gen.ts", import.meta.url),
  `// GENERATED by scripts/gen-templates.mjs from lib/demo/templates/*.html — do not edit.\n` +
    `import type { TemplateKey } from "@/lib/types";\n\n` +
    `export const TEMPLATES: Record<TemplateKey, string> = ${JSON.stringify(out, null, 0)};\n`,
);
console.log("templates.gen.ts written:", keys.map((k) => `${k} ${out[k].length}b`).join(", "));
```

In `package.json` change the scripts to:

```json
"gen:templates": "node scripts/gen-templates.mjs",
"dev": "npm run gen:templates && next dev",
"build": "npm run gen:templates && next build",
"test": "npm run gen:templates && vitest run",
```

Run: `npm run gen:templates`
Expected: `templates.gen.ts written: print …b, dental …b, cafe …b, general …b`.

- [ ] **Step 4: Write the failing tests**

`lib/demo/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { demoVarsFor, escapeHtml, renderDemo } from "./render";
import { TEMPLATES } from "./templates.gen";
import type { LocalBiz, TemplateKey } from "@/lib/types";

const biz = (over: Partial<LocalBiz> = {}): LocalBiz => ({
  id: "node/1", slug: "amar-fast-food-restaurant", name: "Amar Fast Food & Restaurant", area: "Andheri", catKey: "restaurant", catLabel: "restaurant",
  addr: "", waNum: "919820011111", telNum: "", phoneDisplay: "+91 98200 11111", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "", emailSubject: "", emailBody: "", template: "cafe", createdAt: "", ...over,
});

describe("escapeHtml", () => {
  it("escapes the five HTML metacharacters", () => {
    expect(escapeHtml(`<a href="x">Tom's & Co</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; Co&lt;/a&gt;");
  });
});

describe("renderDemo", () => {
  for (const key of Object.keys(TEMPLATES) as TemplateKey[]) {
    it(`${key}: fills every token, keeps the badge and noindex`, () => {
      const html = renderDemo(key, demoVarsFor(biz({ template: key }), 2026));
      expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(html).toMatch(/Demo preview — made for/);
      expect(html).toMatch(/<meta name="robots" content="noindex/);
      expect(html).toContain("Amar Fast Food &amp; Restaurant");
      expect(html).toContain("wa.me/919820011111?text=Hi%20Amar%20Fast%20Food%20%26%20Restaurant");
    });
  }
  it("escapes hostile names in text and encodes them in links", () => {
    const html = renderDemo("general", demoVarsFor(biz({ name: '<script>alert(1)</script>' }), 2026));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("%3Cscript%3Ealert(1)%3C%2Fscript%3E");
  });
  it("falls back to the landline and a Mumbai area", () => {
    const v = demoVarsFor(biz({ waNum: "", telNum: "912226741533", phoneDisplay: "", area: "" }), 2026);
    expect(v).toMatchObject({ waNumber: "912226741533", phoneDisplay: "+91 2226741533", area: "Mumbai" });
  });
});
```

`lib/demo/route.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/d/[slug]/route";
import { createStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";
import type { LocalBiz } from "@/lib/types";

const A9 = {
  id: "node/12395684120", slug: "a9-digital-prints", name: "A9 Digital Prints", area: "Andheri", catKey: "copyshop", catLabel: "print shop", addr: "",
  waNum: "919322214085", telNum: "", phoneDisplay: "+91 93222 14085", email: "", website: "", social: "", segment: "no_website", evidence: "",
  whatsapp: "", emailSubject: "", emailBody: "", template: "print", createdAt: "",
} satisfies LocalBiz;
const NOPHONE = { ...A9, id: "node/2", slug: "no-phone", waNum: "", telNum: "", phoneDisplay: "" } satisfies LocalBiz;

beforeEach(async () => {
  const s = createStore(new MemoryBackend());
  await s.mutateData((d) => ({ ...d, local: [A9, NOPHONE] }));
  setStoreForTests(s);
});

const get = (slug: string) => GET(new Request(`https://x.test/d/${slug}`), { params: Promise.resolve({ slug }) });

describe("GET /d/[slug]", () => {
  it("renders a known business publicly with caching and noindex headers", async () => {
    const res = await get("a9-digital-prints");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage=300/);
    expect(await res.text()).toContain("A9 Digital Prints");
  });
  it("404s for unknown slugs and businesses without a phone", async () => {
    expect((await get("nope")).status).toBe(404);
    expect((await get("no-phone")).status).toBe(404);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run lib/demo`
Expected: FAIL — `./render` and the route module do not exist.

- [ ] **Step 6: Implement `lib/demo/render.ts`**

```ts
import type { LocalBiz, TemplateKey } from "@/lib/types";
import { TEMPLATES } from "./templates.gen";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface DemoVars {
  name: string;
  area: string;
  phoneDisplay: string;
  /** Digits only; used for wa.me and tel: links. */
  waNumber: string;
  category: string;
  year: number;
}

export function demoVarsFor(b: LocalBiz, year: number): DemoVars {
  const num = (b.waNum || b.telNum).replace(/\D/g, "");
  return {
    name: b.name,
    area: b.area || "Mumbai",
    phoneDisplay: b.phoneDisplay || (num ? "+" + num.replace(/^91/, "91 ") : ""),
    waNumber: num,
    category: b.catLabel || "local business",
    year,
  };
}

/** Text/attribute tokens are HTML-escaped; *_URL tokens (inside href) are URL-encoded. */
export function renderDemo(key: TemplateKey, v: DemoVars): string {
  const map: Record<string, string> = {
    "{{BIZ_NAME_URL}}": encodeURIComponent(v.name),
    "{{AREA_URL}}": encodeURIComponent(v.area),
    "{{PHONE_DISPLAY_URL}}": encodeURIComponent(v.phoneDisplay),
    "{{BIZ_NAME}}": escapeHtml(v.name),
    "{{AREA}}": escapeHtml(v.area),
    "{{PHONE_DISPLAY}}": escapeHtml(v.phoneDisplay),
    "{{CATEGORY}}": escapeHtml(v.category),
    "{{WA_NUMBER}}": v.waNumber.replace(/\D/g, ""),
    "{{YEAR}}": String(v.year),
  };
  let html = TEMPLATES[key] ?? TEMPLATES.general;
  for (const [token, value] of Object.entries(map)) html = html.split(token).join(value);
  return html;
}
```

- [ ] **Step 7: Implement `app/d/[slug]/route.ts`**

```ts
import { demoVarsFor, renderDemo } from "@/lib/demo/render";
import { hasPhone } from "@/lib/local/biz";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const NOT_FOUND = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Demo not found</title></head><body style="font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a"><p>This demo page is not available.</p></body></html>`;

/** Public demo page. Reads data.json through the CDN cache and lets Vercel's CDN cache the HTML for 5 minutes,
 * so businesses opening their demo do not use the Blob quota. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const data = await getStore().readData({ fresh: false });
  const biz = data.local.find((b) => b.slug === slug);
  const base = { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" };
  if (!biz || !hasPhone(biz)) {
    return new Response(NOT_FOUND, { status: 404, headers: { ...base, "cache-control": "public, s-maxage=60" } });
  }
  const html = renderDemo(biz.template, demoVarsFor(biz, new Date().getFullYear()));
  return new Response(html, { headers: { ...base, "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- lib/demo`
Expected: PASS (the generator runs first).

- [ ] **Step 9: Commit**

```bash
git add lib/demo scripts/gen-templates.mjs package.json "app/d/[slug]/route.ts"
git commit -m "Demo sites: 3 copied templates + honest general template, bundled generator, escaped renderer, public /d/[slug] with CDN caching

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: App shell, PWA, login page and the Aaj (Today) screen

**Files:**
- Create: `app/globals.css`, `app/layout.tsx`, `app/SwRegister.tsx`, `app/manifest.ts`, `app/pwa-icon/route.tsx`, `app/apple-icon.tsx`, `public/sw.js`, `public/offline.html`, `public/robots.txt`, `app/login/page.tsx`, `app/login/LoginForm.tsx`, `app/(app)/nav.ts`, `app/(app)/layout.tsx`, `app/(app)/BottomNav.tsx`, `lib/dashboard.ts`, `app/(app)/page.tsx`, `lib/client/api.ts`
- Test: `lib/dashboard.test.ts`

**Interfaces:**
- Consumes: store (Task 2), `requirePageSession` (Task 3), `followUpState`, `formatIST`, `ageLabel`, `DAY_MS` (Task 1), `toParam` (Task 1), `STATUSES` (Task 1).
- Produces:
  - `lib/dashboard.ts`: `leadHref(kind, id)`, `interface FollowItem { id; kind; title; followUpAt; when: "overdue" | "today"; href }`, `interface TodaySummary { followUps; newGigs; counts: Record<Status, number>; lastRun }`, `summarize(gigs, data, now): TodaySummary`.
  - `lib/client/api.ts` (browser): `patchState(param, kind, action)`, `postJSON(url, body)`, `patchJSON(url, body)` — each throws `Error(message)` on a non-OK response.
  - CSS classes added to the ReelPilot design system: `.chips`, `.chip`, `.chip--active`, `.stat-grid`, `.stat`, `.stat__n`, `.stat__l`, `.textarea-lg`, `.counter`, `.counter--over`, `.note`, `.kv`, `.desc`, `.toast`.

- [ ] **Step 1: Write the failing test**

`lib/dashboard.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { summarize } from "./dashboard";
import { emptyData } from "./defaults";
import { toParam } from "./ids";
import type { GigsDoc } from "./types";

const NOW = Date.parse("2026-09-28T04:00:00Z"); // Mon 28 Sep, 09:30 IST
const gig = (id: string, fetchedAt: string) => ({ id, source: "remotive", title: `Gig ${id}`, desc: "", url: "https://x", date: "", budget: "", tags: [], extra: "", score: 5, fetchedAt });

describe("summarize", () => {
  it("lists today's and overdue follow-ups, skips closed and later ones, counts new gigs and stages", () => {
    const gigs: GigsDoc = {
      updatedAt: "",
      lastRun: { at: "2026-09-28T01:30:00.000Z", added: 3, failed: ["remoteok"] },
      items: [gig("g1", "2026-09-28T01:30:00.000Z"), gig("g2", "2026-09-28T01:30:00.000Z"), gig("g3", "2026-09-20T00:00:00.000Z")],
    };
    const data = emptyData("t");
    data.local.push({ id: "node/1", name: "A9 Digital Prints" } as never);
    data.state = {
      "node/1": { kind: "local", status: "sent", followUpAt: "2026-09-28T05:30:00.000Z", updatedAt: "t" },   // today 11:00 IST
      g1: { kind: "gig", status: "sent", followUpAt: "2026-09-27T05:30:00.000Z", updatedAt: "t" },          // overdue
      g3: { kind: "gig", status: "won", followUpAt: "2026-09-27T05:30:00.000Z", updatedAt: "t" },           // closed → skipped
      g4: { kind: "gig", status: "sent", followUpAt: "2026-09-30T05:30:00.000Z", updatedAt: "t" },          // later → skipped
    };
    const s = summarize(gigs, data, NOW);
    expect(s.followUps.map((f) => [f.title, f.when])).toEqual([
      ["Gig g1", "overdue"],
      ["A9 Digital Prints", "today"],
    ]);
    expect(s.followUps[1]!.href).toBe(`/local/${toParam("node/1")}`);
    expect(s.newGigs).toBe(1); // g2 only: g1 has state, g3 is older than 24 h
    expect(s.counts.sent).toBe(3);
    expect(s.counts.won).toBe(1);
    expect(s.lastRun?.failed).toEqual(["remoteok"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/dashboard.test.ts`
Expected: FAIL — `./dashboard` not found.

- [ ] **Step 3: Implement `lib/dashboard.ts`**

```ts
import { toParam } from "./ids";
import { DAY_MS, followUpState } from "./time";
import { STATUSES, type DataDoc, type GigsDoc, type LastRun, type LeadKind, type Status } from "./types";

export interface FollowItem {
  id: string;
  kind: LeadKind;
  title: string;
  followUpAt: string;
  when: "overdue" | "today";
  href: string;
}

export interface TodaySummary {
  followUps: FollowItem[];
  newGigs: number;
  counts: Record<Status, number>;
  lastRun: LastRun | null;
}

const CLOSED = new Set<Status>(["won", "lost", "skipped"]);

export function leadHref(kind: LeadKind, id: string): string {
  return `/${kind === "gig" ? "gigs" : "local"}/${toParam(id)}`;
}

export function summarize(gigs: GigsDoc, data: DataDoc, now: number): TodaySummary {
  const gigTitle = new Map(gigs.items.map((g) => [g.id, g.title]));
  const bizName = new Map(data.local.map((b) => [b.id, b.name]));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const followUps: FollowItem[] = [];
  for (const [id, s] of Object.entries(data.state)) {
    counts[s.status]++;
    if (CLOSED.has(s.status) || !s.followUpAt) continue;
    const when = followUpState(s.followUpAt, now);
    if (when !== "overdue" && when !== "today") continue;
    const title = (s.kind === "gig" ? gigTitle.get(id) : bizName.get(id)) ?? id;
    followUps.push({ id, kind: s.kind, title, followUpAt: s.followUpAt, when, href: leadHref(s.kind, id) });
  }
  followUps.sort((a, b) => Date.parse(a.followUpAt) - Date.parse(b.followUpAt));
  const newGigs = gigs.items.filter(
    (g) => now - Date.parse(g.fetchedAt) <= DAY_MS && (data.state[g.id]?.status ?? "new") === "new",
  ).length;
  return { followUps, newGigs, counts, lastRun: gigs.lastRun };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Styles — copy ReelPilot's design system and append ClientPilot classes**

```bash
cp ../reelpilot/app/globals.css app/globals.css
```

Append to `app/globals.css`:

```css
/* ---- ClientPilot additions ---- */
.chips { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin: 4px 0 12px; }
.chip { flex: none; padding: 7px 14px; border-radius: var(--radius-pill); border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); font-size: 14px; text-decoration: none; }
.chip--active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); font-weight: 700; }
.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 8px; text-align: center; text-decoration: none; color: var(--text); }
.stat__n { font-size: 24px; font-weight: 800; line-height: 1.1; }
.stat__l { font-size: 12px; color: var(--text-dim); }
.textarea-lg { min-height: 280px; font-size: 15px; line-height: 1.5; }
.counter { font-size: 12px; color: var(--text-dim); text-align: right; margin-top: 4px; }
.counter--over { color: var(--danger); font-weight: 700; }
.note { font-size: 13px; color: var(--text-dim); }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 14px; margin: 8px 0 12px; }
.kv dt { color: var(--text-dim); }
.kv dd { margin: 0; overflow-wrap: anywhere; }
.desc { white-space: pre-wrap; font-size: 14px; line-height: 1.55; }
.toast { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); background: var(--surface-2); border: 1px solid var(--border); color: var(--text); padding: 10px 16px; border-radius: var(--radius-pill); font-size: 14px; z-index: 50; box-shadow: var(--shadow); }
```

- [ ] **Step 6: Root layout, PWA files and robots**

`app/layout.tsx`:

```tsx
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
```

`app/SwRegister.tsx`:

```tsx
"use client";
import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
```

`app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClientPilot",
    short_name: "ClientPilot",
    description: "Gigs, local clients and follow-ups",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f1c",
    theme_color: "#0a0f1c",
    icons: [
      { src: "/pwa-icon?size=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon?size=512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

`app/pwa-icon/route.tsx`:

```tsx
import { ImageResponse } from "next/og";

export function GET(req: Request) {
  const size = Math.min(1024, Math.max(48, Number(new URL(req.url).searchParams.get("size") ?? 512)));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1c" }}>
        <div style={{ display: "flex", fontSize: Math.round(size * 0.34), fontWeight: 800, color: "#38bdf8", letterSpacing: -2 }}>CP</div>
      </div>
    ),
    { width: size, height: size },
  );
}
```

`app/apple-icon.tsx`:

```tsx
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f1c" }}>
        <div style={{ display: "flex", fontSize: 62, fontWeight: 800, color: "#38bdf8" }}>CP</div>
      </div>
    ),
    { ...size },
  );
}
```

`public/sw.js` (app-shell only: an offline page for navigations; data and APIs always go to the network):

```js
const CACHE = "cp-shell-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/offline.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});
```

`public/offline.html`:

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — ClientPilot</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0f1c;color:#e8eef7;font:16px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}b{color:#38bdf8}</style></head>
<body><div><p><b>ClientPilot</b></p><p>Internet nahi. Net parat aala ki he page reload kara.</p></div></body></html>
```

`public/robots.txt`:

```
User-agent: *
Disallow: /
```

- [ ] **Step 7: Login page**

`app/login/page.tsx`:

```tsx
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="wrap" style={{ minHeight: "80vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="card" style={{ width: "100%", maxWidth: 360 }}>
        <LoginForm />
      </div>
    </main>
  );
}
```

`app/login/LoginForm.tsx`:

```tsx
"use client";
import { useState, type FormEvent } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && j.ok) {
        window.location.href = "/";
        return;
      }
      setErr(j.error ?? `Login failed (${res.status})`);
    } catch {
      setErr("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--accent)" }}>ClientPilot</div>
        <div className="note">Gigs · Local clients · Follow-ups</div>
      </div>
      <label className="field">
        <span className="field__label">Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      <button className="btn btn--primary" disabled={busy || !password}>{busy ? "Checking…" : "Login"}</button>
      {err ? <p style={{ color: "var(--danger)", margin: 0 }}>{err}</p> : null}
    </form>
  );
}
```

- [ ] **Step 8: Tabbed shell**

`app/(app)/nav.ts`:

```ts
export const NAV = [
  { href: "/", label: "Aaj", icon: "today" },
  { href: "/gigs", label: "Gigs", icon: "gigs" },
  { href: "/local", label: "Local", icon: "local" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export type NavIcon = (typeof NAV)[number]["icon"];
```

`app/(app)/BottomNav.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, type NavIcon } from "./nav";

const PATHS: Record<NavIcon, string> = {
  today: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  gigs: "M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z",
  local: "M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  pipeline: "M4 3h4v18H4zM10 3h4v12h-4zM16 3h4v8h-4z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

export function isActive(href: string, path: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function BottomNav() {
  const path = usePathname() ?? "/";
  return (
    <nav className="bottom-nav" aria-label="Main">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`bottom-nav__item${isActive(n.href, path) ? " bottom-nav__item--active" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={PATHS[n.icon]} />
          </svg>
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

`app/(app)/layout.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";
import { requirePageSession } from "@/lib/auth/page";
import { BottomNav } from "./BottomNav";
import { NAV } from "./nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requirePageSession();
  return (
    <>
      <header className="app-bar">
        <Link href="/" className="app-bar__brand">ClientPilot</Link>
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
```

`lib/client/api.ts`:

```ts
/** Browser helpers for the JSON API. Each throws Error(message) on a non-OK response. */
async function send(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown> & { ok?: boolean; error?: string };
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Logged out");
  }
  if (!res.ok || j.ok === false) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export const postJSON = (url: string, body: unknown) => send("POST", url, body);
export const patchJSON = (url: string, body: unknown) => send("PATCH", url, body);
export const putJSON = (url: string, body: unknown) => send("PUT", url, body);
export const getJSON = (url: string) => send("GET", url);

export function patchState(param: string, kind: "gig" | "local", action: Record<string, unknown>) {
  return patchJSON(`/api/state/${param}?kind=${kind}`, action);
}
```

- [ ] **Step 9: The Aaj screen**

`app/(app)/page.tsx`:

```tsx
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { summarize } from "@/lib/dashboard";
import { getStore } from "@/lib/store";
import { formatIST } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requirePageSession();
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const s = summarize(gigs, data, Date.now());

  return (
    <>
      <h1 className="page-title">Aaj</h1>

      <div className="section-label">Follow-ups</div>
      {s.followUps.length === 0 ? (
        <div className="empty">Aaj kahi follow-up nahi.</div>
      ) : (
        s.followUps.map((f) => (
          <Link key={f.id} href={f.href} className="list-row">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="list-row__topic">{f.title}</div>
              <div className="list-row__meta">{f.kind === "gig" ? "Gig" : "Local"} · {formatIST(f.followUpAt)}</div>
            </div>
            <span className={`badge ${f.when === "overdue" ? "badge--danger" : "badge--warn"}`}>{f.when === "overdue" ? "overdue" : "aaj"}</span>
          </Link>
        ))
      )}

      <div className="section-label">Gigs</div>
      <Link href="/gigs?f=new" className="list-row">
        <div style={{ flex: 1 }}>
          <div className="list-row__topic">{s.newGigs} navin gigs (last 24 tas)</div>
          <div className="list-row__meta">
            {s.lastRun ? `Last fetch ${formatIST(s.lastRun.at)} · +${s.lastRun.added}` : "Ajun fetch zala nahi"}
            {s.lastRun?.failed.length ? ` · failed: ${s.lastRun.failed.join(", ")}` : ""}
          </div>
        </div>
      </Link>

      <div className="section-label">Pipeline</div>
      <div className="stat-grid">
        {(["drafted", "sent", "replied", "won", "lost", "skipped"] as const).map((k) => (
          <Link key={k} href="/pipeline" className="stat">
            <div className="stat__n">{s.counts[k]}</div>
            <div className="stat__l">{k}</div>
          </Link>
        ))}
      </div>
      <p className="note" style={{ marginTop: 16 }}>Navin gigs roj savari sadharan 7 vajta yetat.</p>
    </>
  );
}
```

- [ ] **Step 10: Build and look at it**

Run: `npm run build`
Expected: build succeeds; `/`, `/login` listed; `/d/[slug]` and API routes listed as dynamic (ƒ).

Run: `STORE_BACKEND=memory APP_PASSWORD="test pass 1" SESSION_SECRET=0123456789abcdef npm run dev` (PowerShell: set the three env vars with `$env:NAME="…"` first), open `http://localhost:3000` at 390 px width: you are redirected to `/login`; the password logs you in; Aaj shows the empty states and the bottom nav with the Aaj tab highlighted. Stop the server afterwards.

- [ ] **Step 11: Commit**

```bash
git add app public lib/dashboard.ts lib/dashboard.test.ts lib/client
git commit -m "App shell: PWA manifest/icons/offline page, password login, tabbed layout with active tab, Aaj summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Gigs screens — list, detail, live status, AI proposal, bid actions

**Files:**
- Create: `lib/gigs/view.ts`, `app/api/gigs/[id]/live/route.ts`, `app/(app)/gigs/page.tsx`, `app/(app)/gigs/[id]/page.tsx`, `app/(app)/gigs/[id]/GigPanel.tsx`
- Test: `lib/gigs/view.test.ts`, `lib/gigs/live-route.test.ts`

**Interfaces:**
- Consumes: `fetchLive`, `freelancerProjectId`, `LiveInfo` (Task 5); `MAX_PROPOSAL_CHARS` (Task 7); `patchState`, `postJSON`, `getJSON` (Task 11); `requireSession`, `requirePageSession` (Task 3); ids, time (Task 1).
- Produces: `GigFilter`, `GIG_FILTERS`, `parseFilter(v)`, `filterGigs(items, state, f)`, `currencyFromBudget(budget)`; `GET /api/gigs/[id]/live` → `{ ok, live: LiveInfo }`.

- [ ] **Step 1: Write the failing tests**

`lib/gigs/view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { currencyFromBudget, filterGigs, parseFilter } from "./view";
import type { Gig, LeadState } from "@/lib/types";

const g = (id: string) => ({ id } as Gig);
const st = (status: LeadState["status"]): LeadState => ({ kind: "gig", status, updatedAt: "t" });

describe("gig view helpers", () => {
  const items = [g("a"), g("b"), g("c"), g("d"), g("e")];
  const state = { b: st("drafted"), c: st("sent"), d: st("replied"), e: st("skipped") };
  it("filters by status", () => {
    expect(filterGigs(items, state, "new").map((x) => x.id)).toEqual(["a"]);
    expect(filterGigs(items, state, "drafted").map((x) => x.id)).toEqual(["b"]);
    expect(filterGigs(items, state, "sent").map((x) => x.id)).toEqual(["c", "d"]);
    expect(filterGigs(items, state, "all").map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("parses the filter with a safe default", () => {
    expect(parseFilter("sent")).toBe("sent");
    expect(parseFilter("bogus")).toBe("new");
    expect(parseFilter(undefined)).toBe("new");
  });
  it("guesses the bid currency from the budget text", () => {
    expect(currencyFromBudget("₹12500–₹37500")).toBe("INR");
    expect(currencyFromBudget("INR10+/hr")).toBe("INR");
    expect(currencyFromBudget("$250–$750")).toBe("USD");
    expect(currencyFromBudget("€100–€300")).toBe("EUR");
    expect(currencyFromBudget("")).toBe("INR");
  });
});
```

`lib/gigs/live-route.test.ts`:

```ts
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gigs/live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gigs/live")>()),
  fetchLive: async (pid: number) => (pid === 1 ? { open: true, status: "open", bidCount: 52, bidAvg: 24640, currency: "INR" } : null),
}));

import { GET } from "@/app/api/gigs/[id]/live/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { toParam } from "@/lib/ids";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});

const get = (id: string, withCookie = true) =>
  GET(new Request(`https://x.test/api/gigs/${toParam(id)}/live`, { headers: withCookie ? { cookie } : {} }), { params: Promise.resolve({ id: toParam(id) }) });

describe("GET /api/gigs/[id]/live", () => {
  it("requires a session", async () => {
    expect((await get("freelancer.com:1", false)).status).toBe(401);
  });
  it("400s for non-Freelancer gigs and 404s when the project is gone", async () => {
    expect((await get("remotive:5")).status).toBe(400);
    expect((await get("freelancer.com:2")).status).toBe(404);
  });
  it("returns live info", async () => {
    const res = await get("freelancer.com:1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, live: { open: true, status: "open", bidCount: 52, bidAvg: 24640, currency: "INR" } });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/gigs/view.test.ts lib/gigs/live-route.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/gigs/view.ts`**

```ts
import type { Gig, LeadState } from "@/lib/types";

export type GigFilter = "new" | "drafted" | "sent" | "all";

export const GIG_FILTERS: { key: GigFilter; label: string }[] = [
  { key: "new", label: "New" },
  { key: "drafted", label: "Drafted" },
  { key: "sent", label: "Bid sent" },
  { key: "all", label: "All" },
];

export function parseFilter(v: string | undefined): GigFilter {
  return GIG_FILTERS.some((f) => f.key === v) ? (v as GigFilter) : "new";
}

export function filterGigs(items: Gig[], state: Record<string, LeadState>, f: GigFilter): Gig[] {
  return items.filter((g) => {
    const s = state[g.id]?.status ?? "new";
    if (f === "all") return s !== "skipped";
    if (f === "sent") return s === "sent" || s === "replied" || s === "won";
    return s === f;
  });
}

export function currencyFromBudget(budget: string): string {
  if (/₹|INR/.test(budget)) return "INR";
  if (/€|EUR/.test(budget)) return "EUR";
  if (/£|GBP/.test(budget)) return "GBP";
  if (/\$|USD/.test(budget)) return "USD";
  return "INR";
}
```

- [ ] **Step 4: Implement `app/api/gigs/[id]/live/route.ts`**

```ts
import { requireSession } from "@/lib/auth/guard";
import { fetchLive, freelancerProjectId } from "@/lib/gigs/live";
import { fromParam } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const pid = freelancerProjectId(fromParam((await ctx.params).id));
  if (!pid) return Response.json({ ok: false, error: "live status is only available for Freelancer.com gigs" }, { status: 400 });
  try {
    const live = await fetchLive(pid);
    if (!live) return Response.json({ ok: false, error: "project not found" }, { status: 404 });
    return Response.json({ ok: true, live });
  } catch (e) {
    return Response.json({ ok: false, error: `Freelancer API: ${String((e as Error)?.message ?? e).slice(0, 120)}` }, { status: 502 });
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/gigs/view.test.ts lib/gigs/live-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Gigs list page**

`app/(app)/gigs/page.tsx`:

```tsx
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { filterGigs, GIG_FILTERS, parseFilter } from "@/lib/gigs/view";
import { toParam } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { ageLabel } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function GigsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requirePageSession();
  const f = parseFilter((await searchParams).f);
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const list = filterGigs(gigs.items, data.state, f).slice(0, 150);
  const now = Date.now();

  return (
    <>
      <h1 className="page-title">Gigs</h1>
      <div className="chips">
        {GIG_FILTERS.map((x) => (
          <Link key={x.key} href={`/gigs?f=${x.key}`} className={`chip${x.key === f ? " chip--active" : ""}`}>{x.label}</Link>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">Ithe kahi nahi. Navin gigs roj savari sadharan 7 vajta yetat.</div>
      ) : (
        list.map((g) => {
          const st = data.state[g.id]?.status;
          return (
            <Link key={g.id} href={`/gigs/${toParam(g.id)}`} className="list-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="list-row__topic">{g.title}</div>
                <div className="list-row__meta">
                  {g.source} · {g.budget || "no budget"} · {ageLabel(g.date || g.fetchedAt, now)} · score {g.score}
                  {g.extra ? ` · ${g.extra}` : ""}
                </div>
              </div>
              {st && st !== "new" ? <span className="badge badge--accent">{st}</span> : null}
            </Link>
          );
        })
      )}
    </>
  );
}
```

- [ ] **Step 7: Gig detail page**

`app/(app)/gigs/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page";
import { currencyFromBudget } from "@/lib/gigs/view";
import { fromParam } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { formatIST } from "@/lib/time";
import { GigPanel } from "./GigPanel";

export const dynamic = "force-dynamic";

export default async function GigPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const param = (await params).id;
  const id = fromParam(param);
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const gig = gigs.items.find((g) => g.id === id);
  if (!gig) notFound();
  const st = data.state[id];

  return (
    <>
      <Link href="/gigs" className="link-accent">← Gigs</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{gig.title}</h1>
      <dl className="kv">
        <dt>Source</dt><dd>{gig.source}{gig.extra ? ` · ${gig.extra}` : ""}</dd>
        <dt>Budget</dt><dd>{gig.budget || "—"}</dd>
        <dt>Posted</dt><dd>{gig.date ? formatIST(gig.date) : "—"}</dd>
        <dt>Status</dt><dd>{st?.status ?? "new"}{st?.bidAmount ? ` · bid ${st.bidCurrency ?? ""} ${st.bidAmount}` : ""}{st?.followUpAt ? ` · follow-up ${formatIST(st.followUpAt)}` : ""}</dd>
      </dl>
      <div className="card"><div className="desc">{gig.desc || "No description."}</div></div>
      <GigPanel
        id={id}
        param={param}
        url={gig.url}
        isFreelancer={gig.source === "freelancer.com"}
        initialProposal={st?.proposal ?? ""}
        status={st?.status ?? "new"}
        defaultCurrency={currencyFromBudget(gig.budget)}
      />
    </>
  );
}
```

- [ ] **Step 8: `GigPanel` client component**

`app/(app)/gigs/[id]/GigPanel.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getJSON, patchState, postJSON } from "@/lib/client/api";

const MAX = 1500;
type Live = { open: boolean; status: string; bidCount: number | null; bidAvg: number | null; currency: string };

export function GigPanel(props: {
  id: string;
  param: string;
  url: string;
  isFreelancer: boolean;
  initialProposal: string;
  status: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(props.initialProposal);
  const [saved, setSaved] = useState(props.initialProposal);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [changes, setChanges] = useState<string[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(props.defaultCurrency);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const draft = () =>
    run("ai", async () => {
      const j = (await postJSON("/api/ai/proposal", { id: props.id })) as { text: string; changes: string[]; removedLinks: string[] };
      setText(j.text);
      setSaved(j.text);
      setChanges([...j.changes, ...j.removedLinks.map((l) => `Removed link not on your allow-list: ${l}`)]);
      router.refresh();
    });

  const save = () => run("save", async () => {
    await patchState(props.param, "gig", { type: "proposal", proposal: text });
    setSaved(text);
    setMsg("Saved");
  });

  const copy = () => run("copy", async () => {
    await navigator.clipboard.writeText(text);
    setMsg("Copied — ata Freelancer app madhe paste kar");
  });

  const checkLive = () => run("live", async () => {
    const j = (await getJSON(`/api/gigs/${props.param}/live`)) as { live: Live };
    setLive(j.live);
  });

  const bid = () => run("bid", async () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) throw new Error("Bid amount tak");
    await patchState(props.param, "gig", { type: "bid", amount: n, currency });
    setMsg("Bid saved · follow-up 3 divasani");
    router.refresh();
  });

  const skip = () => run("skip", async () => {
    await patchState(props.param, "gig", { type: "skip" });
    router.push("/gigs");
  });

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {props.isFreelancer ? (
        <div className="btn-row" style={{ marginTop: 0 }}>
          <button className="btn btn--ghost" onClick={checkLive} disabled={!!busy}>{busy === "live" ? "Checking…" : "Live check"}</button>
          {live ? (
            <span className="note" style={{ alignSelf: "center" }}>
              {live.open ? "Open" : `Closed (${live.status})`} · {live.bidCount ?? "?"} bids{live.bidAvg ? ` · avg ${live.currency} ${live.bidAvg}` : ""}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="btn-row">
        <button className="btn btn--primary" onClick={draft} disabled={!!busy}>{busy === "ai" ? "AI lihitoy… (30 s paryant)" : text ? "AI proposal parat lihi" : "AI proposal lihi"}</button>
      </div>

      <label className="field" style={{ marginTop: 12 }}>
        <span className="field__label">Proposal</span>
        <textarea className="textarea-lg" value={text} onChange={(e) => setText(e.target.value)} placeholder="AI proposal lihi dab, kinva swatah lihi." />
      </label>
      <div className={`counter${text.length > MAX ? " counter--over" : ""}`}>{text.length}/{MAX}</div>
      {changes.length ? (
        <details className="note"><summary>AI ne kay sudharla ({changes.length})</summary><ul>{changes.map((c, i) => <li key={i}>{c}</li>)}</ul></details>
      ) : null}

      <div className="btn-row">
        {text !== saved ? <button className="btn" onClick={save} disabled={!!busy}>Save edits</button> : null}
        <button className="btn" onClick={copy} disabled={!text || !!busy}>Copy</button>
        <a className="btn" href={props.url} target="_blank" rel="noopener noreferrer">Open in Freelancer</a>
      </div>

      <div className="section-label">Bid lavla?</div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <input className="field__input" style={{ flex: 1, minWidth: 110 }} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="field__input" style={{ width: 92 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {["INR", "USD", "EUR", "GBP", "AUD", "CAD"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn btn--ok" onClick={bid} disabled={!!busy}>Bid kela</button>
      </div>
      <div className="btn-row">
        <button className="btn btn--ghost" onClick={skip} disabled={!!busy}>Skip</button>
      </div>
      {msg ? <div className="toast" role="status">{msg}</div> : null}
    </div>
  );
}
```

- [ ] **Step 9: Build and check at phone width**

Run: `npm run build` — Expected: success.
Then run the dev server as in Task 11 Step 10 with `STORE_BACKEND=memory`, seed a gig by calling the cron route once (`curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/gigs` with `CRON_SECRET` set in the env), open `/gigs` at 390 px: the chips switch lists; a gig opens; "Live check" shows open/closed for a Freelancer gig; typing in the proposal shows the counter and "Save edits"; "Bid kela" with an amount moves it to the "Bid sent" chip.

- [ ] **Step 10: Commit**

```bash
git add lib/gigs/view.ts lib/gigs/view.test.ts lib/gigs/live-route.test.ts "app/api/gigs" "app/(app)/gigs"
git commit -m "Gigs screens: filter chips, detail with live Freelancer status, AI proposal, copy/open, bid and skip actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Local screens — grouped list, search, business detail with WhatsApp/email/demo

**Files:**
- Create: `lib/local/view.ts`, `app/(app)/local/page.tsx`, `app/(app)/local/SearchForm.tsx`, `app/(app)/local/[id]/page.tsx`, `app/(app)/local/[id]/LocalPanel.tsx`
- Modify: `lib/origin.ts` (add `pageOrigin`)
- Test: `lib/local/view.test.ts`

**Interfaces:**
- Consumes: `SEG_ORDER`, `SEGMENT_LABELS`, `CATEGORY_OPTIONS`, `waLink`, `mailtoLink`, `demoUrl`, `hasPhone` (Task 8); `postJSON`, `patchJSON`, `patchState` (Task 11); `requirePageSession` (Task 3); store (Task 2); ids and time (Task 1).
- Produces: `interface LocalGroup { segment; label; hint; items: { biz: LocalBiz; status: Status }[] }`, `groupLocal(local, state, show: "open" | "all"): LocalGroup[]`; `pageOrigin(): Promise<string>`.

- [ ] **Step 1: Write the failing test**

`lib/local/view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupLocal } from "./view";
import type { LeadState, LocalBiz } from "@/lib/types";

const b = (id: string, name: string, segment: LocalBiz["segment"]) => ({ id, name, segment } as LocalBiz);
const st = (status: LeadState["status"]): LeadState => ({ kind: "local", status, updatedAt: "t" });

describe("groupLocal", () => {
  const local = [b("1", "Zeta", "no_website"), b("2", "Alpha", "no_website"), b("3", "Down Co", "site_down"), b("4", "Won Co", "no_website"), b("5", "Beta", "no_website")];
  const state = { "4": st("won"), "5": st("sent") };
  it("groups by segment in priority order, new first then by name, hiding closed ones", () => {
    const g = groupLocal(local, state, "open");
    expect(g.map((x) => x.segment)).toEqual(["site_down", "no_website"]);
    expect(g[1]!.items.map((i) => [i.biz.name, i.status])).toEqual([["Alpha", "new"], ["Zeta", "new"], ["Beta", "sent"]]);
    expect(g[1]!.label).toBe("No website");
  });
  it("shows closed ones with show=all", () => {
    expect(groupLocal(local, state, "all")[1]!.items).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/local/view.test.ts`
Expected: FAIL — `./view` not found.

- [ ] **Step 3: Implement `lib/local/view.ts` and `pageOrigin`**

`lib/local/view.ts`:

```ts
import type { LeadState, LocalBiz, Segment, Status } from "@/lib/types";
import { SEG_ORDER, SEGMENT_LABELS } from "./classify";

export interface LocalGroup {
  segment: Segment;
  label: string;
  hint: string;
  items: { biz: LocalBiz; status: Status }[];
}

const CLOSED = new Set<Status>(["won", "lost", "skipped"]);

export function groupLocal(local: LocalBiz[], state: Record<string, LeadState>, show: "open" | "all"): LocalGroup[] {
  return SEG_ORDER.map((segment) => ({
    segment,
    ...SEGMENT_LABELS[segment],
    items: local
      .filter((b) => b.segment === segment)
      .map((biz) => ({ biz, status: state[biz.id]?.status ?? ("new" as Status) }))
      .filter((x) => show === "all" || !CLOSED.has(x.status))
      .sort((a, b) => Number(a.status !== "new") - Number(b.status !== "new") || a.biz.name.localeCompare(b.biz.name)),
  })).filter((g) => g.items.length > 0);
}
```

Append to `lib/origin.ts`:

```ts
/** Same as publicOrigin, for server components (no Request object). */
export async function pageOrigin(): Promise<string> {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  const { headers } = await import("next/headers");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/local/view.test.ts`
Expected: PASS.

- [ ] **Step 5: Local list page and search form**

`app/(app)/local/SearchForm.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { postJSON } from "@/lib/client/api";
import { CATEGORY_OPTIONS } from "@/lib/local/categories";

export function SearchForm() {
  const router = useRouter();
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function go(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const j = (await postJSON("/api/local/search", { area, category })) as { added: number; scanned: number; partial: boolean; areaLabel: string };
      setMsg(`${j.areaLabel}: ${j.added} navin dukane (${j.scanned} tapasli)${j.partial ? " — partial, jast sathi parat shodha" : ""}`);
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={go} style={{ display: "grid", gap: 10 }}>
      <label className="field">
        <span className="field__label">Area</span>
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Andheri, Mumbai" />
      </label>
      <label className="field">
        <span className="field__label">Prakar</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_OPTIONS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>
      <button className="btn btn--primary" disabled={busy || area.trim().length < 2}>{busy ? "Shodhtoy… (1 minute paryant)" : "Navin shodh"}</button>
      {msg ? <p className="note" style={{ margin: 0 }}>{msg}</p> : null}
    </form>
  );
}
```

`app/(app)/local/page.tsx`:

```tsx
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { toParam } from "@/lib/ids";
import { groupLocal } from "@/lib/local/view";
import { getStore } from "@/lib/store";
import { SearchForm } from "./SearchForm";

export const dynamic = "force-dynamic";

export default async function LocalPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requirePageSession();
  const show = (await searchParams).show === "all" ? "all" : "open";
  const data = await getStore().readData();
  const groups = groupLocal(data.local, data.state, show);

  return (
    <>
      <h1 className="page-title">Local</h1>
      <SearchForm />
      <div className="chips" style={{ marginTop: 12 }}>
        <Link href="/local" className={`chip${show === "open" ? " chip--active" : ""}`}>Open</Link>
        <Link href="/local?show=all" className={`chip${show === "all" ? " chip--active" : ""}`}>All</Link>
      </div>
      {groups.length === 0 ? (
        <div className="empty">Ithe kahi nahi. Varti area ani prakar tak ani "Navin shodh" dab.</div>
      ) : (
        groups.map((g) => (
          <section key={g.segment}>
            <div className="section-label">{g.label} ({g.items.length}) · {g.hint}</div>
            {g.items.map(({ biz, status }) => (
              <Link key={biz.id} href={`/local/${toParam(biz.id)}`} className="list-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="list-row__topic">{biz.name}</div>
                  <div className="list-row__meta">{biz.catLabel} · {biz.area}{biz.phoneDisplay ? ` · ${biz.phoneDisplay}` : ""}</div>
                </div>
                {status !== "new" ? <span className="badge badge--accent">{status}</span> : null}
              </Link>
            ))}
          </section>
        ))
      )}
    </>
  );
}
```

- [ ] **Step 6: Business detail page and panel**

`app/(app)/local/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page";
import { fromParam } from "@/lib/ids";
import { demoUrl, hasPhone } from "@/lib/local/biz";
import { SEGMENT_LABELS } from "@/lib/local/classify";
import { pageOrigin } from "@/lib/origin";
import { getStore } from "@/lib/store";
import { formatIST } from "@/lib/time";
import { LocalPanel } from "./LocalPanel";

export const dynamic = "force-dynamic";

export default async function LocalBizPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession();
  const param = (await params).id;
  const id = fromParam(param);
  const data = await getStore().readData();
  const biz = data.local.find((b) => b.id === id);
  if (!biz) notFound();
  const st = data.state[id];
  const demo = hasPhone(biz) ? demoUrl(await pageOrigin(), biz.slug) : null;
  const num = biz.waNum || biz.telNum;

  return (
    <>
      <Link href="/local" className="link-accent">← Local</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{biz.name}</h1>
      <dl className="kv">
        <dt>Prakar</dt><dd>{biz.catLabel}</dd>
        <dt>Area</dt><dd>{biz.area}{biz.addr ? ` · ${biz.addr}` : ""}</dd>
        <dt>Phone</dt><dd>{num ? <a className="link-accent" href={`tel:+${num}`}>{biz.phoneDisplay || `+${num}`}</a> : "—"}</dd>
        {biz.email ? (<><dt>Email</dt><dd>{biz.email}</dd></>) : null}
        {biz.website ? (<><dt>Website</dt><dd>{biz.website}</dd></>) : null}
        <dt>Segment</dt><dd>{SEGMENT_LABELS[biz.segment].label}{biz.evidence ? ` — ${biz.evidence}` : ""}</dd>
        <dt>Status</dt><dd>{st?.status ?? "new"}{st?.followUpAt ? ` · follow-up ${formatIST(st.followUpAt)}` : ""}</dd>
      </dl>
      {st?.notes ? <div className="card"><div className="desc">{st.notes}</div></div> : null}
      <LocalPanel
        param={param}
        phone={num}
        isMobile={!!biz.waNum}
        email={biz.email}
        whatsapp={biz.whatsapp}
        emailSubject={biz.emailSubject}
        emailBody={biz.emailBody}
        demoUrl={demo}
      />
    </>
  );
}
```

`app/(app)/local/[id]/LocalPanel.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { patchJSON, patchState } from "@/lib/client/api";
import { mailtoLink, waLink } from "@/lib/local/messages";

export function LocalPanel(p: {
  param: string;
  phone: string;
  isMobile: boolean;
  email: string;
  whatsapp: string;
  emailSubject: string;
  emailBody: string;
  demoUrl: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(p.whatsapp);
  const [saved, setSaved] = useState(p.whatsapp);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // window.open runs before the first await, so the browser treats it as part of the tap.
  const sendWa = () =>
    run("wa", async () => {
      const link = waLink(p.phone, text);
      if (!link) throw new Error("Phone number nahi");
      window.open(link, "_blank", "noopener");
      await patchState(p.param, "local", { type: "sent" });
      setMsg("Sent mark kela · follow-up 3 divasani");
      router.refresh();
    });

  const sendEmail = () =>
    run("email", async () => {
      window.location.href = mailtoLink(p.email, p.emailSubject, p.emailBody);
      await patchState(p.param, "local", { type: "sent" });
      router.refresh();
    });

  const save = () => run("save", async () => {
    await patchJSON(`/api/local/${p.param}`, { whatsapp: text });
    setSaved(text);
    setMsg("Saved");
  });

  const regen = () =>
    run("regen", async () => {
      const j = (await patchJSON(`/api/local/${p.param}`, { regenerate: true })) as { biz: { whatsapp: string } };
      setText(j.biz.whatsapp);
      setSaved(j.biz.whatsapp);
      setMsg("Message Settings chya template ne parat banvla");
      router.refresh();
    });

  const copyDemo = () => run("demo", async () => {
    await navigator.clipboard.writeText(p.demoUrl ?? "");
    setMsg("Demo link copied");
  });

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {p.demoUrl ? (
        <div className="btn-row" style={{ marginTop: 0 }}>
          <a className="btn" href={p.demoUrl} target="_blank" rel="noopener noreferrer">Demo bagh</a>
          <button className="btn btn--ghost" onClick={copyDemo} disabled={!!busy}>Copy demo link</button>
        </div>
      ) : (
        <p className="note" style={{ marginTop: 0 }}>Phone number nahi, mhanun demo page nahi.</p>
      )}
      <label className="field" style={{ marginTop: 12 }}>
        <span className="field__label">WhatsApp message</span>
        <textarea className="textarea-lg" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {!p.isMobile && p.phone ? <p className="note">Ha landline number ahe — WhatsApp var nasel. Call karun bagh.</p> : null}
      <div className="btn-row">
        <button className="btn btn--ok" onClick={sendWa} disabled={!p.phone || !!busy}>WhatsApp var pathav</button>
        {text !== saved ? <button className="btn" onClick={save} disabled={!!busy}>Save</button> : null}
        <button className="btn btn--ghost" onClick={regen} disabled={!!busy}>Message parat banva</button>
      </div>
      {p.email ? (
        <div className="btn-row">
          <button className="btn" onClick={sendEmail} disabled={!!busy}>Email pathav</button>
        </div>
      ) : null}
      {msg ? <div className="toast" role="status">{msg}</div> : null}
    </div>
  );
}
```

- [ ] **Step 7: Build and check at phone width**

Run: `npm run build` — Expected: success.
With the memory-backed dev server (Task 11 Step 10), run a search for "Andheri, Mumbai" / "Dentist" on `/local` (real OSM, ~10–40 s): new businesses appear grouped; open one: "Demo bagh" opens `/d/<slug>` in a new tab without login; "WhatsApp var pathav" opens a `https://wa.me/<number>?text=…` URL (close it without sending) and the status becomes `sent`.

- [ ] **Step 8: Commit**

```bash
git add lib/local/view.ts lib/local/view.test.ts lib/origin.ts "app/(app)/local"
git commit -m "Local screens: segment groups, OSM search form, business detail with WhatsApp/email send, demo link, regenerate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Pipeline and Settings screens (+ settings API)

**Files:**
- Create: `lib/pipeline.ts`, `app/(app)/pipeline/page.tsx`, `app/(app)/pipeline/StageControls.tsx`, `app/api/settings/route.ts`, `app/(app)/settings/page.tsx`, `app/(app)/settings/SettingsForm.tsx`
- Test: `lib/pipeline.test.ts`, `lib/settings-route.test.ts`

**Interfaces:**
- Consumes: `leadHref` (Task 11); `toParam` (Task 1); store (Task 2); guards (Task 3); `patchState`, `putJSON`, `postJSON` (Task 11); `followUpState`, `formatIST` (Task 1).
- Produces: `PIPELINE_STAGES`, `interface PipelineItem`, `buildPipeline(gigs, data)`; `GET/PUT /api/settings`.

- [ ] **Step 1: Write the failing tests**

`lib/pipeline.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPipeline } from "./pipeline";
import { emptyData } from "./defaults";
import type { GigsDoc } from "./types";

describe("buildPipeline", () => {
  it("puts acted-on leads in stage columns, soonest follow-up first, with titles and subtitles", () => {
    const gigs: GigsDoc = { updatedAt: "", lastRun: null, items: [{ id: "g1", source: "freelancer.com", title: "Marketplace MVP" } as never, { id: "g2", source: "remotive", title: "Dashboard" } as never] };
    const data = emptyData("t");
    data.local.push({ id: "node/1", name: "A9 Digital Prints", catLabel: "print shop", area: "Andheri" } as never);
    data.state = {
      g1: { kind: "gig", status: "sent", bidAmount: 18000, bidCurrency: "INR", followUpAt: "2026-09-29T05:30:00.000Z", updatedAt: "t" },
      "node/1": { kind: "local", status: "sent", followUpAt: "2026-09-28T05:30:00.000Z", updatedAt: "t" },
      g2: { kind: "gig", status: "drafted", updatedAt: "t" },
      g9: { kind: "gig", status: "skipped", updatedAt: "t" },
    };
    const p = buildPipeline(gigs, data);
    expect(p.sent.map((i) => [i.title, i.sub])).toEqual([
      ["A9 Digital Prints", "print shop · Andheri"],
      ["Marketplace MVP", "Bid INR 18000"],
    ]);
    expect(p.drafted.map((i) => i.title)).toEqual(["Dashboard"]);
    expect(p.won).toEqual([]);
    expect(Object.keys(p)).toEqual(["drafted", "sent", "replied", "won", "lost"]);
  });
});
```

`lib/settings-route.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET, PUT } from "@/app/api/settings/route";
import { COOKIE_NAME, signSession } from "@/lib/auth/crypto";
import { defaultSettings } from "@/lib/defaults";
import { createStore, getStore, setStoreForTests } from "@/lib/store";
import { MemoryBackend } from "@/lib/store/memory";

let cookie = "";
beforeAll(async () => {
  process.env.SESSION_SECRET = "test-secret-0123456789";
  cookie = `${COOKIE_NAME}=${await signSession()}`;
});
beforeEach(() => setStoreForTests(createStore(new MemoryBackend())));

const put = (body: unknown, withCookie = true) =>
  PUT(new Request("https://x.test/api/settings", { method: "PUT", headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) }, body: JSON.stringify(body) }));

describe("/api/settings", () => {
  it("requires a session", async () => {
    expect((await GET(new Request("https://x.test/api/settings"))).status).toBe(401);
    expect((await put(defaultSettings(), false)).status).toBe(401);
  });
  it("rejects invalid links and an empty template", async () => {
    expect((await put({ ...defaultSettings(), allowedLinks: ["not a url"] })).status).toBe(400);
    expect((await put({ ...defaultSettings(), waTemplate: "" })).status).toBe(400);
  });
  it("saves and returns settings", async () => {
    const s = { ...defaultSettings(), pricing: "₹12k per site" };
    expect((await put(s)).status).toBe(200);
    expect((await getStore().readData()).settings.pricing).toBe("₹12k per site");
    const res = await GET(new Request("https://x.test/api/settings", { headers: { cookie } }));
    expect(((await res.json()) as { settings: { pricing: string } }).settings.pricing).toBe("₹12k per site");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pipeline.test.ts lib/settings-route.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/pipeline.ts`**

```ts
import { leadHref } from "./dashboard";
import { toParam } from "./ids";
import type { DataDoc, GigsDoc, LeadKind, Status } from "./types";

export const PIPELINE_STAGES = ["drafted", "sent", "replied", "won", "lost"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface PipelineItem {
  id: string;
  param: string;
  kind: LeadKind;
  title: string;
  sub: string;
  status: Status;
  followUpAt?: string;
  notes?: string;
  href: string;
}

const due = (i: PipelineItem) => (i.followUpAt ? Date.parse(i.followUpAt) : Number.MAX_SAFE_INTEGER);

export function buildPipeline(gigs: GigsDoc, data: DataDoc): Record<PipelineStage, PipelineItem[]> {
  const out = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as PipelineItem[]])) as Record<PipelineStage, PipelineItem[]>;
  const gigById = new Map(gigs.items.map((g) => [g.id, g]));
  const bizById = new Map(data.local.map((b) => [b.id, b]));
  for (const [id, s] of Object.entries(data.state)) {
    if (!(PIPELINE_STAGES as readonly string[]).includes(s.status)) continue;
    const gig = s.kind === "gig" ? gigById.get(id) : undefined;
    const biz = s.kind === "local" ? bizById.get(id) : undefined;
    const sub = s.kind === "gig"
      ? s.bidAmount ? `Bid ${s.bidCurrency ?? ""} ${s.bidAmount}`.replace(/\s+/g, " ") : gig?.source ?? "gig"
      : biz ? `${biz.catLabel} · ${biz.area}` : "local";
    out[s.status as PipelineStage].push({
      id, param: toParam(id), kind: s.kind, title: gig?.title ?? biz?.name ?? id, sub, status: s.status,
      followUpAt: s.followUpAt, notes: s.notes, href: leadHref(s.kind, id),
    });
  }
  for (const k of PIPELINE_STAGES) out[k].sort((a, b) => due(a) - due(b));
  return out;
}
```

- [ ] **Step 4: Implement `app/api/settings/route.ts`**

```ts
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const SettingsSchema = z.object({
  facts: z.string().max(10_000),
  never: z.string().max(4_000),
  allowedLinks: z.array(z.string().trim().url().max(300)).min(1).max(15),
  pricing: z.string().max(4_000),
  waTemplate: z.string().trim().min(10).max(3_000),
});

export async function GET(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const d = await getStore().readData();
  return Response.json({ ok: true, settings: d.settings });
}

export async function PUT(req: Request) {
  const denied = await requireSession(req);
  if (denied) return denied;
  const parsed = SettingsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") }, { status: 400 });
  await getStore().mutateData((d) => ({ ...d, settings: parsed.data }));
  return Response.json({ ok: true, settings: parsed.data });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/pipeline.test.ts lib/settings-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Pipeline page and controls**

`app/(app)/pipeline/StageControls.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { patchState } from "@/lib/client/api";

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StageControls(p: { param: string; kind: "gig" | "local"; status: string; followUpAt: string; notes: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(p.notes);
  // Filled after mount: the server (UTC) and the phone (IST) would format the local time differently.
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => setWhen(p.followUpAt ? toLocalInput(p.followUpAt) : ""), [p.followUpAt]);

  async function act(action: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      await patchState(p.param, p.kind, action);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <select className="field__input" value={p.status} disabled={busy} onChange={(e) => act({ type: "stage", status: e.target.value })}>
          {["drafted", "sent", "replied", "won", "lost", "skipped"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          className="field__input"
          type="datetime-local"
          value={when}
          disabled={busy}
          onChange={(e) => {
            setWhen(e.target.value);
            act({ type: "followUp", followUpAt: e.target.value ? new Date(e.target.value).toISOString() : null });
          }}
        />
      </div>
      <div className="btn-row" style={{ marginTop: 0 }}>
        <input className="field__input" style={{ flex: 1 }} placeholder="Note" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {notes !== p.notes ? <button className="btn" disabled={busy} onClick={() => act({ type: "notes", notes })}>Save</button> : null}
      </div>
      {err ? <p style={{ color: "var(--danger)", margin: 0 }}>{err}</p> : null}
    </div>
  );
}
```

`app/(app)/pipeline/page.tsx`:

```tsx
import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page";
import { buildPipeline, PIPELINE_STAGES, type PipelineStage } from "@/lib/pipeline";
import { getStore } from "@/lib/store";
import { followUpState, formatIST } from "@/lib/time";
import { StageControls } from "./StageControls";

export const dynamic = "force-dynamic";

const LABEL: Record<PipelineStage, string> = {
  drafted: "Drafted",
  sent: "Pathavla / Bid kela",
  replied: "Reply aala",
  won: "Client zala",
  lost: "Nahi",
};

export default async function PipelinePage() {
  await requirePageSession();
  const store = getStore();
  const [gigs, data] = await Promise.all([store.readGigs(), store.readData()]);
  const p = buildPipeline(gigs, data);
  const now = Date.now();

  return (
    <>
      <h1 className="page-title">Pipeline</h1>
      {PIPELINE_STAGES.map((stage) => (
        <section key={stage}>
          <div className="section-label">{LABEL[stage]} ({p[stage].length})</div>
          {p[stage].length === 0 ? (
            <div className="empty">—</div>
          ) : (
            p[stage].map((item) => (
              <div key={item.id} className="card">
                <Link href={item.href} className="list-row__topic link-accent">{item.title}</Link>
                <div className="note">
                  {item.kind === "gig" ? "Gig" : "Local"} · {item.sub}
                  {item.followUpAt ? ` · follow-up ${formatIST(item.followUpAt)}` : ""}
                  {followUpState(item.followUpAt, now) === "overdue" ? " · overdue" : ""}
                </div>
                <StageControls param={item.param} kind={item.kind} status={item.status} followUpAt={item.followUpAt ?? ""} notes={item.notes ?? ""} />
              </div>
            ))
          )}
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 7: Settings page and form**

`app/(app)/settings/SettingsForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { postJSON, putJSON } from "@/lib/client/api";
import type { Settings } from "@/lib/types";

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [links, setLinks] = useState(initial.allowedLinks.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const allowedLinks = links.split("\n").map((l) => l.trim()).filter(Boolean);
      await putJSON("/api/settings", { ...s, allowedLinks });
      setMsg("Saved");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await postJSON("/api/logout", {}).catch(() => {});
    window.location.href = "/login";
  }

  const area = (key: "facts" | "never" | "pricing" | "waTemplate", label: string, hint: string) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <textarea className="textarea-lg" value={s[key]} onChange={(e) => setS({ ...s, [key]: e.target.value })} />
      <span className="note">{hint}</span>
    </label>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {area("facts", "Facts (AI fakt hech vaparel)", "Tuzya baddal khari mahiti. Navin project/experience aala ki ithe jod.")}
      {area("never", "Kadhich claim karu naye", "Ek line = ek gosht.")}
      <label className="field">
        <span className="field__label">Allowed links</span>
        <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={4} />
        <span className="note">Ek line = ek link. Proposal madhe fakt hech links rahtil.</span>
      </label>
      {area("pricing", "Pricing notes", "AI bid amount suchavtana he vachte.")}
      {area("waTemplate", "WhatsApp template", "Placeholders: {intro} {name} {area} {category} {benefit} {demo_line}. Juni messages 'Message parat banva' ne update hotat.")}
      <div className="btn-row">
        <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button className="btn btn--ghost" onClick={logout}>Logout</button>
      </div>
      {msg ? <div className="toast" role="status">{msg}</div> : null}
    </div>
  );
}
```

`app/(app)/settings/page.tsx`:

```tsx
import { requirePageSession } from "@/lib/auth/page";
import { getStore } from "@/lib/store";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requirePageSession();
  const data = await getStore().readData();
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <SettingsForm initial={data.settings} />
    </>
  );
}
```

- [ ] **Step 8: Build and run the full test suite**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no type errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add lib/pipeline.ts lib/pipeline.test.ts lib/settings-route.test.ts app/api/settings "app/(app)/pipeline" "app/(app)/settings"
git commit -m "Pipeline stages with follow-up/notes controls; editable Settings (facts, NEVER list, links, pricing, WA template) and logout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: One-time import from Lead Hunter

**Files:**
- Create: `lib/importer.ts`, `scripts/import.ts`
- Modify: `package.json` (add `"import": "node --env-file=.env.local --import tsx scripts/import.ts"`)
- Test: `lib/importer.test.ts`

**Interfaces:**
- Consumes: `score` (Task 5); `defaultSettings` (Task 2); `buildMessages`, `demoUrl`, `hasPhone`, `templateFor`, `uniqueSlug` (Task 8); `createStore`, `BlobBackend` (Task 2).
- Produces: `buildImport(input): { gigs: GigsDoc; data: DataDoc }`, constants `PLACED_BIDS`, `A9_ID`, `A9_FOLLOW_UP`, `BIDS_FOLLOW_UP`; the `import` npm script.

- [ ] **Step 1: Write the failing test**

`lib/importer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/importer.test.ts`
Expected: FAIL — `./importer` not found.

- [ ] **Step 3: Implement `lib/importer.ts`**

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultSettings } from "./defaults";
import { score } from "./gigs/lead";
import { demoUrl, hasPhone, templateFor, uniqueSlug } from "./local/biz";
import { buildMessages } from "./local/messages";
import type { DataDoc, Gig, GigsDoc, LeadState, LocalBiz } from "./types";

/** Bids placed on Freelancer.com on 2026-09-26 (with Kalpesh's approval). */
export const PLACED_BIDS = [
  { pid: "40734895", amount: 18000, currency: "INR" },
  { pid: "40734538", amount: 7000, currency: "INR" },
  { pid: "40734499", amount: 18000, currency: "INR" },
  { pid: "40695993", amount: 380, currency: "USD" },
];
export const BIDS_SENT_AT = "2026-09-26T17:30:00.000Z";
export const BIDS_FOLLOW_UP = "2026-09-29T05:30:00.000Z"; // Tue 29 Sep, 11:00 IST
export const A9_ID = "node/12395684120";
export const A9_FOLLOW_UP = "2026-09-28T05:30:00.000Z"; // Mon 28 Sep, 11:00 IST
const A9_FIRST_PITCH = "2026-09-20T06:30:00.000Z";
const A9_NOTES =
  'First pitch sent 19–20 Sep; they replied "?". Send the follow-up below on WhatsApp from the same number around 11 AM. ' +
  "No reply by Monday evening → send the email. If they say YES: ₹10,000; small advance (₹2–3k) or pay after it is live; domain ~₹1,000/year extra.";

export interface ImportInput {
  leads: any[];
  mapLeads: any[];
  hunt: any;
  seen: Record<string, string>;
  origin: string;
  now: string;
}

export function buildImport(input: ImportInput): { gigs: GigsDoc; data: DataDoc } {
  const nowMs = Date.parse(input.now);
  const items: Gig[] = input.leads
    .map((l): Gig => {
      const g = {
        id: String(l.id), source: String(l.source), title: String(l.title ?? ""), desc: String(l.desc ?? ""),
        url: String(l.url ?? ""), date: String(l.date ?? ""), budget: String(l.budget ?? ""),
        tags: Array.isArray(l.tags) ? l.tags.map(String) : [], extra: String(l.extra ?? ""),
        fetchedAt: input.seen[l.id] ? `${input.seen[l.id]}T00:00:00.000Z` : input.now,
      };
      return { ...g, score: score(g, nowMs) };
    })
    .sort((a, b) => b.score - a.score);

  const settings = defaultSettings();
  const taken = new Set<string>();
  const warm = input.hunt?.warm?.final;
  const local: LocalBiz[] = input.mapLeads.map((m) => {
    const base = {
      id: String(m.id), name: String(m.name), area: String(m.area ?? ""), catKey: String(m.catKey ?? "business"),
      catLabel: String(m.catLabel ?? "business"), addr: String(m.addr ?? ""), waNum: String(m.waNum ?? ""),
      telNum: String(m.telNum ?? ""), phoneDisplay: String(m.phoneDisplay ?? ""), email: String(m.email ?? ""),
      website: String(m.website ?? ""), social: String(m.social ?? ""), segment: m.segment, evidence: String(m.evidence ?? ""),
    };
    const slug = uniqueSlug(base.name, taken);
    const template = templateFor(base.catKey, base.catLabel);
    const msgs = base.id === A9_ID && warm
      ? { whatsapp: String(warm.whatsappHinglish), emailSubject: String(warm.emailSubject), emailBody: String(warm.emailBody) }
      : buildMessages(base, settings, hasPhone(base) ? demoUrl(input.origin, slug) : null);
    return { ...base, slug, template, ...msgs, createdAt: input.now };
  });

  const state: Record<string, LeadState> = {};
  const huntBids = new Map<string, any>((input.hunt?.bids ?? []).map((b: any) => [String(b.pid), b]));
  for (const b of PLACED_BIDS) {
    state[`freelancer.com:${b.pid}`] = {
      kind: "gig", status: "sent", bidAmount: b.amount, bidCurrency: b.currency,
      ...(huntBids.get(b.pid)?.proposal ? { proposal: String(huntBids.get(b.pid).proposal) } : {}),
      sentAt: BIDS_SENT_AT, followUpAt: BIDS_FOLLOW_UP, updatedAt: input.now,
    };
  }
  if (local.some((b) => b.id === A9_ID)) {
    state[A9_ID] = { kind: "local", status: "sent", sentAt: A9_FIRST_PITCH, followUpAt: A9_FOLLOW_UP, notes: A9_NOTES, updatedAt: input.now };
  }

  return {
    gigs: { updatedAt: input.now, lastRun: null, items },
    data: { state, local, settings, updatedAt: input.now },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/importer.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `scripts/import.ts`**

```ts
// One-time import of C:\kalpesh\kal\lead-hunter data into the private Blob store.
// Usage: npm run import -- --origin https://<production domain> [--force]
import { readFileSync } from "node:fs";
import { buildImport } from "../lib/importer";
import { createStore } from "../lib/store";
import { BlobBackend } from "../lib/store/blob";

const args = process.argv.slice(2);
const origin = args[args.indexOf("--origin") + 1];
if (!args.includes("--origin") || !origin?.startsWith("https://")) {
  console.error("Pass --origin https://<production domain> (used for demo links in messages).");
  process.exit(1);
}
const force = args.includes("--force");
const LH = new URL("../../lead-hunter/", import.meta.url);
const read = (f: string) => JSON.parse(readFileSync(new URL(f, LH), "utf8"));

const store = createStore(new BlobBackend());
const existing = await store.readData();
if (existing.local.length && !force) {
  console.error(`data.json already has ${existing.local.length} businesses — rerun with --force to overwrite everything.`);
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
console.log(`Imported ${gigs.items.length} gigs, ${data.local.length} businesses, ${Object.keys(data.state).length} lead states.`);
```

(Relative imports are used because the script runs through `tsx` outside Next's bundler.)

Add to `package.json` scripts: `"import": "node --env-file=.env.local --import tsx scripts/import.ts"`.

- [ ] **Step 6: Commit**

```bash
git add lib/importer.ts lib/importer.test.ts scripts/import.ts package.json
git commit -m "Importer: Lead Hunter gigs, businesses (fresh honest messages + demo links), 4 placed bids and the A9 follow-up

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Deploy to Vercel, import data, smoke-test on a phone-sized screen

No new code; every step is a command or a check. Stop and report if any check fails.

- [ ] **Step 1: Everything green locally**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no type errors, build succeeds.

- [ ] **Step 2: Generate the secrets** (kept only in the gitignored `.env.secrets.local` and in Vercel)

```bash
node -e "
const c=require('crypto');
const W='apple river tiger lamp cloud stone mango piano rocket garden pencil ocean candle forest silver violet copper sunny window bridge meadow falcon ember maple lotus harbor quartz saffron cobalt tulip orbit canyon velvet pepper lemon walnut glacier comet willow marble breeze thunder coral jasmine basil cedar dune ivory lagoon nectar pixel radar summit tango ultra vivid zebra amber blossom cactus dolphin eagle fossil ginger hazel iris jungle kiwi lantern mocha nimbus olive papaya quiver raven sparrow tundra umber vortex wander yonder zephyr acorn bamboo cherry daisy elm fern grape hollow indigo jade koala lilac'.split(' ');
const pw=[0,1,2,3].map(()=>W[c.randomInt(W.length)]).join(' ')+' '+c.randomInt(10,100);
const hex=()=>c.randomBytes(32).toString('hex');
require('fs').writeFileSync('.env.secrets.local','APP_PASSWORD='+pw+'\nSESSION_SECRET='+hex()+'\nCRON_SECRET='+hex()+'\n');
console.log('password:', pw);
"
```

Expected: prints `password: <4 words> <number>`; `.env.secrets.local` exists and `git status` does not list it (covered by `.env*` in `.gitignore`).

- [ ] **Step 3: Create and link the Vercel project, create the private Blob store in Mumbai**

```bash
npx vercel@60.1.3 link --yes --project clientpilot --scope kalpeshmalusare30-7671
npx vercel@60.1.3 blob create-store clientpilot-data --access private --region bom1 --yes --scope kalpeshmalusare30-7671
```

Expected: `.vercel/project.json` exists (gitignored); the store is created and connected to all environments (`BLOB_STORE_ID` added). If `link` says the project does not exist, run `npx vercel@60.1.3 project add clientpilot --scope kalpeshmalusare30-7671` and link again.

- [ ] **Step 4: Set production environment variables**

Read the values from `.env.secrets.local`, the Gemini key from `../reelpilot/.env` (`GEMINI_API_KEY`), then for each variable run (production only; values are stored as sensitive):

```bash
npx vercel@60.1.3 env add APP_PASSWORD production --value "<value>" --yes --scope kalpeshmalusare30-7671
npx vercel@60.1.3 env add SESSION_SECRET production --value "<value>" --yes --scope kalpeshmalusare30-7671
npx vercel@60.1.3 env add CRON_SECRET production --value "<value>" --yes --scope kalpeshmalusare30-7671
npx vercel@60.1.3 env add GEMINI_API_KEY production --value "<value>" --yes --scope kalpeshmalusare30-7671
npx vercel@60.1.3 env add GEMINI_MODEL production --value "gemini-flash-lite-latest,gemini-3.6-flash,gemini-flash-latest,gemini-3.5-flash" --yes --scope kalpeshmalusare30-7671
```

Expected: `npx vercel@60.1.3 env ls production --scope kalpeshmalusare30-7671` lists all five plus `BLOB_STORE_ID`.

- [ ] **Step 5: Deploy to production and make it reachable without a Vercel login**

```bash
npx vercel@60.1.3 --prod --yes --scope kalpeshmalusare30-7671
```

Note the production domain from the output (e.g. `https://clientpilot-<x>.vercel.app`) as `$PROD`.

New Vercel projects can be created with Vercel Authentication (SSO protection) on, which would block the public demo pages and the phone. Check and, if needed, turn it off (the app has its own password):

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$PROD/login"
```

If this prints `401` (or a 30x to vercel.com), run:

```bash
node -e "
const fs=require('fs');
const t=JSON.parse(fs.readFileSync(process.env.APPDATA+'/com.vercel.cli/Data/auth.json','utf8')).token;
const p=JSON.parse(fs.readFileSync('.vercel/project.json','utf8'));
fetch('https://api.vercel.com/v9/projects/'+p.projectId+'?teamId='+p.orgId,{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({ssoProtection:null})})
  .then(r=>r.json()).then(j=>console.log('ssoProtection:', j.ssoProtection, j.error||''));
"
```

Expected: `ssoProtection: null`, and the curl check now prints `200`.

- [ ] **Step 6: Import the Lead Hunter data**

```bash
npx vercel@60.1.3 env pull .env.local --yes --scope kalpeshmalusare30-7671
npm run import -- --origin "$PROD"
```

Expected: `Imported 164 gigs, 101 businesses, 5 lead states.`

- [ ] **Step 7: Check the cron route and run it once**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$PROD/api/cron/gigs"
curl -s -H "Authorization: Bearer <CRON_SECRET from .env.secrets.local>" "$PROD/api/cron/gigs"
```

Expected: the first prints `401`; the second prints `{"ok":true,"added":…,"total":…,"failed":[…]}` with `total` ≥ 164.

- [ ] **Step 8: Public/private boundary checks**

```bash
curl -s -o /dev/null -w "gigs page: %{http_code} -> %{redirect_url}\n" "$PROD/gigs"
curl -s -o /dev/null -w "settings api: %{http_code}\n" "$PROD/api/settings"
curl -s -o /dev/null -w "demo: %{http_code}\n" "$PROD/d/a9-digital-prints"
curl -s -o /dev/null -w "manifest: %{http_code}\n" "$PROD/manifest.webmanifest"
```

Expected: `gigs page: 307 -> $PROD/login`, `settings api: 401`, `demo: 200`, `manifest: 200`.

- [ ] **Step 9: Phone-width smoke test in the browser (390 × 844)**

1. `$PROD` → redirected to `/login`. Enter a wrong password 5 times from one tab: the 6th attempt shows "Too many attempts". (The lock is per warm instance and per IP; if a cold start resets it, note that and continue.)
2. Wait out the lock or use another network, log in with the real password → **Aaj** shows the A9 Digital Prints follow-up (Mon 28 Sep 11:00) and, once 29 Sep arrives, the 4 bids; the pipeline counters show `sent 5`.
3. **Gigs** → New chip lists gigs; open a Freelancer gig → **Live check** shows open/closed and bid count; **AI proposal lihi** returns text under 1500 characters whose links are only from the allow-list.
4. **Local** → A9 Digital Prints → message is the approved Hinglish follow-up; **Demo bagh** opens `/d/a9-digital-prints` in a new tab (it renders without a session). Do not press Send in WhatsApp.
5. **Pipeline** shows A9 and the 4 bids under "Pathavla / Bid kela".
6. **Settings** loads the facts; Save works; Logout returns to `/login`.
7. Chrome menu → "Install app" is offered (manifest + service worker).

Record anything that failed with the exact error text.

- [ ] **Step 10: Commit the deployment config and report**

```bash
git add -A
git status --short   # must NOT list .env.local, .env.secrets.local or .vercel/
git commit -m "Deploy ClientPilot to Vercel (bom1): private Blob store, env, import, smoke test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Report to Kalpesh: the production URL, the password (from Step 2, shown once), and the phone steps: open the URL in Chrome → log in → menu → "Install app".

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| §1 constraints (free, PC off, password, honesty) | 2, 3, 7, 16 |
| §2 Login / Aaj / Gigs / Local / Pipeline / Settings | 11, 12, 13, 14 |
| §3 architecture, units, data documents | 1, 2, 5, 6, 7, 8, 10 |
| §3.3 API routes | 3, 4, 6, 7, 9, 12, 14 |
| §4 AI proposal, local search, demos, security, errors | 7, 8, 9, 10, 3 |
| §5 initial import | 15, 16 |
| §6 testing (unit, build, deployed smoke) | every task, 16 |
| §7 setup | 16 |
