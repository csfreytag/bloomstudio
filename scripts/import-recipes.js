#!/usr/bin/env node
/* ============================================================================
 * import-recipes.js — import arrangements from the PRODUCT SPREADSHEET into
 * the Recipe Guide (Firestore `recipes`).
 *
 * The sheet lays each arrangement out as a vertical BLOCK:
 *   header row:  SKU | Price | Projection | Count | cost/per | Cost Total | Containers/Vases
 *   +1 row:      <SKU> | <$Price> | <Proj> | 1 | ... | <container name> ...
 *   +2 row:      | <$calc> | ... | Greenery                (category sub-header)
 *   +3 row:      <Recipe Name> | ... | <greenery item> ...
 *   ...items, then "Flowers", "Accents" sub-headers with their items,
 *   ending in a "Labor" row, then blank rows before the next block.
 *
 * Ingredient categories map to app fields: Containers/Vases→container (single),
 * Greenery→fillers[], Flowers→flowers[] (color split off "Name - Color"),
 * Accents→accent (single; extras noted), Form→hardgood, Plants→plants[].
 *
 * Ingredient names are matched (case/space-insensitive) against the app's
 * current price lists (settings/recipeGuide) so they line up with the app's
 * dropdowns. Unmatched names are kept verbatim and listed in a report.
 *
 * Recipe price = the sheet's Price, stored as adjPrice (fixed) so it shows
 * exactly regardless of ingredient matching. Photos import blank.
 *
 * Usage (dry-run):
 *   node import-recipes.js --sheet=<id> --tab="VASE ARRANGEMENTS" \
 *     --project=<proj> --keyfile=<path>
 * Add --write --yes to actually write. Default is CREATE-ONLY (skips any SKU
 * already in the app). Add --refresh to also OVERWRITE prior imports in place
 * (same id, keeps any attached photo). HAND-BUILT recipes (no importedFrom tag)
 * are NEVER touched, in either mode.
 * ========================================================================== */
'use strict';
const path = require('path');
const admin = require('firebase-admin');
const { google } = require('googleapis');

const args = process.argv.slice(2);
const opt = (n, d) => { const h = args.find(a => a.startsWith('--' + n + '=')); return h ? h.split('=').slice(1).join('=') : d; };
const flag = n => args.includes('--' + n);
const SHEET = opt('sheet'), TAB = opt('tab'), PROJECT = opt('project'), KEYFILE = opt('keyfile');
const STATUS = opt('status', 'active');
const DO_WRITE = flag('write'), CONFIRMED = flag('yes'), REFRESH = flag('refresh');
if (!SHEET || !TAB || !PROJECT || !KEYFILE) { console.error('Required: --sheet, --tab, --project, --keyfile'); process.exit(1); }

