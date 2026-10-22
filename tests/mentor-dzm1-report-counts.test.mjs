import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mentorReportStatsFromImports, mentorPendingScoreCount, fetchDzm1MentorReportStats } from "../lib/data/mentorReportStats.js";

const imports=[
 {id:"shift-old",site:"DZM1",detected_report_type:"mentor_trip",created_at:"2026-10-21T08:00:00Z",metadata:{rows:21,report_date:"2026-10-21"}},
 {id:"shift-report",site:"DZM1",detected_report_type:"mentor_trip",created_at:"2026-10-22T12:42:15Z",metadata:{rows:21,report_date:"2026-10-21"}},
 {id:"driver-report",site:"DZM1",detected_report_type:"mentor",created_at:"2026-10-22T12:42:15Z",metadata:{rows:20,report_date:"2026-10-21"}},
];
const unmatched=[
 {id:"1",status:"open",payload:{score:832}},
 {id:"2",status:"open",payload:{score:850}},
 {id:"3",status:"open",payload:{score:804}},
 {id:"4",status:"open",payload:{score:null,totalTrips:1}},
];
test("DZM1 source audit: 21 trip entries and 20 scored driver accounts are not interchangeable",()=>{
 const rows=mentorReportStatsFromImports(imports);
 assert.deepEqual(rows,{shiftRows:21,driverRows:20,scoreImportId:"driver-report"});
 assert.equal(mentorPendingScoreCount(unmatched),3);
 assert.equal(20-3,17);
});
test("Repeat Shift Report imports must not double-count source trip rows",()=>{
 assert.equal(mentorReportStatsFromImports(imports).shiftRows,21);
 assert.equal(mentorReportStatsFromImports([imports[1]]).driverRows,null);
 assert.equal(mentorReportStatsFromImports([]).shiftRows,null);
 assert.equal(mentorReportStatsFromImports([{detected_report_type:"mentor",metadata:{rows:"bad"}}]).driverRows,null);
});
test("Unmatched only counts genuinely scored, unresolved encrypted accounts",()=>{
 assert.equal(mentorPendingScoreCount([...unmatched,{status:"resolved",payload:{score:900}},{status:"open",payload:{score:""}}]),3);
 assert.equal(mentorPendingScoreCount([]),0);
});
test("DZM1 reads only the selected site and report date; never mutates Supabase",async()=>{
 let importQuery=[], unmatchedQuery=[];
 const createQuery=(which,records,log)=>({
   select(arg){log.push(["select",arg]);return this},
   eq(key,value){log.push(["eq",key,value]);return this},
   in(key,value){log.push(["in",key,value]);return this},
   order(key,val){log.push(["order",key,val]);return this},
   limit(num){log.push(["limit",num]);return Promise.resolve({data:records,error:null})},
   then(resolve,reject){return Promise.resolve({data:records,error:null}).then(resolve,reject)},
 });
 const supabase={from(table){
   assert.ok(["imports","unmatched_driver_records"].includes(table));
   return table==="imports"?createQuery(table,imports,importQuery):createQuery(table,unmatched,unmatchedQuery);
 }};
 const result=await fetchDzm1MentorReportStats(supabase,"org-id","2026-10-21");
 assert.deepEqual(result,{shiftRows:21,driverRows:20,scoreImportId:"driver-report",pendingScores:3});
 assert.ok(importQuery.some(([op,key,v])=>op==="eq"&&key==="site"&&v==="DZM1"));
 assert.ok(importQuery.some(([op,key,v])=>op==="eq"&&key==="metadata->>report_date"&&v==="2026-10-21"));
 assert.ok(unmatchedQuery.some(([op,key,v])=>op==="eq"&&key==="source_import_id"&&v==="driver-report"));
 assert.ok(unmatchedQuery.some(([op,key,v])=>op==="eq"&&key==="status"&&v==="open"));
});
test("DZM1 KPIs display 21 prominently but preserve separate actual count of unique recorded drivers",()=>{
 const component=readFileSync(new URL("../components/operations/MentorView.jsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/mentor.css",import.meta.url),"utf8");
 assert.ok(component.includes("Shift Report Entries"));
 assert.ok(component.includes("Driver Report Scores"));
 assert.ok(component.includes("Unique drivers with an eMentor trip (matched)"));
 assert.ok(component.includes("Encrypted score accounts awaiting driver mapping"));
 assert.ok(component.includes("reportStats?.pendingScores"));
 assert.ok(component.includes("fetchDzm1MentorReportStats(getSupabaseBrowserClient(), organizationId, selectedDate)"));
 assert.ok(component.includes("normalizedSelectedSite !== \"DZM1\""));
 assert.ok(css.includes(".mentor-daily-kpis.dzm1-report-kpis"));
 assert.ok(css.includes(".mentor-shift-total"));
 assert.ok(!component.includes("setRecordedCount(21)"));
});
