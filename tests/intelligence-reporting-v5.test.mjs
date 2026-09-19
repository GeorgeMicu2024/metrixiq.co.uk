import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  availableWeeks,
  buildExecutivePack,
  executivePackCsvRows,
  formatExecutivePackWhatsApp,
} from "../lib/reports/executivePackV2.js";
import { answerExecutiveQuestion } from "../lib/intelligence/executiveAnalystV2.js";

function row({
  id,
  name,
  trid,
  site="DLS2",
  week,
  end,
  fico,
  dcr,
  pod=100,
  cc=100,
  concessions=0,
}) {
  return {
    id:id+"-"+week,
    driver_id:id,
    week_label:week,
    period_end:end,
    mentor_score:fico,
    dcr,
    dsc_dpmo:0,
    lor:0,
    pod,
    cc,
    ce_dpmo:0,
    cdf_dpmo:0,
    psb:0,
    concessions,
    raw_data:{source_files:["DSP-Scorecard.pdf"]},
    drivers:{id,trid,full_name:name,site,status:"active"},
  };
}

function dataset() {
  return {
    metricRows:[
      row({id:"1",name:"Driver One",trid:"D1",week:"W36",end:"2026-09-11",fico:849,dcr:99.9}),
      row({id:"1",name:"Driver One",trid:"D1",week:"W37",end:"2026-09-18",fico:800,dcr:99.2,concessions:2}),
      row({id:"2",name:"Driver Two",trid:"D2",week:"W36",end:"2026-09-11",fico:800,dcr:98.6,concessions:2}),
      row({id:"2",name:"Driver Two",trid:"D2",week:"W37",end:"2026-09-18",fico:825,dcr:99.2,concessions:2}),
    ],
    scorecards:[
      {id:"s36",site:"DLS2",year:2026,week:36,week_label:"W36",overall_score:92,standing:"Fantastic",site_rank:2,focus_areas:[]},
      {id:"s37",site:"DLS2",year:2026,week:37,week_label:"W37",overall_score:88,standing:"Great",site_rank:4,focus_areas:["FICO"]},
    ],
    incidents:[
      {id:"i1",site:"DLS2",week_label:"W37",severity:"high",status:"open",title:"DNR investigation",incident_type:"dnr",driver_id:"1",driver_name:"Driver One"},
    ],
    coaching:[
      {id:"c1",driver_id:"1",status:"open",priority:"high",title:"FICO coaching",due_at:null,drivers:{id:"1",trid:"D1",full_name:"Driver One",site:"DLS2"}},
    ],
    feedback:[
      {id:"f1",driver_id:"1",site:"DLS2",week_label:"W37",dnr_concession:true,scanned_over_25m:false},
    ],
    tasks:[],
    imports:[],
    unmatched:[],
  };
}

test("Executive Pack V2 builds management scope, movement and root causes", () => {
  const data=dataset();
  const pack=buildExecutivePack(data,{site:"DLS2",weekLabel:"W37"});

  assert.equal(pack.fleet.drivers,2);
  assert.equal(pack.siteScorecard.delta,-4);
  assert.equal(pack.incidents.open.length,1);
  assert.equal(pack.coaching.open.length,1);
  assert.equal(pack.evidence.dnrCount,1);
  assert.ok(pack.rootCauses.totalLostPoints>0);
  assert.equal(pack.declined[0].driver_name,"Driver One");
  assert.equal(pack.improved[0].driver_name,"Driver Two");
  assert.ok(pack.actions.length>0);
});

test("Executive Pack honours an explicitly empty custom driver scope", () => {
  const pack=buildExecutivePack(dataset(),{site:"DLS2",weekLabel:"W37",driverIds:[]});
  assert.equal(pack.fleet.drivers,0);
  assert.equal(pack.movement.length,0);
});

test("Weekly Executive Pack exports WhatsApp and CSV-compatible rows", () => {
  const pack=buildExecutivePack(dataset(),{site:"DLS2",weekLabel:"W37"});
  const text=formatExecutivePackWhatsApp(pack);
  const rows=executivePackCsvRows(pack);

  assert.ok(text.includes("*METRIXIQ WEEKLY EXECUTIVE PACK*"));
  assert.ok(text.includes("*ROOT CAUSES*"));
  assert.ok(text.includes("*NEXT ACTIONS*"));
  assert.ok(rows.some((row)=>row.section==="driver_scorecard"));
  assert.ok(rows.some((row)=>row.section==="root_cause"));
});

test("Executive AI Analyst answers point-loss questions from stored evidence", () => {
  const answer=answerExecutiveQuestion(
    dataset(),
    "Which KPI cost us the most scorecard points?",
    {site:"DLS2",weekLabel:"W37"}
  );

  assert.equal(answer.intent,"point_loss");
  assert.ok(answer.answer.includes("scorecard points"));
  assert.ok(answer.facts.length>0);
  assert.equal(answer.scope.site,"DLS2");
  assert.equal(answer.scope.weekLabel,"W37");
});

test("Executive AI Analyst compares a named week against its previous stored period", () => {
  const answer=answerExecutiveQuestion(
    dataset(),
    "Why did performance change in W37?",
    {site:"DLS2",weekLabel:"W37"}
  );

  assert.equal(answer.intent,"why_drop");
  assert.ok(answer.answer.includes("W36"));
  assert.ok(answer.answer.includes("W37"));
  assert.ok(answer.evidence.length>0);
});

test("Executive AI Analyst identifies repeated concessions across stored periods", () => {
  const answer=answerExecutiveQuestion(
    dataset(),
    "Who has repeated concessions?",
    {site:"DLS2",weekLabel:"W37"}
  );

  assert.equal(answer.intent,"repeat_concessions");
  assert.ok(answer.facts.some((fact)=>fact.includes("Driver Two")));
  assert.ok(answer.evidence.some((item)=>item.trid==="D2"));
});

test("availableWeeks exposes stored report periods in order", () => {
  assert.deepEqual(availableWeeks(dataset(),"DLS2"),["W36","W37"]);
});

test("V5 migration creates immutable report history and audited save RPC", () => {
  const sql=fs.readFileSync("supabase/migrations/20260919_intelligence_reporting_v5.sql","utf8").toLowerCase();
  for(const fragment of [
    "create table if not exists public.report_snapshots",
    "alter table public.report_snapshots enable row level security",
    "create or replace function public.save_report_snapshot",
    "create or replace function public.list_report_snapshots",
    "'report_generated'",
    "public.write_audit_event",
  ]){
    assert.ok(sql.includes(fragment),"missing "+fragment);
  }
});

test("V5 product surfaces replace legacy intelligence/report views in workspace routing", () => {
  const dashboard=fs.readFileSync("components/DashboardClient.jsx","utf8");
  const navigation=fs.readFileSync("components/dashboard/navigation.js","utf8");
  const analyst=fs.readFileSync("components/intelligence/ExecutiveAnalystV2.jsx","utf8");
  const reports=fs.readFileSync("components/reports/ReportBuilderV2.jsx","utf8");

  assert.ok(dashboard.includes('./intelligence/ExecutiveAnalystV2'));
  assert.ok(dashboard.includes('./reports/ReportBuilderV2'));
  assert.ok(dashboard.includes("<ExecutiveAnalystV2"));
  assert.ok(dashboard.includes("<ReportBuilderV2"));
  assert.equal(dashboard.includes("<IntelligenceView"),false);
  assert.equal(dashboard.includes("<ReportsView"),false);
  assert.ok(navigation.includes('["intelligence", "AI Analyst"]'));
  assert.ok(navigation.includes('["reports", "Report Builder"]'));
  assert.ok(analyst.includes("Ask MetrixIQ"));
  assert.ok(reports.includes("Weekly Executive Pack"));
  assert.ok(reports.includes("Print / Save PDF"));
  assert.ok(reports.includes("Copy WhatsApp"));
});
