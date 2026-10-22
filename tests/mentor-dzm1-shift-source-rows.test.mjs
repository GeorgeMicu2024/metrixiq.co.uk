import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseMentorTripMatrix} from "../lib/analyzer/spreadsheet.js";
import {mentorReportStatsFromImports} from "../lib/data/mentorReportStats.js";
import {persistImportAudit} from "../lib/persistence/evidence.js";

const header=["First Name","Last Name","Vehicle Identifier","Begin Route Time","End Route Time","Total Driver Hours","Total Driver Miles","Trip","Short Trip"];
const line=(first,last,begin,end,trip=1)=>[first,last,"TEST-VEHICLE",begin,end,"01:30","22.4",trip,"false"];

test("DZM1 preserves every Shift Report row, including duplicate driver trips and variant names",()=>{
  const matrix=[header,line("Sonia","Balaban","2:20 pm","3:42 pm"),line("Sonia","Balaban","3:42 pm","5:19 pm"),line("Daniel","Hotin","10:44 am","1:29 pm"),line("Daniel","Hotin2","1:31 pm","3:10 pm")];
  const result=parseMentorTripMatrix(matrix,"Shift Report_2026-10-21.xlsx","Shift Report (VRM)");
  assert.equal(result.reportType,"mentor_trip");
  assert.equal(result.rows,4);
  assert.deepEqual(result.sourceEntries.map(e=>[e.row,e.name,e.begin,e.end,e.trips]),[
    [2,"Sonia Balaban","2:20 pm","3:42 pm",1],
    [3,"Sonia Balaban","3:42 pm","5:19 pm",1],
    [4,"Daniel Hotin","10:44 am","1:29 pm",1],
    [5,"Daniel Hotin2","1:31 pm","3:10 pm",1]
  ]);
  assert.ok(result.sourceEntries.every(e=>!Object.hasOwn(e,"vehicleIdentifier")),"source entries exclude registration numbers and device identifiers");
});
test("DZM1 reads original source rows from audit metadata, never substitutes score identities",()=>{
  const entries=[{row:2,name:"Sonia Balaban",begin:"2:20 pm",end:"3:42 pm",trips:1},{row:3,name:"Sonia Balaban",begin:"3:42 pm",end:"5:19 pm",trips:1}];
  const stats=mentorReportStatsFromImports([
    {id:"shift",detected_report_type:"mentor_trip",metadata:{rows:2,mentor_shift_entries:entries},created_at:"2026-10-22T12:00:00Z"},
    {id:"scores",detected_report_type:"mentor",metadata:{rows:1},created_at:"2026-10-22T12:00:00Z"}
  ]);
  assert.equal(stats.shiftRows,2);
  assert.deepEqual(stats.shiftEntries,entries);
  assert.equal(stats.driverRows,1);
  assert.equal(stats.scoreImportId,"scores");
});
test("DZM1 daily import stores all Shift rows in existing metadata without merging duplicate trips",async()=>{
  const entries=[{row:2,name:"Sonia Balaban",begin:"2:20 pm",end:"3:42 pm",trips:1},{row:3,name:"Sonia Balaban",begin:"3:42 pm",end:"5:19 pm",trips:1}];
  let saved=[];
  const supabase={from(table){
    assert.equal(table,"imports");
    return {insert(payload){saved=payload;return {select(){return Promise.resolve({data:payload.map((p,i)=>({id:"import-"+i,file_name:p.file_name})),error:null})}}}};
  }};
  await persistImportAudit(supabase,"org-1",{
    importContext:{type:"mentor-daily",reportDate:"2026-10-21"},
    fileResults:[{name:"Shift Report_2026-10-21.xlsx",type:"xlsx",reportType:"mentor_trip",status:"parsed",rows:2,recognised:true,mentorShiftEntries:entries,site:"DZM1"}]
  },[{name:"Shift Report_2026-10-21.xlsx",size:2000}],"DZM1");
  assert.equal(saved.length,1);
  assert.deepEqual(saved[0].metadata.mentor_shift_entries,entries);
  assert.equal(saved[0].metadata.rows,2);
  assert.equal(saved[0].site,"DZM1");
});
test("Other stations do not gain extra Shift Report metadata automatically",async()=>{
  const entries=[{row:2,name:"A B",begin:"",end:"",trips:1}];
  let payload=[];
  const supabase={from(){return {insert(rows){payload=rows;return {select(){return Promise.resolve({data:[{id:"1",file_name:"source.xlsx"}],error:null})}}}}}};
  await persistImportAudit(supabase,"org",{
    importContext:{type:"mentor-daily",reportDate:"2026-10-21"},
    fileResults:[{name:"source.xlsx",type:"xlsx",reportType:"mentor_trip",rows:1,status:"parsed",mentorShiftEntries:entries}]
  },[{name:"source.xlsx"}],"DLS2");
  assert.equal(payload[0].metadata.mentor_shift_entries,undefined);
});
test("DZM1 daily page visibly lists every retained entry under the unchanged score table",()=>{
  const source=readFileSync(new URL("../components/operations/MentorView.jsx",import.meta.url),"utf8");
  const sheet=readFileSync(new URL("../app/mentor.css",import.meta.url),"utf8");
  const analyzer=readFileSync(new URL("../lib/analyzer.js",import.meta.url),"utf8");
  assert.ok(source.includes('All Trip Entries — {dzm1ShiftRows}'));
  assert.ok(source.includes('reportStats.shiftEntries.map((entry,i)=>('));
  assert.ok(source.includes('entry.name'));
  assert.ok(source.includes('entry.begin'));
  assert.ok(source.includes('entry.end'));
  assert.ok(source.includes('normalizedSelectedSite==="DZM1"&&dzm1ShiftRows!=null'));
  assert.ok(source.includes('<MentorReportTable'));
  assert.ok(sheet.includes('.mentor-shift-source-table'));
  assert.ok(analyzer.includes('mentorShiftEntries.push(...output.sourceEntries)'));
});
