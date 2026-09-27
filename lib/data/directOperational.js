export const DIRECT_OPERATIONAL_SELECT =
  "driver_id,week_label,period_start,period_end,dcr,pod,cc,iadc,site,mentor_score,ementor,fico,concessions,raw_data,risk,issue,drivers(id,trid,full_name,site,status)";

export async function fetchDirectOperationalRows(supabase, organizationId, kind) {
  const pageSize = 1000;
  const allRows = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("driver_metrics")
      .select(DIRECT_OPERATIONAL_SELECT)
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: true })
      .order("driver_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (["dcr", "cc"].includes(kind)) {
      query = query.not(kind, "is", null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = data || [];
    allRows.push(...page);

    if (page.length < pageSize) break;
  }

  // The POD operational workspace is a reject-analysis view, so it must
  // use only rows produced by a dedicated POD Quality report. Scorecard-only
  // POD percentages do not contain opportunities, bypass or reject reasons and
  // can otherwise make the page look populated with incompatible evidence.
  if (kind === "pod") {
    return allRows.filter((row) => {
      const detail = row?.raw_data?.pod_detail;
      return Boolean(detail && typeof detail === "object" && !Array.isArray(detail));
    });
  }

  if (kind === "mentor") {
    // Weekly eMentor must represent the exact population in a weekly source
    // report. Daily rows and mentor values inherited from merged scorecard
    // history must never inflate the weekly register.
    return allRows.filter((row) => {
      const hasMentor = row.mentor_score != null || row.ementor != null || row.fico != null || row.raw_data?.mentor;
      const granularity = String(row.raw_data?.metric_granularity || "").toLowerCase();
      const sourceFiles = Array.isArray(row.raw_data?.source_files) ? row.raw_data.source_files : [];
      const hasMentorSource = sourceFiles.some((name) => /mentor|driver report|fico/i.test(String(name)));
      return hasMentor && granularity !== "daily" && hasMentorSource;
    });
  }

  // IADC and DWC share one workspace. Keep genuine IADC rows plus
  // DWC-only rows, but exclude unrelated metrics so newer weeks cannot
  // steal the selected period and make Daily appear empty.
  if (kind === "iadc") {
    return allRows.filter((row) =>
      row.iadc != null ||
      row.raw_data?.dwc != null
    );
  }

  return allRows;
}
