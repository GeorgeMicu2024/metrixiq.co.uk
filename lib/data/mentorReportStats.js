// The counts shown in DZM1 eMentor must distinguish entries in the uploaded
// Shift Report from unique resolved drivers and scored Driver Report accounts.
// Report row counts are preserved in the original import audit metadata.
export function mentorReportStatsFromImports(imports) {
  const findLatest = type => (imports || [])
    .filter(row=>row?.detected_report_type===type)
    .sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")))[0] || null;
  // Source entries are ordered exactly as in the original Shift Report XLSX.
  const shift=findLatest("mentor_trip"), driver=findLatest("mentor");
  const rawEntries=Array.isArray(shift?.metadata?.mentor_shift_entries) ? shift.metadata.mentor_shift_entries : [];
  const shiftEntries=rawEntries.filter(row=>Number.isInteger(Number(row?.row)) && typeof row?.name === "string" && row.name.trim());
  const intOrNull=value=>{
    if(value===null||value===undefined||String(value).trim()==="")return null;
    const n=Number(value);
    return Number.isInteger(n)&&n>=0?n:null;
  };
  return {
    shiftRows:intOrNull(shift?.metadata?.rows),
    driverRows:intOrNull(driver?.metadata?.rows),
    scoreImportId:driver?.id||"",
    ...(shiftEntries.length?{shiftEntries}:{}),
  };
}

export function mentorPendingScoreCount(rows) {
  return (rows||[]).filter(row => row?.status==="open" &&
    row?.payload?.score!==null && row?.payload?.score!==undefined &&
    String(row.payload.score).trim()!=="" &&
    Number.isFinite(Number(row.payload.score))).length;
}

// Read-only: do not materialise/resolve identities or change imported scores.
export async function fetchDzm1MentorReportStats(supabase, organizationId, date) {
  if(!organizationId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))return null;
  const {data:imports,error} = await supabase.from("imports")
    .select("id,detected_report_type,metadata,created_at")
    .eq("organization_id",organizationId)
    .eq("site","DZM1")
    .eq("metadata->>report_date",date)
    .in("detected_report_type",["mentor","mentor_trip"])
    .order("created_at",{ascending:false})
    .limit(50);
  if(error)throw error;
  const stats=mentorReportStatsFromImports(imports||[]);
  if(!stats.scoreImportId)return {...stats,pendingScores:null};
  const {data:unmatched,error:unmatchedError}=await supabase.from("unmatched_driver_records")
    .select("id,status,payload")
    .eq("organization_id",organizationId)
    .eq("report_type","mentor_daily")
    .eq("status","open")
    .eq("source_import_id",stats.scoreImportId);
  if(unmatchedError)throw unmatchedError;
  return {...stats,pendingScores:mentorPendingScoreCount(unmatched||[])};
}
