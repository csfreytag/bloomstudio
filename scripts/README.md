# scripts — server-side tooling

Server-side scripts for the Recipe Guide. These use a service-account
credential and are **never** run in the browser.

## sync-pricing.js — Google Sheet → Firestore pricing sync (one-way)

Reads the price sheet (one tab per category: Flowers, Fillers, Containers,
Accents, Hardgoods, Plants; columns `Name | Cost ($) | Your Final Price ($)`)
and writes the prices into Firestore at `settings/recipeGuide.priceLists` in the
shape the app loads (`{ n, p, r }` = name, cost, your-final-price).

The app is **read-only** for pricing — bulk price changes happen in the Sheet,
then you run this sync.

### Prerequisites
1. `npm install` in this folder.
2. `GOOGLE_APPLICATION_CREDENTIALS` set to a service-account key (already set in
   this environment).
3. The Sheet **shared (Viewer)** with that service account's email.
4. The **Google Sheets API enabled** on the service account's GCP project.

### Run it

Describe the Sheet (introspect tabs + sample rows, write nothing — use this
first to confirm the layout of an existing sheet):
```bash
node sync-pricing.js --describe --sheet=<id>
```

Dry run (reads the Sheet, prints a summary, writes `pricing-preview.json`,
writes nothing to Firestore):
```bash
node sync-pricing.js
```

Write to a specific Firestore project (explicit + confirmed):
```bash
node sync-pricing.js --write --project=freytags-recipes-staging --yes   # staging
node sync-pricing.js --write --project=freytags-purchasing --yes        # production
```

Options:
- `--keyfile=<path>` use a specific service-account key file (otherwise uses
  `GOOGLE_APPLICATION_CREDENTIALS`). Keep key files outside the repo.
- `--sheet=<id>` override the spreadsheet id (default is the Recipe price sheet).
- `--write` enable Firestore writes (otherwise dry run).
- `--project=<id>` required with `--write`; the target Firestore project.
- `--yes` required with `--write`; confirms the write target.

> Writing uses firebase-admin, which **bypasses security rules**. Be deliberate
> about `--project`. Test against staging before production.

`pricing-preview.json` is git-ignored (it contains pricing data).
