'use strict';
// Lock out staging Recipe app: DISABLE all Auth users except a keep-list, so
// nobody logs into the test site by mistake now that prod is live. Reversible
// (disabled users can be re-enabled anytime). Dry-run unless --apply.
const admin = require('firebase-admin');
const key = require('C:/Keys/claude-llm-access.json');
admin.initializeApp({ credential: admin.credential.cert(key), projectId: 'freytags-recipes-staging' });
const KEEP = ['chad@freytags.com'];             // stays active for future testing
const APPLY = process.argv.includes('--apply');
(async () => {
  const auth = admin.auth();
  let res = await auth.listUsers(1000);
  const users = res.users;
  console.log(`Staging Auth users (${users.length}):`);
  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    const keep = KEEP.includes(email);
    console.log(`  ${keep ? 'KEEP  ' : (u.disabled ? 'already-off' : 'DISABLE')}  ${u.email || u.uid}  (disabled=${u.disabled})`);
    if (APPLY && !keep && !u.disabled) {
      await auth.updateUser(u.uid, { disabled: true });
    }
  }
  console.log(APPLY ? '\nAPPLIED: non-keep users disabled.' : '\nDRY RUN — re-run with --apply to disable. KEEP list: ' + KEEP.join(', '));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
