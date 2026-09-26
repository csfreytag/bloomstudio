'use strict';
// Pull arrangement dimensions from the site's internal recipe detail page
// (internal search by SKU → /productRecipe.cfm?varID=N → "Approximate size:
// H tall x W wide x D depth") and write ONLY sizeH/sizeW/sizeD on staging.
// Report-only unless --write. Only touches imported recipes.
const admin = require('firebase-admin');
const KEY = 'C:\\Keys\\claude-llm-access.json';
const SEARCH = 'https://www.freytagsflorist.com/floristProductSearch.cfm?keyword=';
const SITE = 'https://www.freytagsflorist.com';
const WRITE = process.argv.includes('--write');
const UA = { 'User-Agent': 'Mozilla/5.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseDims(html) {
  const full = html.replace(/&quot;|&#34;/g, '"').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const ai = full.search(/approx/i);
  const seg = ai > -1 ? full.slice(ai, ai + 160) : full;
  // Grab a value by the dimension WORD, order-agnostic (handles "H tall x W wide
  // x D depth", "D long x W wide x H tall", etc.)
  const grab = kw => { const m = seg.match(new RegExp('(\\d{1,3}(?:\\.\\d)?)\\s*(?:in\\.?|"|”|inch(?:es)?)?\\s*(?:' + kw + ')\\b', 'i')); return m ? m[1] : ''; };
  let H = grab('tall|high') , W = grab('wide') , D = grab('depth|deep|long');
  if (!H && !W) { // retail "H" h x W" w"
    const m = seg.match(/(\d{1,3}(?:\.\d)?)\s*(?:"|”|in\.?)\s*h\s*x\s*(\d{1,3}(?:\.\d)?)\s*(?:"|”|in\.?)\s*w(?:\s*x\s*(\d{1,3}(?:\.\d)?)\s*(?:"|”|in\.?)\s*d)?/i);
    if (m) { H = m[1]; W = m[2]; D = m[3] || ''; }
  }
  return (H && W) ? { H, W, D } : null;   // require both H & W; avoids stray-number partials
}
async function getDims(sku) {
  const r = await fetch(SEARCH + encodeURIComponent(sku), { headers: UA });
  const h = await r.text();
  const link = (h.match(/\/productRecipe\.cfm\?varID=\d+/i) || [])[0];
  if (!link) return null;
  const pr = await fetch(SITE + link, { headers: UA });
  return parseDims(await pr.text());
}

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)), projectId: 'freytags-recipes-staging' });
  const db = admin.firestore();
  const snap = await db.collection('recipes').get();
  const recs = [];
  snap.forEach(d => { const r = d.data(); if (r.importedFrom && r.sku && !r.sizeH) recs.push({ id: d.id, sku: String(r.sku).trim(), name: (r.name || '').replace(/\s+/g, ' '), tab: (r.importedFrom || '').split('/').pop() }); });
  console.log(`Fetching dimensions for ${recs.length} recipes...\n`);

  const got = [], none = [];
  const POOL = 4;
  for (let i = 0; i < recs.length; i += POOL) {
    await Promise.all(recs.slice(i, i + POOL).map(async t => {
      try {
        const d = await getDims(t.sku);
        if (!d) { none.push(t); return; }
        if (WRITE) await db.collection('recipes').doc(t.id).update({ sizeH: d.H, sizeW: d.W, sizeD: d.D, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        got.push({ ...t, d });
      } catch (e) { none.push({ ...t, error: e.message }); }
    }));
    await sleep(300);
    process.stdout.write(`  ${Math.min(i + POOL, recs.length)}/${recs.length}\r`);
  }
  console.log(`\n\n${WRITE ? 'WROTE' : 'WOULD WRITE'} dimensions: ${got.length} · no size found: ${none.length}\n`);
  console.log('Sample:'); got.slice(0, 10).forEach(g => console.log(`  ${g.name} [${g.sku}] → ${g.d.H}H x ${g.d.W}W${g.d.D ? ' x ' + g.d.D + 'D' : ''}`));
  const byTab = {}; for (const n of none) (byTab[n.tab] = byTab[n.tab] || []).push(n.sku);
  console.log('\nNo size, by tab:'); for (const t of Object.keys(byTab)) console.log(`  ${t} (${byTab[t].length})`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
