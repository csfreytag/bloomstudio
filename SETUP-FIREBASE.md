# Firebase migration — staging setup checklist

This is the one-time setup to get the Recipe Guide running on Firebase **in
staging**. Do every step against the **staging** project. Production is not
touched until you've verified staging and explicitly choose to go live.

Branch: do this on `staging`. Don't merge to `main` until verified.

## Staging is fully isolated from Purchasing

Recipe **staging** uses its **own dedicated Firebase project**
(`freytags-recipes-staging`) — it shares **nothing** with the Purchasing app.
No shared collections, no shared rules, no shared data. You can test, seed,
reset, and break things here with zero risk to Purchasing.

The two apps only share a backend in **production** (the `freytags-purchasing`
project) — and even there, the Recipe app only ever writes Recipe-owned data
(see "Shared-backend safety" at the bottom).

---

## What the code already does

- `public/firebase.js` — Firebase wiring: picks **production** config on
  `freytags-recipes.web.app`, otherwise uses the **staging** (dedicated
  Recipe) config. Handles sign-in (Google + Email/Password), resolves each
  user's role from `users/{uid}`, and exposes `RecipeStore` (the data layer
  that replaced localStorage).
- `public/index.html` — boots through an auth gate, loads all data from
  Firestore, writes recipes / tags / price lists / margin settings back, and
  uploads photos to Cloud Storage.
- `firestore.rules`, `storage.rules`, `firestore.indexes.json` — role-based
  rules and indexes (Admin / Manager / Designer).
- On first load into an empty database, the app **seeds** Firestore from this
  browser's existing localStorage data (or the built-in defaults).

---

## Steps (staging)

