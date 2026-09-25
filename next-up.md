# NEXT UP — Freytag's Recipe Guide
Updated: 2026-09-25

## Where things stand
Live at https://freytags-recipes.web.app (`firebase.js?v=9`). The Opus full review's Tier 1 and Tier 2 fixes are all shipped to staging + prod and pushed to `main` (2026-09-25). Remaining review work is the UI tier. Labor = share-of-price is decided but NOT live (would move 7 recipe prices).

## In flight
- Review UI tier (not started): recipe below the fold after tapping on phone/tablet (auto-scroll), long Log form (sticky Save), sticky 2x2 price cards eat space/overlap, two paint dropdowns per row, orphan nav tab, market items show $0.00 in the editor, junk recipe #1
- Labor = share of final price, default 13% — ship only after the team locks the 7 calculated-price recipes (#1 blank, #2 Test Arrangement, #3 Seaside Sunflower, #58 Twenty Four White Roses Luxury, #167 Apricot Blush Trio, #292 "Vail Morning", #314 "Solstice Sun") or Chad OKs new prices
- ~22 untracked `scripts/_*.js` diagnostics + `.claude/settings.json` — undecided if they belong in the repo

## Blocked on Chad
- Team review of the 7 calculated-price recipes above
- Hand to Purchasing: (a) add the two `usageRecords` composite indexes (employeeNumber↑+createdAt↓, orderNumber↑+createdAt↓; created live 2026-09-25) to their `firestore.indexes.json`; (b) FYI recipe functions no longer revive `active:false` or trust users-doc roles
- One live click-through as admin: Approve from the queue, create a recipe, reopen→edit→Save a log, set margin targets, Sync now (I can't sign in)
- Add the team in the in-app Users tab

## Next up
- IDEA: "Add seasonal item" form in the Purchasing app → appends to the SEASONAL tab of PRICE SHEETS; Recipe side already consumes it. Purchasing-side build; offer a handoff spec
- Overstuffing report (manager): needs a threshold definition
- Held: Plant Items import (~423 recipes) — one pass after review (Chad's call)

## Decisions — don't re-litigate
- Keep BOTH recipe pricing modes: count-up auto-calc AND build-to-target (2026-06-30)
- Do NOT deploy repo `firestore.rules` to prod — shared claims-based ruleset; edit via REST API (2026-06-24)
- Prod hosting deploy is manual (`workflow_dispatch`), not auto-on-merge (2026-06-25); Node 22 functions
- Seasonal pricing: six SEASONAL tabs; expired → "Market — ask"; admin/manager "Sync now"; sheet stays the only price source (2026-09-09)
- Paint: painted stem/item adds a FLAT $2 (× qty for stems), any # colors. Flowers/fillers/accent/container paintable, NOT hardgoods (2026-09-09)
- Container/accent/hardgood shown as a table like flowers; price in BOTH dropdown and column (2026-09-10)
- Usage logs are APPEND-ONLY (edit = new version, fixed id `<rootId>_v<n>` so two edits can't both be v2). Admin: list + search + history; others: search by employee #. Employee # required, blank on reopen (editor enters their own) (2026-09-10 / 09-25)
- Designer pricing in Log/Production is INTENDED (item prices + build-to-price; never margin/sale price). Dropdown labels show retail only, never vendor cost (2026-08 / 09-25)
- HARD RULE: never change a recipe price, directly or via formula/code. Impact-check prod before any pricing-math change; if any recipe finalPrice moves → stop and ask Chad (2026-09-25)
- Functions check roles from token claims only + `active:true` (no shared users-doc fallback); never set `active:true` over an `active:false` (2026-09-25)
- Margin targets live in `tags/recipeSettings` (recipe-manager-writable) — `settings/` is Purchasing-write-only (2026-09-25)
- Calculator: includes hardgoods + paint, labor default 13% (scratch tool, not a recipe price) (2026-09-25)
