const aliases = {
  id: ["trid", "transporter id", "transporterid", "driver id", "associate id", "da id", "courier id"],
  name: ["driver name", "driver", "da name", "delivery associate", "associate", "courier", "full name", "name"],
  site: ["site", "station", "depot", "location", "delivery station"],
  dcr: ["dcr", "delivery completion rate", "delivery completion", "completion rate"],
  pod: ["pod", "photo on delivery", "photo compliance", "proof of delivery", "pod quality"],
  iadc: ["iadc", "driver compliance", "delivery compliance"],
  cc: ["cc", "contact compliance", "contact rate"],
  fico: ["fico", "fico score", "driving score"],
  ementor: ["ementor", "e mentor", "ementor score", "mentor score"],
  psb: ["psb", "pickup success", "pick up success", "collection success"],
  reattempts: ["reattempt", "reattempts", "reattempt compliance", "re attempt"],
  concessions: ["concessions", "concession", "dnr", "dnr count", "defects"],
  lor: ["lor", "loss on route", "lost on route", "losses"],
};
const metrics = ["dcr","pod","iadc","cc","fico","ementor","psb","reattempts","concessions","lor"];
const pctMetrics = new Set(["dcr","pod","iadc","cc","psb","reattempts"]);

function clean(v){ return String(v ?? "").toLowerCase().replace(/[._\-/()%]+/g," ").replace(/\s+/g," ").trim(); }
function normId(v){ return String(v ?? "").trim().toUpperCase().replace(/\s+/g,""); }
function findKey(headers, wanted){
  let best=null;
  for(const h of headers){
    const s=clean(h);
    for(const alias of aliases[wanted]||[]){
      const a=clean(alias); let score=0;
      if(s===a) score=100; else if(s.includes(a)||a.includes(s)) score=90;
      else { const st=new Set(s.split(" ")); const p=a.split(" "); const ov=p.filter(x=>st.has(x)).length; if(ov) score=60+(ov/p.length)*25; }
      if(!best||score>best.score) best={header:h,score};
    }
  }
  return best&&best.score>=72?best.header:null;
}
function numeric(v,key){
  if(v===null||v===undefined||v==="") return null;
  let n=typeof v==="number"?v:Number(String(v).replace(/,/g,"").replace(/%/g,"").trim());
  if(!Number.isFinite(n)) return null;
  if(pctMetrics.has(key)&&n<=1.01) n*=100;
  return n;
}
function avg(arr){ return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:undefined; }
function initials(name){ return name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(); }
function riskFor(m){
  let p=0;
  if((m.pod??100)<97) p+=2; if((m.iadc??100)<80) p+=2; if((m.dcr??100)<98) p+=2;
  if((m.concessions??0)>4) p+=2; if((m.lor??0)>2) p+=2; if((m.fico??900)<790) p+=1; if((m.ementor??900)<815) p+=1;
  return p>=4?"High":p>=2?"Medium":"Low";
}
function performanceFor(m){
  const parts=[];
  for(const k of ["dcr","pod","iadc","cc","psb","reattempts"]) if(m[k]!=null) parts.push(Math.min(100,Math.max(0,m[k])));
  if(m.fico!=null) parts.push(Math.min(100,m.fico/8.5));
  if(m.ementor!=null) parts.push(Math.min(100,m.ementor/8.5));
  if(m.concessions!=null) parts.push(Math.max(0,100-m.concessions*6));
  if(m.lor!=null) parts.push(Math.max(0,100-m.lor*8));
  return Math.round(avg(parts)??0);
}
function issueFor(m,risk){
  if((m.pod??100)<97) return "POD below target";
  if((m.iadc??100)<80) return "IADC compliance below target";
  if((m.dcr??100)<98) return "DCR completion risk";
  if((m.ementor??900)<815) return "eMentor below 815";
  if((m.fico??900)<790) return "FICO driving score risk";
  if((m.concessions??0)>4) return "High concessions";
  return risk==="Medium"?"Performance consistency needs review":"No active concern";
}

async function tableFromFile(file){
  const ext=file.name.split(".").pop()?.toLowerCase();
  if(["xlsx","xls","csv"].includes(ext)){
    const XLSX=await import("xlsx");
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    if(!sheet) return null;
    const rows=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false});
    const headers=rows.length?Object.keys(rows[0]):[];
    return {fileName:file.name,headers,rows};
  }
  if(ext==="json"){
    const obj=JSON.parse(await file.text());
    const rows=Array.isArray(obj)?obj:Array.isArray(obj.rows)?obj.rows:[obj];
    return {fileName:file.name,headers:rows[0]?Object.keys(rows[0]):[],rows};
  }
  return null;
}

