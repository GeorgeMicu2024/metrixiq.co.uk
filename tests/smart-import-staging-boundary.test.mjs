import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const remote = readFileSync(new URL("../lib/imports/stagingRemote.js", import.meta.url), "utf8");
const lab = readFileSync(new URL("../components/imports/SmartImportLab.jsx", import.meta.url), "utf8");
const center = readFileSync(new URL("../components/imports/ImportCenterV2.jsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/smart-import-stage/index.ts", import.meta.url), "utf8");
const approveEdge = readFileSync(new URL("../supabase/functions/smart-import-approve/index.ts", import.meta.url), "utf8");
const approveSql = readFileSync(new URL("../supabase/staging/20260928_approve_reconciled_batch.sql", import.meta.url), "utf8");
const identityApprovalSql = readFileSync(new URL("../supabase/staging/20260929_reject_invalid_driver_identity_before_approval.sql", import.meta.url), "utf8");
const productionEdge = readFileSync(new URL("../supabase/functions/smart-import-production/index.ts", import.meta.url), "utf8");
const productionSql = readFileSync(new URL("../supabase/production/20260929_smart_import_preflight.sql", import.meta.url), "utf8");
const productionCommitSql = readFileSync(new URL("../supabase/production/20260930_smart_import_commit_gate.sql", import.meta.url), "utf8");

test("staging and Production preflight use explicit isolated endpoints", () => {
  assert.match(remote, /STAGING_FUNCTION_URL = "https:\/\/hsbxqiuvciwalxogqceb\.supabase\.co\/functions\/v1\/smart-import-stage"/);
  assert.match(remote, /APPROVE_FUNCTION_URL = "https:\/\/hsbxqiuvciwalxogqceb\.supabase\.co\/functions\/v1\/smart-import-approve"/);
  assert.match(remote, /PRODUCTION_PREFLIGHT_URL = "https:\/\/bbljkuwfejslsqoqqwzh\.supabase\.co\/functions\/v1\/smart-import-production"/);
});

test("remote staging authenticates with the active MetrixIQ session", () => {
  assert.match(remote, /auth\.getSession\(\)/);
  assert.match(remote, /Authorization: "Bearer " \+ token/);
});

test("Smart Import Lab receives organization scope and keeps Production locked behind gates", () => {
  assert.match(center, /SmartImportLab sites=\{sites\} organizationId=\{organizationId\}/);
  assert.match(lab, /PRODUCTION WRITES LOCKED/);
  assert.match(lab, /approval, zero-write preflight and fingerprint validation/);
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


test("approval endpoint is isolated to MetrixIQ Staging and uses the active session", () => {
  assert.match(remote, /smart-import-approve/);
  assert.match(remote, /approveSmartImportBatch/);
  assert.match(remote, /auth\.getSession\(\)/);
  assert.match(remote, /Authorization: "Bearer " \+ token/);
});

test("approval Edge Function validates production identity, membership and site scope", () => {
  assert.match(approveEdge, /auth\.getUser\(token\)/);
  assert.match(approveEdge, /organization_members/);
  assert.match(approveEdge, /"owner", "manager"/);
  assert.match(approveEdge, /site_scope/);
  assert.match(approveEdge, /smart_import_lab\.approve_batch/);
  assert.match(approveEdge, /writesToProduction: false/);
});

test("database approval gate requires reconciled, conflict-free staging data", () => {
  assert.match(approveSql, /status <> 'staging'/);
  assert.match(approveSql, /reconciliationStatus/);
  assert.match(approveSql, /blocked_file_count <> 0/);
  assert.match(approveSql, /logical_conflict_count <> 0/);
  assert.match(approveSql, /Stored evidence changed after reconciliation/);
  assert.match(approveSql, /status = 'approved'/);
  assert.match(approveSql, /approved_by = p_actor/);
  assert.match(approveSql, /writesToProduction', false/);
});

test("approval UI is a separate gate after staging and never claims a production write", () => {
  assert.match(lab, /APPROVAL GATE/);
  assert.match(lab, /Approve Batch/);
  assert.match(lab, /Approved ✓/);
  assert.match(lab, /PRODUCTION STILL OFF/);
  assert.match(lab, /Production remains untouched/);
});


test("approval rejects structural or non-TRID driver identities", () => {
  assert.match(identityApprovalSql, /invalid driver identities/i);
  assert.match(identityApprovalSql, /entity_key !~ '\^A\[A-Z0-9\]\{8,\}\$'/);
  assert.match(approveEdge, /Batch contains invalid driver identities/);
});

test("Production endpoint fetches approved data server-to-server and gates commit explicitly", () => {
  assert.match(productionEdge, /STAGING_EXPORT_URL/);
  assert.match(productionEdge, /smart-import-export/);
  assert.match(productionEdge, /const action = body\?\.action \|\| "preflight"/);
  assert.match(productionEdge, /"preflight", "commit"/);
  assert.match(productionEdge, /COMMIT_APPROVED_BATCH/);
  assert.match(productionEdge, /expectedFingerprint/);
  assert.match(productionEdge, /PREFLIGHT_FINGERPRINT_MISMATCH/);
  assert.match(productionEdge, /private\.smart_import_preflight/);
  assert.match(productionEdge, /private\.smart_import_commit/);
});

test("Production preflight remains private and does not expose a commit writer", () => {
  assert.match(productionSql, /private\.smart_import_commits/);
  assert.match(productionSql, /private\.smart_import_preflight/);
  assert.match(productionSql, /dailyDetailSkipped/);
  assert.match(productionSql, /concessions_weekly_snapshots/);
  assert.doesNotMatch(productionSql, /insert into public\.driver_metrics/i);
  assert.doesNotMatch(productionSql, /update public\.driver_metrics/i);
  assert.doesNotMatch(productionSql, /delete from public\.driver_metrics/i);
});

test("Production commit UI unlocks only after a successful preflight", () => {
  assert.match(lab, /PRODUCTION PREFLIGHT/);
  assert.match(lab, /Run Production Preflight/);
  assert.match(lab, /commitToProduction/);
  assert.match(lab, /expectedFingerprint: productionPreflight\.batchFingerprint/);
  assert.match(lab, /disabled=\{!productionPreflight\.ready \|\| commitBusy \|\| productionCommit\?\.committed\}/);
  assert.match(lab, /APPROVED FINGERPRINT \+ TRANSACTION GATE READY/);
  assert.match(lab, /PRODUCTION COMMIT COMPLETE/);
  assert.match(lab, /zero writes/);
});


test("Production commit function is transactional, fingerprint-bound and idempotent", () => {
  assert.match(productionCommitSql, /pg_advisory_xact_lock/);
  assert.match(productionCommitSql, /fingerprint changed after approval/i);
  assert.match(productionCommitSql, /status='committed'/);
  assert.match(productionCommitSql, /alreadyCommitted/);
  assert.match(productionCommitSql, /private\.smart_import_preflight/);
  assert.match(productionCommitSql, /insert into public\.driver_metrics/i);
  assert.match(productionCommitSql, /insert into public\.feedback_events/i);
  assert.match(productionCommitSql, /insert into public\.audit_events/i);
});
