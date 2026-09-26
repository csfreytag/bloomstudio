'use strict';
// Verify the analytics SA key + Drive scope can read the Drive-backed funeral
// list (exactly what the lookupOrder function will do). READ-ONLY.
const { BigQuery } = require('@google-cloud/bigquery');
const creds = require('C:\\Keys\\claude-llm-access.json');
(async () => {
  const bq = new BigQuery({
    projectId: creds.project_id,
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/bigquery', 'https://www.googleapis.com/auth/drive.readonly']
  });
  const [rows] = await bq.query({
    query: 'SELECT COUNT(*) AS n FROM `freytags-florist-analytics.orda_analytics.v_funeral_accounts`',
    location: 'us-central1'
  });
  console.log('funeral accounts readable:', rows[0].n);
  // sample a couple to confirm format
  const [s] = await bq.query({
    query: 'SELECT sold_account FROM `freytags-florist-analytics.orda_analytics.v_funeral_accounts` LIMIT 3',
    location: 'us-central1'
  });
  console.log('sample:', s.map(r => r.sold_account).join(', '));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
