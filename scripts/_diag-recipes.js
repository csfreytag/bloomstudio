'use strict';
const admin = require('firebase-admin');
const { google } = require('googleapis');
const SHEET = '1bhPOKRkqVmAtyIxim61Y9LBX4udiDr2z4bnc0Su2PZY';
const SKUS = ['FFE2621', 'FFE2624', 'FFE2615', 'FFE2619', 'FFE2626', 'FFE2625', 'FFE2620', 'FFE2623'];

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: 'C:/Keys/claude-llm-access.json', scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET, range: `VASE ARRANGEMENTS!A1:M6000` })).data.values || [];

  admin.initializeApp({ credential: admin.credential.cert(require('C:/Keys/claude-llm-access.json')), projectId: 'freytags-recipes-staging' });
  const snap = await admin.firestore().collection('recipes').get();
  const app = {}; snap.forEach(d => { const r = d.data(); if (r.sku) app[String(r.sku).trim()] = r; });

  for (const sku of SKUS) {
    let start = -1; for (let i = 0; i < rows.length; i++) { if (((rows[i] || [])[0] || '').trim() === sku) { start = i; break; } }
    console.log('\n════════ ' + sku + ' ════════');
    if (start < 0) { console.log('  (not found in sheet)'); }
    else {
      let s = start; while (s > 0 && (rows[s] || [])[0] !== 'SKU') s--;
      let e = s + 1; while (e < rows.length && (rows[e] || [])[0] !== 'SKU') e++;
      console.log('  --- SHEET (col A | D=qty | G=item | I=desc) ---');
      for (let i = s; i < e; i++) { const r = rows[i] || []; const a = (r[0] || '').trim(), d = (r[3] || '').trim(), g = (r[6] || '').trim(), ic = (r[8] || '').trim(); if (a || g || ic) console.log('    A:' + (a || '·') + '  D:' + (d || '') + '  G:' + (g || '·') + '  I:' + (ic || '')); }
    }
    const r = app[sku];
    console.log('  --- APP ---');
    if (!r) console.log('    (not in app)');
    else console.log('    container: ' + r.container + ' | accent: ' + r.accent + '\n    flowers: ' + JSON.stringify((r.flowers || []).map(f => f.name + (f.color ? '/' + f.color : ''))) + '\n    fillers: ' + JSON.stringify((r.fillers || []).map(f => f.name)) + '\n    extras: ' + JSON.stringify((r.extras || []).map(x => x.qty + '× ' + x.name)));
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
