/* ============================================================================
 * Recipe Guide — Cloud Functions (user / role management)
 *
 * Codebase: "recipe-guide" (isolated). These run on the SHARED
 * freytags-purchasing project alongside the Purchasing app's functions.
 * They only ever touch the Recipe Guide role:
 *
 *   - setRecipeRole({email, role})     grant/change a recipe role for an
 *                                      existing account (e.g. a Google user
 *                                      who has signed in once)
 *   - createRecipeUser({email, password, displayName, role})
 *                                      create an Email/Password account (for
 *                                      people without an @freytags.com login)
 *                                      and grant a recipe role
 *   - removeRecipeRole({email})        revoke ONLY the recipe role; leaves the
 *                                      account and any purchasingRole intact
 *
 * Roles are independent per app: we always MERGE custom claims so a person's
 * purchasingRole (and the shared `active` flag) is never disturbed. Removing a
 * recipe role never disables the account or affects Purchasing.
 *
 * Caller must be a Recipe Guide ADMIN (checked via their recipeGuideRole claim,
 * falling back to their users/{uid} doc so this also works pre-claims).
 * ========================================================================== */

'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Match the project's existing functions region.
setGlobalOptions({ region: 'us-central1' });

const VALID_ROLES = ['admin', 'manager', 'designer'];

async function assertRecipeAdmin(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  if (auth.token && auth.token.recipeGuideRole === 'admin') return;
  // Fallback for environments where roles live in the users doc (staging).
  const snap = await db.collection('users').doc(auth.uid).get();
  if (snap.exists && (snap.data() || {}).recipeGuideRole === 'admin') return;
  throw new HttpsError('permission-denied', 'Recipe Guide admins only.');
}

function cleanEmail(e) { return String(e || '').trim().toLowerCase(); }

// Set the recipe role on both the auth claims (merged) and the users doc.
async function applyRecipeRole(user, role) {
  const existing = user.customClaims || {};
  const claims = Object.assign({}, existing, { active: true, recipeGuideRole: role });
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await db.collection('users').doc(user.uid).set({
    email: user.email || '',
    displayName: user.displayName || '',
    recipeGuideRole: role,
    active: true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

exports.setRecipeRole = onCall(async (req) => {
  await assertRecipeAdmin(req);
  const email = cleanEmail(req.data.email);
  const role = req.data.role;
  if (!email) throw new HttpsError('invalid-argument', 'An email is required.');
  if (!VALID_ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Role must be admin, manager, or designer.');
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    throw new HttpsError('not-found',
      `No account exists yet for ${email}. A Google user must sign in once first; for someone without an @freytags.com login, use "Create account" instead.`);
  }
  await applyRecipeRole(user, role);
  return { ok: true, uid: user.uid, email, role };
});

exports.createRecipeUser = onCall(async (req) => {
  await assertRecipeAdmin(req);
  const email = cleanEmail(req.data.email);
  const role = req.data.role;
  const displayName = String(req.data.displayName || '').trim();
  const password = String(req.data.password || '');
  if (!email) throw new HttpsError('invalid-argument', 'An email is required.');
  if (!VALID_ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Role must be admin, manager, or designer.');
  if (password.length < 6) throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');

  let existing = null;
  try { existing = await admin.auth().getUserByEmail(email); } catch (e) { /* expected: no user */ }
  if (existing) throw new HttpsError('already-exists',
    `An account already exists for ${email}. Use "Set role" to grant access instead.`);

  const user = await admin.auth().createUser({
    email,
    password,
    displayName: displayName || undefined,
    emailVerified: false
  });
  await applyRecipeRole(user, role);
  return { ok: true, uid: user.uid, email, role };
});

exports.removeRecipeRole = onCall(async (req) => {
  await assertRecipeAdmin(req);
  const email = cleanEmail(req.data.email);
  if (!email) throw new HttpsError('invalid-argument', 'An email is required.');
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    throw new HttpsError('not-found', `No account exists for ${email}.`);
  }
  // Strip ONLY the recipe role; keep purchasingRole and the shared `active`.
  const claims = Object.assign({}, user.customClaims || {});
  delete claims.recipeGuideRole;
  await admin.auth().setCustomUserClaims(user.uid, claims);
  await db.collection('users').doc(user.uid).set({
    recipeGuideRole: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true, uid: user.uid, email };
});

// ── Invites: pre-authorize a Google user before they've ever signed in ──────
// Pending invites live in recipeInvites/{email}; access is via these functions
// only (Admin SDK), so no extra Firestore rule is needed.

// Admin: grant now if the account already exists, otherwise store a pending
// invite that's applied automatically on the person's first sign-in.
exports.inviteRecipeUser = onCall(async (req) => {
  await assertRecipeAdmin(req);
  const email = cleanEmail(req.data.email);
  const role = req.data.role;
  if (!email) throw new HttpsError('invalid-argument', 'An email is required.');
  if (!VALID_ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Role must be admin, manager, or designer.');

  let user = null;
  try { user = await admin.auth().getUserByEmail(email); } catch (e) { /* not signed in yet */ }
  if (user) {
    await applyRecipeRole(user, role);
    return { ok: true, mode: 'granted', email, role };
  }
  await db.collection('recipeInvites').doc(email).set({
    email,
    role,
    invitedBy: (req.auth.token && req.auth.token.email) || req.auth.uid,
    invitedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, mode: 'invited', email, role };
});

// Any signed-in user: if a pending invite matches their (verified) email,
// apply the role and consume the invite. Safe — the role comes only from an
// admin-created invite for that exact email.
exports.claimRecipeInvite = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  const email = cleanEmail(req.auth.token && req.auth.token.email);
  if (!email) return { role: null };
  const ref = db.collection('recipeInvites').doc(email);
  const snap = await ref.get();
  if (!snap.exists) return { role: null };
  const role = (snap.data() || {}).role;
  if (!VALID_ROLES.includes(role)) { await ref.delete(); return { role: null }; }
  const user = await admin.auth().getUser(req.auth.uid);
  await applyRecipeRole(user, role);
  await ref.delete();
  return { role };
});

// Admin: list / revoke pending invites.
exports.listRecipeInvites = onCall(async (req) => {
  await assertRecipeAdmin(req);
  const snap = await db.collection('recipeInvites').get();
  const invites = [];
  snap.forEach(d => { const x = d.data() || {}; invites.push({ email: x.email || d.id, role: x.role }); });
  return { invites };
});

exports.revokeRecipeInvite = onCall(async (req) => {
  await assertRecipeAdmin(req);
  const email = cleanEmail(req.data.email);
  if (!email) throw new HttpsError('invalid-argument', 'An email is required.');
  await db.collection('recipeInvites').doc(email).delete();
  return { ok: true, email };
});
