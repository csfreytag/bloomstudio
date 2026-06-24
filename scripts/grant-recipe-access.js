#!/usr/bin/env node
/* ============================================================================
 * grant-recipe-access.js — provision a Recipe Guide user on PRODUCTION
 *
 * The production project (freytags-purchasing) is shared with the Purchasing
 * app, and its security rules read roles from CUSTOM AUTH CLAIMS
 * (request.auth.token.active / .recipeGuideRole). This script:
 *
 *   1. Sets the custom claims { active:true, recipeGuideRole:<role> } on the
 *      user's auth token  — MERGED with any existing claims, so a person who
 *      is also (say) a Purchasing buyer keeps their purchasingRole untouched.
 *   2. Mirrors the role into users/{uid} (the app reads this for its own UI).
 *
 * The user must already exist in Firebase Auth — i.e. they've signed in once
 * (Google or email/password). Identify them by --uid or --email.
 *
 * Uses the Admin SDK (bypasses security rules). Run with the claude-llm-access
 * service-account key, which has Firebase Authentication Admin on this project.
 *
 * Usage:
 *   node grant-recipe-access.js --email=chad@freytags.com --role=admin \
 *     --project=freytags-purchasing --keyfile=C:\Keys\claude-llm-access.json
 *   node grant-recipe-access.js --uid=<authUid> --role=manager --project=... --keyfile=...
 *
 * After running, the user signs out and back in (or reloads) to pick up the
 * new claim. The app also force-refreshes the token on load.
 * ========================================================================== */

'use strict';
const path = require('path');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
function opt(name, def) {
  const hit = args.find(a => a.startsWith('--' + name + '='));
  return hit ? hit.split('=').slice(1).join('=') : def;
}

const uidArg = opt('uid');
const emailArg = opt('email', '');
const name = opt('name', '');
const role = opt('role');
const project = opt('project');
const keyfile = opt('keyfile');

const VALID_ROLES = ['admin', 'manager', 'designer'];
if ((!uidArg && !emailArg) || !role || !project) {
  console.error('Required: --role and --project, plus --uid OR --email. Usually --keyfile too.');
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
  // Resolve the auth user (must have signed in at least once).
  let user;
  try {
    user = uidArg
      ? await admin.auth().getUser(uidArg)
      : await admin.auth().getUserByEmail(emailArg);
  } catch (e) {
    console.error(`Could not find that user in Auth (${uidArg || emailArg}).`);
    console.error('They must sign in to the app once before you can grant access.');
    process.exit(1);
  }
  const uid = user.uid;
  const email = emailArg || user.email || '';

  // MERGE claims so we never wipe a Purchasing claim on a shared user.
  const existing = user.customClaims || {};
  const claims = Object.assign({}, existing, { active: true, recipeGuideRole: role });
  await admin.auth().setCustomUserClaims(uid, claims);

  // Mirror into users/{uid} — the app reads role from here for its UI gating.
  const ref = admin.firestore().collection('users').doc(uid);
  const exists = (await ref.get()).exists;
  await ref.set({
    email,
    displayName: name || user.displayName || '',
    recipeGuideRole: role,
    active: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...(exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() })
  }, { merge: true });

  console.log(`Granted recipeGuideRole=${role} to ${email} (uid ${uid}) in ${project}.`);
  console.log('Custom claims now:', JSON.stringify(claims));
  if (existing.purchasingRole) {
    console.log(`(Preserved existing purchasingRole=${existing.purchasingRole}.)`);
  }
  console.log('They must sign out and back in (or reload) to pick up the new claim.');
  process.exit(0);
})().catch(e => { console.error('Failed:', e.message || e); process.exit(1); });
