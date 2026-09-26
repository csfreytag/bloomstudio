'use strict';
// Recover photos for recipes that still have none, using the site's internal
// product search by EXACT SKU (floristProductSearch.cfm?keyword=<sku>), which
// carries variant SKUs the retail export lacks. Extracts the product's
// itemVariation image, resizes via imgix, embeds on staging. Report-only unless
// --write. Only touches imported recipes that currently have no photo.
const admin = require('firebase-admin');
const KEY = 'C:\\Keys\\claude-llm-access.json';
const SEARCH = 'https://www.freytagsflorist.com/floristProductSearch.cfm?keyword=';
const IMGIX = 'https://freytagsflorist.imgix.net';
const PARAMS = '?w=900&fm=jpg&q=70&fit=max';
const WRITE = process.argv.includes('--write');
const UA = { 'User-Agent': 'Mozilla/5.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findImage(sku) {
  const r = await fetch(SEARCH + encodeURIComponent(sku), { headers: UA });
  const h = await r.text();
  if (/could find no products/i.test(h)) return null;
  const m = h.match(/itemVariation\/([^"'?\s>]+\.(?:jpg|jpeg|png))/i);
  return m ? m[1] : null;
}
async function toDataUri(file) {
  const r = await fetch(IMGIX + '/images/itemVariation/' + file + PARAMS, { headers: UA });
  if (!r.ok) throw new Error('img ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return { uri: 'data:image/jpeg;base64,' + buf.toString('base64'), kb: Math.round(buf.length / 1024) };
}

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)), projectId: 'freytags-recipes-staging' });
  const db = admin.firestore();
  const snap = await db.collection('recipes').get();
  const targets = [];
  snap.forEach(d => { const r = d.data(); const has = typeof r.photo === 'string' && r.photo.startsWith('data:'); if (r.importedFrom && r.sku && !has) targets.push({ id: d.id, sku: String(r.sku).trim(), name: r.name, tab: (r.importedFrom || '').split('/').pop() }); });
  console.log(`Recipes still without a photo: ${targets.length}\n`);

  const found = [], still = [];
  const POOL = 4;
  for (let i = 0; i < targets.length; i += POOL) {
    await Promise.all(targets.slice(i, i + POOL).map(async t => {
      try {
        let file = await findImage(t.sku);
        if (!file) { still.push(t); return; }
        if (WRITE) { const { uri } = await toDataUri(file); await db.collection('recipes').doc(t.id).update({ photo: uri, updatedAt: admin.firestore.FieldValue.serverTimestamp() }); }
        found.push({ ...t, file });
      } catch (e) { still.push({ ...t, error: e.message }); }
    }));
    await sleep(300);
    process.stdout.write(`  ${Math.min(i + POOL, targets.length)}/${targets.length}\r`);
  }

  console.log(`\n\n${WRITE ? 'EMBEDDED' : 'WOULD RECOVER'}: ${found.length} · still missing: ${still.length}\n`);
  console.log('Sample recovered (sku → image file):');
  found.slice(0, 12).forEach(f => console.log(`  ${f.name} [${f.sku}] → ${f.file.slice(0, 44)}`));
  const byTab = {}; for (const s of still) (byTab[s.tab] = byTab[s.tab] || []).push(s.name + ' [' + s.sku + ']');
  console.log('\nStill no photo, by tab:');
  for (const t of Object.keys(byTab)) console.log(`  ${t} (${byTab[t].length}): ${byTab[t].join(' | ')}`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
