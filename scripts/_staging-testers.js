'use strict';
// READ-ONLY: list staging Recipe Guide users (the testers) to replicate on prod.
const admin = require('firebase-admin');
const key = require('C:\\Keys\\claude-llm-access.json');
const db = admin.initializeApp({ credential: admin.credential.cert(key), projectId: 'freytags-recipes-staging' }).firestore();
(async () => {
  const snap = await db.collection('users').get();
  snap.forEach(d => {
    const u = d.data() || {};
    if (u.recipeGuideRole) console.log(`${u.email} | role=${u.recipeGuideRole} | name="${u.displayName || ''}" | active=${u.active !== false}`);
  });
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
