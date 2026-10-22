import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mentorActivitySite, mentorRowWithImportSite, mentorShiftReportEntries,
} from "../lib/data/mentorSiteProvenance.js";

const imported={id:"shift-20261021",site:"DZM1",detected_report_type:"mentor_trip",metadata:{rows:21,report_date:"2026-10-21"}};
const scored={id:"scores-20261021",site:"DZM1",detected_report_type:"mentor",metadata:{rows:20,report_date:"2026-10-21"}};

test("DZM1: three manually matched FICO rows with null site inherit their source import's DZM1 site",()=>{
  for(const name of ["Constantin Viasu","Eugen Borto","Sonia Valentina Balaban"]){
    const row={site:null,drivers:{full_name:name},mentor_score:841,raw_data:{manual_mapping:true},source_import:scored};
    const resolved=mentorRowWithImportSite(row);
    assert.equal(resolved.site,"DZM1");
    assert.equal(resolved.mentor_score,row.mentor_score);
    assert.equal(row.site,null,"projection cannot change stored source");
  }
});
test("No score from another DSP can be reassigned to DZM1 by import fallback",()=>{
  assert.equal(mentorActivitySite({site:"DLS2",source_import:scored}),"DLS2");
  assert.equal(mentorActivitySite({site:null,raw_data:{activity_site:"DXM3"},source_import:scored}),"DXM3");
  assert.equal(mentorActivitySite({site:null,raw_data:{mentor:{station:"DEH1"}},source_import:scored}),"DEH1");
  assert.equal(mentorActivitySite({site:null,source_import:null}),"");
  assert.equal(mentorRowWithImportSite({site:"DLS2",source_import:scored}).site,"DLS2");
});
test("Encrypted score waiting for mapping carries verified station from uploaded Driver Report",()=>{
  const row={status:"open",site:null,payload:{score:850,reportDate:"2026-10-21"},source_import:scored};
  const resolved=mentorRowWithImportSite(row);
  assert.equal(resolved.site,"DZM1");
  assert.equal(resolved.status,"open","source-only evidence is not enough to guess driver identity");
});
test("Shift Report 21 raw entries are distinct from 16 unique matched drivers",()=>{
  const rows=Array.from({length:16},(_,i)=>({driver_id:"driver"+i,source_import:imported}));
  assert.equal(mentorShiftReportEntries(rows,"2026-10-21"),21);
  assert.equal(mentorShiftReportEntries([...rows,...rows],"2026-10-21"),21,"repeated rows cannot double count");
  assert.equal(mentorShiftReportEntries([...rows,{source_import:scored}],"2026-10-21"),21);
  assert.equal(mentorShiftReportEntries(rows,"2026-10-22"),null);
  assert.equal(new Set(rows.map(r=>r.driver_id)).size,16);
});
test("eMentor daily and mapping UI fetch import provenance using real foreign keys",()=>{
  const daily=readFileSync(new URL("../lib/data/mentorDaily.js",import.meta.url),"utf8");
  const mapping=readFileSync(new URL("../lib/data/mentorMapping.js",import.meta.url),"utf8");
  const view=readFileSync(new URL("../components/operations/MentorView.jsx",import.meta.url),"utf8");
  assert.ok(daily.includes("source_import:imports!mentor_daily_snapshots_source_import_id_fkey"));
  assert.ok(daily.includes("source_import:imports!unmatched_driver_records_source_import_id_fkey"));
  assert.ok(daily.includes("page.map(mentorRowWithImportSite)"));
  assert.ok(daily.includes("return (data || []).map(mentorRowWithImportSite)"));
  assert.ok(mapping.includes("source_import:imports!unmatched_driver_records_source_import_id_fkey"));
  assert.ok(mapping.includes("const rows = (data || []).map(mentorRowWithImportSite)"));
  assert.ok(view.includes("mentorShiftReportEntries(selectedDailyRows, selectedDate)"));
  assert.ok(view.includes("Unique drivers with an eMentor trip"));
  assert.ok(view.includes("Shift Report rows"));
  assert.ok(view.includes("const recordedCount = useMemo("),"existing Recorded definition preserved");
  assert.ok(view.includes("const dailyMap = useMemo("),"existing score table preserved");
});
