'use strict';
// Copy the tag library (tags/all {list:[]}) from staging -> prod. Additive/safe.
const admin = require('firebase-admin');
const key = require('C:\\Keys\\claude-llm-access.json');
const WRITE = process.argv.includes('--write');
function fsdb(name, projectId) {
  return admin.initializeApp({ credential: admin.credential.cert(key), projectId }, name).firestore();
}
(async () => {
  const stg = fsdb('stg', 'freytags-recipes-staging');
  const prod = fsdb('prod', 'freytags-purchasing');
  const sTags = ((await stg.collection('tags').doc('all').get()).data() || {}).list || [];
  const pTags = ((await prod.collection('tags').doc('all').get()).data() || {}).list || [];
  console.log('staging tags:', sTags.length, '| prod tags (before):', pTags.length);
  console.log('staging list:', JSON.stringify(sTags));
  if (!WRITE) { console.log('\nDRY RUN — re-run with --write to copy.'); process.exit(0); }
  await prod.collection('tags').doc('all').set({ list: sTags }, { merge: true });
  console.log('\nDONE — prod tags/all now has', sTags.length, 'tags.');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
