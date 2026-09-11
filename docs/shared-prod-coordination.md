# Shared Production Coordination — Purchasing + Recipe apps

**Both apps run on ONE production Firestore database** (Firebase project
`freytags-purchasing`). The Purchasing app and the Recipe Guide (bloomstudio,
hosted at `freytags-recipes`) share the same data and the same security rules.
This doc is the playbook so the two apps never clobber each other. Keep a copy in
**both** repos.

## The setup (facts)
- **One prod DB, two apps.** Shared Firestore on project `freytags-purchasing`.
- **Hosting is separate** (safe): purchasing → `hosting:freytags-purchasing`;
  recipe → `hosting:freytags-recipes`.
- **Functions are separate codebases** (safe — no cross-pruning):
  purchasing `codebase="default"`, recipe `codebase="recipe-guide"`.
- **Rules and data are SHARED** — this is the only real collision surface.
- **Rules model = auth-token CLAIMS** (`request.auth.token.purchasingRole` /
  `recipeGuideRole`), NOT Firestore user-doc lookups.
- **Recovery net:** Firestore PITR is ON (7-day) + daily scheduled backups (7-day).

## The rules that keep us safe

1. **One canonical `firestore.rules`.** The **purchasing repo's** `firestore.rules`
   is the single source of truth — it is the COMPLETE union (all recipe rules + all
   purchasing rules). It is the ONLY file ever deployed to prod's rules.

2. **The recipe app NEVER deploys a rules file.** Its CI is hosting-only
   (`action-hosting-deploy`) — keep it that way. The recipe repo's local
   `firestore.rules` is an OLD doc-based, purchasing-less draft; **it must never
   reach prod** (its own header says "staging only"). Any recipe rule change is
   either (a) a surgical script on the live rules **and** mirrored back into the
   canonical file, or (b) handed to the purchasing repo to merge into the canonical
   file. Either way the canonical file must always reflect live prod.

3. **Verify before EVERY rules deploy.** Read live prod rules → diff against the
   file about to deploy → confirm the change is only what you intend → then deploy.
   (This is the check that caught the missing recipe rules on 2026-09-11.)

4. **PITR stays ON.** It's the backstop if anything ever slips through — the whole
   DB (both apps' data) can be rewound to any minute in the last 7 days.

## Collection ownership (whose rules/schema you must not touch alone)

- **Recipe-owned:** `recipes`, `tags`, `pricing`, `usageRecords`.
  (`usageRecords` is APPEND-ONLY as of 2026-09-11: `update:false`, admin-only delete.)
- **Purchasing-owned:** `purchaseOrders`, `invoices`, `unmatchedInvoices`,
  `receivingRecords`, `creditMemos`, `carriers`, `inquiries`, `coolerItems`,
  `coolerCounts`, `coolerDumps`, `inventoryStatus`, `freightBills`.
- **Shared — coordinate before changing rules OR schema:** `products` (recipe owns
  retail + creation; purchasing writes cost), `vendors`, `users`, `changeLogs`,
  `settings`.

## Deploy mechanics (so nobody's surprised)
- **Purchasing:** `git push origin main` → CI deploys functions + hosting +
  storage + **firestore:rules** to prod. So the purchasing repo IS the rules
  deployer — its `firestore.rules` must always be the current complete union first.
- **Recipe:** `git push origin main` → hosting only. Never rules, never functions
  into the `default` codebase.

## The one-line version
**Any change to prod Firestore rules goes through the purchasing repo's canonical
`firestore.rules`, and you verify against live prod before deploying. Everything
else (hosting, functions) is already isolated.**

---

## Recipe-side implementation notes (bloomstudio) — verified 2026-09-11
- **This repo's `firebase.json` declares NO `firestore` or `storage` block** — so
  even an accidental local `firebase deploy` from here cannot deploy (and clobber)
  the shared rules. The stale `firestore.rules` also carries a loud DO-NOT-DEPLOY
  banner.
- **Recipe rule changes are made by surgical REST script** against live prod
  (`scripts/prod-rules-fetch.js` to read, `scripts/prod-rules-usage-appendonly.js`
  is the last one applied), then the exact block must be **handed to the purchasing
  repo to mirror into canonical**. Rollback = re-point the release at the prior
  ruleset id printed by the script.
- **Verified live on 2026-09-11:** `usageRecords` is append-only
  (`update:false`, `delete: isRecipeAdmin()`); PITR = ENABLED; one daily backup
  schedule at 7-day retention; database **delete protection = ENABLED** (Purchasing
  did this — it's a shared-DB setting, so to ever legitimately delete the DB
  someone must toggle it off first).
- **Reconciled 2026-09-11:** the Purchasing side confirmed its canonical
  `firestore.rules` is in sync with live prod for all four recipe-owned blocks
  (`recipes`, `tags`, `pricing`, append-only `usageRecords`) — so the next
  Purchasing rules deploy preserves the append-only change (no revert).
- **STANDING RULE:** after ANY future surgical rule change to prod from the recipe
  side, **ping the Purchasing side to re-sync their canonical file** before their
  next rules deploy — otherwise that deploy silently reverts the change.
