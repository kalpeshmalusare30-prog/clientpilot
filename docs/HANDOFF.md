# ClientPilot — handoff (2026-09-28, night)

You are continuing ClientPilot on another machine. Kalpesh will say "continue". Finish the remaining steps below. Do not rebuild anything that is already done.

## State

- Branch `feature/clientpilot-mvp`: all 15 plan tasks (docs/superpowers/plans/2026-09-27-clientpilot.md) are implemented and task-reviewed.
- Final whole-branch review: done, with three lenses (security, correctness, UX/honesty). The consolidated must-fix list F-1..F-14 is below.
- Final fix wave: in progress when this file was written. Commits named "Final review fix: … (F-n)" are the fixes that landed. Check `git log` to see which F ids are covered.
- Production (early version, gigs only, commit 2f58b79): https://clientpilot-three.vercel.app. The cron has run once and 170 gigs are stored.

## Remaining steps

1. **Finish the fix wave.** Run `git log --oneline` and compare the F ids in the commit messages with the list below. Fix any id that is missing. Then run `npx vitest run`, `npx tsc --noEmit` and `npm run build`; all must be clean.
2. **Run one scoped re-review of the fix commits.** Range: `803d71a..HEAD`. Check each F item is really fixed and that nothing new broke. Fix anything Critical or Important.
3. **Deploy.** Vercel scope is the team `kal1201`: the CLI rejects the personal scope. Commands:
   - `npx vercel@60.1.3 login`, done by Kalpesh.
   - `npx vercel@60.1.3 link --yes --project clientpilot --scope kal1201`
   - `npx vercel@60.1.3 --prod --yes --scope kal1201`
   - Production env vars are already set on Vercel: APP_PASSWORD, SESSION_SECRET, CRON_SECRET, GEMINI_API_KEY, GEMINI_MODEL, BLOB_READ_WRITE_TOKEN (private Blob store `clientpilot-data`, bom1). Do not change them.
4. **Import the Lead Hunter data.** The importer merges and never overwrites (F-1). It needs `../lead-hunter/` (hunts/, leads.json, map-leads.json) next to the repo. That folder is only on the home PC. If it is missing here, skip the import and tell Kalpesh to run it from the home PC.
   - `npx vercel@60.1.3 env pull .env.local --environment=production --scope kal1201`
   - Dry run first: `STORE_BACKEND=memory npm run import -- --origin https://clientpilot-three.vercel.app`
   - Then run it for real without `--force`: `npm run import -- --origin https://clientpilot-three.vercel.app`
5. **Smoke test.**
   - `/login` should return 200.
   - `/gigs` without a cookie should return 307 to /login.
   - `/api/settings` without a cookie should return 401.
   - `/api/cron/gigs` without the secret should return 401.
   - `/d/a9-digital-prints` should return 200 and carry the CSP header.
   - Kalpesh logs in himself. Never type his password.
6. **Push.** Run `git push origin feature/clientpilot-mvp`, then open a PR to `main` or merge it if Kalpesh says so.

## Must-fix list (final review)

- **F-1 (Critical):** the importer merges into gigs.json and data.json and keeps the cron gigs, lastRun, state and settings.
- **F-2:** the link stripper catches:
  - "Step 1.https://evil.store", 2https://, -https:// and +https://;
  - any www. host;
  - bare domains such as linktr.ee and .store.

  It keeps Node.js, .NET, e.g., emails and allowed https links.
- **F-3:** the shorten pass accepts a reply only if it is at least min(600, 50% of the original) and has no preamble. The pass is skipped after about 35 s.
- **F-4:** `checked: boolean` is returned for AI drafts. The Gigs UI shows a warning when it is false.
- **F-5:** the WhatsApp, Email and Bid actions keep a replied, won or lost status. No follow-up is set when the lead is won.
- **F-6:** the demo templates contain no invented specifics:
  - no named dentist, testimonials, ratings, "Est. 2019", fake handles, non-veg menu, fixed PIN or static "Open now";
  - they show a sample notice and no ", Mumbai";
  - the map searches by name and area.
- **F-7:** the outreach wording is honest:
  - "we could not find a website listed";
  - site-down messages carry the dated `auditedAt`;
  - the disclaimer is wider.
- **F-8:** landline leads get no WhatsApp button. They get Call and "Contact kela" instead.
- **F-9:** the Pipeline follow-up is not kept on a failed save, and the error reads "Save zala nahi" with a Retry.
- **F-10:** the Settings toast auto-clears or can be closed, and never covers Save or Logout.
- **F-11:** the email regex is strict, the mailto address is encoded, and the Email button is hidden when the address is invalid.
- **F-12:** `firstValue` no longer splits a URL on a comma or semicolon inside its path.
- **F-13:** the /d/[slug] pages:
  - send a CSP sandbox header;
  - return 404 for lost or skipped leads;
  - have their slug format validated.

  The icon sizes are fixed.
- **F-14:** the print demo has no horizontal overflow when the business name is long.

Parked (no change needed): extra private IP ranges; the spec text should say that demos need a phone number; minor polish items.

## Rules

- Never commit `.env*` or `.vercel/`.
- Never print secrets.
- Outreach and proposals must stay honest.
- Kalpesh logs in, uses OAuth and sends messages himself.
