const SOURCE_PATTERN =
  /^DSP_Associates_Concessions_(D[A-Z]{1,4}\d{1,3})_(\d{4})-W(\d{2})(?:\s*\(\d+\))?\.csv$/i;

function parseSource(fileName) {
  const name = String(fileName || "").trim();
  const match = name.match(SOURCE_PATTERN);
  if (!match) return null;
  return {
    fileName: name,
    site: String(match[1]).toUpperCase(),
    week: `W${match[3]}`,
  };
}

export function concessionSnapshotFromDriver({
  organizationId,
  driverId,
  driver,
}) {
  const raw = driver?.rawMetrics || {};
  if (raw.concessions == null || Number.isNaN(Number(raw.concessions))) return null;

  const sources = Array.isArray(driver?.sources) ? driver.sources : [];
  const source = sources.map(parseSource).find(Boolean);
  if (!source) return null;

  const trid = String(driver?.id || "").trim().toUpperCase();
  if (!trid) return null;

  return {
    organization_id: organizationId,
    site: source.site,
    week_label: source.week,
    driver_id: driverId || null,
    driver_trid: trid,
    driver_name: String(driver?.name || trid).trim() || trid,
    dnr: Math.max(0, Math.trunc(Number(raw.concessions) || 0)),
    source_file: source.fileName,
    updated_at: new Date().toISOString(),
  };
}

export async function replaceConcessionSnapshotWeeks(
  supabase,
  organizationId,
  rows
) {
  const cleanRows = (rows || []).filter(Boolean);
  if (!cleanRows.length) return 0;

  const groups = new Map();
  for (const row of cleanRows) {
    const key = `${row.site}::${row.week_label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let saved = 0;

  for (const groupRows of groups.values()) {
    const site = groupRows[0].site;
    const week = groupRows[0].week_label;

    const { error: deleteError } = await supabase
      .from("concessions_weekly_snapshots")
      .delete()
      .eq("organization_id", organizationId)
      .eq("site", site)
      .eq("week_label", week);

    if (deleteError) throw deleteError;

    const { data, error } = await supabase
      .from("concessions_weekly_snapshots")
      .upsert(groupRows, {
        onConflict: "organization_id,site,week_label,driver_trid",
      })
      .select("id");

    if (error) throw error;
    saved += data?.length || 0;
  }

  return saved;
}
