# NEXT UP — Freytag's Recipe Guide
Updated: 2026-09-09

## Where things stand
Live at https://freytags-recipes.web.app. Two features shipped 2026-09-09:
(1) Seasonal pricing — the sync reads six SEASONAL tabs, an expired Expiration
flips the item to "Market — ask", the app shows a seasonal badge, and
managers/admins get a "Sync now" button (`syncPricesNow`, prod-only).
(2) Paint pricing — a painted stem/item now adds a flat $2 (× qty for stems),
across recipe totals, recipe view, and Log/Production; added an inline
Container-paint picker beside the existing Accent-paint. All deployed to prod via
CLI and `main` fast-forwarded to match (the merge also fixed a junk "PLANT" header row).

## In flight
- Seasonal pricing — DONE + deployed. The six SEASONAL tabs are empty; the team adds items (Name/Color/Price/Expiration) as they arrive, then "Sync now" or wait for the ~7am cron
- 19 untracked `scripts/_*.js` diagnostics + `.claude/settings.json` — still uncommitted, undecided if they belong in the repo

## Blocked on Chad
- Verify "Sync now" once as an admin/manager on prod (I can't log in to test the button end-to-end)
- Add the team in the in-app Users tab — post-go-live rollout step

## Next up
- Price breakdown tab doesn't itemize hardgood/plant lines (total correct; lines missing)
- Ordering export totals flowers + fillers only — add plants for plant gardens
- Enable PITR + scheduled backups on prod Firestore
- Consider min-instances=1 to cut lookupOrder / syncPricesNow cold start

## Decisions — don't re-litigate
- Keep BOTH recipe pricing modes: count-up auto-calc AND build-to-target (2026-06-30)
- Do NOT deploy repo `firestore.rules` to prod — shared claims-based ruleset; edit via REST API (2026-06-24)
- Prod hosting deploy is manual (`workflow_dispatch`), not auto-on-merge (2026-06-25)
- Recipe functions on Node 22 — done (2026-06-25)
- Seasonal pricing: six separate SEASONAL tabs (one per permanent tab); expired price → "Market — ask" (reuses the market-price state), extend by editing the date; admin/manager "Sync now" button; sheet stays the only price source (2026-09-09)
- Paint pricing: a painted stem/item adds a FLAT $2 (× qty for stems), regardless of how many colors. Flowers, fillers, accent, and container are paintable; NOT hardgoods. Reverses the 2026-08-08 "paint is descriptive only" call. The old flat "$2 Paint" accent is now redundant (left selectable; would double-charge if added on top) (2026-09-09)
