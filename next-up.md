# NEXT UP — Freytag's Recipe Guide
Updated: 2026-09-10

## Where things stand
Live at https://freytags-recipes.web.app. Recent work (2026-09-09/10), all on prod + `main`:
- Seasonal pricing (six SEASONAL tabs → "Market — ask" on expiry; admin/manager "Sync now" button).
- Paint: a painted stem/item adds a flat $2 (× qty for stems).
- Container/accent/hardgood render as an `.ing-table` (Slot·Item·Paint·Price) like flowers — price shows in BOTH the dropdown and the Price column.
- Usage-log **reopen + audit**: logs are append-only (edit = new version, original kept). Admins get a recent list + search; others search by employee #. Employee # required, cleared after each save. Admin "History" shows the chain. `firebase.js?v=7`.

## In flight
- 19 untracked `scripts/_*.js` diagnostics + `.claude/settings.json` — uncommitted, undecided if they belong in the repo

## Blocked on Chad
- Test reopen→edit→Save as admin: confirm it creates v2 and v1 is preserved (I can't log in to exercise the write path)
- Verify "Sync now" once as admin/manager on prod
- Add the team in the in-app Users tab

## Next up
- **Audit step 5 (pending): create-only Firestore rule on `usageRecords`** so edits/deletes can't erase originals even outside the app — surgical change to the SHARED prod ruleset via REST, NOT a repo-rules deploy
- Price breakdown tab doesn't itemize hardgood/plant lines (total correct; lines missing)
- Ordering export totals flowers + fillers only — add plants for plant gardens
- Enable PITR + scheduled backups on prod Firestore

## Decisions — don't re-litigate
- Keep BOTH recipe pricing modes: count-up auto-calc AND build-to-target (2026-06-30)
- Do NOT deploy repo `firestore.rules` to prod — shared claims-based ruleset; edit via REST API (2026-06-24)
- Prod hosting deploy is manual (`workflow_dispatch`), not auto-on-merge (2026-06-25); Node 22 functions
- Seasonal pricing: six SEASONAL tabs; expired → "Market — ask"; admin/manager "Sync now"; sheet stays the only price source (2026-09-09)
- Paint: painted stem/item adds a FLAT $2 (× qty for stems), any # colors. Flowers/fillers/accent/container paintable, NOT hardgoods. Reverses 2026-08-08 "descriptive only"; old flat "$2 Paint" accent now redundant (2026-09-09)
- Container/accent/hardgood shown as a table like flowers; price in BOTH dropdown and column (2026-09-10)
- Usage logs are APPEND-ONLY (edit = new version; original never overwritten). Admin: full list + search + history; others: search by employee # only. Employee # required + cleared after save; delete admin-only (2026-09-10)
