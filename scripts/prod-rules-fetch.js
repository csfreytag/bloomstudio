'use strict';
// READ-ONLY: fetch the LIVE production Firestore ruleset source so we can add
// ONE new block (/usageRecords) without touching anything else.
const { google } = require('googleapis');
const KEY = 'C:\\Keys\\freytags-service-account.json';
const PROJECT = 'freytags-purchasing';
(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const rel = await client.request({ url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore` });
  const rulesetName = rel.data.rulesetName;
  console.log('CURRENT RELEASE rulesetName:', rulesetName);
  const rs = await client.request({ url: `https://firebaserules.googleapis.com/v1/${rulesetName}` });
  const files = rs.data.source.files || [];
  files.forEach(f => {
    console.log('\n===== FILE:', f.name, '=====');
    console.log(f.content);
  });
})().catch(e => { console.error('ERR', e.response ? JSON.stringify(e.response.data) : e.message); process.exit(1); });
