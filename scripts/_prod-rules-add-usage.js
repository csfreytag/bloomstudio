'use strict';
// Surgically add a /usageRecords block to the LIVE prod Firestore ruleset.
// It fetches the current source, inserts ONE new block (never retyping or
// altering any existing rule), compiles it (create validates syntax), and only
// updates the live release when run with --release. Rollback = re-point the
// release at the previous rulesetName printed below.
const { google } = require('googleapis');
const KEY = 'C:\\Keys\\freytags-service-account.json';
const PROJECT = 'freytags-purchasing';
const RELEASE = 'release';
const DO_RELEASE = process.argv.includes('--release');

const ANCHOR = "    // ─── PRICING (service account writes only) ───────────────────────────────";
const BLOCK = [
  "    // ─── USAGE RECORDS (Recipe Guide: what designers actually used) ───────────",
  "    match /usageRecords/{usageId} {",
  "      allow read: if hasRecipeGuideAccess();",
  "      allow create: if hasRecipeGuideAccess();",
  "      allow update, delete: if isRecipeManager()",
  "        || (hasRecipeGuideAccess() && resource.data.userId == request.auth.uid);",
  "    }",
  "",
  ""
].join("\n");

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();

  const rel = await client.request({ url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore` });
  const oldRuleset = rel.data.rulesetName;
  const rs = await client.request({ url: `https://firebaserules.googleapis.com/v1/${oldRuleset}` });
  const file = (rs.data.source.files || []).find(f => /firestore/i.test(f.name)) || rs.data.source.files[0];
  const oldSrc = file.content;

  // Safety checks before touching anything.
  if (oldSrc.indexOf('usageRecords') !== -1) { console.log('ABORT: prod already has a usageRecords block. Nothing to do.'); process.exit(0); }
  const anchorCount = oldSrc.split(ANCHOR).length - 1;
  if (anchorCount !== 1) { console.log(`ABORT: anchor found ${anchorCount} times (need exactly 1).`); process.exit(1); }
  if (!/function hasRecipeGuideAccess\(\)/.test(oldSrc) || !/function isRecipeManager\(\)/.test(oldSrc)) {
    console.log('ABORT: expected helper functions not found.'); process.exit(1);
  }

  const newSrc = oldSrc.replace(ANCHOR, BLOCK + ANCHOR);
  // The ONLY difference must be the inserted block.
  if (newSrc.length !== oldSrc.length + BLOCK.length) { console.log('ABORT: unexpected length delta.'); process.exit(1); }
  if (newSrc.replace(BLOCK, '') !== oldSrc) { console.log('ABORT: change is not a clean single insertion.'); process.exit(1); }

  console.log('Previous rulesetName (for rollback):', oldRuleset);
  console.log('\n--- Inserted block ---\n' + BLOCK);

  // Create (this compiles/validates the whole ruleset).
  let created;
  try {
    created = await client.request({
      url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
      method: 'POST',
      data: { source: { files: [{ name: file.name, content: newSrc }] } }
    });
  } catch (e) {
    console.log('\nVALIDATION FAILED — ruleset NOT created, live rules untouched:');
    console.log(JSON.stringify(e.response ? e.response.data : e.message, null, 2));
    process.exit(1);
  }
  const newName = created.data.name;
  console.log('\nCompiled OK. New rulesetName:', newName);

  if (!DO_RELEASE) {
    console.log('\nVALIDATION PASS (no release). Re-run with --release to make it live.');
    process.exit(0);
  }

  await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    method: 'PATCH',
    data: { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: newName } }
  });
  console.log('\nRELEASED — production Firestore rules now include /usageRecords.');
  console.log('Rollback if ever needed: re-point release to', oldRuleset);
  process.exit(0);
})().catch(e => { console.error('ERR', e.response ? JSON.stringify(e.response.data) : e.message); process.exit(1); });
