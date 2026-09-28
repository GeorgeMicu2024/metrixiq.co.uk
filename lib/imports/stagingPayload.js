function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function safeKey(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._:@|+-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 240);
}

function periodKey(period = {}) {
  return text(period.key || period.weekLabel || period.periodEnd || period.periodStart || "");
}

function driverIdentity(driver = {}) {
  return safeKey(
    driver.id ||
    driver.trid ||
    driver.mentorHash ||
    driver.details?.mentor?.identityKey ||
    driver.name ||
    "unknown-driver"
  );
}

function driverSite(driver = {}, period = {}) {
  return upper(
    driver.site ||
    driver.details?.mentor?.station ||
    period.site ||
    ""
  );
}

function firstSource(driver = {}, period = {}, fallback = "") {
  return (
    (Array.isArray(driver.sources) && driver.sources.find(Boolean)) ||
    (Array.isArray(period.sourceFiles) && period.sourceFiles.find(Boolean)) ||
    fallback ||
    ""
  );
}

function recordForDriver(driver, period, sourceFileName) {
  const pKey = periodKey(period);
  const site = driverSite(driver, period);
  const identity = driverIdentity(driver);
  return {
    sourceFileName,
    site,
    reportType: "DRIVER_PERIOD",
    periodKey: pKey || null,
    recordKey: safeKey(["driver", site || "unknown-site", pKey || "unknown-period", identity].join("|")),
    entityLevel: "DRIVER",
    entityKey: identity,
    metricKey: null,
    metricValue: null,
    metricText: null,
    sourcePriority: 60,
    payload: {
      driver,
      period: {
        key: period.key || null,
        weekLabel: period.weekLabel || null,
        periodStart: period.periodStart || null,
        periodEnd: period.periodEnd || null,
        granularity: period.granularity || null,
        sourceFiles: period.sourceFiles || [],
      },
    },
  };
}

function recordForScorecard(scorecard, index, fallbackFile) {
  const site = upper(scorecard?.site || "");
  const pKey = text(scorecard?.weekLabel || scorecard?.periodKey || scorecard?.week || "");
  const sourceFileName =
    text(scorecard?.sourceFile || scorecard?.fileName || "") ||
    (Array.isArray(scorecard?.sourceFiles) && text(scorecard.sourceFiles[0])) ||
    fallbackFile;
  return {
    sourceFileName,
    site,
    reportType: "SITE_SCORECARD",
    periodKey: pKey || null,
    recordKey: safeKey(["scorecard", site || "unknown-site", pKey || ("index-" + index)].join("|")),
    entityLevel: "SITE",
    entityKey: site || null,
    metricKey: null,
    metricValue: null,
    metricText: null,
    sourcePriority: 80,
    payload: scorecard || {},
  };
}

function recordForFeedback(event, index, fallbackFile) {
  const site = upper(event?.site || "");
  const pKey = text(event?.weekLabel || event?.periodKey || event?.date || event?.feedbackDate || "");
  const eventIdentity = safeKey(
    event?.trackingId ||
    event?.tracking_id ||
    event?.id ||
    event?.transporterId ||
    event?.driverId ||
    ((pKey || "event") + "-" + index)
  );
  const sourceFileName =
    text(event?.sourceFile || event?.fileName || "") ||
    (Array.isArray(event?.sourceFiles) && text(event.sourceFiles[0])) ||
    fallbackFile;
  return {
    sourceFileName,
    site,
    reportType: "FEEDBACK_EVENT",
    periodKey: pKey || null,
    recordKey: safeKey(["feedback", site || "unknown-site", pKey || "unknown-period", eventIdentity].join("|")),
    entityLevel: "EVENT",
    entityKey: eventIdentity,
    metricKey: null,
    metricValue: null,
    metricText: null,
    sourcePriority: 70,
    payload: event || {},
  };
}

export function buildRemoteStagingPayload({
  organizationId,
  analysis,
  plan,
  staging,
  exactDuplicates = [],
} = {}) {
  if (!organizationId) throw new Error("Workspace organisation is required for staging.");
  if (!staging || staging.writesEnabled !== false) {
    throw new Error("Remote staging requires a validated zero-write staging plan.");
  }

  const analysedFiles = new Map(
    (plan?.files || []).map((row) => [row.name, row])
  );

  const files = [];
  for (const row of plan?.files || []) {
    const smart = row.smart || {};
    files.push({
      fileName: row.name,
      contentHash: row.contentHash || "",
      byteSize: Number(row.byteSize || 0),
      mimeType: row.mimeType || null,
      reportTypes: smart.reportTypes || [],
      sites: smart.site === "MULTI_SITE" ? (smart.contentSites || []) : [smart.site].filter(Boolean),
      periodKey: smart.period?.key || row.period?.key || null,
      granularity: smart.granularity || row.period?.granularity || null,
      confidence: Number(smart.confidence || 0),
      state: row.smartState === "review" ? "blocked" : row.smartState || "ready",
      rowCount: Number(row.rows || 0),
      targets: (staging.files || []).find((item) => item.fileName === row.name)?.targets || [],
      warnings: smart.warnings || [],
      detectionEvidence: {
        segments: smart.segments || [],
        contentSites: smart.contentSites || [],
        filenameSite: smart.filenameSite || null,
      },
      metadata: {
        parserReportType: row.reportType || null,
        recognized: Boolean(row.recognized),
      },
    });
  }

  for (const duplicate of exactDuplicates || []) {
    files.push({
      fileName: duplicate.file?.name || "",
      contentHash: duplicate.hash || "",
      byteSize: Number(duplicate.file?.size || 0),
      mimeType: duplicate.file?.type || null,
      reportTypes: [],
      sites: [],
      periodKey: null,
      granularity: null,
      confidence: 100,
      state: "duplicate",
      rowCount: 0,
      targets: [],
      warnings: [],
      detectionEvidence: {},
      metadata: { duplicateOfName: duplicate.duplicateOf?.name || null },
    });
  }

  const readyNames = new Set(
    files.filter((item) => item.state === "ready" || item.state === "warning").map((item) => item.fileName)
  );
  const fallbackFile = [...readyNames][0] || files[0]?.fileName || "";

  const records = [];
  for (const period of analysis?.periods || []) {
    for (const driver of period?.drivers || []) {
      const source = firstSource(driver, period, fallbackFile);
      if (!source || !analysedFiles.has(source)) continue;
      records.push(recordForDriver(driver, period, source));
    }
  }

  (analysis?.siteScorecards || []).forEach((scorecard, index) => {
    const record = recordForScorecard(scorecard, index, fallbackFile);
    if (record.sourceFileName && analysedFiles.has(record.sourceFileName)) records.push(record);
  });

  (analysis?.feedbackEvents || []).forEach((event, index) => {
    const record = recordForFeedback(event, index, fallbackFile);
    if (record.sourceFileName && analysedFiles.has(record.sourceFileName)) records.push(record);
  });

  const deduped = new Map();
  for (const record of records) {
    const current = deduped.get(record.recordKey);
    if (!current) {
      deduped.set(record.recordKey, record);
      continue;
    }
    deduped.set(record.recordKey, {
      ...current,
      payload: {
        ...current.payload,
        mergedEvidence: [
          ...(current.payload?.mergedEvidence || []),
          record.payload,
        ],
      },
      sourcePriority: Math.max(current.sourcePriority || 0, record.sourcePriority || 0),
    });
  }

  return {
    organizationId,
    parserVersion: "smart-import-v1",
    writesEnabled: false,
    summary: {
      sourceCount: Number(staging.totalFiles || 0) + Number(staging.exactDuplicatesSkipped || 0),
      uniqueFileCount: Number(staging.totalFiles || 0),
      exactDuplicateCount: Number(staging.exactDuplicatesSkipped || 0),
      logicalConflictCount: Number(staging.logicalConflictGroups || 0),
      readyFileCount: Number(staging.readyFiles || 0),
      blockedFileCount: Number(staging.blockedFiles || 0),
      sourceRows: Number(staging.sourceRows || 0),
      feedbackRows: Number(staging.feedbackRows || 0),
      scorecardRows: Number(staging.scorecardRows || 0),
      destinations: staging.destinations || {},
    },
    files,
    records: [...deduped.values()],
  };
}
