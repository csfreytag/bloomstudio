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
- [x] **In-app user management** — admin-only **Users** tab: list users, grant access to a Google user, create email/password accounts, change/remove role. Backed by `functions/` (codebase `recipe-guide`): `setRecipeRole`, `createRecipeUser`, `removeRecipeRole` (admin-gated, claims merged, Recipe role independent of Purchasing). Deployed to prod & verified 2026-06-25. The `grant-recipe-access.js` script remains as a fallback.
- [ ] Bump the `recipe-guide` functions to **Node 22** before Node 20 is decommissioned (2026-10-30); also `firebase-functions@latest`.
- [ ] **PDF export** — recipe sheets: multi-recipe-per-page and single-recipe-per-page, with a cover page for a tag collection.
- [ ] **Mobile-friendly layout** for designers at the workbench.
- [ ] **Recipe history / versioning** — see/compare past versions.
- [ ] **Cost feed from Purchasing** — invoice history (highest vendor cost) populates ingredient cost, so margins become real (currently cost = $0, margins show ~100%).
- [ ] Move pricing into the proper shared `products`/`pricing` collections (currently in `settings/recipeGuide`) once the Purchasing cost feed exists.

## 🚀 Go-live — DONE 2026-06-24 (live at https://freytags-recipes.web.app)
- [x] Google + Email/Password enabled on production (`freytags-purchasing`).
- [x] Production OAuth client trusted in Google Workspace.
- [x] App deployed to prod hosting (`firebase deploy --only hosting:freytags-recipes`).
- [x] Prices synced to prod (`settings/recipeGuide`) via the analytics SA.
- [x] Chad provisioned admin via `grant-recipe-access.js` (claims + users doc); recipe-write verified under prod rules; test recipe cleaned up.
- [x] Merged `staging` → `main`; CI fixed to target the `freytags-recipes` site and to sync the **prod** project by default.
- **Did NOT deploy rules to prod** — prod already has a shared Recipe+Purchasing ruleset using custom claims; the repo `firestore.rules` is the staging (users-doc) model. See memory `production-go-live`.

## ✅ Designer role + workflow — DONE 2026-06-25
- [x] Designers can build/edit recipes (website "building items"); saves auto-held as **Pending review**; no publish/status/web-item/tags/cost-margin; retail prices + photo + calculator kept; approved recipes view-only for designers.
- [x] Prod `recipes` rule updated **surgically** (designers create/update only while status != active) via the firebaserules REST API; 8/8 rule tests passed; all Purchasing rules byte-identical.
- [x] CI `firebase-hosting-merge.yml` switched to **manual (workflow_dispatch)** — old auto-deploy was failing on GitHub's Node 24 runner. Deploy prod hosting manually with the explicit target.

## 🚀 Post-go-live / before broad team rollout
- [ ] **Add the team** in the in-app **Users** tab (designers, managers, admins). Primary remaining step.
- [ ] **Optional final smoke test**: create a test designer, sign in as them, build a recipe → confirm it lands in Approvals (Pending) → approve → Active.
- [ ] **Enable PITR + scheduled backups** on prod Firestore (Blaze) for recovery, on top of the in-app archive (soft-delete).
- Minor (non-blocking): price-breakdown itemization for hardgood/plant lines; plants in ordering export; Node 22 bump for functions before 2026-10-30.

## ✍️ Chad's to-dos (outside the app)
- [ ] Finish filling retail prices in the "PRICE SHEETS" Google Sheet (team).
- [ ] Add **PLANTS** and **ACCENTS** tabs to the sheet (already pre-wired — they auto-sync once they exist).
- [ ] (Optional) Add SKUs for containers in the sheet.
