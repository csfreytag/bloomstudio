/* ============================================================================
 * pricingCore — Google Sheet → priceLists builder for the "Sync now" function.
 *
 * MIRRORS the priceSheets layout of scripts/sync-pricing.js (SOURCES,
 * SEASONAL_SOURCES, the seasonal expiry→market rule, collision handling, and the
 * diff). If you change the tab layout or seasonal rules in one file, change BOTH.
 * (The CLI script stays the source for the nightly cron; this powers the in-app
 * "Sync now" button so a manager doesn't wait for the cron.)
 * ========================================================================== */
'use strict';

// Permanent tabs on the PRICE SHEETS workbook (0-based column indices).
const SOURCES = [
  { tab: 'FLOWERS',    blocks: [ { name: 0, colors: 1, price: 2, target: 'flowers' }, { name: 4, colors: 5, price: 6, target: 'flowers' } ] },
  { tab: 'GREENS',     blocks: [ { name: 0, price: 1, target: 'fillers' }, { name: 3, price: 4, target: 'fillers' } ] },
  { tab: 'CONTAINERS', blocks: [ { name: 0, price: 1, target: 'containers' } ] },
  { tab: 'HARDGOODS',  blocks: [ { name: 0, price: 1, target: 'hardgoods' } ] },
  { tab: 'PLANTS',     blocks: [ { name: 0, price: 1, target: 'plants' } ] },
  { tab: 'ACCENTS',    blocks: [ { name: 0, price: 1, target: 'accents' } ] }
];
// Seasonal tabs: same targets, plus a per-row Expiration column (exp).
const SEASONAL_SOURCES = [
  { tab: 'SEASONAL FLOWERS',    blocks: [ { name: 0, colors: 1, price: 2, exp: 3, target: 'flowers' } ] },
  { tab: 'SEASONAL GREENERY',   blocks: [ { name: 0, price: 1, exp: 2, target: 'fillers' }, { name: 4, price: 5, exp: 6, target: 'fillers' } ] },
  { tab: 'SEASONAL PLANTS',     blocks: [ { name: 0, price: 1, exp: 2, target: 'plants' } ] },
  { tab: 'SEASONAL CONTAINERS', blocks: [ { name: 0, price: 1, exp: 2, target: 'containers' } ] },
  { tab: 'SEASONAL ACCENTS',    blocks: [ { name: 0, price: 1, exp: 2, target: 'accents' } ] },
  { tab: 'SEASONAL HARDGOODS',  blocks: [ { name: 0, price: 1, exp: 2, target: 'hardgoods' } ] }
];

function parseMoney(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[$,\s]/g, '').trim();
  if (s === '') return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function chicagoToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function parseSheetDate(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let [, mo, d, y] = m; if (y.length === 2) y = '20' + y; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  const t = Date.parse(s);
  if (!isNaN(t)) { const dt = new Date(t); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }
  return undefined;
}
function unormName(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

async function readTab(sheets, sheetId, tab) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${tab}!A:Z` });
  return res.data.values || [];
}

// Read the whole workbook (permanent + seasonal) into { priceLists, warnings }.
async function buildPriceLists(sheets, sheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existing = new Set((meta.data.sheets || []).map(s => s.properties.title));
  const priceLists = {};
  const warnings = [];

  for (const src of SOURCES) {
    if (!existing.has(src.tab)) continue;
    let rows;
    try { rows = await readTab(sheets, sheetId, src.tab); }
    catch (e) { warnings.push(`${src.tab}: ${e.message || e}`); continue; }
    const headerRows = src.headerRows === undefined ? 1 : src.headerRows;
    for (const block of src.blocks) {
      const items = [];
      for (let i = headerRows; i < rows.length; i++) {
        const r = rows[i] || [];
        const name = (r[block.name] || '').trim();
        if (!name || name.toLowerCase() === 'none') continue;
        const item = { n: name, p: 0, r: parseMoney(r[block.price]) };
        if (block.colors != null) {
          const colors = String(r[block.colors] || '').split(',').map(s => s.trim()).filter(Boolean);
          if (colors.length) item.colors = colors;
        }
        items.push(item);
      }
      (priceLists[block.target] || (priceLists[block.target] = [])).push(...items);
    }
  }

  const today = chicagoToday();
  for (const src of SEASONAL_SOURCES) {
    if (!existing.has(src.tab)) continue;
    let rows;
    try { rows = await readTab(sheets, sheetId, src.tab); }
    catch (e) { warnings.push(`${src.tab}: ${e.message || e}`); continue; }
    for (const block of src.blocks) {
      const items = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const name = (r[block.name] || '').trim();
        if (!name || name.toLowerCase() === 'none') continue;
        const item = { n: name, p: 0, r: parseMoney(r[block.price]), seasonal: true };
        if (block.colors != null) {
          const colors = String(r[block.colors] || '').split(',').map(s => s.trim()).filter(Boolean);
          if (colors.length) item.colors = colors;
        }
        const parsed = parseSheetDate(r[block.exp]);
        if (parsed === undefined) warnings.push(`${src.tab} row ${i + 1} ("${name}"): unreadable Expiration — kept with no expiry`);
        else if (parsed) { item.availableUntil = parsed; if (parsed < today) { item.r = null; item.expired = true; } }
        items.push(item);
      }
      (priceLists[block.target] || (priceLists[block.target] = [])).push(...items);
    }
  }

  // A seasonal row wins over a same-named permanent item in the same list.
  for (const key of Object.keys(priceLists)) {
    const list = priceLists[key];
    const seasonalNames = new Set(list.filter(i => i.seasonal).map(i => unormName(i.n)));
    if (!seasonalNames.size) continue;
    priceLists[key] = list.filter(i => i.seasonal || !seasonalNames.has(unormName(i.n)));
  }

  return { priceLists, warnings };
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

module.exports = { SHEET_ID: '1OEhdT3brIBNhE65GNtzzarQqPSMVN1HZVPjjjdHssYc', buildPriceLists, diffPriceLists };
