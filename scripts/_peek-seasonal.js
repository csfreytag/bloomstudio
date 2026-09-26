const { google } = require('googleapis');
const SHEET_ID = '1OEhdT3brIBNhE65GNtzzarQqPSMVN1HZVPjjjdHssYc';
const auth = new google.auth.GoogleAuth({
  keyFile: 'C:\\Keys\\claude-llm-access.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
(async () => {
  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const tabs = meta.data.sheets.map(s => s.properties.title);
  console.log('ALL TABS:\n  ' + tabs.join('\n  '));
  const seasonal = tabs.filter(t => /seasonal/i.test(t));
  console.log('\nSEASONAL TABS FOUND:', seasonal.length);
  for (const t of seasonal) {
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `'${t}'!A1:J6`,
    });
    console.log(`\n===== ${t} =====`);
    (r.data.values || [['(empty)']]).forEach((row, i) => console.log(`  row${i + 1}:`, JSON.stringify(row)));
  }
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
