const STORAGE_KEY = "metrixiq.smartImportLab.staging.v1";

function nowIso() {
  return new Date().toISOString();
}

export function createBrowserStagingSnapshot(stagingPlan, { label = "Smart Import Lab" } = {}) {
  if (!stagingPlan || stagingPlan.writesEnabled !== false) {
    throw new Error("Only zero-write staging plans can be stored in Smart Import Lab.");
  }

  return {
    version: 1,
    mode: "browser_dry_run",
    label,
    createdAt: nowIso(),
    writesEnabled: false,
    summary: {
      totalFiles: Number(stagingPlan.totalFiles || 0),
      readyFiles: Number(stagingPlan.readyFiles || 0),
      blockedFiles: Number(stagingPlan.blockedFiles || 0),
      exactDuplicatesSkipped: Number(stagingPlan.exactDuplicatesSkipped || 0),
      logicalConflictGroups: Number(stagingPlan.logicalConflictGroups || 0),
      sourceRows: Number(stagingPlan.sourceRows || 0),
      feedbackRows: Number(stagingPlan.feedbackRows || 0),
      scorecardRows: Number(stagingPlan.scorecardRows || 0),
      destinations: stagingPlan.destinations || {},
    },
    files: (stagingPlan.files || []).map((item) => ({
      fileName: item.fileName,
      contentHash: item.contentHash,
      reportTypes: item.reportTypes,
      sites: item.sites,
      periodKey: item.periodKey,
      granularity: item.granularity,
      confidence: item.confidence,
      targets: item.targets,
      rows: item.rows,
    })),
    blocked: (stagingPlan.blocked || []).map((item) => ({
      fileName: item.fileName,
      reportTypes: item.reportTypes,
      sites: item.sites,
      periodKey: item.periodKey,
      reasons: item.reasons,
    })),
  };
}

export function saveBrowserStaging(storage, stagingPlan, options) {
  if (!storage?.setItem) throw new Error("Browser staging storage is unavailable.");
  const snapshot = createBrowserStagingSnapshot(stagingPlan, options);
  storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function loadBrowserStaging(storage) {
  if (!storage?.getItem) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || parsed?.writesEnabled !== false) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBrowserStaging(storage) {
  if (storage?.removeItem) storage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };
