'use strict';
// For each recipe, find items described in column I that have NO column-G entry
// (the ones the import skipped), and list them under the recipe as an "Also in
// this arrangement" note. Surgical: touches ONLY the `notes` field. Idempotent
// (rewrites its own block). --write to apply; otherwise report-only.
// Also prints the full missing-items list for the team.
const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const KEY = 'C:\\Keys\\claude-llm-access.json';
const SHEET = '1bhPOKRkqVmAtyIxim61Y9LBX4udiDr2z4bnc0Su2PZY';
const TABS = ['VASE ARRANGEMENTS', 'ROSES', 'FUNERAL ARRANGEMENTS', 'PROM', 'LTO CATALOG', 'PLANT ITEMS'];
const WRITE = process.argv.includes('--write');
const MARK = '\n———\nAlso in this arrangement (from the recipe sheet, not separately priced):\n';
const HEADERS = new Set(['form', 'forms', 'greenery', 'greens', 'flowers', 'accents', 'plants', 'containers/vases', 'containers', 'labor', 'sku', 'sympathy forms/hardgoods', 'hardgoods']);
const hk = s => String(s).toLowerCase().replace(/:$/, '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: 'C:/Keys/claude-llm-access.json', scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const bySku = {};           // sku -> { name, tab, items:[cleaned strings] }
  for (const tab of TABS) {
    const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET, range: `${tab}!A1:M6000` })).data.values || [];
    let sku = null, name = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const a = (r[0] || '').trim(), g = (r[6] || '').trim(), iRaw = (r[8] || '').trim();
      if (a === 'SKU') { const nx = rows[i + 1] || []; sku = (nx[0] || '').trim(); name = ''; continue; }
      if (a && a !== sku && !/^\$/.test(a) && !HEADERS.has(hk(a)) && !name) name = a;
      if (!sku) continue;
      if (!/^\s*\d+\s*-/.test(iRaw)) continue;                       // only "N- description" lines
      const gIsItem = g && g.toLowerCase() !== 'none' && !HEADERS.has(hk(g));
      if (gIsItem) continue;                                          // has a column-G item → already imported
      const m = iRaw.match(/^\s*(\d+)\s*-\s*(.+?)\s*$/);
      const item = m ? { qty: +m[1], name: m[2] } : { qty: 1, name: iRaw };
      (bySku[sku] = bySku[sku] || { name, tab, items: [] }).items.push(item);
      if (name && !bySku[sku].name) bySku[sku].name = name;
    }
  }

  // Report
  const tabsSeen = {};
  let totalItems = 0, recipesAffected = 0;
  const lines = [];
  for (const [sku, rec] of Object.entries(bySku)) {
    recipesAffected++; totalItems += rec.items.length;
    (tabsSeen[rec.tab] = tabsSeen[rec.tab] || []).push(`  ${rec.name || '(no name)'} [${sku}]\n     - ${rec.items.map(it => it.qty + '× ' + it.name).join('\n     - ')}`);
  }
  for (const tab of TABS) { if (tabsSeen[tab]) { lines.push(`\n===== ${tab} =====`); lines.push(...tabsSeen[tab]); } }
  const report = `MISSING ITEMS (in column I, no column-G entry) — ${totalItems} items across ${recipesAffected} recipes\n` + lines.join('\n');
  console.log(report.split('\n').slice(0, 60).join('\n'));
  fs.writeFileSync('C:/Users/ChadFreytag/Downloads/recipe-missing-items.txt', report);
  console.log(`\n(full list written to Downloads/recipe-missing-items.txt)`);

  if (!WRITE) { console.log('\nREPORT ONLY — add --write to add these under each recipe as notes.'); return; }

  admin.initializeApp({ credential: admin.credential.cert(require(KEY)), projectId: 'freytags-recipes-staging' });
  const db = admin.firestore();
  const snap = await db.collection('recipes').get();
  const skuToId = {}; snap.forEach(d => { const r = d.data(); if (r.sku) skuToId[String(r.sku).trim()] = { id: d.id, notes: r.notes || '' }; });
  let updated = 0;
  for (const [sku, rec] of Object.entries(bySku)) {
    const hit = skuToId[sku]; if (!hit) continue;
    const base = (hit.notes || '').split(MARK)[0].trimEnd();     // remove the old notes block I added earlier
    await db.collection('recipes').doc(hit.id).update({ extras: rec.items, notes: base, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    updated++;
  }
  console.log(`\nSet "Also included" items on ${updated} recipes (moved out of notes into a visible list).`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