### 1. Create the dedicated staging project
- In the [Firebase console](https://console.firebase.google.com/), create a new
  project named **`freytags-recipes-staging`** (this is its own project, NOT
  inside the Purchasing project).
- Enable **Firestore** (standard, `us-central1`) and **Storage**.

### 2. Register a Web app and paste its config
- Console → Project settings → *Your apps* → add a **Web app**.
- Copy the `firebaseConfig` values into **`public/firebase.js` → `STAGING_CONFIG`**
  (replace the `STAGING_API_KEY` / `STAGING_SENDER_ID` / `STAGING_APP_ID`
  placeholders). The project/auth/storage fields should already match
  `freytags-recipes-staging` — double-check them.

### 3. Enable auth providers
- Console → Authentication → *Sign-in method*:
  - Enable **Google** (set support email).
  - Enable **Email/Password**.

### 4. Create the staging hosting site
```powershell
# from the bloomstudio repo root
firebase use staging
firebase hosting:sites:create freytags-recipes-staging --project staging
firebase target:apply hosting freytags-recipes-staging freytags-recipes-staging --project staging
```
(The `.firebaserc` already maps the `staging` alias and the
`freytags-recipes-staging` target.)

### 5. Authorize the staging domain for auth
- Console → Authentication → Settings → *Authorized domains* → add
  `freytags-recipes-staging.web.app` (`localhost` is there by default).

### 6. Deploy rules, indexes, and hosting
Because staging is its own dedicated project, these deploys are safe — there's
nothing of Purchasing's to overwrite.
```powershell
firebase use staging
firebase deploy --only firestore:rules,firestore:indexes,storage --project staging
firebase deploy --only hosting:freytags-recipes-staging --project staging
```
> Habit to keep anyway: always scope with `--project staging` and an explicit
> target. Never a bare `firebase deploy`.

### 7. Bootstrap the first admin (chicken-and-egg)
The rules require a `users/{uid}` record before anyone can use the app, and only
admins can create user records — so the **first** admin must be created by hand:
1. Sign in once at `https://freytags-recipes-staging.web.app`. You'll land on
   the "No access yet" screen — that's expected.
2. Console → Authentication → copy your account's **User UID**.
3. Console → Firestore → create collection `users`, document ID = that UID:
   ```
   email:           "chad@freytags.com"
   displayName:     "Chad Freytag"
   recipeGuideRole: "admin"
   active:          true
   ```
4. Reload the app — you're in as Admin, and it seeds the database on first load.

### 8. Add the rest of the team
Once you're admin, add each teammate's `users/{uid}` doc with `recipeGuideRole`
= `admin` | `manager` | `designer`. (An in-app user-management screen is a
sensible follow-up; for now it's console-side.)

> Designers without Google Workspace accounts: create them under
> Authentication → Users (email + password), then add their `users` doc with
> `recipeGuideRole: "designer"`.

---

## Test checklist (on staging)

- [ ] Sign in with Google and with an email/password account.
- [ ] First load seeds recipes, price lists, tags, margins.
- [ ] Create / edit / delete a recipe — survives reload (check it in Firestore).
- [ ] Upload a recipe photo — appears, and lands in Storage under `recipes/<id>/`.
- [ ] Edit a price list and Save — persists.
- [ ] Change margin targets — persists.
- [ ] Sign in as a **Designer** — no Prices/Order/Reports tabs, no pricing, read-only.
- [ ] Sign in as a **Manager** — can edit recipes, can't manage users.
- [ ] Open from a second browser/account — sees the same shared data.

---

## Going live (production — READ THIS CAREFULLY)

Production **is** the shared `freytags-purchasing` project. Two things matter:

1. **Rules are project-wide and replace the whole ruleset.** `firestore.rules`
   in this repo only describes Recipe-Guide collections. Deploying it *as-is* to
   production would lock the Purchasing app out of its own data (deny-by-default
   on `purchaseOrders`, `invoices`, etc.). **Before any production rules deploy,
   merge these Recipe rules into the Purchasing app's current production rules
   so the deployed file is the union of both apps.** Same applies to
   `storage.rules` and `firestore.indexes.json` (an index deploy can delete
   indexes not listed in the file).
2. **The `users` collection is shared.** A user may have both a
   `recipeGuideRole` and a `purchasingRole`. When editing a user doc, **merge /
   update — never overwrite** — or you'll wipe the other app's role.

Go-live steps, done deliberately (not via the automatic CI deploy):
1. Production web config is already in `firebase.js` (`PROD_CONFIG`).
2. Enable Google + Email/Password on the production project.
3. Deploy the **merged** rules to production by hand, with Purchasing's rules
   included. Do not rely on CI for rules — the GitHub Action deploys **hosting
   only**, so it can't touch rules (this is why it's safe).
4. Merge `staging` → `main`. The GitHub Action deploys hosting to
   `freytags-recipes.web.app`.

---

## Shared-backend safety (what the Recipe app writes)

For peace of mind — even in production, the Recipe app only ever writes
Recipe-owned things and can't clobber Purchasing data:

| Write | Location | Shared with Purchasing? |
|-------|----------|-------------------------|
| Recipes | `recipes/{id}` | No — Recipe-only collection |
| Tags, price lists, margins | `settings/recipeGuide` (one doc) | No — distinct doc |
| Activity log | `changeLogs` via add() | Append-only, tagged `app:'recipe-guide'` |
| Photos | Storage `recipes/<id>/…` | No — Recipe-namespaced path |
| Users | — | The app never writes `users` (roles are set in console) |

The one-time seed only fires when there are no recipes **and** no
`settings/recipeGuide` doc, and writes only those two Recipe things.

## Not included in this migration (future workstreams, per CLAUDE.md)
- Google Sheet → Firestore one-way **pricing sync** (price lists currently live
  in `settings/recipeGuide` and remain editable in-app).
- Shared `products` master list + the `pricing` collection; invoice-cost feed
  from Purchasing; any cross-app automation (e.g. auto-ordering agent). These
  are the features that will actually exercise the shared production backend —
  decide how to integration-test them when you build them.
- Recipe export to PDF, recipe history/versioning, mobile workbench layout, and
  an in-app user-management UI.