const CATEGORIES = ['containers/vases', 'greenery', 'flowers', 'accents', 'form', 'plants', 'labor'];
// Section-header text (col G) → internal category. Tolerates the variants seen
// across tabs: trailing colon ("Accents:"), spaces around the slash, plurals,
// and the funeral "Sympathy Forms / Hardgoods" wording.
const headerKey = s => String(s).toLowerCase().replace(/:$/, '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
const CAT_HEADERS = new Map([
  ['containers/vases', 'containers/vases'], ['containers', 'containers/vases'],
  ['greenery', 'greenery'], ['greens', 'greenery'],
  ['flowers', 'flowers'],
  ['accents', 'accents'],
  ['form', 'form'], ['forms', 'form'], ['hardgoods', 'form'],
  ['sympathy forms/hardgoods', 'form'], ['forms/hardgoods', 'form'],
  ['plants', 'plants'],
  ['labor', 'labor']
]);
const money = v => { if (v == null) return null; const s = String(v).replace(/[$,\s]/g, ''); const n = parseFloat(s); return isNaN(n) ? null : n; };
// Match key. Normalizations are ADDITIVE — both the price-list name and the
// recipe name pass through this, so they only make more things line up, never
// break a match that already works: drop quote/inch marks (5" = 5”), collapse
// "5 x 8" / "5×8" → "5x8", abbreviate Large → Lg (the price sheet does), and
// treat dashes as spaces so "Hydrangea - Large Green" meets "Hydrangea Lg Green".
const norm = s => String(s == null ? '' : s).toLowerCase()
  .replace(/[“”‘’"']/g, '')
  .replace(/(\d)\s*[x×]\s*(\d)/g, '$1x$2')
  .replace(/\blarge\b/g, 'lg')
  .replace(/[-–]/g, ' ')
  .replace(/\s+/g, ' ').trim();

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(KEYFILE))), projectId: PROJECT });
  const db = admin.firestore();

  // Load the app's current price lists for name matching.
  const s = await db.collection('settings').doc('recipeGuide').get();
  const pl = (s.data() || {}).priceLists || {};
  const idx = {};
  for (const k of ['flowers', 'fillers', 'containers', 'accents', 'hardgoods', 'plants']) {
    idx[k] = new Map((pl[k] || []).map(it => [norm(it.n), it.n]));
  }
  // Match a name to a list; returns the canonical app name or null.
  const match = (list, name) => idx[list].get(norm(name)) || null;
  // Flowers: exact, else strip trailing " - Color" and retry.
  function matchFlower(raw) {
    const n = String(raw).trim();
    if (match('flowers', n)) return { name: match('flowers', n), color: '' };
    const i = n.lastIndexOf(' - ');
    if (i > 0) { const p = n.slice(0, i).trim(), c = n.slice(i + 3).trim(); if (match('flowers', p)) return { name: match('flowers', p), color: c }; }
    return null;
  }

  // Read the tab.
  const auth = new google.auth.GoogleAuth({ keyFile: path.resolve(KEYFILE), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET, range: `${TAB}!A1:M6000` })).data.values || [];

  // Split into blocks at each header row.
  const headerAt = i => (rows[i] || [])[0] === 'SKU' && /containers|form/i.test((rows[i] || [])[6] || '');
  const blocks = [];
  for (let i = 0; i < rows.length; i++) {
    if (headerAt(i)) { const start = i + 1; let j = start; while (j < rows.length && !headerAt(j)) j++; blocks.push(rows.slice(start, j)); i = j - 1; }
  }

  // Discrepancy tracking: category → (unmatched name → set of "Recipe [SKU]" using it)
  const unmatched = { flowers: new Map(), fillers: new Map(), containers: new Map(), accents: new Map(), plants: new Map(), hardgoods: new Map() };
  const note = (cat, nm, who) => { if (!unmatched[cat].has(nm)) unmatched[cat].set(nm, new Set()); unmatched[cat].get(nm).add(who); };
  const recipes = [];
  for (const b of blocks) {
    const col0 = b.map(r => (r[0] || '').trim()).filter(Boolean);
    const sku = col0[0] || '';
    const name = col0[1] || '';
    if (!sku && !name) continue;
    const who = `${name || '(no name)'} [${sku || 'no sku'}]`;
    const skuRow = b.find(r => (r[0] || '').trim()) || [];
    const price = money(skuRow[1]);
    const projection = money(skuRow[2]);
    let cat = 'containers/vases';
    const rec = { sku, name, price, projection, container: 'None', accent: 'None', hardgood: 'None', flowers: [], fillers: [], plants: [], accentExtras: [], hardgoodExtras: [] };
    for (const r of b) {
      const c6 = (r[6] || '').trim();
      if (!c6) continue;
      const hk = headerKey(c6);
      if (CAT_HEADERS.has(hk)) { cat = CAT_HEADERS.get(hk); continue; }
      if (cat === 'labor') continue;
      if (c6.toLowerCase() === 'none') continue;
      const qty = parseFloat(r[3]) || 0;
      if (cat === 'containers/vases') {
        const m = match('containers', c6);
        if (m) rec.container = m;
        else { const h = match('hardgoods', c6); if (h) { if (rec.hardgood === 'None') rec.hardgood = h; else rec.hardgoodExtras.push(h); } else { note('containers', c6, who); rec.container = c6; } }
      }
      else if (cat === 'greenery') { const m = match('fillers', c6); if (!m) note('fillers', c6, who); rec.fillers.push({ name: m || c6, qty: qty || 1 }); }
      else if (cat === 'flowers') { const mf = matchFlower(c6); if (!mf) { note('flowers', c6, who); rec.flowers.push({ name: c6, qty: qty || 1 }); } else { const o = { name: mf.name, qty: qty || 1 }; if (mf.color) o.color = mf.color; rec.flowers.push(o); } }
      else if (cat === 'accents') { const m = match('accents', c6); if (!m) note('accents', c6, who); if (rec.accent === 'None') rec.accent = m || c6; else rec.accentExtras.push(m || c6); }
      else if (cat === 'form') { const m = match('hardgoods', c6); if (!m) note('hardgoods', c6, who); if (rec.hardgood === 'None') rec.hardgood = m || c6; else rec.hardgoodExtras.push(m || c6); }
      else if (cat === 'plants') { const m = match('plants', c6); if (!m) note('plants', c6, who); rec.plants.push({ name: m || c6, qty: qty || 1 }); }
    }
    recipes.push(rec);
  }

  console.log(`Parsed ${recipes.length} recipe(s) from "${TAB}".\n`);
  recipes.forEach(r => {
    console.log(`• ${r.name || '(no name)'} [${r.sku}] $${r.price} · container: ${r.container} · ${r.flowers.length} flower(s), ${r.fillers.length} greenery${r.plants.length ? ', ' + r.plants.length + ' plant(s)' : ''}${r.accent !== 'None' ? ' · accent: ' + r.accent : ''}${r.accentExtras.length ? ' (+' + r.accentExtras.join(', ') + ')' : ''}`);
  });
  console.log('\n=== DISCREPANCY REPORT — names not in PRICE SHEETS (fix manually in the app) ===');
  let anyDisc = false;
  for (const [cat, label] of [['flowers', 'flowers'], ['fillers', 'greenery'], ['containers', 'containers'], ['accents', 'accents'], ['plants', 'plants'], ['hardgoods', 'hardgoods']]) {
    const m = unmatched[cat];
    if (!m.size) continue;
    anyDisc = true;
    console.log(`\n  ${label} (${m.size}):`);
    for (const [nm, recs] of m) console.log(`     · "${nm}"  — ${[...recs].join(', ')}`);
  }
  if (!anyDisc) console.log('  (none — every ingredient matched PRICE SHEETS)');

  // Classify against what's already in the app. HAND-BUILT recipes (no
  // importedFrom tag) are NEVER touched. Prior imports (importedFrom set) can be
  // refreshed in place with --refresh — keeps the same id and any attached photo.
  const existing = await db.collection('recipes').get();
  let maxId = 0; const bySku = new Map();
  existing.forEach(d => {
    const data = d.data() || {}; const n = Number(d.id); if (!isNaN(n)) maxId = Math.max(maxId, n);
    if (data.sku) bySku.set(String(data.sku).trim(), { id: d.id, imported: !!data.importedFrom, photo: data.photo || null, name: data.name, sizeH: data.sizeH || '', sizeW: data.sizeW || '', sizeD: data.sizeD || '', extras: data.extras || [], tags: data.tags || [] });
  });
  const plan = { create: [], refresh: [], protect: [] };
  for (const r of recipes) {
    const hit = r.sku ? bySku.get(r.sku.trim()) : null;
    if (!hit) plan.create.push(r);
    else if (hit.imported && REFRESH) plan.refresh.push([r, hit]);
    else plan.protect.push([r, hit]);           // hand-built, or a prior import when --refresh is off
  }
  const handBuilt = plan.protect.filter(([, h]) => !h.imported);
  const priorImports = plan.protect.filter(([, h]) => h.imported);
  console.log(`\nWrite plan (${REFRESH ? 'REFRESH mode' : 'create-only'}): ${plan.create.length} new, ${plan.refresh.length} refreshed, ${plan.protect.length} untouched.`);
  if (handBuilt.length) console.log('  Protected (hand-built — never overwritten): ' + handBuilt.map(([, h]) => `${h.name} [${h.id}]`).join(' | '));
  if (priorImports.length) console.log(`  Prior imports skipped (add --refresh to update): ${priorImports.length}`);

  if (!DO_WRITE) { console.log('\nDRY RUN — nothing written. Add --write --yes (and --refresh to update prior imports).'); return; }
  if (!CONFIRMED) { console.log('\nAdd --yes to confirm the write.'); return; }

  // keep = existing doc data on a refresh (preserve photo, dimensions, "Also
  // included" extras, tags); null on a create.
  const writeRec = (docId, r, keep) => {
    const noteParts = [];
    if (r.accentExtras.length) noteParts.push('Additional accents: ' + r.accentExtras.join(', '));
    if (r.hardgoodExtras.length) noteParts.push('Additional hardgoods: ' + r.hardgoodExtras.join(', '));
    const notes = noteParts.join(' · ');
    return db.collection('recipes').doc(docId).set({
      sku: r.sku, name: r.name || '(unnamed)', status: STATUS,
      calcPrice: 0, adjPrice: (r.price && r.price > 0) ? r.price : null,
      projection: r.projection || null,
      container: r.container, accent: r.accent, hardgood: r.hardgood,
      flowers: r.flowers, fillers: r.fillers, plants: r.plants,
      laborPct: 13, photo: (keep && keep.photo) || null, tags: (keep && keep.tags) || [], notes,
      extras: (keep && keep.extras) || [],
      sizeH: keep ? keep.sizeH : '', sizeW: keep ? keep.sizeW : '', sizeD: keep ? keep.sizeD : '',
      webItem: false, approvalNote: '', archived: false,
      importedFrom: 'PRODUCT SPREADSHEET/' + TAB,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  };
  let nextId = maxId + 1, created = 0, refreshed = 0;
  for (const r of plan.create) { await writeRec(String(nextId++), r, null); created++; }
  for (const [r, hit] of plan.refresh) { await writeRec(hit.id, r, hit); refreshed++; }   // keep id + photo/size/extras
  console.log(`\nWrite complete: ${created} created, ${refreshed} refreshed, ${plan.protect.length} untouched, in ${PROJECT}.`);
}
main().catch(e => { console.error('ERROR:', e.message || e); process.exit(1); });
