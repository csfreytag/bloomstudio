'use strict';
// Build the "fix in the recipe sheet" list: every column-I item that has no
// column-G dropdown entry, grouped by recipe, flagged by whether the item
// already exists somewhere in the price sheet. READ-ONLY.
const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const KEY = 'C:\\Keys\\claude-llm-access.json';
const SHEET = '1bhPOKRkqVmAtyIxim61Y9LBX4udiDr2z4bnc0Su2PZY';
const TABS = ['VASE ARRANGEMENTS', 'FUNERAL ARRANGEMENTS', 'LTO CATALOG', 'PROM', 'ROSES'];  // plants held for the big pass
const HEADERS = new Set(['form', 'forms', 'greenery', 'greens', 'flowers', 'accents', 'plants', 'containers/vases', 'containers', 'labor', 'sku', 'sympathy forms/hardgoods', 'hardgoods']);
const hk = s => String(s).toLowerCase().replace(/:$/, '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
// Weak tokens that shouldn't drive a suggestion (colors, sizes, descriptors) —
// so "Green Aspidistra Leaves" matches on "aspidistra", not "green".
const STOP = new Set(['green', 'blue', 'white', 'pink', 'red', 'purple', 'yellow', 'orange', 'lavender', 'light', 'dark', 'fresh', 'leaves', 'leaf', 'stem', 'stems', 'tall', 'short', 'large', 'small', 'mini', 'med', 'medium', 'painted', 'with', 'and', 'the']);
const toks4 = s => new Set(norm(s).split(' ').filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.replace(/s$/, '')));
const CATLABEL = { flowers: 'Cut Flowers', fillers: 'Greenery', containers: 'Containers', accents: 'Accents', hardgoods: 'Hardgoods', plants: 'Plants' };

