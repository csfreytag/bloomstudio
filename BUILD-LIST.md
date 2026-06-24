# Freytag's Recipe Guide — Build List

The running list of what's done, what's next, and what's parked. This file lives
in the repo so it's the same on every machine (office PC, claude.ai/code from
home, anywhere) — as long as you push when you leave and pull when you arrive.

To add something: tell Claude "add X to BUILD-LIST.md", then push.

---

## ✅ Done (Firebase migration + this session)
- localStorage → Firebase (Firestore + Auth). App boots through a sign-in gate.
- Google + Email/Password sign-in; roles from `users/{uid}` (admin/manager/designer).
- Security rules + indexes (role-based).
- **Dedicated staging project** `freytags-recipes-staging` (isolated from Purchasing). Live at https://freytags-recipes-staging.web.app
- Google Sheet → Firestore **pricing sync** (`scripts/sync-pricing.js`) — reads the real "PRICE SHEETS" (FLOWERS/GREENS/HARDGOODS), maps to flowers/fillers/containers, retail-only.
- Chad + Carrie set up as admins on staging.
- **Designer Calculator** now prices from retail (was reading the empty cost field).
- **Web-item drift flag** — per-recipe "fixed price" toggle; flags when the locked price drifts from current ingredient prices (any change + stronger alert at 10%+); list badge. Prices never auto-change.
- **Read-only price list** — the in-app price list is now a clean Name | Price view (no editing); shows "synced from master sheet · <date>".
- **Price-change flag** — the sync diffs against current prices and records what changed; the app shows a "N prices changed in the last sync" banner.
- **Market-price display** — seasonal items (no fixed price, e.g. Peony) show "market price" instead of $0.

## ✅ Done (recipe builder categories)
- Container / Hardgoods / Accent are now separate categories (sheet has separate CONTAINERS + HARDGOODS tabs; synced 1:1).
- Recipe builder: **Hardgoods picker** (funeral base) + **Plants section** (plant gardens) added, wired into pricing/budget/recipe-view. Plant gardens are just recipes (use the Plants section + a "Garden" tag).
- New recipes default to **None**; dropdowns and recipe lines show **retail** prices for containers/accents/hardgoods.

## 🔜 Next up
- [ ] Minor: **Price breakdown** tab doesn't itemize hardgood/plant lines yet (the total includes them; lines just aren't listed). Low priority while cost = $0.
- [ ] Minor: **Ordering export** totals flowers + fillers only — add plants for plant-garden ordering.
- [x] Sheet finalized & format verified (71 flowers / 45 fillers / 111 containers / 128 plants); parser handles the header-less Plants tab. Synced to staging.
- **Scheduled + manual price sync** — GitHub Action built (`.github/workflows/sync-pricing.yml`): daily cron + "Run workflow" button. **Activates at go-live** (GitHub only runs scheduled/dispatch workflows from the default branch `main`). Until then, run manually on a dev machine. Needs repo secret `RECIPE_SYNC_SA_KEY` (full claude-llm-access JSON).
- [ ] **Manual sync button (optional, in-app)** — needs a Cloud Function (Blaze); the GitHub "run workflow" button covers manual once live.
- [ ] Polish: brief login-screen flash on page load for already-signed-in users.
- [ ] Look at the sheet's **HARDGOODS** tab — the last sync flagged a "Funeral" row with no price + renamed containers, which looks like a row got shifted so the column header leaked in as an item.

## 📋 Backlog
- [ ] **In-app user management** screen (admins invite + assign roles). Today it's console/script (`scripts/set-user-role.js`).
- [ ] **PDF export** — recipe sheets: multi-recipe-per-page and single-recipe-per-page, with a cover page for a tag collection.
- [ ] **Mobile-friendly layout** for designers at the workbench.
- [ ] **Recipe history / versioning** — see/compare past versions.
- [ ] **Cost feed from Purchasing** — invoice history (highest vendor cost) populates ingredient cost, so margins become real (currently cost = $0, margins show ~100%).
- [ ] Move pricing into the proper shared `products`/`pricing` collections (currently in `settings/recipeGuide`) once the Purchasing cost feed exists.

## 🚀 Go-live (production — do deliberately, later)
- [ ] Enable Google + Email/Password on the production project (`freytags-purchasing`).
- [ ] Trust the **production** OAuth client in Google Workspace (like we did for staging) so regular users (not just admins) can sign in.
- [ ] Deploy **merged** Firestore/Storage rules to production (merge with the Purchasing app's rules — shared project, don't clobber).
- [ ] Merge `staging` → `main` (GitHub Action deploys hosting to freytags-recipes.web.app).

## ✍️ Chad's to-dos (outside the app)
- [ ] Finish filling retail prices in the "PRICE SHEETS" Google Sheet (team).
- [ ] Add **PLANTS** and **ACCENTS** tabs to the sheet (already pre-wired — they auto-sync once they exist).
- [ ] (Optional) Add SKUs for containers in the sheet.
