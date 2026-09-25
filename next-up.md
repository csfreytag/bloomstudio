# NEXT UP — Freytag's Recipe Guide
Updated: 2026-09-25

## Where things stand
Live at https://freytags-recipes.web.app. Recent work (2026-09-09/10), all on prod + `main`:
- Seasonal pricing (six SEASONAL tabs → "Market — ask" on expiry; admin/manager "Sync now" button).
- Paint: a painted stem/item adds a flat $2 (× qty for stems).
- Container/accent/hardgood render as an `.ing-table` (Slot·Item·Paint·Price) like flowers — price shows in BOTH the dropdown and the Price column.
- Usage-log **reopen + audit**: logs are append-only (edit = new version, original kept). Admins get a recent list + search; others search by employee #. Employee # required, cleared after each save. Admin "History" shows the chain. `firebase.js?v=7`.
- **Prod `usageRecords` rule is now APPEND-ONLY (2026-09-11): `update:false`, admin-only delete** — the enforcement (step 5). Done via `scripts/prod-rules-usage-appendonly.js`. Rollback ruleset: `8ff6068f-ae3f-4297-b343-850180af3049`.
- Price breakdown now itemizes hardgood + plant lines; Ordering export now includes plants.

## In flight
- **Opus full review (2026-09-25) — fixes NOT started, awaiting Chad's go.** Top verified bugs: (1) recipe names/SKUs with `"` get TRUNCATED on save — 74/391 at risk (e.g. `6" Neantha…` → `6`), none damaged yet; + no HTML-escaping of user text (stored XSS from designer accounts); (2) Reports Approve/Send-back/Projection never save (`saveAll` only saves `activeId`); (3) reopened-log edit mode leaks into the next new log; (4) editor silently drops an ingredient renamed in the sheet; (5) `nextId` collision can overwrite a recipe; (6) "Sync now" can wipe permanent prices if one tab read fails; (7) role functions force `active:true`, invites trust unverified email, Purchasing-manager→recipe-admin via users-doc fallback. ⚠ Any fix touching pricing math must pass the no-price-change check first (see Decisions).
- **Labor = share of final price (Chad decided 2026-09-25) — NOT live.** Shipped then REVERTED same day (77d9f75) because it moved 5 live recipe prices. Chad's team is reviewing the calculated-price recipes (#1 blank, #2 Test Arrangement, #3 Seaside Sunflower, #58 Twenty Four White Roses Luxury, #167 Apricot Blush Trio, #292 "Vail Morning", #314 "Solstice Sun"). Ship only after they're locked with a typed Adjusted retail or Chad OKs new prices.
- 19 untracked `scripts/_*.js` diagnostics + `.claude/settings.json` — uncommitted, undecided if they belong in the repo

## Blocked on Chad
- Team review of the 7 calculated-price recipes above (fix names in SKU box, delete test/blank, lock prices)
- Test reopen→edit→Save as admin: confirm it creates v2 and v1 is preserved (I can't log in to exercise the write path)
- Verify "Sync now" once as admin/manager on prod
- Add the team in the in-app Users tab

## Next up
- IDEA (Chad, revisit Mon 2026-09-15): a "Add seasonal item" form in the **Purchasing app** so the buyer doesn't open the Google Sheet — it appends a row to the SEASONAL tab of PRICE SHEETS via the Sheets API, then the existing seasonal sync + "Sync now" makes it live. Recommended over an app-managed Firestore seasonal collection (keeps sheet = one-way source of truth; reuses what's built). It's a PURCHASING-side build; Recipe side already consumes it. Settle: which SA writes the sheet; form matches tab layout (Name·Color·Price·Expiration). Offer to draft a handoff spec.
- Overstuffing report (manager): the append-only audit + `valueUsed`/`designedValue` now make it buildable — needs a threshold definition
- Held: Plant Items import (~423 recipes) — do in one pass after review (Chad's call)

## Decisions — don't re-litigate
- Keep BOTH recipe pricing modes: count-up auto-calc AND build-to-target (2026-06-30)
- Do NOT deploy repo `firestore.rules` to prod — shared claims-based ruleset; edit via REST API (2026-06-24)
- Prod hosting deploy is manual (`workflow_dispatch`), not auto-on-merge (2026-06-25); Node 22 functions
- Seasonal pricing: six SEASONAL tabs; expired → "Market — ask"; admin/manager "Sync now"; sheet stays the only price source (2026-09-09)
- Paint: painted stem/item adds a FLAT $2 (× qty for stems), any # colors. Flowers/fillers/accent/container paintable, NOT hardgoods. Reverses 2026-08-08 "descriptive only"; old flat "$2 Paint" accent now redundant (2026-09-09)
- Container/accent/hardgood shown as a table like flowers; price in BOTH dropdown and column (2026-09-10)
- Usage logs are APPEND-ONLY (edit = new version; original never overwritten). Admin: full list + search + history; others: search by employee # only. Employee # required + cleared after save; delete admin-only (2026-09-10)
- Designer pricing in Log/Production is INTENDED, not a leak: CUSTOM → show build-to-price (build to the final total); RECIPE → show each item's price (so a substitution matches dollar-for-dollar) and alert "over the recipe" vs the recipe's DESIGNED value, never the sale price/margin (that's hidden, saved silently for the manager report). Supersedes the prototype "Designer: no pricing visible" line. Do NOT hide these prices (2026-08 / reaffirmed 2026-09-11)
- HARD RULE: never change a recipe price, directly or via formula/code. Impact-check prod before any pricing-math change; if any recipe finalPrice moves → stop and ask Chad (2026-09-25)
