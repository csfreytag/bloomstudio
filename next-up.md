# NEXT UP — Freytag's Recipe Guide
Updated: 2026-09-25

## Where things stand
Live at https://freytags-recipes.web.app (`firebase.js?v=9`). The Opus full review is DONE: Tier 1, Tier 2 and the UI tier are all shipped to staging + prod and pushed to `main` (2026-09-25). Labor = share-of-price is decided but NOT live (would move 7 recipe prices).

## In flight
- Connect STAGING Recipe to STAGING Purchasing (project `freytags-purchasing-staging`). Full backup done 2026-09-26: `C:\Users\ChadFreytag\Backups\recipe-app\2026-09-26` (README inside) + git tag `backup-2026-09-26`. Code identical on both sites (verified by file hashes 2026-09-26). Staging DATA synced from prod 2026-09-26 (`scripts/sync-prod-to-staging.js --apply`; re-check = 0 diffs). PLAN A agreed with Purchasing session 2026-09-26: staging Recipe site stays in freytags-recipes-staging hosting but its config points at `freytags-purchasing-staging` (Blaze; rules + storage already include recipe blocks). Purchasing copies live data there + adds our auth domains + tester claims (their checkpoint 2). OUR checkpoint 3 DONE 2026-09-26 (Chad approved): staging config → purchasing-staging, seeding only in freytags-recipes-staging, full-width STAGING banner, role from token claim first, lookup/Sync now gated on functions-available, ORDA_SA_KEY copied, 9 recipe-guide functions deployed there (labels verified), staging hosting deployed (`firebase.js?v=10`). On `staging` branch ONLY — NOT merged to main, prod NOT deployed. Waiting: Chad + Carrie test on staging, then decide prod rollout of this code (harmless on prod: prod host still uses PROD_CONFIG)
- Labor = share of final price, default 13% — ship only after the team locks the 7 calculated-price recipes (#1 blank, #2 Test Arrangement, #3 Seaside Sunflower, #58 Twenty Four White Roses Luxury, #167 Apricot Blush Trio, #292 "Vail Morning", #314 "Solstice Sun") or Chad OKs new prices
- ~22 untracked `scripts/_*.js` diagnostics + `.claude/settings.json` — undecided if they belong in the repo

## Blocked on Chad
- Make the GitHub repo PRIVATE (it went public 2026-05-08 only for GitHub Pages; Pages still serves the OLD localStorage prototype at csfreytag.github.io/bloomstudio). Turn off Pages first, then Settings → Change visibility. Audit 2026-09-25: no keys/passwords in any of 88 commits; 0 forks/stars
- Team review of the 7 calculated-price recipes above
- Hand to Purchasing: (a) add the two `usageRecords` composite indexes (employeeNumber↑+createdAt↓, orderNumber↑+createdAt↓; created live 2026-09-25) to their `firestore.indexes.json`; (b) FYI recipe functions no longer revive `active:false` or trust users-doc roles
- One live click-through as admin: Approve from the queue, create a recipe, reopen→edit→Save a log, set margin targets, Sync now (I can't sign in)
- Add the team in the in-app Users tab

## Next up
- Ship plan-A code (9495472: claim-first role lookup, hasFunctions gates, banner, seed guard, firebase.js?v=10) to PROD — HOLD: Chad 2026-09-26, team is working in prod. Do it at a quiet time, after Chad + Carrie test staging. ⚠ Until then `staging` is AHEAD of `main`: any prod hotfix must be built from `main` (or ship this too knowingly) — don't deploy prod from the staging branch by accident
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
- Recipe editor price cards stay PINNED (Chad's earlier ask) but as a slim one-line bar; Log/Production Save + employee # pinned to the bottom; one paint dropdown per row (+ 2nd color on demand) (2026-09-25)
