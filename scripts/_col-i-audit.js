'use strict';
// Audit: compare the descriptive recipe in column I ("N- name") against the
// dropdown item my import read from column G, across all recipe tabs. Flags:
//  - MISSING: column I has an item but column G is None/blank → never imported
//  - MISMAP?: column G has an item but shares no significant word with column I
// READ-ONLY. No writes.
const { google } = require('googleapis');
const SHEET = '1bhPOKRkqVmAtyIxim61Y9LBX4udiDr2z4bnc0Su2PZY';
const TABS = ['VASE ARRANGEMENTS', 'ROSES', 'FUNERAL ARRANGEMENTS', 'PROM', 'LTO CATALOG', 'PLANT ITEMS'];
const HEADERS = new Set(['form', 'forms', 'greenery', 'greens', 'flowers', 'accents', 'plants', 'containers/vases', 'containers', 'labor', 'sku', 'sympathy forms/hardgoods', 'hardgoods']);
const hk = s => String(s).toLowerCase().replace(/:$/, '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
const STOP = new Set(['the', 'and', 'with', 'stem', 'stems', 'inch', 'in', 'x', 'of', 'each', 'a', 'n', 'wilt', 'long', 'short', 'green', 'white', 'pink', 'red', 'blue', 'purple', 'yellow', 'orange', 'lavender', 'light', 'dark', 'hot', 'mini', 'large', 'small', 'med', 'medium', 'deluxe', 'standard', 'premium']);
const stem = w => w.replace(/(es|s)$/, '');
const sig = s => new Set(String(s).toLowerCase().replace(/^\s*\d+\s*-\s*/, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w)).map(stem));

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: 'C:/Keys/claude-llm-access.json', scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  let curName = '';
  const totals = {};
  for (const tab of TABS) {
    const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET, range: `${tab}!A1:M2000` })).data.values || [];
    const t = totals[tab] = { iLines: 0, missing: [], mismap: [] };
    let recName = '';
    for (const r of rows) {
      const a = (r[0] || '').trim(), g = (r[6] || '').trim(), iRaw = (r[8] || '').trim();
      if (a && a !== 'SKU' && !/^\$/.test(a) && !HEADERS.has(hk(a))) recName = a; // recipe name appears in col A
      if (!/^\s*\d+\s*-/.test(iRaw)) continue;                 // only "N- description" lines
      t.iLines++;
      const gIsItem = g && g.toLowerCase() !== 'none' && !HEADERS.has(hk(g));
      if (!gIsItem) { t.missing.push(`${recName}: ${iRaw}`); continue; }
      const gi = sig(g), ii = sig(iRaw);
      const overlap = [...ii].some(w => gi.has(w)) || [...gi].some(w => ii.has(w));
      if (!overlap && ii.size) t.mismap.push(`${recName}: I="${iRaw}"  G="${g}"`);
    }
  }
  for (const tab of TABS) {
    const t = totals[tab];
    console.log(`\n===== ${tab}: ${t.iLines} described items | ${t.missing.length} MISSING | ${t.mismap.length} possible mis-map =====`);
    if (t.missing.length) console.log(' MISSING (in column I, None in G):\n   ' + t.missing.slice(0, 30).join('\n   ') + (t.missing.length > 30 ? `\n   … +${t.missing.length - 30} more` : ''));
    if (t.mismap.length) console.log(' POSSIBLE MIS-MAP:\n   ' + t.mismap.slice(0, 25).join('\n   ') + (t.mismap.length > 25 ? `\n   … +${t.mismap.length - 25} more` : ''));
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
