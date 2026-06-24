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

## 🔜 Next up
- [ ] **Make the price list read-only in the app** (Sheet is the one-way source; no editing prices in-app).
- [ ] **"Last synced / what changed" flag** in the app — show when prices were synced and which items changed.
- [ ] **Scheduled price sync** — GitHub Action runs the sync automatically (needs the service-account key added as a repo secret).
- [ ] **Manual price sync** — an on-demand trigger (GitHub "run now", or in-app button later).
- [ ] **Market-price flag for seasonals** — Peony etc. come in as `**seasonal`; show "market price" instead of $0.
- [ ] Polish: brief login-screen flash on page load for already-signed-in users.

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
