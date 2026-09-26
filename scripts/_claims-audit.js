'use strict';
// Read-only: which prod users carry a recipe role, and is their `active` claim true?
// Also: users docs that list a recipeGuideRole the claims don't have (fallback-only).
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('C:/Keys/freytags-service-account.json')), projectId: 'freytags-purchasing' });
(async () => {
  const claimsByUid = {};
  let tok; const rows = [];
  do { const r = await admin.auth().listUsers(1000, tok); r.users.forEach(u => { claimsByUid[u.uid] = u.customClaims || {}; if ((u.customClaims || {}).recipeGuideRole) rows.push({ role: u.customClaims.recipeGuideRole, active: u.customClaims.active, verified: u.emailVerified, provider: (u.providerData[0] || {}).providerId }); }); tok = r.pageToken; } while (tok);
  console.log('recipe-role users:', rows.length);
  console.log('  active!==true:', rows.filter(r => r.active !== true).length);
  console.log('  by provider/verified:', JSON.stringify(rows.reduce((a, r) => { const k = r.provider + '/' + (r.verified ? 'verified' : 'unverified'); a[k] = (a[k] || 0) + 1; return a; }, {})));
  const docs = await admin.firestore().collection('users').get();
  let fallbackOnly = 0; docs.forEach(d => { const x = d.data() || {}; if (x.recipeGuideRole && (claimsByUid[d.id] || {}).recipeGuideRole !== x.recipeGuideRole) fallbackOnly++; });
  console.log('users docs whose recipeGuideRole differs from claims:', fallbackOnly);
  const inv = await admin.firestore().collection('recipeInvites').get();
  console.log('pending invites:', inv.size);
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