export async function inspectPdf(file){
  try{
    const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),disableWorker:true}).promise;
    let text="";
    for(let i=1;i<=Math.min(doc.numPages,3);i++){
      const page=await doc.getPage(i); const c=await page.getTextContent();
      text += " " + c.items.map(x=>x.str||"").join(" ");
    }
    return {pages:doc.numPages,preview:text.replace(/\s+/g," ").trim().slice(0,360)};
  }catch{ return {pages:0,preview:"PDF detected. Text preview unavailable in this browser."}; }
}

export async function analyseFiles(files){
  const tables=[]; const pdfs=[];
  for(const file of files){
    const ext=file.name.split(".").pop()?.toLowerCase();
    if(ext==="pdf") pdfs.push({name:file.name,...await inspectPdf(file)});
    else { const t=await tableFromFile(file); if(t) tables.push(t); }
  }
  const schedule=new Map();
  for(const t of tables){
    const idH=findKey(t.headers,"id"), nameH=findKey(t.headers,"name"), siteH=findKey(t.headers,"site");
    const metricHeaders=metrics.map(k=>findKey(t.headers,k)).filter(Boolean);
    const looksMaster=(idH&&nameH&&metricHeaders.length===0)||/(master|schedule|roster)/i.test(t.fileName);
    if(looksMaster&&idH&&nameH){
      for(const row of t.rows){ const id=normId(row[idH]); const name=String(row[nameH]??"").trim(); if(id&&name) schedule.set(id,{name,site:siteH?String(row[siteH]??"").trim():""}); }
    }
  }
  const raw=new Map(); let matchedByTrid=0, unmatchedDrivers=0;
  for(const t of tables){
    const idH=findKey(t.headers,"id"), nameH=findKey(t.headers,"name"), siteH=findKey(t.headers,"site");
    const metricMap={}; for(const k of metrics){ const h=findKey(t.headers,k); if(h) metricMap[h]=k; }
    if(!Object.keys(metricMap).length) continue;
    for(const row of t.rows){
      const id=idH?normId(row[idH]):""; let name=nameH?String(row[nameH]??"").trim():"";
      const master=id?schedule.get(id):null; if(!name&&master?.name){ name=master.name; matchedByTrid++; } else if(id&&name&&master?.name) matchedByTrid++;
      if(!name&&id) unmatchedDrivers++;
      if(!name&&!id) continue;
      const key=id||`NAME:${clean(name)}`; const cur=raw.get(key)||{id,name,site:"",metrics:{}};
      cur.name ||= name; cur.site ||= (siteH?String(row[siteH]??"").trim():"")||master?.site||"Unknown";
      for(const [h,k] of Object.entries(metricMap)){ const n=numeric(row[h],k); if(n!=null){ if(!cur.metrics[k])cur.metrics[k]=[]; cur.metrics[k].push(n); } }
      raw.set(key,cur);
    }
  }
  const drivers=[];
  for(const [key,r] of raw){
    const m={}; for(const [k,v] of Object.entries(r.metrics)) m[k]=avg(v);
    if(!Object.keys(m).length) continue;
    const risk=riskFor(m), performance=performanceFor(m), name=r.name||r.id||"Unmatched driver";
    drivers.push({id:r.id||key,name,initials:initials(name),site:r.site||"Unknown",performance,risk,dcr:m.dcr??0,pod:m.pod??0,iadc:m.iadc??0,cc:m.cc??0,fico:m.fico??0,ementor:m.ementor??0,psb:m.psb??0,reattempts:m.reattempts??0,concessions:m.concessions??0,lor:m.lor??0,issue:issueFor(m,risk)});
  }
  drivers.sort((a,b)=>({High:0,Medium:1,Low:2}[a.risk]-{High:0,Medium:1,Low:2}[b.risk]||a.performance-b.performance));
  const kpis={}; for(const k of metrics){ const vals=drivers.map(d=>d[k]).filter(v=>v!==0&&Number.isFinite(v)); const a=avg(vals); if(a!=null)kpis[k]=Number(a.toFixed(["concessions","lor"].includes(k)?2:1)); }
  return {sourceFiles:files.map(f=>f.name),scheduleEntries:schedule.size,matchedByTrid,unmatchedDrivers,driverCount:drivers.length,kpis,drivers,pdfs};
}
