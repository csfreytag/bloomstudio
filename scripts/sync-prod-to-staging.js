'use strict';
// Make STAGING's Recipe data an exact copy of PRODUCTION's, so staging is a
// true test bed. Reads prod (read-only), writes ONLY the staging project.
//
//   node scripts/sync-prod-to-staging.js            # dry run: shows the diff
//   node scripts/sync-prod-to-staging.js --apply    # do it
//
// Copied (prod → staging, replacing staging's copy):
//   recipes/*, usageRecords/*   — staging-only docs are deleted
//   tags/all, settings/recipeGuide (price lists), tags/recipeSettings if present
// NOT touched: staging users / roles / changeLogs (staging's own logins).
// Take a backup first: node scripts/backup-firestore.js --env=staging --out=...
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');

const prodApp = admin.initializeApp({ credential: admin.credential.cert(require('C:/Keys/freytags-service-account.json')), projectId: 'freytags-purchasing' }, 'prod');
const stgApp = admin.initializeApp({ credential: admin.credential.cert(require('C:/Keys/claude-llm-access.json')), projectId: 'freytags-recipes-staging' }, 'stg');
if (stgApp.options.projectId !== 'freytags-recipes-staging') throw new Error('refusing: write target is not the staging project');
const prod = prodApp.firestore(), stg = stgApp.firestore();

const COLLECTIONS = ['recipes', 'usageRecords'];
const DOCS = ['tags/all', 'settings/recipeGuide', 'tags/recipeSettings'];

const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);

(async () => {
  const w = APPLY ? stg.bulkWriter() : null;
  let writes = 0, deletes = 0;
  for (const c of COLLECTIONS) {
    const [p, s] = await Promise.all([prod.collection(c).get(), stg.collection(c).get()]);
    const pm = new Map(p.docs.map(d => [d.id, d])), sm = new Map(s.docs.map(d => [d.id, d]));
    const add = [...pm.keys()].filter(id => !sm.has(id));
    const del = [...sm.keys()].filter(id => !pm.has(id));
    const chg = [...pm.keys()].filter(id => sm.has(id) && canon(pm.get(id).data()) !== canon(sm.get(id).data()));
    console.log(`${c}: prod ${p.size}, staging ${s.size} → add ${add.length}, update ${chg.length}, delete ${del.length}`);
    const show = (lbl, ids, src) => ids.slice(0, 12).forEach(id => { const x = src.get(id).data() || {}; console.log(`   ${lbl} ${id}  ${x.sku || x.orderNumber || ''} ${x.name || x.baseRecipeName || ''}`.trimEnd()); });
    show('+', add, pm); show('~', chg, pm); show('-', del, sm);
    if (APPLY) {
      for (const id of [...add, ...chg]) { w.set(stg.collection(c).doc(id), pm.get(id).data()); writes++; }
      for (const id of del) { w.delete(stg.collection(c).doc(id)); deletes++; }
    }
  }
  for (const path of DOCS) {
    const [p, s] = await Promise.all([prod.doc(path).get(), stg.doc(path).get()]);
    const same = p.exists === s.exists && (!p.exists || canon(p.data()) === canon(s.data()));
    console.log(`${path}: ${!p.exists ? 'not in prod (left as is)' : same ? 'same' : 'differs → copy'}`);
    if (APPLY && p.exists && !same) { w.set(stg.doc(path), p.data()); writes++; }
  }
  if (APPLY) { await w.close(); console.log(`\nAPPLIED to staging: ${writes} writes, ${deletes} deletes.`); }
  else console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
