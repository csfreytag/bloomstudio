'use strict';
// READ-ONLY: confirm prod has recipes + priceLists so the migrated recipes and
// the paint/Log dropdowns work.
const admin = require('firebase-admin');
const key = require('C:\\Keys\\claude-llm-access.json');
const db = admin.initializeApp({ credential: admin.credential.cert(key), projectId: 'freytags-purchasing' }).firestore();
(async () => {
  const recs = await db.collection('recipes').get();
  const migrated = recs.docs.filter(d => (d.data() || {}).migratedFrom === 'staging').length;
  const s = (await db.collection('settings').doc('recipeGuide').get()).data() || {};
  const pl = s.priceLists || {};
  const sizes = Object.keys(pl).reduce((o, k) => (o[k] = (pl[k] || []).length, o), {});
  const paints = (pl.hardgoods || []).filter(h => /^paint\s+\S/i.test(h.n)).length;
  const tags = (await db.collection('tags').doc('all').get()).data();
  console.log('PROD recipes:', recs.size, '| migrated-from-staging:', migrated);
  console.log('PROD priceList sizes:', JSON.stringify(sizes));
  console.log('PROD paint shades in hardgoods:', paints);
  console.log('PROD tags:', tags && tags.list ? tags.list.length : 0);
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
