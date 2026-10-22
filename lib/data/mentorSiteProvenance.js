// The uploaded report's explicitly selected activity site is preserved on
// public.imports. A manually reconciled eMentor score may materialise with
// site=null when the driver's master-record site is unset. Resolve the site
// from its original import, but NEVER override explicit row-level evidence.
const trimSite = value => String(value || "").trim().toUpperCase();

export function mentorActivitySite(row) {
  const source = row?.raw_data?.mentor || {};
  const sourceDriver = row?.payload?.driver || {};
  return trimSite(
    row?.site ||
    row?.raw_data?.activity_site ||
    source?.station ||
    sourceDriver?.site ||
    sourceDriver?.details?.mentor?.station ||
    row?.source_import?.site ||
    row?.source_import?.metadata?.activity_site
  );
}

export function mentorRowWithImportSite(row) {
  const site = mentorActivitySite(row);
  return site && site !== trimSite(row?.site)
    ? {...row, site, site_from_import: !trimSite(row?.site)}
    : row;
}

// The Shift Report's rows count raw trip entries, not distinct drivers.
// Reimporting the same Shift Report must not double-count its 21 entries.
export function mentorShiftReportEntries(rows, selectedDate) {
  const counts = new Map();
  for (const row of rows || []) {
    const imp = row?.source_import;
    if (!imp?.id || imp?.detected_report_type !== "mentor_trip") continue;
    const date = String(imp.metadata?.report_date || imp.metadata?.reportDate || "").trim();
    if (date !== String(selectedDate || "").trim()) continue;
    const count = Number(imp.metadata?.rows);
    if (Number.isInteger(count) && count >= 0) counts.set(imp.id, count);
  }
  return counts.size ? Math.max(...counts.values()) : null;
}
