# Cloud Readiness Audit — bloomstudio (Freytag's Recipe Guide)

Audited: 2026-09-23, on branch `claude/funny-feynman-aq5bb3` (identical to `origin/main` at `d647d80`).
Scope: every tracked file except `.agents/skills/**` (vendored third-party agent skill docs, which the app never runs).
This is a report only. No other file was changed.

## Bottom line

**This app already runs almost entirely off the Windows machine.** The production app is a static page on Firebase Hosting (`public/index.html` + `public/firebase.js`). Staff open it in a browser, and it talks straight to Firestore, Auth, Storage and Cloud Functions in the `freytags-purchasing` project. The daily price sync runs on GitHub Actions. Nothing in the serving path touches a local disk, the office LAN, or Windows.

The ties to Chad's PC are all in **admin tooling and docs**:
- Four Node admin scripts hardcode `C:\Keys\*.json` service-account keys.
- The docs assume PowerShell and absolute `C:\` paths.
- A "source of truth" coordination doc lives only in a sibling repo checked out at `C:\Code\freytags-purchasing`.
- Some operations exist only as "run this script by hand from the dev box."

> ⚠ **CLAUDE.md is out of date and will mislead a cloud agent.** It says "data is stored in browser localStorage, there is no Firebase connection wired in yet" (`CLAUDE.md:8`) and "the next major task is migrating to Firebase" (`CLAUDE.md:11`). Both are false: `public/firebase.js` is a full Firestore/Auth/Storage/Functions data layer, and prod is live on it. It also says "GitHub Actions also auto-deploys on push to main" (`CLAUDE.md:22`), but `.github/workflows/firebase-hosting-merge.yml:4-11` is `workflow_dispatch` only. `CLAUDE.md:7` calls the app `public/index.html (~110 KB)`: the served file is 227 KB, and the ~109 KB file is the stale root `index.html`.

---

## 1. Code and version control — gitignored files that are required to run

| Ignored path / pattern | `.gitignore` line | Needed for | Status |
|---|---|---|---|
| `*-service-account*.json`, `*serviceAccount*.json`, `.secrets/` | `.gitignore:72-74` | Every admin script under `scripts/` | Key files live **outside the repo**, in `C:\Keys\` (see §4). None are in git history (checked with `git log --all -p` for `private_key` / `BEGIN PRIVATE KEY`). |
| `.env` | `.gitignore:66` | Nothing. No code reads `.env`. | Not required. |
| `node_modules/` | `.gitignore:54`, `functions/.gitignore:1` | `scripts/`, `functions/` | Can be rebuilt: both folders have `package-lock.json`. |
| `*.local` | `functions/.gitignore:3` | Would hold emulator secrets (`functions/.secret.local`) | Not currently required. The one function secret is in Secret Manager. |
| `scripts/pricing-preview.json` | `.gitignore:77` | **Output only**, written on every sync run | Not an input. |
| `.firebase/` | `.gitignore:11` | CLI hosting cache | Not required. |

**Untracked (not ignored, just never committed) and possibly relied on.** `next-up.md:14` records *"19 untracked `scripts/_*.js` diagnostics + `.claude/settings.json` — uncommitted"*. Those files exist only on the Windows PC. They are not in this clone, so this audit could not check them for more `C:\` paths or keys. **Anything useful in them is lost if the PC goes away.**

**Not in the repo at all but treated as required reading:** `C:\Code\freytags-purchasing\docs\SHARED-PROD-COORDINATION.md` (`CLAUDE.md:36`, `docs/shared-prod-coordination.md:9`). It is the canonical shared-prod playbook, and the only copy is in another repo, reached through a Windows path. The same repo holds the canonical, deployable `firestore.rules`.

## 2. Runtime and dependencies

### Language / versions

| Component | Runtime | Declared where | Lockfile |
|---|---|---|---|
| Browser app (`public/`) | Plain ES5/ES2015 JS, no build step | — | n/a (no npm deps) |
| Firebase JS SDK | **10.14.1**, loaded from gstatic CDN | `public/index.html:8-12` | Pinned by URL |
| Tabler icons | 2.44.0, loaded from jsDelivr | `public/index.html:7` | Pinned by URL |
| Cloud Functions | **Node 22** | `functions/package.json:4-6` (`"engines": {"node": "22"}`) | ✅ `functions/package-lock.json` |
| Admin scripts | Node (no `engines` field). Docs say "Node v22" (`CLAUDE.md:54`). | — | ✅ `scripts/package-lock.json` |
| Price-sync CI | **Node 20** | `.github/workflows/sync-pricing.yml:30-32` | uses `npm ci` |
| `src/lib/*.ts`, `src/types/shared.ts` | TypeScript | **No root `package.json` or `tsconfig.json`.** Test header says "Run with: npx jest" (`src/lib/alias-matcher.test.ts:5-6`), but jest/ts-node are not declared anywhere. | ❌ none |

Version drift: functions pin Node 22, the sync workflow uses Node 20, and the scripts don't declare a version. This is minor and harmless today.

### Tools installed globally rather than declared in the project

| Tool | Where it's assumed | Notes |
|---|---|---|
| **Firebase CLI** (`firebase`) | `CLAUDE.md:18-21, 54`; `SETUP-FIREBASE.md:60-64, 76-79` | Global install. Not in any `package.json`. Required for every hosting/functions deploy done by hand. |
| **gcloud CLI** | `CLAUDE.md:45` (verify-codebase-label command) | Global install. |
| **`npx http-server`** | `.claude/launch.json:6` (local preview on port 5055) | Fetched on demand by `npx --yes`. Works anywhere Node runs. |
| **`GOOGLE_APPLICATION_CREDENTIALS` env var** | `scripts/README.md:18-19` ("already set in this environment"), `scripts/sync-pricing.js:14, 115-116, 415` | A **machine-level env var on the Windows box** that points at a key file. Used as the fallback when `--keyfile` is omitted (`sync-pricing.js`, `set-user-role.js:41-44`, `grant-recipe-access.js:60-62`). |
| jest / ts-node | `src/lib/alias-matcher.test.ts:5-6` | Undeclared. The TS tests cannot run from a clean checkout. |

**Not found:** ODBC drivers, system Python, Office/Excel automation, COM/OLE, `.bat`/`.ps1` scripts, or Windows-only npm packages. Every `.js` file is cross-platform Node.

### Windows-specific items

| File:line | What |
|---|---|
| `scripts/migrate-staging-to-prod.js:8` | `require('C:\\Keys\\claude-llm-access.json')`: **hardcoded Windows absolute path, crashes on Linux at load** |
| `scripts/prod-rules-fetch.js:5` | `const KEY = 'C:\\Keys\\freytags-service-account.json'`: hardcoded, no override |
| `scripts/prod-rules-usage-appendonly.js:9` | same hardcoded `C:\Keys\freytags-service-account.json`, no override |
| `scripts/provision-prod-testers.js:10` | `require('C:\\Keys\\freytags-service-account.json')`: hardcoded, crashes at load |
| `scripts/grant-recipe-access.js:19, 26` | Comment/usage example uses `--keyfile=C:\Keys\freytags-service-account.json` (the code itself takes `--keyfile` and is portable) |
| `CLAUDE.md:16` | Local path `C:\Users\ChadFreytag\OneDrive - freytags.com\Documents\bloomstudio`. The repo lives in a **OneDrive-synced folder**. |
| `CLAUDE.md:36`, `docs/shared-prod-coordination.md:9` | `C:\Code\freytags-purchasing\docs\SHARED-PROD-COORDINATION.md` |
| `CLAUDE.md:19`, `SETUP-FIREBASE.md:60, 76` | ` ```powershell ` fenced deploy instructions (the commands themselves are plain `firebase ...` and run in any shell) |
| `CLAUDE.md:53-54` | "Windows 11, VS Code, PowerShell — use `Move-Item` not `mv`". This tells agents to emit PowerShell, which is wrong in a Linux container. |

## 3. Data at rest

### Files the app READS at runtime

**Production web app: no local files.** It reads only:
- Firestore: `recipes`, `settings/recipeGuide`, `tags/all`, `users`, `changeLogs`, `usageRecords` (`public/firebase.js:9-14, 83-87`)
- Firebase Storage (photos)
- Browser `localStorage` keys `bs_recipes2`, `bs_<category>`, `bs_tags`, `bs_margin_good`, `bs_margin_warn`. These are read **once, to import old prototype data from that one browser** (`public/firebase.js:529-540`). They are per-browser, not server-side.

**Cloud Functions (`functions/index.js`)**: no local files. They read Firestore, Auth, BigQuery (`freytags-florist-analytics.orda_raw.dbo_ORDERS_PRODUCTS`, `dbo_ORDERS`, `orda_analytics.v_funeral_accounts`, `functions/index.js:246-267`) and the Google Sheet `1OEhdT3b…` (`functions/pricingCore.js:146`).

**Admin scripts:**

| Script:line | Reads |
|---|---|
| `migrate-staging-to-prod.js:8` | `C:\Keys\claude-llm-access.json` |
| `prod-rules-fetch.js:5`, `prod-rules-usage-appendonly.js:9`, `provision-prod-testers.js:10` | `C:\Keys\freytags-service-account.json` |
| `sync-pricing.js:116, 359`; `import-recipes.js:41, 75, 97`; `set-user-role.js:29, 42`; `grant-recipe-access.js:48, 61` | Key file at `--keyfile=<path>`, or `$GOOGLE_APPLICATION_CREDENTIALS` |
| `sync-pricing.js:33, 84` | Google Sheets `1OEhdT3brIBNhE65GNtzzarQqPSMVN1HZVPjjjdHssYc` (PRICE SHEETS) and `1bhPOKRkqVmAtyIxim61Y9LBX4udiDr2z4bnc0Su2PZY` (PRODUCT SPREADSHEET), via the API, not local files |
| `import-recipes.js:99` | Google Sheet `--sheet=<id>`, range `A1:M6000` |

No network shares, drive-letter data files, SQLite, CSV or XLSX inputs were found. `scripts/klaviyo-catalog.json` (35 KB) and `scripts/recipe-skus.json` (12 KB) are committed data files, **but nothing in the repo reads them** (grep found no reference). They look like leftovers from one-off diagnostics, possibly the untracked `scripts/_*.js`.

### Files it WRITES at runtime (lost on container restart)

| File:line | What | Impact if lost |
|---|---|---|
| `scripts/sync-pricing.js:479-480` | `scripts/pricing-preview.json`, a dry-run preview written on **every** run, including CI | None. Throwaway inspection output. The real result goes to Firestore. |
| `scripts/provision-prod-testers.js:43` | Prints **generated passwords** for new designer accounts to stdout only | ⚠ Passwords are never stored. In a container, capture the log or they're gone (you'd have to reset them). |
| `scripts/prod-rules-usage-appendonly.js:51, 77` | Prints the **rollback ruleset id** to stdout only | ⚠ Must be copied somewhere durable. Today it's hand-copied into `next-up.md:10`. |
| Browser `localStorage` (`index.html:558`, root prototype) | Old prototype saves | Not server-side. Irrelevant to containers. |

The Firebase CLI also writes `firebase-debug.log` and `.firebase/` cache. Both are disposable.

### Local database files

**None.** There is no SQLite or other local DB. All state is in Firestore (shared prod project `freytags-purchasing`, PITR + daily backups per `CLAUDE.md:42`) and Firebase Storage.

## 4. Secrets

| Secret | Where it lives | Committed? | Used by |
|---|---|---|---|
| **Prod admin SA key** `firebase-adminsdk-fbsvc@freytags-purchasing` | `C:\Keys\freytags-service-account.json` on Chad's PC (`grant-recipe-access.js:17-19`) | ❌ No | `prod-rules-fetch.js`, `prod-rules-usage-appendonly.js`, `provision-prod-testers.js`, `grant-recipe-access.js`. **The only key with Firebase Auth (Identity Toolkit) rights on prod** (`grant-recipe-access.js:19-22`). |
| **Analytics SA key** `claude-llm-access@freytags-florist-analytics` | `C:\Keys\claude-llm-access.json` (`migrate-staging-to-prod.js:8`); also whatever `GOOGLE_APPLICATION_CREDENTIALS` points at on the PC | ❌ No | `migrate-staging-to-prod.js`, `sync-pricing.js`, `import-recipes.js` |
| Same analytics key, as GitHub secret `RECIPE_SYNC_SA_KEY` | GitHub repo secrets (`sync-pricing.yml:7-8, 40-41`) | ❌ No (written to `scripts/sa-key.json` at runtime, then deleted, `sync-pricing.yml:38-51`) | Daily price sync |
| Same analytics key, as Secret Manager secret `ORDA_SA_KEY` | GCP Secret Manager, `freytags-purchasing` (`functions/index.js:39-42`) | ❌ No | `lookupOrder`, `syncPricesNow` functions |
| GitHub secret `FIREBASE_SERVICE_ACCOUNT_FREYTAGS_PURCHASING` | GitHub repo secrets (`firebase-hosting-merge.yml:20`, `firebase-hosting-pull-request.yml:19`) | ❌ No | Hosting deploys from Actions |
| Firebase **web** config, prod `AIzaSyAMWl…` | `public/firebase.js:27-34`, `CLAUDE.md:106-113` | ✅ Yes, **public by design** | Browser. Protected by Auth + rules, not secrecy. |
| Firebase **web** config, staging `AIzaSyAXAh…` | `public/firebase.js:43-50` | ✅ Yes, public by design | Browser |
| Firebase CLI login token | `%USERPROFILE%\.config\configstore\firebase-tools.json` on the PC (implicit; the CLI stores it there after `firebase login`) | ❌ No | Every manual `firebase deploy` |
| gcloud credentials | `%APPDATA%\gcloud` on the PC (implicit) | ❌ No | `CLAUDE.md:45` verification command |

Two further items:
- Account **email addresses** of real testers are committed in `scripts/provision-prod-testers.js:17-23`. This is personal data, not a secret, but worth noting.
- **Rotation risk:** the analytics key is copied in at least three places (the `C:\Keys` file, the GitHub secret, and Secret Manager). Rotating it means updating all three.

## 5. Local network reach

**None found.** Checked for `10.x`, `192.168.x`, `172.16-31.x`, `localhost` / `127.0.0.1` targets, `.local` hostnames, SMB/UNC paths, and printer/POS/3CX hosts. Every outbound endpoint is a public Google/CDN API:

| Endpoint | File:line | Classification |
|---|---|---|
| `www.gstatic.com/firebasejs/10.14.1/*` | `public/index.html:8-12` | Public CDN |
| `cdn.jsdelivr.net/npm/@tabler/icons-webfont` | `public/index.html:7` | Public CDN |
| `firebaserules.googleapis.com` | `prod-rules-fetch.js:10, 13`; `prod-rules-usage-appendonly.js:35, 37, 57, 72` | Public Google API |
| Sheets / Drive / BigQuery APIs | `sync-pricing.js`, `import-recipes.js:97`, `functions/index.js:237-240, 305-307` | Public Google API |
| Firestore / Auth / Storage / Functions | `public/firebase.js` | Public Google API |
| Browser Web Speech API | `public/index.html:2164, 2271, 2756` | Runs in the user's browser (Chrome sends audio to Google). No server involvement. |

`public/firebase.js:56` mentions `localhost`/`127.0.0.1` only to route local previews to the **staging** Firebase config. That's a hostname check, not a LAN dependency.

**Upstream note (outside this repo):** `lookupOrder` reads RTI/POS order data from BigQuery `orda_raw.*`. Something outside this repo replicates RTI into BigQuery, possibly from the office network. This repo never touches RTI directly. If that replication stops, order lookup goes stale, but that's the analytics pipeline's problem, not this app's.

## 6. Scheduled work

| Job | Mechanism | Frequency | What it does | Machine-bound? |
|---|---|---|---|---|
| **Price sync** | GitHub Actions cron, `.github/workflows/sync-pricing.yml:15-16` (`0 12 * * *`) | Daily, 12:00 UTC (~6–7 am Central) | Reads PRICE SHEETS, then writes `settings/recipeGuide.priceLists` in prod Firestore | **No.** Already cloud. The workflow is on `main`, so GitHub should be running it. This audit did not check the Actions run history. |
| Price sync, on demand | Callable Cloud Function `syncPricesNow` (`functions/index.js:296-339`), plus the "Run workflow" button (`sync-pricing.yml:17-22`) | Ad hoc, manager/admin | Same as above | No |
| Firestore backups / PITR | GCP-managed (`CLAUDE.md:41`) | Daily + 7-day PITR | Recovery | No |

**Manually run scripts (all from Chad's PC today):**

| Script | Purpose | How often | Container-ready? |
|---|---|---|---|
| `scripts/sync-pricing.js` | Manual/dry-run price sync (`scripts/README.md`) | Ad hoc | ✅ Yes, with `--keyfile` or ADC |
| `scripts/import-recipes.js` | Bulk-import recipes from PRODUCT SPREADSHEET tabs. A ~423-recipe Plant Items run is still pending (`next-up.md`, "Held"). | One-off per tab | ✅ Yes (requires `--keyfile`) |
| `scripts/set-user-role.js` | Write `users/{uid}` role (bootstrap first admin) | Rare | ✅ Yes |
| `scripts/grant-recipe-access.js` | Set custom claims + users doc on prod | Rare. Mostly replaced by the in-app Users tab through Cloud Functions. | ✅ Code yes. **Key must be the prod admin key.** |
| `scripts/prod-rules-fetch.js` | Read the live prod ruleset | Before any rule change | ❌ **Hardcoded `C:\Keys`** |
| `scripts/prod-rules-usage-appendonly.js` | Surgical prod rules swap (the template for future rule changes, `CLAUDE.md:41`) | Rare, high-stakes | ❌ **Hardcoded `C:\Keys`** |
| `scripts/provision-prod-testers.js` | One-off tester provisioning | Done (one-off) | ❌ **Hardcoded `C:\Keys`** |
| `scripts/migrate-staging-to-prod.js` | One-off staging→prod recipe copy | Done (one-off) | ❌ **Hardcoded `C:\Keys`** |
| `firebase deploy --only hosting:freytags-recipes` | Prod hosting deploy (`CLAUDE.md:18-21`) | Each release | Needs Firebase CLI + auth. The Actions "Run workflow" button (`firebase-hosting-merge.yml`) already works without the PC. |
| `firebase deploy --only functions` (codebase `recipe-guide`) | Functions deploy | Each functions change | Needs Firebase CLI + an identity with deploy rights on `freytags-purchasing`. **No CI workflow exists for functions.** |

## 7. Who calls this app

- **Serving staff:** designers, managers and admins open **https://freytags-recipes.web.app** in a browser, from the workbench, a phone, or anywhere. It isn't limited to the LAN: it's public Firebase Hosting behind Firebase Auth (Google Sign-In for `@freytags.com`, email/password for designers).
- **Entry point:** `public/index.html`, which loads `public/firebase.js?v=7` (`public/index.html:13`). The SPA rewrite in `firebase.json` sends every route to `/index.html`. The root `index.html` (109 KB) is the **stale localStorage prototype** and is not served.
- **Called by other code:** the browser calls callable Cloud Functions (`setRecipeRole`, `createRecipeUser`, `removeRecipeRole`, `inviteRecipeUser`, `claimRecipeInvite`, `listRecipeInvites`, `revokeRecipeInvite`, `lookupOrder`, `syncPricesNow`). GitHub Actions calls `scripts/sync-pricing.js` daily.
- **Run manually by one person:** all the admin scripts in §6, plus manual Firebase CLI deploys. That person is Chad, on the Windows PC, holding the only copy of the `C:\Keys` files.
- **Shares a backend with the Purchasing app** (`freytags-purchasing` repo), which owns the canonical prod `firestore.rules`.

---

## Blockers

Ordered **easiest → hardest**. None of them is a true "cannot move." The production app is already in the cloud and has been all along. What has to move is **Chad's admin workflow**, not the app.

1. **Stale, Windows-flavoured agent instructions (trivial).** `CLAUDE.md:53-54` tells agents to use PowerShell. `CLAUDE.md:7-11` says the app is a localStorage prototype with no Firebase. `CLAUDE.md:22` says merges to main auto-deploy. A cloud agent following these literally will do the wrong thing. Fix the text. No code change.

2. **Hardcoded `C:\Keys\…` paths in four scripts (easy).** `migrate-staging-to-prod.js:8`, `prod-rules-fetch.js:5`, `prod-rules-usage-appendonly.js:9` and `provision-prod-testers.js:10` crash on Linux the moment they load. Switch them to the `--keyfile` / ADC pattern the other scripts already use. Two are finished one-offs and could be retired instead. **The rules scripts matter:** `CLAUDE.md:41` makes them the only sanctioned way to change prod rules.

3. **Untracked files that exist only on the PC (easy, but urgent).** The 19 `scripts/_*.js` diagnostics and `.claude/settings.json` (`next-up.md:14`) are not in git. Decide what to keep, check them for keys/paths, and commit or delete them. Otherwise they disappear with the PC.

4. **Getting credentials into the container (moderate: a policy decision, not a technical one).** Every admin script needs a Google identity:
   - The **prod admin key** (`freytags-service-account.json`) exists only on Chad's disk. It is the only credential that can manage prod Auth users (`grant-recipe-access.js:17-22`).
   - A container needs it injected as an environment secret, or better, replaced with Workload Identity / short-lived impersonation (`gcloud auth` + `--impersonate-service-account`).
   - Firebase CLI deploys need `FIREBASE_TOKEN`-style or SA-based auth instead of Chad's interactive `firebase login`.
   - **Be deliberate:** putting a prod-admin key that bypasses security rules into a cloud agent environment is a real expansion of who and what can rewrite the shared prod database and its rules. That includes the Purchasing app's data. Consider keeping rules-release and user-provisioning human-run, with only read/dry-run in the container.

5. **Cross-repo source of truth reached through a Windows path (moderate).** The shared-prod playbook and the only deployable `firestore.rules` live in `freytags-purchasing`, referenced as `C:\Code\freytags-purchasing\…` (`CLAUDE.md:36`, `docs/shared-prod-coordination.md:9`). A container needs that repo cloned alongside, with read access granted. Any rule change still needs a hand-off to that repo, or the next Purchasing deploy reverts it. That coordination can't be automated away from this repo alone.

6. **No CI path for Cloud Functions deploys (moderate).** Hosting can be deployed from GitHub Actions (manual button). Functions (`codebase: recipe-guide`) can only be deployed from a machine with the Firebase CLI and deploy rights on the shared prod project. This needs either a functions deploy workflow (with the codebase-label safeguard from `CLAUDE.md:43-45`) or a credentialed container.

**What cannot move:** nothing in this repo requires the office LAN, Windows, a local database, or a local file at runtime. The only piece that is genuinely stuck to physical hardware is **the private key files in `C:\Keys`**, and only because nobody has moved them yet. Once the keys (or a keyless replacement) are available to the container, and the four hardcoded paths are fixed, everything here runs on Linux unchanged.
