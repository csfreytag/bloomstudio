'use strict';
// READ-ONLY. For each imported recipe, try to find its photo on the retail
// site by slugifying the name → /flowers/<slug>/. Reports matched vs not.
// No uploads, no writes anywhere.
const admin = require('firebase-admin');
const KEY = 'C:\\Keys\\claude-llm-access.json';
const BASE = 'https://www.freytagsflorist.com/flowers/';
const slugify = s => String(s).toLowerCase().trim()
  .replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function probe(name) {
  const slug = slugify(name);
  try {
    const res = await fetch(BASE + slug + '/', { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    const resolved = !res.redirected && /\/flowers\//.test(res.url);
    let photo = null;
    if (resolved) { const html = await res.text(); photo = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || null; }
    return { name, slug, matched: resolved && !!photo, photo };
  } catch (e) { return { name, slug, matched: false, error: e.message }; }
}

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)), projectId: 'freytags-recipes-staging' });
  const snap = await admin.firestore().collection('recipes').get();
  const recs = [];
  snap.forEach(d => { const r = d.data(); if (r.importedFrom) recs.push({ name: r.name, tab: (r.importedFrom || '').split('/').pop() }); });
  console.log(`Probing ${recs.length} imported recipes...\n`);

  const results = [];
  const POOL = 6;
  for (let i = 0; i < recs.length; i += POOL) {
    const batch = recs.slice(i, i + POOL);
    const r = await Promise.all(batch.map(x => probe(x.name).then(p => ({ ...p, tab: x.tab }))));
    results.push(...r);
  }

  const byTab = {};
  for (const r of results) { (byTab[r.tab] = byTab[r.tab] || { hit: 0, miss: 0, misses: [] }); if (r.matched) byTab[r.tab].hit++; else { byTab[r.tab].miss++; byTab[r.tab].misses.push(r.name); } }
  const total = results.length, hits = results.filter(r => r.matched).length;
  console.log(`=== COVERAGE: ${hits}/${total} recipes have a website photo ===\n`);
  for (const tab of Object.keys(byTab)) {
    const t = byTab[tab];
    console.log(`${tab}: ${t.hit} matched, ${t.miss} not found`);
    if (t.misses.length) console.log('   no match: ' + t.misses.slice(0, 40).join(' | ') + (t.misses.length > 40 ? ` … +${t.misses.length - 40}` : ''));
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
