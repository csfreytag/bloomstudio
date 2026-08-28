'use strict';
// Migrate Recipe Guide recipes from STAGING -> PRODUCTION (shared project).
// Dry-run by default; pass --write to commit. Skips non-active + obvious test
// junk unless --include-drafts. Copies recipes AS-IS (incl. base64 photos,
// sizes, paint, adjPrice). Item PRICES are NOT in recipe docs — prod's
// priceLists come from the one-way Sheet sync, untouched here.
const admin = require('firebase-admin');
const key = require('C:\\Keys\\claude-llm-access.json');
const WRITE = process.argv.includes('--write');
const INCLUDE_DRAFTS = process.argv.includes('--include-drafts');
function fsdb(name, projectId) {
  return admin.initializeApp({ credential: admin.credential.cert(key), projectId }, name).firestore();
}
const isJunk = r => {
  const sku = String(r.sku || '').trim().toLowerCase();
  const name = String(r.name || '').trim().toLowerCase();
  return /^test/.test(sku) || sku === 'test sku' || /^(test|untitled)\b/.test(name) || name === 'test arr';
};
(async () => {
  const stg = fsdb('stg', 'freytags-recipes-staging');
  const prod = fsdb('prod', 'freytags-purchasing');
  const snap = await stg.collection('recipes').get();
  const all = []; snap.forEach(d => { const r = d.data(); r.__id = d.id; all.push(r); });
  const kept = [], skipped = [];
  for (const r of all) {
    if (!INCLUDE_DRAFTS && r.status && r.status !== 'active') { skipped.push([r.__id, r.sku || r.name, 'status=' + r.status]); continue; }
    if (isJunk(r)) { skipped.push([r.__id, r.sku || r.name, 'looks like test data']); continue; }
    kept.push(r);
  }
  const withPhoto = kept.filter(r => r.photo).length;
  console.log(`Staging recipes: ${all.length} | to migrate: ${kept.length} (${withPhoto} with photos) | skipped: ${skipped.length}`);
  console.log('Skipped:'); skipped.forEach(s => console.log('  -', s[0], '|', s[1], '|', s[2]));
  const prodSnap = await prod.collection('recipes').get();
  console.log(`\nPROD currently has ${prodSnap.size} recipes; migration writes by doc id (adds/overwrites).`);
  if (!WRITE) { console.log('\nDRY RUN — no writes made. Re-run with --write to migrate.'); process.exit(0); }
  let n = 0;
  for (const r of kept) {
    const id = r.__id; delete r.__id;
    r.migratedFrom = 'staging';
    r.migratedAt = admin.firestore.FieldValue.serverTimestamp();
    await prod.collection('recipes').doc(String(id)).set(r);
    n++; if (n % 50 === 0) console.log('  written', n);
  }
  console.log(`\nDONE — migrated ${n} recipes to production.`);
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
