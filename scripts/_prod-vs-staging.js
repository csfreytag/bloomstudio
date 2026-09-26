'use strict';
// READ-ONLY diagnostic: compare recipe data in production vs staging so we can
// decide safely whether/what to migrate. No writes.
const admin = require('firebase-admin');
const key = require('C:\\Keys\\claude-llm-access.json');
function fs(name, projectId) {
  const a = admin.initializeApp({ credential: admin.credential.cert(key), projectId }, name);
  return a.firestore();
}
(async () => {
  const targets = [['PROD', 'freytags-purchasing'], ['STAGING', 'freytags-recipes-staging']];
  for (const [label, projectId] of targets) {
    try {
      const db = fs(label, projectId);
      const snap = await db.collection('recipes').get();
      let photos = 0, paint = 0, dims = 0, importedFrom = 0, handBuilt = 0;
      const byStatus = {};
      let latest = null, latestSku = '';
      snap.forEach(d => {
        const r = d.data();
        if (r.photo) photos++;
        if ((r.flowers || []).some(f => f.paint) || (r.fillers || []).some(f => f.paint) || r.accentPaint) paint++;
        if (r.sizeH || r.sizeW || r.sizeD) dims++;
        if (r.importedFrom) importedFrom++; else handBuilt++;
        byStatus[r.status || 'none'] = (byStatus[r.status || 'none'] || 0) + 1;
        const u = r.updatedAt && r.updatedAt.toDate ? r.updatedAt.toDate() : null;
        if (u && (!latest || u > latest)) { latest = u; latestSku = r.sku || d.id; }
      });
      // usageRecords presence
      let usage = 0;
      try { usage = (await db.collection('usageRecords').limit(1).get()).size; } catch (e) {}
      console.log(`\n=== ${label} (${projectId}) ===`);
      console.log(`recipes: ${snap.size} | photos: ${photos} | withPaint: ${paint} | withDims: ${dims}`);
      console.log(`importedFrom set: ${importedFrom} | hand-built (no importedFrom): ${handBuilt}`);
      console.log(`status:`, JSON.stringify(byStatus));
      console.log(`latest updatedAt: ${latest ? latest.toISOString() : 'n/a'} (${latestSku})`);
      console.log(`usageRecords collection has docs: ${usage > 0 ? 'yes' : 'no/empty'}`);
    } catch (e) {
      console.log(`\n=== ${label} (${projectId}) === ERROR: ${e.message}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
