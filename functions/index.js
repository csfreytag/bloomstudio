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
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Match the project's existing functions region.
setGlobalOptions({ region: 'us-central1' });

// Service-account key (JSON) with read access to the Orda BigQuery datasets in
// freytags-florist-analytics. Stored in Secret Manager; set with:
//   firebase functions:secrets:set ORDA_SA_KEY
const ORDA_SA_KEY = defineSecret('ORDA_SA_KEY');

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

// Any Recipe Guide user (Designers included) — for read-only order lookups.
async function assertRecipeUser(req) {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'You must be signed in.');
  if (auth.token && VALID_ROLES.includes(auth.token.recipeGuideRole)) return;
  const snap = await db.collection('users').doc(auth.uid).get();
  if (snap.exists && VALID_ROLES.includes((snap.data() || {}).recipeGuideRole)) return;
  throw new HttpsError('permission-denied', 'Recipe Guide access required.');
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

// ── Orda order lookup (BigQuery, near-real-time raw layer) ──────────────────
// Given an order number, return its line items so a designer can log usage
// against the actual order. Read-only; any Recipe Guide user may call it.
// Queries orda_raw.dbo_ORDERS_PRODUCTS in freytags-florist-analytics using the
// analytics service-account key (ORDA_SA_KEY secret).
exports.lookupOrder = onCall({ secrets: [ORDA_SA_KEY] }, async (req) => {
  await assertRecipeUser(req);
  const orderNumber = String((req.data && req.data.orderNumber) || '').trim();
  if (!orderNumber) throw new HttpsError('invalid-argument', 'An order number is required.');

  let creds;
  try { creds = JSON.parse(ORDA_SA_KEY.value()); }
  catch (e) { throw new HttpsError('failed-precondition', 'Orda credentials are not configured.'); }

  const { BigQuery } = require('@google-cloud/bigquery');
  // Drive scope is needed because the funeral-account list is a Google
  // Sheet-backed external table (v_funeral_accounts).
  const bq = new BigQuery({
    projectId: creds.project_id,
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/bigquery', 'https://www.googleapis.com/auth/drive.readonly']
  });

  const params = { ord: orderNumber, ordPad: orderNumber.padStart(8, '0') };
  // Match the exact number, or a zero-padded/'0'-prefixed variant, so a barcode
  // that drops or adds leading zeros still resolves.
  const query = `
    SELECT TRIM(product_code) AS productCode,
           product_description AS description,
           units, unit_price AS unitPrice
    FROM \`freytags-florist-analytics.orda_raw.dbo_ORDERS_PRODUCTS\`
    WHERE order_number = @ord
       OR order_number = @ordPad
       OR SAFE_CAST(order_number AS INT64) = SAFE_CAST(@ord AS INT64)
    ORDER BY product_number`;
  // Run the line-items query and the header/funeral query CONCURRENTLY so the
  // lookup is fast. The header query is best-effort (never fails the lookup).
  const linesQ = bq.query({ query, params, location: 'us-central1' });
  const hdrQ = bq.query({
    query: `
      SELECT ANY_VALUE(o.sold_name) AS soldName,
             LOGICAL_OR(LPAD(TRIM(o.sold_account), 8, '0') IN (
               SELECT sold_account FROM \`freytags-florist-analytics.orda_analytics.v_funeral_accounts\`
             )) AS isFuneral
      FROM \`freytags-florist-analytics.orda_raw.dbo_ORDERS\` o
      WHERE o.order_number = @ord
         OR o.order_number = @ordPad
         OR SAFE_CAST(o.order_number AS INT64) = SAFE_CAST(@ord AS INT64)`,
    params, location: 'us-central1'
  }).catch(() => [[]]); // swallow — funeral flag is optional

  let rows;
  try {
    [rows] = await linesQ;
  } catch (e) {
    throw new HttpsError('internal', 'Order lookup failed: ' + (e.message || e));
  }
  const lines = (rows || []).map(r => ({
    productCode: r.productCode || '',
    description: r.description || '',
    units: Number(r.units) || 0,
    unitPrice: r.unitPrice != null ? Number(r.unitPrice) : null
  }));

  let isFuneral = false, soldName = null;
  const [hdr] = await hdrQ;
  if (hdr && hdr[0]) { soldName = hdr[0].soldName || null; isFuneral = !!hdr[0].isFuneral; }

  return { ok: true, orderNumber, lines, soldName, isFuneral };
});
