'use strict';
// Match recipes to the product export by SKU, pull each photo (resized via the
// imgix CDN), and embed it on staging (photo field only). Report-only unless
// --write is passed. Hand-built recipes are never touched (only imported SKUs).
const XLSX = require('xlsx');
const admin = require('firebase-admin');
const KEY = 'C:\\Keys\\claude-llm-access.json';
const XLS = 'C:/Users/ChadFreytag/Downloads/zaius_products-2026-08-05.xls';
const WRITE = process.argv.includes('--write');
const IMGIX = 'https://freytagsflorist.imgix.net';
const PARAMS = '?w=900&fm=jpg&q=70&fit=max';

const norm = s => String(s == null ? '' : s).trim();
function imgixUrl(u) { try { return IMGIX + new URL(u).pathname + PARAMS; } catch { return u; } }
async function toDataUri(u) {
  let res = await fetch(imgixUrl(u), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('img ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  return { uri: 'data:image/jpeg;base64,' + buf.toString('base64'), kb: Math.round(buf.length / 1024) };
}

(async () => {
  // Build SKU -> image_url from the export
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(XLS).Sheets['Sheet1'], { defval: '' });
  const cat = {};
  for (const r of rows) { const sku = norm(r.sku); if (sku) cat[sku] = { name: r.name, img: norm(r.image_url) }; }
  console.log(`Export: ${rows.length} products, ${Object.keys(cat).length} with SKU.`);

  admin.initializeApp({ credential: admin.credential.cert(require(KEY)), projectId: 'freytags-recipes-staging' });
  const db = admin.firestore();
  const snap = await db.collection('recipes').get();
  const recs = [];
  snap.forEach(d => { const r = d.data(); if (r.importedFrom && r.sku) recs.push({ id: d.id, sku: norm(r.sku), name: r.name, tab: (r.importedFrom || '').split('/').pop() }); });

  const matched = recs.filter(r => cat[r.sku] && cat[r.sku].img);
  const missed = recs.filter(r => !(cat[r.sku] && cat[r.sku].img));
  const byTab = {}; for (const r of recs) { byTab[r.tab] = byTab[r.tab] || { m: 0, t: 0 }; byTab[r.tab].t++; if (cat[r.sku] && cat[r.sku].img) byTab[r.tab].m++; }
  console.log(`\nSKU match: ${matched.length}/${recs.length} recipes have a photo in the export`);
  for (const t of Object.keys(byTab)) console.log(`  ${t}: ${byTab[t].m}/${byTab[t].t}`);
  if (missed.length) { console.log('\nNo photo in export (' + missed.length + '):'); console.log('  ' + missed.map(r => `${r.name} [${r.sku}]`).join(' | ')); }

  if (!WRITE) { console.log('\nREPORT ONLY — add --write to embed photos.'); return; }

  console.log('\nEmbedding...');
  let ok = 0, fail = 0, kbSum = 0;
  const POOL = 5;
  for (let i = 0; i < matched.length; i += POOL) {
    await Promise.all(matched.slice(i, i + POOL).map(async r => {
      try { const { uri, kb } = await toDataUri(cat[r.sku].img); await db.collection('recipes').doc(r.id).update({ photo: uri, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); ok++; kbSum += kb; }
      catch (e) { fail++; console.log('  FAIL ' + r.sku + ' ' + e.message); }
    }));
    process.stdout.write(`  ${Math.min(i + POOL, matched.length)}/${matched.length}\r`);
  }
  console.log(`\nDONE: ${ok} embedded, ${fail} failed, avg ${ok ? Math.round(kbSum / ok) : 0} KB.`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
