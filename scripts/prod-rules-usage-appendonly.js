'use strict';
// Surgically switch the LIVE prod /usageRecords block to APPEND-ONLY:
//   update -> false (edits become new version docs, never overwrite an original)
//   delete -> admin only
// Fetches current source, swaps ONLY that one block (verified), compiles it
// (create validates), and releases only with --release. Rollback = re-point the
// release at the previous rulesetName printed below.
const { google } = require('googleapis');
const KEY = 'C:\\Keys\\freytags-service-account.json';
const PROJECT = 'freytags-purchasing';
const DO_RELEASE = process.argv.includes('--release');

const OLD_BLOCK = [
  "    match /usageRecords/{usageId} {",
  "      allow read: if hasRecipeGuideAccess();",
  "      allow create: if hasRecipeGuideAccess();",
  "      allow update, delete: if isRecipeManager()",
  "        || (hasRecipeGuideAccess() && resource.data.userId == request.auth.uid);",
  "    }"
].join("\n");

const NEW_BLOCK = [
  "    match /usageRecords/{usageId} {",
  "      allow read: if hasRecipeGuideAccess();",
  "      allow create: if hasRecipeGuideAccess();",
  "      allow update: if false;                 // append-only: edits are new version docs",
  "      allow delete: if isRecipeAdmin();        // admin-only cleanup; history is the audit trail",
  "    }"
].join("\n");

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();

  const rel = await client.request({ url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore` });
  const oldRuleset = rel.data.rulesetName;
  const rs = await client.request({ url: `https://firebaserules.googleapis.com/v1/${oldRuleset}` });
  const file = (rs.data.source.files || []).find(f => /firestore/i.test(f.name)) || rs.data.source.files[0];
  const oldSrc = file.content;

  // Safety: the exact old block must appear exactly once, and isRecipeAdmin must exist.
  const count = oldSrc.split(OLD_BLOCK).length - 1;
  if (count !== 1) { console.log(`ABORT: expected old block exactly once, found ${count}. (Already migrated?)`); process.exit(count === 0 ? 0 : 1); }
  if (!/function isRecipeAdmin\(\)/.test(oldSrc)) { console.log('ABORT: isRecipeAdmin() helper not found.'); process.exit(1); }

  const newSrc = oldSrc.replace(OLD_BLOCK, NEW_BLOCK);
  if (newSrc === oldSrc) { console.log('ABORT: replacement made no change.'); process.exit(1); }
  // The ONLY difference must be that one block (reverse-swap must reproduce the original).
  if (newSrc.replace(NEW_BLOCK, OLD_BLOCK) !== oldSrc) { console.log('ABORT: change is not a clean single-block swap.'); process.exit(1); }

  console.log('Previous rulesetName (for rollback):', oldRuleset);
  console.log('\n--- OLD ---\n' + OLD_BLOCK + '\n\n--- NEW ---\n' + NEW_BLOCK);

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

  if (!DO_RELEASE) { console.log('\nVALIDATION PASS (no release). Re-run with --release to make it live.'); process.exit(0); }

  await client.request({
    url: `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    method: 'PATCH',
    data: { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: newName } }
  });
  console.log('\nRELEASED — /usageRecords is now append-only (no updates; admin-only delete).');
  console.log('Rollback if ever needed: re-point release to', oldRuleset);
  process.exit(0);
})().catch(e => { console.error('ERR', e.response ? JSON.stringify(e.response.data) : e.message); process.exit(1); });
