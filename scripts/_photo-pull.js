'use strict';
// Pull each imported recipe's photo from the retail site (name → /flowers/<slug>/
// → og:image), fetch a web-sized copy via the imgix CDN, embed as a data URI,
// and write ONLY the recipe's `photo` field on staging. Idempotent; misses are
// left untouched and reported. No other fields are modified.
const admin = require('firebase-admin');
const KEY = 'C:\\Keys\\claude-llm-access.json';
const BASE = 'https://www.freytagsflorist.com/flowers/';
const IMGIX = 'https://freytagsflorist.imgix.net';
const IMG_PARAMS = '?w=900&fm=jpg&q=70&fit=max';
const slugify = s => String(s).toLowerCase().trim()
  .replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function findPhoto(name) {
  const res = await fetch(BASE + slugify(name) + '/', { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (res.redirected || !/\/flowers\//.test(res.url)) return null;
  const html = await res.text();
  const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  return (og && /itemVariation/.test(og)) ? og : null;
}
async function fetchDataUri(ogUrl) {
  const path = new URL(ogUrl).pathname;                 // /images/itemVariation/<file>.jpg
  const res = await fetch(IMGIX + path + IMG_PARAMS, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('img ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  return { uri: 'data:image/jpeg;base64,' + buf.toString('base64'), kb: Math.round(buf.length / 1024) };
}

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)), projectId: 'freytags-recipes-staging' });
  const db = admin.firestore();
  const snap = await db.collection('recipes').get();
  const recs = [];
  snap.forEach(d => { const r = d.data(); if (r.importedFrom) recs.push({ id: d.id, name: r.name, tab: (r.importedFrom || '').split('/').pop() }); });
  console.log(`Pulling photos for ${recs.length} imported recipes...\n`);

  const matched = [], missed = [];
  const POOL = 5;
  for (let i = 0; i < recs.length; i += POOL) {
    await Promise.all(recs.slice(i, i + POOL).map(async x => {
      try {
        const og = await findPhoto(x.name);
        if (!og) { missed.push(x); return; }
        const { uri, kb } = await fetchDataUri(og);
        await db.collection('recipes').doc(x.id).update({ photo: uri, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        matched.push({ ...x, kb });
      } catch (e) { missed.push({ ...x, error: e.message }); }
    }));
    process.stdout.write(`  ${Math.min(i + POOL, recs.length)}/${recs.length}\r`);
  }

  const avg = matched.length ? Math.round(matched.reduce((s, m) => s + m.kb, 0) / matched.length) : 0;
  console.log(`\n\n=== DONE: ${matched.length} photos embedded, ${missed.length} without a website match (avg ${avg} KB) ===\n`);
  const byTab = {};
  for (const m of missed) { (byTab[m.tab] = byTab[m.tab] || []).push(m.name); }
  console.log('No website photo (need a manual photo):');
  for (const tab of Object.keys(byTab)) console.log(`  ${tab} (${byTab[tab].length}): ${byTab[tab].join(' | ')}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
