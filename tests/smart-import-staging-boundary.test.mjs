import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const remote = readFileSync(new URL("../lib/imports/stagingRemote.js", import.meta.url), "utf8");
const lab = readFileSync(new URL("../components/imports/SmartImportLab.jsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/imports/ImportCenterV2.jsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/smart-import-stage/index.ts", import.meta.url), "utf8");

test("remote staging targets only the isolated staging project", () => {
  assert.match(remote, /hsbxqiuvciwalxogqceb\.supabase\.co\/functions\/v1\/smart-import-stage/);
  assert.doesNotMatch(remote, /bbljkuwfejslsqoqqwzh\.supabase\.co\/functions/);
});

test("remote staging authenticates with the active MetrixIQ session", () => {
  assert.match(remote, /auth\.getSession\(\)/);
  assert.match(remote, /Authorization: "Bearer " \+ token/);
});

test("Smart Import Lab receives organization scope and never claims production writes", () => {
  assert.match(center, /SmartImportLab sites=\{sites\} organizationId=\{organizationId\}/);
  assert.match(lab, /PRODUCTION WRITES OFF/);
  assert.match(lab, /production untouched/);
});

test("staging Edge Function validates production user and owner or manager membership", () => {
  assert.match(edge, /auth\.getUser\(token\)/);
  assert.match(edge, /organization_members/);
  assert.match(edge, /"owner", "manager"/);
  assert.match(edge, /site_scope/);
  assert.match(edge, /writesToProduction: false/);
});


test("staging failures are rendered inline beside the staging controls", () => {
  assert.match(lab, /const \[remoteError, setRemoteError\]/);
  assert.match(lab, /Test DB staging failed:/);
  assert.match(lab, /Sending validated batch to MetrixIQ Staging/);
  assert.match(lab, /setRemoteError\(failure\)/);
});

test("Edge Function exposes safe reconciliation failures without leaking arbitrary database errors", () => {
  assert.match(edge, /rawMessage\.startsWith\("Staging reconciliation failed\."\)/);
  assert.match(edge, /RECONCILIATION_FAILED/);
  assert.match(edge, /STAGING_WRITE_FAILED/);
});


test("Stage control locks after a successful remote stage", () => {
  assert.match(lab, /!remoteStage/);
  assert.match(lab, /"Staged ✓"/);
  assert.match(lab, /"Already staged ✓"/);
  assert.doesNotMatch(lab, /"Stage again"/);
});

test("Edge Function calls the idempotent v3 staging function", () => {
  assert.match(edge, /smart_import_lab\.stage_payload_v3/);
});


test("cross-batch overlap remains staging evidence instead of being excluded", () => {
  const migration = readFileSync(
    new URL("../supabase/staging/20260928_preserve_cross_batch_overlap.sql", import.meta.url),
    "utf8"
  );
  assert.match(migration, /previouslyStaged/);
  assert.match(migration, /current_file\.state in \('ready','warning'\)/);
  assert.doesNotMatch(migration, /set\s+state = 'duplicate',[\s\S]*previousBatchId/);
  assert.match(migration, /Partial-overlap batches must retain all current normalized evidence/);
});
