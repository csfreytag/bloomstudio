'use strict';
// READ-ONLY backup of Recipe Guide Firestore data to local JSON files.
//
//   node scripts/backup-firestore.js --env=staging --out=<folder>
//   node scripts/backup-firestore.js --env=prod    --out=<folder>
//
// staging  (freytags-recipes-staging, its own project): EVERY top-level
//          collection, with subcollections.
// prod     (freytags-purchasing, SHARED with the Purchasing app): only the
//          Recipe-owned collections + the one recipe settings doc — never
//          Purchasing's data.
//
// One JSON file per collection: { collection, count, docs: { <id>: data } }.
// Timestamps are written as {"__ts":"<ISO>"} so a restore can rebuild them.
// Keys are read from C:\Keys (outside the repo). Never writes to Firestore.
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const arg = k => (process.argv.find(a => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
const ENV = arg('env');
const OUT = arg('out');
if (!['staging', 'prod'].includes(ENV) || !OUT) {
  console.error('usage: node scripts/backup-firestore.js --env=staging|prod --out=<folder>');
  process.exit(1);
}
const CFG = {
  staging: { project: 'freytags-recipes-staging', key: 'C:/Keys/claude-llm-access.json' },
  prod: { project: 'freytags-purchasing', key: 'C:/Keys/freytags-service-account.json' }
}[ENV];
// Recipe-owned on the shared prod DB (see SHARED-PROD-COORDINATION.md).
const PROD_COLLECTIONS = ['recipes', 'tags', 'pricing', 'usageRecords', 'recipeInvites'];
const PROD_DOCS = ['settings/recipeGuide'];
// Shared activity log: only the Recipe app's own entries.
const PROD_QUERIES = [{ name: 'changeLogs__recipe-guide', q: d => d.collection('changeLogs').where('app', '==', 'recipe-guide') }];

admin.initializeApp({ credential: admin.credential.cert(require(CFG.key)), projectId: CFG.project });
const db = admin.firestore();

function plain(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof admin.firestore.Timestamp) return { __ts: v.toDate().toISOString() };
  if (v instanceof admin.firestore.GeoPoint) return { __geo: [v.latitude, v.longitude] };
  if (v instanceof admin.firestore.DocumentReference) return { __ref: v.path };
  if (Buffer.isBuffer(v)) return { __bytes: v.toString('base64') };
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o; }
  return v;
}

async function dumpCollection(ref, dir) {
  const snap = await ref.get();
  const docs = {};
  for (const d of snap.docs) {
    docs[d.id] = plain(d.data());
    const subs = await d.ref.listCollections();
    for (const sc of subs) await dumpCollection(sc, path.join(dir, ref.id + '__' + d.id));
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ref.id + '.json'), JSON.stringify({ collection: ref.path, count: snap.size, docs }, null, 1));
  console.log(`  ${ref.path.padEnd(28)} ${snap.size} docs`);
  return snap.size;
}

(async () => {
  const dir = path.resolve(OUT);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Backing up ${ENV} (${CFG.project}) → ${dir}`);
  const cols = ENV === 'staging' ? await db.listCollections() : PROD_COLLECTIONS.map(c => db.collection(c));
  const counts = {};
  for (const c of cols) counts[c.id] = await dumpCollection(c, dir);
  if (ENV === 'prod') {
    for (const p of PROD_DOCS) {
      const d = await db.doc(p).get();
      fs.writeFileSync(path.join(dir, p.replace('/', '__') + '.json'), JSON.stringify({ doc: p, exists: d.exists, data: plain(d.data() || null) }, null, 1));
      counts[p] = d.exists ? 1 : 0;
      console.log(`  ${p.padEnd(28)} ${d.exists ? 'saved' : 'MISSING'}`);
    }
  }
  if (ENV === 'prod') {
    for (const pq of PROD_QUERIES) {
      const snap = await pq.q(db).get();
      const docs = {}; snap.forEach(d => { docs[d.id] = plain(d.data()); });
      fs.writeFileSync(path.join(dir, pq.name + '.json'), JSON.stringify({ query: pq.name, count: snap.size, docs }, null, 1));
      counts[pq.name] = snap.size;
      console.log(`  ${pq.name.padEnd(28)} ${snap.size} docs`);
    }
  }
  fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify({ env: ENV, project: CFG.project, at: new Date().toISOString(), counts }, null, 1));
  console.log('Done.');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