(async () => {
  admin.initializeApp({ credential: admin.credential.cert(require(KEY)), projectId: 'freytags-recipes-staging' });
  const pl = (await admin.firestore().collection('settings').doc('recipeGuide').get()).data().priceLists || {};
  const exact = {}, tokenIndex = [];
  for (const cat of Object.keys(pl)) {
    exact[cat] = new Set((pl[cat] || []).map(i => norm(i.n)));
    for (const it of (pl[cat] || [])) tokenIndex.push({ cat, name: it.n, toks: toks4(it.n) });
  }
  function lookup(nm) {
    const n = norm(nm);
    for (const cat of Object.keys(exact)) if (exact[cat].has(n)) return { status: 'in', cat };
    const toks = toks4(nm);
    let best = null, bestN = 0;
    for (const e of tokenIndex) { let c = 0; for (const t of toks) if (e.toks.has(t)) c++; if (c > bestN) { bestN = c; best = e; } }
    if (best && bestN >= 1) return { status: 'maybe', cat: best.cat, suggest: best.name };
    return { status: 'no' };
  }

  const auth = new google.auth.GoogleAuth({ keyFile: 'C:/Keys/claude-llm-access.json', scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  const byRecipe = []; const notInSheet = [];
  for (const tab of TABS) {
    const rows = (await sheets.spreadsheets.values.get({ spreadsheetId: SHEET, range: `${tab}!A1:M6000` })).data.values || [];
    let sku = null, name = '', cur = null;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const a = (r[0] || '').trim(), g = (r[6] || '').trim(), iRaw = (r[8] || '').trim();
      if (a === 'SKU') { sku = ((rows[i + 1] || [])[0] || '').trim(); name = ''; cur = null; continue; }
      if (a && a !== sku && !/^\$/.test(a) && !HEADERS.has(hk(a)) && !name) name = a;
      if (!/^\s*\d+\s*-/.test(iRaw)) continue;
      const gIsItem = g && g.toLowerCase() !== 'none' && !HEADERS.has(hk(g));
      if (gIsItem) continue;
      const item = iRaw.replace(/^\s*\d+\s*-\s*/, '').trim();
      const res = lookup(item);
      if (!cur) { cur = { name: name || '(no name)', sku, tab, items: [] }; byRecipe.push(cur); }
      cur.items.push({ item, status: res.status, target: res.suggest || '', cat: res.cat ? CATLABEL[res.cat] : '' });
      if (res.status === 'no') notInSheet.push(`${item} — ${cur.name} [${sku}]`);
    }
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const uniqueNo = [...new Set(byRecipe.flatMap(r => r.items.filter(i => i.status === 'no').map(i => i.item)))];
  const catGuess = it => /urn|easel|cross|saddle|cage|wreath|heart|rosary|foam|lid piece/i.test(it) ? 'Sympathy Forms/Hardgoods'
    : /ivy|fern|eucalyptus|willow|ruscus|grass|aspidistra|salal|lemon leaf|greenery/i.test(it) ? 'Greenery'
    : /mushroom|lotus|moss|rock|sand|feather|driftwood|pearl|glitter|berr|pine cone|bell cup|palm fan/i.test(it) ? 'Accents'
    : 'Cut Flowers';
  const recipesHtml = byRecipe.map(r => `<div class="rec"><h3>${esc(r.name)} <span class="sku">${esc(r.sku)}</span></h3><ul>${r.items.map(it =>
    it.status === 'no'
      ? `<li class="no"><span class="mk">✗</span><span><b>${esc(it.item)}</b> — not in the price sheet; add it or leave unpriced</span></li>`
      : `<li class="ok"><span class="mk">→</span><span><b>${esc(it.item)}</b> &nbsp;set column&nbsp;G to <span class="t">${esc(it.target || it.item)}</span>${it.status === 'maybe' ? ' <span class="q">(confirm)</span>' : ''}</span></li>`
  ).join('')}</ul></div>`).join('\n');
  const html = `<title>Recipe Sheet — Funeral Column G</title><style>
    body{font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#1b221b;line-height:1.55;max-width:760px;margin:0 auto;padding:40px 26px}
    h1{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-size:30px;margin:0 0 4px}
    .dek{color:#5c6858;margin:6px 0 18px}
    .brief{background:#f5f7f1;border:1px solid #e1e6d9;border-left:4px solid #3b6b4a;border-radius:8px;padding:14px 18px;margin:0 0 22px}
    .flag{background:#f5ead9;border:1px solid #ecd9b8;border-left:4px solid #9a6015;border-radius:8px;padding:12px 18px;margin:0 0 24px}
    .flag b{color:#9a6015}
    h2{font-family:'Iowan Old Style',Palatino,Georgia,serif;font-size:20px;margin:26px 0 8px}
    .rec{border:1px solid #e1e6d9;border-radius:8px;padding:10px 16px;margin:10px 0;break-inside:avoid}
    .rec h3{font-size:15px;margin:2px 0 6px}
    .sku{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:#5c6858;font-weight:400}
    ul{list-style:none;margin:0;padding:0}
    li{display:flex;gap:9px;padding:5px 0;border-bottom:.5px solid #eef1e9;font-size:14px}
    li:last-child{border-bottom:0}
    .mk{font-weight:700;min-width:14px}
    li.ok .mk{color:#3b6b4a}li.no .mk{color:#9a6015}
    .t{font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#3b6b4a}
    .q{color:#9a6015;font-size:12px}
    ol{padding-left:20px}ol li{display:list-item;border:0}
    footer{margin-top:28px;padding-top:14px;border-top:1px solid #e1e6d9;color:#5c6858;font-size:13px}
    @media print{.rec,.brief,.flag{break-inside:avoid}}
  </style>
  <h1>Recipe Sheet — Funeral Cleanup</h1>
  <p class="dek">${byRecipe.length} funeral recipes have ingredients written in column I but not yet selected in column G. Nothing's broken — they show under "Also included" and totals are correct — this just makes them proper, filterable ingredients.</p>
  <div class="brief"><b>How to work this:</b> do <b>Step 1</b> once (add ${uniqueNo.length} items to the price sheet), then <b>Step 2</b> — go recipe by recipe and pick the matching dropdown in <b>column G</b>. Each Step 2 line shows the exact item to select.</div>
  <h2>Step 1 — Add these ${uniqueNo.length} to the price sheet</h2>
  <p class="dek" style="margin-top:0">Not in the price list at all. Add each to the tab shown (leave the price at 0 if you're unsure — we'll sort it later), or skip it and it'll still show under "Also included."</p>
  <ul class="add">${uniqueNo.map(it => `<li class="no"><span class="mk">☐</span><span><b>${esc(it)}</b> <span class="t">→ add to ${catGuess(it)}</span></span></li>`).join('')}</ul>
  <h2>Step 2 — Fill in column G <span style="font-size:14px;color:#5c6858;font-weight:400;">(${byRecipe.length} recipes)</span></h2>
  ${recipesHtml}
  <footer>All on the staging (test) app. ${byRecipe.length} recipes. Column G only — the price sheet doesn't need changes except the few flagged above.</footer>`;
  fs.writeFileSync('C:/Users/ChadFreytag/Downloads/recipe-funeral-columnG.html', html);
  console.log(`Recipes: ${byRecipe.length} | not-in-sheet items: ${uniqueNo.length}`);
  console.log('HTML written to Downloads/recipe-funeral-columnG.html');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
