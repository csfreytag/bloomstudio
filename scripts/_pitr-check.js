'use strict';
// READ-ONLY: check PITR + backup posture on the shared prod Firestore.
const { google } = require('googleapis');
const KEY = 'C:\\Keys\\freytags-service-account.json';
const PROJECT = 'freytags-purchasing';
(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const db = await client.request({ url: `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)` });
  console.log('pointInTimeRecoveryEnablement:', db.data.pointInTimeRecoveryEnablement);
  console.log('deleteProtectionState       :', db.data.deleteProtectionState);
  try {
    const sch = await client.request({ url: `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/backupSchedules` });
    const list = sch.data.backupSchedules || [];
    console.log('backupSchedules             :', list.length);
    list.forEach(s => console.log('   -', s.name.split('/').pop(), 'retention', s.retention, s.dailyRecurrence ? 'daily' : (s.weeklyRecurrence ? 'weekly' : '?')));
  } catch (e) { console.log('backupSchedules: could not read (', (e.response && e.response.data && e.response.data.error && e.response.data.error.message) || e.message, ')'); }
})().catch(e => { console.error('ERR', e.response ? JSON.stringify(e.response.data) : e.message); process.exit(1); });
