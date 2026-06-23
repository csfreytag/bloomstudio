# Freytag's Recipe Guide — CLAUDE.md

This repo (`bloomstudio`) is **Freytag's Recipe Guide**, an internal flower-recipe management tool for Freytag's Florist (a retail florist in Austin, TX). It shares a Firebase backend with a second app, the **Purchasing App** (separate repo: `freytags-purchasing`). This file is scoped to the Recipe Guide; the Purchasing app is referenced only where it affects the shared backend.

## Current state

- The whole app is currently a **single-file prototype**: `public/index.html` (~110 KB) — HTML + CSS + JS in one file, no build step.
- Data is stored in **browser `localStorage`**. There is **no Firebase connection wired in yet**. Same for the Purchasing app — both are still localStorage prototypes.
- Deployed live to **https://freytags-recipes.web.app** (Firebase Hosting).
- Logo lives at `public/logo.png`.
- **The next major task is migrating from localStorage to Firebase** (Firestore + Auth + Storage). Do not assume any backend wiring exists.

## Repo / deploy

- GitHub: `https://github.com/csfreytag/bloomstudio`
- Local path: `C:\Users\ChadFreytag\OneDrive - freytags.com\Documents\bloomstudio`
- Firebase serves from the `public/` folder (single-page app rewrite to `/index.html`).
- Deploy (run from the repo root, in a VS Code terminal):
  ```powershell
  firebase deploy --only hosting:freytags-recipes
  ```
- GitHub Actions also auto-deploys on push to `main`.
- **Always confirm the terminal is in the bloomstudio folder before deploying** — deploying from the wrong folder previously overwrote the wrong hosting site. The two hosting targets are `freytags-recipes` (this app) and `freytags-purchasing` (the other app), both under the same Firebase project.

## Branching & staging workflow

- **Always work in a `staging` branch first. Never edit or commit directly on `main`.** (Mirrors the discipline already used on the Purchasing app.)
- `main` = **production**. Merging to `main` deploys the live Recipe site (`freytags-recipes.web.app`) via GitHub Actions.
- `staging` = **test**. Build and verify here before merging to `main`.
- Every Claude Code session should state which branch it's on. If unsure, assume `staging` and confirm before doing anything.
- Deploy production ONLY with the explicit hosting target: `firebase deploy --only hosting:freytags-recipes`. **Never** a bare `firebase deploy` (that once overwrote the wrong site).
- **Test the Firebase migration against staging first** so the production database is never touched until the migration is verified.

## Environments

- **Production** — Recipe hosting site `freytags-recipes` in Firebase project `freytags-purchasing`. Uses the web config in "Secrets & config" above.
- **Staging** — Recipe hosting site `freytags-recipes-staging` in Firebase project `freytags-purchasing-staging` (the existing Purchasing staging project; Recipe staging shares it, mirroring how production Recipe shares the Purchasing production project). *To be created.*
- Manage both with Firebase project aliases in `.firebaserc`: `default` → `freytags-purchasing`, `staging` → `freytags-purchasing-staging`. The staging frontend needs the **staging project's** own web config (grab it from that project's settings), not the production one.

## Dev environment

- Windows 11, VS Code, **PowerShell** (use PowerShell syntax — `Move-Item` not `mv`, `Copy-Item` not `cp`).
- Node v22, Firebase CLI installed globally.
- The Explorer panel in VS Code does NOT change the terminal's working directory — always `cd` explicitly.

## Shared Firebase architecture

- Firebase project (production): **`freytags-purchasing`** (shared by both apps).
- Firestore: standard edition, default database, `us-central1`. Created but empty.
- Auth: **Google Sign-In** (`@freytags.com` accounts, MFA at Workspace level) **+ Email/Password** (Recipe Guide Designers who lack Workspace accounts). Both enabled.
- Storage: Google Cloud Storage for arrangement photos.

Shared Firestore collections (both apps):

```
users           single auth system, roles assigned per app
products        shared master product/ingredient list
pendingProducts unrecognized product names awaiting manager review
vendors         shared vendor directory
changeLogs      activity log, both apps write here
settings        app-wide config (e.g. settings/notifications)
```

Recipe Guide only:

```
recipes
tags
pricing         synced one-way from Google Sheet; app is READ-ONLY for pricing
```

Shared product record:

```
products/{productId}
  name: "Roses - Med Stem Red"   standard name
  category: "flower"             Recipe Guide uses this; purchasing ignores it
  unit: "stem"
  unitConversion: null           or {factor:50, vendorUnit:"bundle"}
  costLevel: "parent"            or "variety" for Bill Doran invoices
  aliases: ["Freedom Rose", "Rosa Freedom 60cm", "FREEDOM RD 60CM"]
  retailPrice: 16.00             Google Sheet sync ONLY — purchasing NEVER writes this
  defaultVendor: vendor_id       purchasing uses; Recipe Guide ignores
  active: true
```

## Secrets & config

Two separate things — don't confuse them:

**Firebase web config (PUBLIC — safe to commit, goes in the browser code):**

```js
const firebaseConfig = {
  apiKey: "AIzaSyAMWlRK2PcbxISUk6KA58bHlWmcBw62bGw",
  authDomain: "freytags-purchasing.firebaseapp.com",
  projectId: "freytags-purchasing",
  storageBucket: "freytags-purchasing.firebasestorage.app",
  messagingSenderId: "291868509292",
  appId: "1:291868509292:web:dac696ccf7fb9b093e4449"
};
```

