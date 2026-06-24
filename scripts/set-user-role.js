#!/usr/bin/env node
/* ============================================================================
 * set-user-role.js — create/update a Recipe Guide user record in Firestore
 *
 * Writes users/{uid} with a recipeGuideRole. Uses the admin SDK (bypasses
 * security rules), so it's how you grant the FIRST admin, and a handy way to
 * add teammates without hand-editing the Firestore console.
 *
 * Usage:
 *   node set-user-role.js --uid=<authUid> --email=<email> --name="<display>" \
 *     --role=admin|manager|designer --project=<projectId> --keyfile=<path>
 * ========================================================================== */

'use strict';
const path = require('path');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
function opt(name, def) {
  const hit = args.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const uid = opt('uid');
const email = opt('email', '');
const name = opt('name', '');
const role = opt('role');
const project = opt('project');
const keyfile = opt('keyfile');

const VALID_ROLES = ['admin', 'manager', 'designer'];
if (!uid || !role || !project) {
  console.error('Required: --uid, --role, --project (and usually --keyfile).');
  process.exit(1);
}
if (!VALID_ROLES.includes(role)) {
  console.error(`--role must be one of: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

const init = keyfile
  ? { credential: admin.credential.cert(require(path.resolve(keyfile))) }
  : { credential: admin.credential.applicationDefault() };
init.projectId = project;
admin.initializeApp(init);

(async () => {
  const ref = admin.firestore().collection('users').doc(uid);
  const exists = (await ref.get()).exists;
  await ref.set({
    email,
    displayName: name,
    recipeGuideRole: role,
    active: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
  }, { merge: true });
  console.log(`${exists ? 'Updated' : 'Created'} users/${uid} → recipeGuideRole: ${role} (${email}) in ${project}`);
})().catch(e => { console.error('Failed:', e.message || e); process.exit(1); });
