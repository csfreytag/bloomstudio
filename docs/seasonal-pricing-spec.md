# Seasonal Pricing — Spec

*Status: approved, not yet built. Drafted 2026-09-09.*

## Problem

Freytag's brings in flowers, greenery, plants, and containers that aren't on the
permanent price sheet — seasonal or one-off buys whose prices fluctuate
(e.g. poinsettias at Christmas, market-price specialty stems). Today there's no
clean way to get those into the app, and no way to make a temporary price expire
on its own.

## Decisions (settled — do not re-litigate)

- **Four separate seasonal tabs** on the "PRICE SHEETS" workbook — Chad's call, for
  visual clarity for the team (2026-09-09). One tab per category rather than a
  single tab + category dropdown.
- **Expired price → "market price / ask"**, NOT dropped and NOT kept at the stale
  number. This reuses the sync's existing market-price state (the `**seasonal`
  convention → no fixed retail). To **extend**, edit the date; to **remove**,
  delete the row (2026-09-09).
- **"Sync now" button** (admin/manager) so a seasonal item is live in ~30s instead
  of waiting for the daily cron (2026-09-09).
- **Sheet stays the single source of truth.** No in-app price entry, even for
  seasonal items — that would create a second source and cause drift.

## The seasonal tabs (as built, 2026-09-09)

Six seasonal tabs on the **PRICE SHEETS** workbook
(`1OEhdT3brIBNhE65GNtzzarQqPSMVN1HZVPjjjdHssYc`), one per permanent tab. Each
mirrors its parent's shape rather than a single uniform layout. Row 1 = headers;
the expiration column is headed **`Expiration`**. Column indices are 0-based.

| Tab | Blocks (name / color / price / expiration cols) | Routes to |
|---|---|---|
| `SEASONAL FLOWERS` | `{name:0, colors:1, price:2, exp:3}` | flowers |
| `SEASONAL GREENERY` | `{name:0, price:1, exp:2}` **and** `{name:4, price:5, exp:6}` | fillers |
| `SEASONAL PLANTS` | `{name:0, price:1, exp:2}` | plants |
| `SEASONAL CONTAINERS` | `{name:0, price:1, exp:2}` | containers |
| `SEASONAL ACCENTS` | `{name:0, price:1, exp:2}` | accents |
| `SEASONAL HARDGOODS` | `{name:0, price:1, exp:2}` | hardgoods |

Only `SEASONAL FLOWERS` has a Color column. `SEASONAL GREENERY` keeps the parent
`GREENS` two-block split (Greenery block A–C, Dried block E–G); each block has its
own Expiration.

Cell rules:
- **Price** — retail dollars; blank or `**market` = market price from the start
  (item shows but quotes no number).
- **Expiration** — a real spreadsheet date (e.g. `12/31/2026`), not text; blank =
  no auto-expiry (active until the row is deleted). To extend, change the date; to
  retire, delete the row. Past the date → item flips to "Market — ask".

This is a **new** `SEASONAL_SOURCES` config in `sync-pricing.js`, parallel to the
existing `SOURCES` — each entry adds an `exp` index per block and a `seasonal:true`
marker; all seasonal tabs use `headerRows:1`.

## Sync behavior (`scripts/sync-pricing.js`)

1. **Read** the six `SEASONAL *` tabs in addition to the permanent tabs, routing
   each to its category per the table above.
2. **Per row**, compute the effective price using *today* in **America/Chicago**:
   - `Available Until` present AND `< today` → **market price** (no fixed retail),
     i.e. the same state as `**seasonal`. Item stays in the catalog.
   - Otherwise → use `Price` (or market, if `Price` is blank/`**market`).
3. **Merge** seasonal items into the same category lists as permanent items, so
   they appear everywhere the app reads a catalog (price lists, recipe/calc
   dropdowns, Production/Log, the voice catalog).
4. **Tag** each seasonal-sourced item so the app can badge it and know its state,
   e.g. `{ seasonal: true, availableUntil: "2026-12-31", market: <bool> }`.
5. **Collision rule:** if a seasonal row's normalized name matches a permanent
   item, the **seasonal row wins while active** (it reflects current market
   reality). Log the collision in the sync report.
6. **Bad rows fail loud, not silent:** a missing name, unparseable price, or
   invalid date → **skip that one row and report it** (sync summary + ideally a
   surfaced "needs attention" list). Never crash the run, never mis-route.
   *(Motivation: the "Liatrice" typo hid an item silently — at seasonal volume
   that has to be visible.)*

## App behavior

1. **"Market — ask" display.** Where a seasonal item is in the market state (expired,
   or priced `**market`), show **"Market — ask"** instead of a `$` figure in: price
   lists, recipe view, price breakdown, the calculator, and Production/Log.
   - First verify how the app currently renders a `null`/seasonal price (the
     existing `**seasonal` path). Reuse it; only add the "Market — ask" label +
     seasonal badge if not already present.
2. **Seasonal badge.** A small "Seasonal" tag on such items so designers know it's
   temporary and the price may move.
3. **"Sync now" button.**
   - **Where:** Prices tab header (admin/manager only; hidden for designers).
   - **How:** a callable Cloud Function `syncPricesNow` in the **recipe-guide**
     functions codebase that runs the sync logic on demand — Firestore writes via
     the admin SDK (function's own creds), Sheets read via the Sheets-scoped
     service-account secret. Gate with `assertRecipeUser` + role check
     (admin/manager).
   - **Feedback:** toast "Syncing…" → "Done — N prices updated" (or the error).
   - **Env note:** functions run on **production only** (staging is Spark, no
     functions). On staging, hide the button or show "manual sync is production-only."

## Rollout order

1. **(Chad)** Create the four `SEASONAL *` tabs with the columns above.
2. **Sync:** update `sync-pricing.js` for the seasonal tabs + expiry/market-flip +
   seasonal tag + loud bad-row handling. Verify with a **dry run**, then a
   **staging write**, and re-check the catalog end-to-end.
3. **App:** add "Market — ask" rendering + seasonal badge (after confirming the
   existing null-price path).
4. **Button:** build `syncPricesNow` (deploy `--only functions:recipe-guide`) + the
   admin/manager Prices-tab button. Verify on prod.
5. **Merge `staging` → `main`** — see dependency below.

## Dependencies / gotchas

- **The daily cron runs from `main`, not `staging`.** The seasonal changes to
  `sync-pricing.js` will land on `staging`; until `staging` is merged to `main`,
  the **nightly** sync keeps using the old script (no seasonal tabs). The manual
  "Sync now" button (a deployed function) would work before the merge, but the
  automatic nightly run won't pick up seasonal items until `main` has the new
  script. Plan the merge as part of shipping this.
- **Greenery = fillers.** Confirm the app truly has no separate "greenery" list
  before wiring `SEASONAL GREENERY → fillers`.
- **All six categories are covered** — Chad added a seasonal tab per permanent tab,
  including `SEASONAL ACCENTS` and `SEASONAL HARDGOODS`. (The permanent `ACCENTS`
  tab now exists and syncs too — 42 items — so the pre-wired accents route is live.)

## Open questions

- Cron frequency: keep the single daily run (button covers urgency), or add a
  second midday run? (Chad's call; leaning keep-daily + button.)
- Should an expired item auto-drop after a long grace period, or stay as
  "Market — ask" until manually removed? (Current decision: stay until removed.)
