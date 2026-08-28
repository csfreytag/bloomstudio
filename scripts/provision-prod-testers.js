'use strict';
// Provision the four Recipe Guide testers on PRODUCTION, mirroring the app's own
// admin functions (applyRecipeRole / createRecipeUser / inviteRecipeUser).
//   - Email/password designers: create with a generated password + designer role.
//   - Google users: grant now if they've signed in, else store a pending invite
//     that auto-applies on first sign-in.
// Dry-run by default; --write to execute. Uses prod's own Auth SA.
const admin = require('firebase-admin');
const crypto = require('crypto');
const KEY = require('C:\\Keys\\freytags-service-account.json');
const WRITE = process.argv.includes('--write');
admin.initializeApp({ credential: admin.credential.cert(KEY), projectId: 'freytags-purchasing' });
const auth = admin.auth();
const db = admin.firestore();
const FV = admin.firestore.FieldValue;

const EMAIL_PW = [
  { email: 'ellen@recip.com', role: 'designer', name: 'Ellen' },
  { email: 'chrysta@recip.com', role: 'designer', name: 'Chrysta' }
];
const GOOGLE = [
  { email: 'rain@freytags.com', role: 'designer', name: 'Rain' },
  { email: 'imelda@freytags.com', role: 'manager', name: 'Imelda Reyna' }
];

async function applyRole(user, role) {
  if (!WRITE) return;
  const claims = Object.assign({}, user.customClaims || {}, { active: true, recipeGuideRole: role });
  await auth.setCustomUserClaims(user.uid, claims);
  await db.collection('users').doc(user.uid).set({
    email: user.email || '', displayName: user.displayName || '',
    recipeGuideRole: role, active: true, updatedAt: FV.serverTimestamp()
  }, { merge: true });
}

(async () => {
  const out = [];
  for (const t of EMAIL_PW) {
    let u = null; try { u = await auth.getUserByEmail(t.email); } catch (e) {}
    if (u) { await applyRole(u, t.role); out.push(`${t.email} — already existed; role set to ${t.role}`); continue; }
    const pw = 'recipes-' + crypto.randomBytes(3).toString('hex');
    if (WRITE) { u = await auth.createUser({ email: t.email, password: pw, displayName: t.name, emailVerified: false }); await applyRole(u, t.role); }
    out.push(`${t.email} — ${WRITE ? 'CREATED' : 'would create'} (designer)  PASSWORD: ${pw}`);
  }
  for (const t of GOOGLE) {
    let u = null; try { u = await auth.getUserByEmail(t.email); } catch (e) {}
    if (u) { await applyRole(u, t.role); out.push(`${t.email} — account exists; ${WRITE ? 'granted' : 'would grant'} ${t.role}`); continue; }
    if (WRITE) await db.collection('recipeInvites').doc(t.email).set({ email: t.email, role: t.role, invitedBy: 'migration (chad@freytags.com)', invitedAt: FV.serverTimestamp() });
    out.push(`${t.email} — ${WRITE ? 'INVITED' : 'would invite'} as ${t.role} (auto-applies on first Google sign-in)`);
  }
  console.log((WRITE ? '=== PROVISIONED ===' : '=== DRY RUN (no changes) ===') + '\n' + out.join('\n'));
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