This is what the client app uses for Auth/Firestore/Storage. It is public by design — data is protected by Firebase Auth + Firestore/Storage security rules, NOT by hiding this.

**Service account JSON key (SECRET — never commit, server-side only):**

- Account: `Claude-llm-access@freytags-florist-analytics.iam.gserviceaccount.com` (lives in the `freytags-florist-analytics` GCP project, with cross-project access to `freytags-purchasing`).
- Used only by server-side work: the Google Sheet → Firestore pricing sync and any admin/Storage scripts. NOT used in the browser.
- Storage bucket for photos: `llm_cloud_storage_photos` (in `freytags-florist-analytics`).
- Keep the key file OUTSIDE the repo (or in Secret Manager) and gitignore it. Suggested `.gitignore` entries: `*-service-account*.json`, `.secrets/`.
- The pricing Sheet must be shared with the service account's email for the sync to work.

**Security rules** (not a key, but the real protection): Firestore + Storage rules enforce the roles below (Designers read-only, no pricing; Admins manage users; etc.). Write these as part of the migration.

## Roles (Recipe Guide)

- **Admin** — everything: users, price lists, recipes, reports, exports.
- **Manager** — create/edit recipes, reports, ordering. No user management.
- **Designer** — Recipe view + calculator only. Read-only. **No pricing visible.**

Roles are per-app — the same person can be a Manager here and a Buyer in Purchasing. In the prototype there's a "Role preview" dropdown to simulate roles; in the real build the role comes from the login.

## Pricing model

- **Cost** = what Freytag's pays the vendor. **Price / retail** = what the customer pays.
- **Markup**: Flowers & Fillers × 4; Containers, Accents, Hardgoods, Plants × 3.5.
- **Margin** = (retail − cost) / retail × 100. **COGS** = cost as % of retail (COGS + margin = 100%).
- Pricing tabs in the app: Flowers, Fillers, Containers, Accents, Hardgoods, Plants.
- Price list columns: **Cost** → **Calculated retail (×4 / ×3.5)** → **Your final price** (override, e.g. round $4.74 → $4.75) → **Diff**.
- Recipe Guide costs at the **parent** product level, not variety level (e.g. "Alstroemeria Hot Pink" = $3.50 regardless of variety).
- **Peony / seasonal items** need a "market price" flag — no fixed retail price.

## Pricing data source (Google Sheet → Firestore)

- Pricing is a **one-way sync**: Google Sheet → Firestore. The app is **read-only** for pricing. Bulk price edits happen in the Sheet, never in the app.
- Sheet ID: `1DI59WCs_7xiDbjUHDCkFINy9WKoIokFzAX1S203uUvo`
- Lives in the service account's "LLM Inbox" folder (`1f7MYLYBgKuDB1kW5O2EFkQF6MlWLs-kL`), **not** in a personal Google Drive.
- Tabs: Flowers, Fillers, Containers, Accents, Hardgoods, Plants. Columns: `Name | Cost ($) | Your Final Price ($)`. Cost is currently left blank — to be fed later by the Purchasing app's invoice history (highest vendor cost, conservative).
- Service account key is stored in Google Secret Manager; scoped to specific sheets only (no broad Drive access). **Never commit the key to GitHub.**

## Features built in the prototype

Recipes (create/edit), three recipe tabs — **Recipe edit / Recipe view / Price breakdown** (Recipe view = designer-friendly, no business analysis; Price breakdown = Admin/Manager only); price lists for all six categories; **Designer calculator** (build-up and work-down-from-target modes); **Ordering export** (filter by one or more tags, enter weekly quantities, export CSV of stems to order, with dedup across tags); **Margin report** with configurable healthy/watch thresholds; **Seasonal planning view**; **Recipe status** (Draft / Pending review / Active / Discontinued); **Approval workflow**; **tags + notes**; size as height × width × depth; photo upload with click-to-enlarge lightbox; filter/search by tag, price range, and keyword (name, SKU, flower).

## Needs the real (Firebase) build — not yet done

Google Sheet → Firestore pricing sync; shared Firestore data + photo storage; **Google Sign-In + Email/Password auth and permissions**; change log persisted to Firestore; recipe export to PDF (multi-recipe-per-page and single-recipe-per-page layouts, with a cover page for tag collections); mobile-friendly layout for designers at the workbench; recipe history / versioning; product alias system + pending products queue (shared with Purchasing).

## Key decisions — do not revisit without good reason

- Firebase, not BigQuery.
- Google Sheet is the **one-way** source for retail pricing — no editing prices in the app.
- Cost comes from Purchasing-app invoice history (highest vendor cost), not manual entry.
- **`retailPrice` is owned exclusively by Recipe Guide / the Google Sheet sync. Purchasing never writes it. Invoice prices are for matching/bookkeeping only.**
- Product categories exist in the data but are invisible in the Purchasing UI.
- Designers use email/password (no Workspace accounts).
- Both apps share one Firebase project (`freytags-purchasing`).
- Both apps should connect to Firebase with the shared schema in mind — design the schema once to serve both.
