# ClientPilot — design spec

Date: 2026-09-26 · Owner: Kalpesh Malusare · Status: design approved in chat; spec pending Kalpesh's review

## 1. Goal

Kalpesh runs his whole client-acquisition loop from his Android phone, with his PC switched off:
find freelance gigs, get an honest AI-drafted proposal, find local businesses without a website,
message them on WhatsApp with a free demo site, and track who replied and who to follow up.

Today this lives on the PC as `C:\kalpesh\kal\lead-hunter` (Node scripts + static HTML). ClientPilot
moves it to the cloud as an installable PWA and reuses that code.

### Constraints
- Zero budget: free tiers only. No new third-party accounts or terms for Kalpesh to accept.
- Works with the PC off: hosted on Vercel (Kalpesh's existing account `kalpeshmalusare30-7671`, CLI already logged in).
- Password login (Kalpesh's choice over Google sign-in). The app is on the public internet, so brute force must be throttled.
- Honesty: AI text may only use facts Kalpesh has entered, and only his own links (same rules as the Sept 26 bid workflow).
- Kalpesh never has to type on the PC for day-to-day use.

### Out of scope (YAGNI)
- Push notifications.
- Placing bids on Freelancer automatically (their rules ban automation; the Freelancer app is used for the bid itself).
- Sending WhatsApp messages automatically (a `wa.me` link opens WhatsApp with the text filled; Kalpesh taps Send).
- ReelPilot (its video rendering needs the PC).
- Multiple users.

## 2. Screens (mobile-first, bottom tab bar)

1. **Login** — password field. Session lasts 30 days.
2. **Aaj (Today)** — follow-ups due today and overdue, count of gigs fetched in the last 24 hours that are still `new`, counts per pipeline stage, last cron run (time, new gigs, failed sources), button to jump to each.
3. **Gigs** — list of fetched gigs, best score first, filter chips: New / Drafted / Bid sent / All. Each row: title, source, budget, age, score.
   Gig detail:
   - full description, budget, link;
   - for Freelancer.com gigs a **live refresh** of open/closed status and bid count;
   - **"AI proposal lihi"** → draft + honesty check → editable text box, character count (Freelancer limit 1500);
   - buttons: **Copy**, **Open in Freelancer** (opens the gig URL, which Android hands to the Freelancer app), **Bid kela** (asks amount + currency, sets status `sent`, follow-up date +3 days), **Skip**.
4. **Local** — local businesses grouped by segment (site down / no website / old site / social only). Each card: name, area, category, evidence line.
   Business detail:
   - WhatsApp message (editable) + **WhatsApp var pathav** (`https://wa.me/<number>?text=...`), then status `sent`, follow-up +3 days;
   - **Demo** — link to its public demo page `/d/<slug>` (Copy / Open), available for every business;
   - email draft with `mailto:` if an email exists;
   - **Navin shodh** (search): area text + category picker → finds new businesses and adds them.
5. **Pipeline** — all touched leads (gigs and businesses) by stage: New → Drafted → Sent → Replied → Won / Lost. Tap to change stage, set follow-up date and notes.
6. **Settings** — "Facts" (the only facts AI may use), NEVER-claim list, allowed links, pricing notes, WhatsApp message template, log out.

## 3. Architecture

- **Next.js 15 (App Router) + TypeScript + React 19**, deployed to **Vercel Hobby** as project `clientpilot`. Repo `C:\kalpesh\kal\clientpilot` (git).
- **Storage: Vercel Blob** (first-party, no new account). JSON documents under a random 32-hex prefix `BLOB_PREFIX` (env). All reads and writes go through server code; blob URLs are never sent to the browser; no secrets are stored in Blob. Reads must bypass the CDN cache so a read right after a write sees the write.
- **Daily cron: Vercel Cron** at `30 1 * * *` UTC (07:00 IST) calling `/api/cron/gigs`.
- **AI: Gemini** via `@google/genai`, key `GEMINI_API_KEY` (Kalpesh's existing free key, same one ReelPilot uses), model fallback list `GEMINI_MODEL` (comma separated), same skip-on-429/503/404 logic as ReelPilot's `GeminiProvider`.
- **PWA**: web manifest, icons, a minimal service worker (app-shell cache only; data always from network). Installable from Chrome on Android.

### 3.1 Units

| Unit | Does | Depends on |
|---|---|---|
| `lib/store.ts` | typed get/put of each JSON document in Blob | `@vercel/blob`, `BLOB_PREFIX` |
| `lib/auth.ts` | password check (constant time), HMAC-signed session token (Web Crypto, edge-safe), lockout bookkeeping | `APP_PASSWORD`, `SESSION_SECRET`, store (`auth.json`) |
| `middleware.ts` | redirect/401 for anything not public | `lib/auth` token verify |
| `lib/gigs/sources/*.ts` | one fetcher per source, ported from `lead-hunter/bot.js` (`srcFreelancerCom`, `srcHackerNews`, `srcRemotive`, `srcRemoteOK`, `srcWWR`, `srcWorkingNomads`, `srcJobicy`, `srcHimalayas`, `srcArbeitnow`). Reddit is dropped (blocks cloud IPs). | fetch |
| `lib/gigs/score.ts` | `score()` and keyword hits, ported from `bot.js` | — |
| `lib/gigs/merge.ts` | merge fetched gigs into `gigs.json`: dedupe by id, keep last 30 days, cap 600 | — |
| `lib/ai/proposal.ts` | draft prompt + honesty-check prompt, returns final text | `lib/ai/gemini.ts`, settings |
| `lib/local/search.ts` | geocode (Nominatim), Overpass query, category mapping, phone normalising, ported from `map-hunter.js` | fetch |
| `lib/local/audit.ts` | website audit (DOWN / OLD / OK) with DNS confirm via Google DoH, ported from `auditSite` | fetch |
| `lib/local/messages.ts` | WhatsApp + email text from template and category benefit, ported from `buildMessages` / `benefitOf` | settings |
| `lib/demo/render.ts` | fills a demo template (print / dental / cafe / general) with name, area, phone, WhatsApp number, year | templates in `lib/demo/templates/` |
| `app/d/[slug]/page` | public demo page | `lib/demo/render`, store |
| `app/api/*` | route handlers for each action below | the libs above |

### 3.2 Data (Blob documents)

- `gigs.json` — `{ updatedAt, items: Gig[] }`. Gig = `{ id, source, title, desc, url, budget, date, tags, score, fetchedAt }`. **Written only by the cron and the one-time import.**
- `state.json` — `{ [leadId]: LeadState }`. LeadState = `{ kind: 'gig'|'local', status, proposal?, bidAmount?, bidCurrency?, sentAt?, followUpAt?, notes?, updatedAt }`. Status ∈ `new | drafted | sent | replied | won | lost | skipped`. **Written only by user actions.**
- `local.json` — `{ items: LocalBiz[] }`. LocalBiz = `{ id, slug, name, area, catKey, catLabel, waNum, telNum, phoneDisplay, email, website, social, segment, evidence, whatsapp, emailSubject, emailBody, template, createdAt }`. Written by user actions (search, edit).
- `settings.json` — `{ facts, never, allowedLinks, pricing, waTemplate, updatedAt }`.
- `auth.json` — `{ [ip]: { fails, lockedUntil, last } }`.

Keeping cron output (`gigs.json`) and user decisions (`state.json`) in separate documents means the cron can never overwrite a status Kalpesh set. Single user, so user-vs-user write races are accepted.

### 3.3 API routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/login` | public, throttled | password → session cookie `cp_session` (HttpOnly, Secure, SameSite=Lax, 30 days) |
| `POST /api/logout` | session | clear cookie |
| `GET /api/cron/gigs` | `Authorization: Bearer CRON_SECRET` | fetch all sources (each isolated, 15 s timeout), score, merge, save |
| `GET /api/gigs/[id]/live` | session | Freelancer API status + bid count |
| `POST /api/ai/proposal` | session | `{ leadId }` → draft + check → text; saves as `drafted` |
| `PATCH /api/state/[leadId]` | session | status / proposal / bid / follow-up / notes |
| `POST /api/local/search` | session | `{ area, category }` → new businesses added (max duration 60 s) |
| `PATCH /api/local/[id]` | session | edit message / details |
| `GET/PUT /api/settings` | session | settings |

Pages render on the server from Blob and use these routes for changes.

## 4. Behaviour details

### AI proposal
1. Draft prompt: gig text + Settings facts + NEVER list + allowed links + rules from the Sept 26 workflow (open with the client's need, 3–4 step plan, small first milestone, 1–2 questions, ≤ 1500 chars, no clichés, past-tense claims only from facts).
2. Check prompt: a second Gemini call that removes unsupported claims and links outside the allowed list and returns the corrected text plus a list of changes.
3. The app also strips any URL not in the allowed list in code, and shows the character count.

### Local search
- Nominatim geocode with class filter and bbox widening; Overpass query tiled at 0.09°; per-business website audit with 6 s timeout, 8 in parallel; segments and exclusions as in `map-hunter.js` (banks, chains, government, non-Latin names excluded; dedupe by phone + name against existing items).
- Nominatim/Overpass usage policy: identifying User-Agent, one search at a time.
- If the search would exceed the 60 s limit, it returns what it has with a "partial — search again for more" note.

### Demos
- `/d/<slug>` renders the template picked from the category (`print`, `dental`, `cafe`, else `general`). `print`, `dental` and `cafe` are copied from `lead-hunter/templates/demo-*.html`; `general` is a new template built from the same structure with neutral copy (services, contact, WhatsApp, map) for any other local business. Every page carries the "Demo preview — made for <name>" badge and `noindex`.
- The search category picker offers the categories that `map-hunter.js` `categoryOf()` already maps.
- Unknown slug → 404. Demo pages are the only public pages besides login.
- Existing demos at `demos-kal1201.vercel.app` stay as they are.

### Security
- `APP_PASSWORD`: generated passphrase (4 random words + number), shown to Kalpesh once in chat; stored only in Vercel env.
- Lockout: 5 failed attempts per client IP → 15 minutes locked; counter kept in `auth.json` so it survives cold starts. Failures older than 15 minutes are forgotten. The client IP is read from Vercel's `x-real-ip` header (set by Vercel's edge, not by the client).
- Session token = `expiry.HMAC(SESSION_SECRET, expiry)`, verified in middleware with Web Crypto; constant-time compare.
- Cron route refuses requests without the exact `CRON_SECRET` bearer.
- Security headers: `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

### Errors
- Each gig source runs in its own try/catch; the cron result lists which sources failed; the Aaj screen shows "last fetch: time, N new, sources failed: …".
- AI, live refresh and search errors show a plain message and a Retry button; nothing is saved on failure.
- Blob write failure → the action shows "not saved, retry"; the UI never shows a status that was not stored.

## 5. Initial data import

One-time script `scripts/import.mjs` (run from the PC during setup) uploads:
- `gigs.json` from `lead-hunter/leads.json` (164 gigs).
- `local.json` from `lead-hunter/map-leads.json` (101 businesses, with their existing messages; the three existing demo businesses keep their slugs).
- `state.json`:
  - 4 bids placed on 2026-09-26 → `sent` with amounts (Freelancer ids 40734895 ₹18,000; 40734538 ₹7,000; 40734499 ₹18,000; 40695993 $380), follow-up 2026-09-29.
  - A9 Digital Prints → `sent` (first pitch Sept 19–20, replied "?"), follow-up 2026-09-28 11:00 IST, notes = the approved follow-up message from `lead-hunter/hunts/2026-09-26.json`.
- `settings.json`: facts, NEVER list and allowed links from the Sept 26 facts sheet; pricing from `GUIDE.md` §6; WhatsApp template from `map-hunter.js`.

## 6. Testing

- **Unit (vitest)**: score; each source parser against saved sample payloads; merge (dedupe, 30-day window, cap); phone normalising; category → template; message builder; demo render (placeholders all filled, badge present); session token sign/verify/expiry; lockout (5th failure locks, cooldown expiry, success resets); URL allow-list stripping.
- **Build**: `tsc --noEmit` + `next build` clean.
- **Deployed smoke test** (browser at phone width): wrong password ×5 locks; right password logs in; Aaj shows A9 follow-up; a gig's live refresh works; AI proposal returns text under 1500 chars with only allowed links; WhatsApp button produces a correct `wa.me` link; a demo page loads without login; `/api/cron/gigs` without the secret returns 401 and with it adds gigs; an unauthenticated request to any other page redirects to login.

## 7. Setup steps (all done by Claude from the PC, once)

1. Create Vercel project `clientpilot`; create and link a Blob store.
2. Set env vars: `APP_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `BLOB_PREFIX`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
3. Run the import; deploy to production; run the smoke test.
4. Give Kalpesh the URL and password; he opens it on the phone and taps "Install app".
