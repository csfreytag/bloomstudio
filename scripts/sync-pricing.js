#!/usr/bin/env node
/* ============================================================================
 * sync-pricing.js — Google Sheet -> Firestore pricing sync (one-way)
 *
 * Reads the Recipe Guide price sheet (one tab per category) and writes the
 * prices into Firestore at settings/recipeGuide.priceLists, in the SAME shape
 * the app already loads: { n: name, p: cost, r: yourFinalPrice }.
 *
 * SAFE BY DEFAULT: with no flags it is a DRY RUN — it reads the Sheet, prints
 * a summary, writes a preview file (pricing-preview.json), and writes NOTHING
 * to Firestore.
 *
 * Auth: uses Application Default Credentials. This environment has
 *   GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key.
 *   - To READ the Sheet: share the Sheet (Viewer) with that service account's
 *     email, and enable the Google Sheets API on its GCP project.
 *   - To WRITE Firestore: the credential must have access to the --project you
 *     target. firebase-admin writes with admin privileges (bypasses rules).
 *
 * Usage:
 *   node sync-pricing.js                         # dry run (read + preview only)
 *   node sync-pricing.js --write --project=X --yes   # write to project X
 *   node sync-pricing.js --sheet=<id>            # override sheet id
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// ── Config ──────────────────────────────────────────────────────────────────
const DEFAULT_SHEET_ID = '1OEhdT3brIBNhE65GNtzzarQqPSMVN1HZVPjjjdHssYc'; // "PRICE SHEETS"

// The sheet has 3 tabs, each with two side-by-side [Name | Price] blocks
// separated by a blank column. Columns are 0-indexed: A=0, B=1, C=2(blank),
// D=3, E=4. Each block routes into one app price-list category.
//
// There is NO cost column — the Price column is retail ("your final price").
// Cost is fed later by the Purchasing app's invoice history.
//
// Accents and Plants are intentionally NOT synced yet (not in the sheet) — they
// stay as the app's existing lists. When they're added to the sheet, add a
// source entry here and they'll flow through automatically.
// PLANTS and ACCENTS tabs don't exist in the sheet yet — they're pre-wired so
// they activate automatically the moment those tabs are added (same two-block
// Name|Price layout; a single-column tab also works — the 2nd block just reads
// empty). Tabs that don't exist are skipped silently, leaving that category as
// the app's existing list.
const SOURCES = [
  { tab: 'FLOWERS',    blocks: [ { name: 0, colors: 1, price: 2, target: 'flowers' }, { name: 4, colors: 5, price: 6, target: 'flowers' } ] },
  { tab: 'GREENS',     blocks: [ { name: 0, price: 1, target: 'fillers' }, { name: 3, price: 4, target: 'fillers' } ] },
  { tab: 'CONTAINERS', blocks: [ { name: 0, price: 1, target: 'containers' } ] },
  { tab: 'HARDGOODS',  blocks: [ { name: 0, price: 1, target: 'hardgoods' } ] },
  { tab: 'PLANTS',     headerRows: 1, blocks: [ { name: 0, price: 1, target: 'plants' } ] },
  { tab: 'ACCENTS',    blocks: [ { name: 0, price: 1, target: 'accents' } ] }
];

// ── Seasonal tabs (PRICE SHEETS layout only) ──────────────────────────────────
// Occasional / market items with a per-row Expiration date. They merge into the
// SAME target lists as the permanent tabs, tagged { seasonal:true }. Past the
// expiration date, the price flips to market (r=null → "ask") but the item stays
// so it can be extended (edit the date) or removed (delete the row). Layout
// mirrors each permanent sibling; only FLOWERS has a Color column, and GREENERY
// keeps the two-block Greenery/Dried split. See docs/seasonal-pricing-spec.md.
const SEASONAL_SOURCES = [
  { tab: 'SEASONAL FLOWERS',    blocks: [ { name: 0, colors: 1, price: 2, exp: 3, target: 'flowers' } ] },
  { tab: 'SEASONAL GREENERY',   blocks: [ { name: 0, price: 1, exp: 2, target: 'fillers' }, { name: 4, price: 5, exp: 6, target: 'fillers' } ] },
  { tab: 'SEASONAL PLANTS',     blocks: [ { name: 0, price: 1, exp: 2, target: 'plants' } ] },
  { tab: 'SEASONAL CONTAINERS', blocks: [ { name: 0, price: 1, exp: 2, target: 'containers' } ] },
  { tab: 'SEASONAL ACCENTS',    blocks: [ { name: 0, price: 1, exp: 2, target: 'accents' } ] },
  { tab: 'SEASONAL HARDGOODS',  blocks: [ { name: 0, price: 1, exp: 2, target: 'hardgoods' } ] }
];

// ── Alternate layout: the PRODUCT SPREADSHEET (recipes + prices in one file) ──
// Same workbook the recipes live in, so ingredient names line up automatically.
// Structural differences vs PRICE SHEETS:
//   · CUT FLOWERS lists one row PER COLOR ("Alstroemeria - White"); splitColor
//     re-aggregates to parent + colors[] so the app's color dropdown still works.
//   · SYMPATHY FORMS/HARDGOODS is shifted one column right (name in B, price in C).
//   · col B is the final retail price in every tab; cost columns are ignored.
// Select with --layout=product (defaults the sheet id to PRODUCT_SHEET_ID).
const PRODUCT_SHEET_ID = '1bhPOKRkqVmAtyIxim61Y9LBX4udiDr2z4bnc0Su2PZY';
const PRODUCT_SOURCES = [
  { tab: 'CUT FLOWERS',              headerRows: 1, blocks: [ { name: 0, price: 1, target: 'flowers', splitColor: true } ] },
  { tab: 'CONTAINERS/VASES',         headerRows: 1, blocks: [ { name: 0, price: 1, target: 'containers' } ] },
  { tab: 'GREENERY',                 headerRows: 1, blocks: [ { name: 0, price: 1, target: 'fillers' } ] },
  { tab: 'ACCENTS',                  headerRows: 1, blocks: [ { name: 0, price: 1, target: 'accents' } ] },
  { tab: 'PLANTS',                   headerRows: 1, blocks: [ { name: 0, price: 1, target: 'plants' } ] },
  { tab: 'SYMPATHY FORMS/HARDGOODS', headerRows: 2, blocks: [ { name: 1, price: 2, target: 'hardgoods' } ] }
];

// Categories the app keeps that the sheet never manages (left untouched on write).
// (Accents is pre-wired above but skipped until an ACCENTS tab exists.)
const UNMANAGED_KEYS = [];

const SETTINGS_DOC = 'recipeGuide';

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name) { return args.includes('--' + name); }
function opt(name, def) {
  const hit = args.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
}
const DO_WRITE = flag('write');
const DO_DESCRIBE = flag('describe');
const DO_LIST = flag('list');
const CONFIRMED = flag('yes');
const LAYOUT = opt('layout', 'priceSheets');
const ACTIVE_SOURCES = LAYOUT === 'product' ? PRODUCT_SOURCES : SOURCES;
const SHEET_ID = opt('sheet', LAYOUT === 'product' ? PRODUCT_SHEET_ID : DEFAULT_SHEET_ID);
const TARGET_PROJECT = opt('project', null);
// Optional explicit service-account key file. If omitted, uses Application
// Default Credentials (GOOGLE_APPLICATION_CREDENTIALS).
const KEYFILE = opt('keyfile', null);

function makeAuth(scopes) {
  const cfg = { scopes };
  if (KEYFILE) cfg.keyFile = KEYFILE;
  return new google.auth.GoogleAuth(cfg);
}

// ── Helpers ───────────────────────────────────────────────────────────────--
function parseMoney(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[$,\s]/g, '').trim();
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Today's date as YYYY-MM-DD in America/Chicago (en-CA formats as YYYY-MM-DD),
// so expiry comparisons follow the shop's local calendar day, not UTC.
function chicagoToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
// Parse a sheet date cell to YYYY-MM-DD. Returns null for blank, a string for a
// good date, and undefined for present-but-unparseable (so the caller can warn
// and keep the item rather than silently drop it).
function parseSheetDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);   // M/D/YYYY or M/D/YY
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);            // YYYY-MM-DD
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  const t = Date.parse(s);                                 // last resort
  if (!isNaN(t)) {
    const dt = new Date(t);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return undefined;
}
// Normalize a name for collision matching (seasonal vs permanent same item).
function unormName(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// (block parsing is handled inline in readSheet)

// Re-aggregate a flat "Parent - Color" flower list into parent + colors[].
// Splits on the LAST " - " (so "Rose - Spray - White" → parent "Rose - Spray",
// color "White"), matching how the recipe importer splits names. Price is the
// parent price (first non-null seen; colors of one flower share a price).
function aggregateColors(items) {
  const parents = new Map();
  for (const it of items) {
    const idx = it.n.lastIndexOf(' - ');
    const parent = idx > 0 ? it.n.slice(0, idx).trim() : it.n.trim();
    const color = idx > 0 ? it.n.slice(idx + 3).trim() : '';
    if (!parents.has(parent)) parents.set(parent, { n: parent, p: 0, r: it.r, colors: [] });
    const p = parents.get(parent);
    if (p.r == null && it.r != null) p.r = it.r;
    if (color && !p.colors.includes(color)) p.colors.push(color);
  }
  return [...parents.values()].map(p => { if (!p.colors.length) delete p.colors; return p; });
}

// ── List spreadsheets the service account can access (writes nothing) ──────--
async function listSpreadsheets() {
  const auth = makeAuth(['https://www.googleapis.com/auth/drive.metadata.readonly']);
  const drive = google.drive({ version: 'v3', auth: await auth.getClient() });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: 'files(id,name,modifiedTime,owners(emailAddress))',
    orderBy: 'modifiedTime desc',
    pageSize: 100,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  const files = res.data.files || [];
  if (!files.length) {
    console.log('No spreadsheets visible to this service account.');
    console.log('Make sure the sheet is shared with the account email (Viewer).');
    return;
  }
  console.log(`Spreadsheets visible to the service account (${files.length}):\n`);
  for (const f of files) {
    const owner = (f.owners && f.owners[0] && f.owners[0].emailAddress) || '?';
    console.log(`  • ${f.name}`);
    console.log(`      id    : ${f.id}`);
    console.log(`      owner : ${owner}   modified: ${f.modifiedTime}`);
  }
}

// ── Describe the Sheet (introspection, writes nothing) ────────────────────--
async function describeSheet() {
  const auth = makeAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const title = meta.data.properties && meta.data.properties.title;
  const tabs = (meta.data.sheets || []).map(s => s.properties.title);
  console.log('Spreadsheet:', title);
  console.log(`Tabs (${tabs.length}):`, tabs.join(' | '));
  for (const tab of tabs) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${tab}!A1:Z6`
    });
    const rows = res.data.values || [];
    console.log(`\n[${tab}] first ${rows.length} row(s):`);
    rows.forEach((r, i) => console.log(`  ${i}: ${JSON.stringify(r)}`));
  }
}

// ── Read the Sheet ────────────────────────────────────────────────────────--
async function readSheet() {
  const auth = makeAuth(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  // Which tabs actually exist? (so we can skip not-yet-created ones silently)
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = new Set((meta.data.sheets || []).map(s => s.properties.title));

  const priceLists = {};
  const summary = [];
  for (const src of ACTIVE_SOURCES) {
    if (!existing.has(src.tab)) { summary.push({ tab: src.tab, skipped: true }); continue; }
    let rows = [];
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: `${src.tab}!A:Z`
      });
      rows = res.data.values || [];
    } catch (e) {
      const msg = (e && e.errors && e.errors[0] && e.errors[0].message) || e.message || String(e);
      summary.push({ tab: src.tab, error: msg });
      continue;
    }
    const header = rows[0] || [];
    const headerRows = src.headerRows === undefined ? 1 : src.headerRows;
    for (const block of src.blocks) {
      const items = [];
      for (let i = headerRows; i < rows.length; i++) {
        const r = rows[i] || [];
        const name = (r[block.name] || '').trim();
        if (!name) continue;                   // skip blank cells
        if (name.toLowerCase() === 'none') continue; // sheet's own None row (app adds its own)
        const item = { n: name, p: 0, r: parseMoney(r[block.price]) };
        // Optional per-flower color options (comma-separated cell). Only when
        // a colors column is configured for this block (set after the sheet's
        // Colors column is added). Empty → no colors (picker stays optional).
        if (block.colors != null) {
          const colors = String(r[block.colors] || '').split(',').map(s => s.trim()).filter(Boolean);
          if (colors.length) item.colors = colors;
        }
        items.push(item);
      }
      const finalItems = block.splitColor ? aggregateColors(items) : items;
      if (!priceLists[block.target]) priceLists[block.target] = [];
      priceLists[block.target].push(...finalItems);
      summary.push({
        tab: src.tab,
        blockName: (header[block.name] || '').trim() || '(block)',
        target: block.target,
        count: finalItems.length,
        marketCount: finalItems.filter(i => i.r == null).length,
        sample: finalItems.slice(0, 3)
      });
    }
  }
  // ── Seasonal pass (PRICE SHEETS layout only) ──────────────────────────────
  const seasonalWarnings = [];
  if (LAYOUT === 'priceSheets') {
    const today = chicagoToday();
    for (const src of SEASONAL_SOURCES) {
      if (!existing.has(src.tab)) { summary.push({ tab: src.tab, skipped: true }); continue; }
      let rows = [];
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${src.tab}!A:Z` });
        rows = res.data.values || [];
      } catch (e) {
        const msg = (e && e.errors && e.errors[0] && e.errors[0].message) || e.message || String(e);
        summary.push({ tab: src.tab, error: msg });
        continue;
      }
      const header = rows[0] || [];
      for (const block of src.blocks) {
        const items = [];
        for (let i = 1; i < rows.length; i++) {   // seasonal tabs always have a header row
          const r = rows[i] || [];
          const name = (r[block.name] || '').trim();
          if (!name || name.toLowerCase() === 'none') continue;
          const item = { n: name, p: 0, r: parseMoney(r[block.price]), seasonal: true };
          if (block.colors != null) {
            const colors = String(r[block.colors] || '').split(',').map(s => s.trim()).filter(Boolean);
            if (colors.length) item.colors = colors;
          }
          const parsed = parseSheetDate(r[block.exp]);
          if (parsed === undefined) {
            seasonalWarnings.push(`${src.tab} row ${i + 1} ("${name}"): unreadable Expiration "${String(r[block.exp]).trim()}" — kept with no expiry`);
          } else if (parsed) {
            item.availableUntil = parsed;
            if (parsed < today) { item.r = null; item.expired = true; }   // past → market ("ask")
          }
          items.push(item);
        }
        if (!priceLists[block.target]) priceLists[block.target] = [];
        priceLists[block.target].push(...items);
        summary.push({
          tab: src.tab,
          blockName: (header[block.name] || '').trim() || '(block)',
          target: block.target,
          count: items.length,
          seasonal: true,
          expiredCount: items.filter(i => i.expired).length,
          marketCount: items.filter(i => i.r == null).length,
          sample: items.slice(0, 3)
        });
      }
    }
    // Collision: a seasonal row wins over a same-named permanent item in the same
    // list (it reflects the current market reality). Drop the permanent duplicate.
    for (const key of Object.keys(priceLists)) {
      const list = priceLists[key];
      const seasonalNames = new Set(list.filter(i => i.seasonal).map(i => unormName(i.n)));
      if (!seasonalNames.size) continue;
      const before = list.length;
      priceLists[key] = list.filter(i => i.seasonal || !seasonalNames.has(unormName(i.n)));
      const dropped = before - priceLists[key].length;
      if (dropped) seasonalWarnings.push(`${key}: ${dropped} permanent item(s) overridden by a same-named seasonal entry`);
    }
  }

  return { priceLists, summary, seasonalWarnings };
}

// ── Write to Firestore (only with --write) ────────────────────────────────--
async function writeFirestore(priceLists) {
  const admin = require('firebase-admin');
  const init = KEYFILE
    ? { credential: admin.credential.cert(require(path.resolve(KEYFILE))) }
    : { credential: admin.credential.applicationDefault() };
  if (TARGET_PROJECT) init.projectId = TARGET_PROJECT;
  admin.initializeApp(init);
  const db = admin.firestore();
  const projectId = (admin.app().options.projectId) || TARGET_PROJECT || '(from credential)';

  const ref = db.collection('settings').doc(SETTINGS_DOC);

  // Diff against what's currently stored so the app can flag what changed.
  const snap = await ref.get();
  const prev = (snap.exists && snap.data().priceLists) || {};
  const changes = diffPriceLists(prev, priceLists);

  console.log(`\n>>> WRITING priceLists to Firestore project: ${projectId}`);
  console.log('    doc: settings/' + SETTINGS_DOC);
  if (changes.length) {
    console.log(`    ${changes.length} change(s) vs current:`);
    changes.slice(0, 25).forEach(c => {
      const label = c.type === 'added' ? `added @ $${c.to}` : c.type === 'removed' ? `removed (was $${c.from})` : `$${c.from} → $${c.to}`;
      console.log(`      · [${c.cat}] ${c.name}: ${label}`);
    });
    if (changes.length > 25) console.log(`      … +${changes.length - 25} more`);
  } else {
    console.log('    no price changes vs current.');
  }

  await ref.set({
    priceLists,
    pricingSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    pricingSync: { at: new Date().toISOString(), changedCount: changes.length, changes: changes.slice(0, 200) }
  }, { merge: true });
  console.log('Write complete.');
}

function priceOf(item) { return (item.r !== null && item.r !== undefined) ? item.r : null; }
function diffPriceLists(prev, next) {
  const changes = [];
  for (const cat of Object.keys(next)) {
    const prevMap = {}; (prev[cat] || []).forEach(it => { prevMap[(it.n || '').trim()] = priceOf(it); });
    const nextMap = {}; (next[cat] || []).forEach(it => { nextMap[(it.n || '').trim()] = priceOf(it); });
    for (const name of Object.keys(nextMap)) {
      if (!(name in prevMap)) changes.push({ cat, name, type: 'added', from: null, to: nextMap[name] });
      else if (prevMap[name] !== nextMap[name]) changes.push({ cat, name, type: 'changed', from: prevMap[name], to: nextMap[name] });
    }
    for (const name of Object.keys(prevMap)) {
      if (!(name in nextMap)) changes.push({ cat, name, type: 'removed', from: prevMap[name], to: null });
    }
  }
  return changes;
}

// ── Main ─────────────────────────────────────────────────────────────────--
(async () => {
  console.log('Sheet → Firestore pricing sync');
  console.log('  sheet id     :', SHEET_ID);
  console.log('  credential   :', KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || '(ADC)');
  console.log('  mode         :', DO_LIST ? 'LIST (read only)' : DO_DESCRIBE ? 'DESCRIBE (read only)' : (DO_WRITE ? 'WRITE' : 'DRY RUN (read only)'));
  console.log('');

  if (DO_LIST) {
    try {
      await listSpreadsheets();
    } catch (e) {
      console.error('\nFailed to list spreadsheets:', e.message || e);
      console.error('If this says the Drive API is disabled, enable it on the');
      console.error('freytags-florist-analytics project, or just send me the sheet URL.');
      process.exit(1);
    }
    return;
  }

  if (DO_DESCRIBE) {
    try {
      await describeSheet();
    } catch (e) {
      console.error('\nFailed to read the Sheet:', e.message || e);
      process.exit(1);
    }
    return;
  }

  let result;
  try {
    result = await readSheet();
  } catch (e) {
    console.error('\nFailed to read the Sheet:', e.message || e);
    console.error('Checklist: (1) Sheet shared with the service-account email,');
    console.error('           (2) Google Sheets API enabled on its GCP project,');
    console.error('           (3) tab names match', Object.keys(TAB_TO_KEY).join(', '));
    process.exit(1);
  }

  // Print summary
  let errors = 0;
  const catTotals = {};
  const skipped = [];
  for (const s of result.summary) {
    if (s.skipped) { skipped.push(s.tab); continue; }
    if (s.error) { errors++; console.log(`  [${s.tab}]  ERROR: ${s.error}`); continue; }
    catTotals[s.target] = (catTotals[s.target] || 0) + s.count;
    const tags = [];
    if (s.marketCount) tags.push(`${s.marketCount} market-priced`);
    if (s.seasonal && s.expiredCount) tags.push(`${s.expiredCount} expired → ask`);
    console.log(`  ${s.seasonal ? '⌛ ' : ''}[${s.tab} › ${s.blockName}]  ${s.count} items → ${s.target}` + (tags.length ? `  (${tags.join(', ')})` : ''));
    for (const it of s.sample) {
      console.log(`       · ${it.n}${it.r != null ? ` — $${it.r}` : ' — market price'}`);
    }
  }
  console.log('\n  Category totals (synced):');
  for (const k of Object.keys(catTotals)) console.log(`    ${k.padEnd(12)} ${catTotals[k]}`);
  if (skipped.length) console.log('  Tabs not in sheet yet (skipped, category kept as-is):', skipped.join(', '));
  console.log('  Never synced (app-managed):', UNMANAGED_KEYS.join(', '));
  if (errors) console.log(`  ${errors} tab error(s).`);
  if (result.seasonalWarnings && result.seasonalWarnings.length) {
    console.log(`\n  ⚠ Seasonal rows needing attention (${result.seasonalWarnings.length}):`);
    result.seasonalWarnings.forEach(w => console.log(`    · ${w}`));
  }

  // Always write a local preview for inspection (no cloud writes).
  const previewPath = path.join(__dirname, 'pricing-preview.json');
  fs.writeFileSync(previewPath, JSON.stringify(result.priceLists, null, 2));
  console.log('  preview written:', previewPath);

  if (!DO_WRITE) {
    console.log('\nDry run only — nothing written to Firestore.');
    console.log('When the numbers look right, write with:');
    console.log('  node sync-pricing.js --write --project=<projectId> --yes');
    return;
  }

  if (errors) {
    console.error('\nRefusing to write: some tabs failed to read (see errors above).');
    process.exit(1);
  }
  if (!TARGET_PROJECT) {
    console.error('\n--write requires --project=<projectId> so the target is explicit.');
    process.exit(1);
  }
  if (!CONFIRMED) {
    console.error(`\n--write to "${TARGET_PROJECT}" requires --yes to confirm. Aborting.`);
    process.exit(1);
  }
  await writeFirestore(result.priceLists);
})();
