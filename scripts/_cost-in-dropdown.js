'use strict';
// Read-only: price-list items whose dropdown label would show vendor COST (no retail, cost>0).
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('C:/Keys/freytags-service-account.json')), projectId: 'freytags-purchasing' });
(async () => {
  const d = (await admin.firestore().doc('settings/recipeGuide').get()).data() || {};
  const pl = d.priceLists || {};
  for (const [k, list] of Object.entries(pl)) {
    const hits = (list || []).filter(i => !(i.r > 0) && i.p > 0);
    console.log(k.padEnd(11), (list || []).length, 'items;', hits.length, 'show cost', hits.slice(0, 5).map(i => i.n + ' p=' + i.p + ' r=' + i.r).join(' | '));
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
