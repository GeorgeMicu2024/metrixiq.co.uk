const aliases = {
  id: ["trid", "transporter id", "transporterid", "driver id", "associate id", "da id", "courier id"],
  name: ["driver name", "driver", "da name", "delivery associate", "associate", "courier", "full name", "name"],
  site: ["site", "station", "depot", "location", "delivery station"],
  dcr: ["dcr", "delivery completion rate", "delivery completion", "completion rate"],
  pod: ["pod", "photo on delivery", "photo-on-delivery", "photo compliance", "proof of delivery", "pod quality"],
  iadc: ["iadc", "iadc %", "driver compliance", "in app delivery workflow", "in-app delivery workflow", "delivery compliance"],
  cc: ["cc", "contact compliance", "contact compliance %", "contact rate"],
  fico: ["fico", "fico score", "safe driving metric", "driving score"],
  ementor: ["ementor", "e mentor", "e-mentor", "ementor score", "mentor score"],
  psb: ["psb", "pickup success", "pick up success", "pickup success behaviours"],
  reattempts: ["reattempt", "reattempts", "reattempt compliance", "re attempt"],
  concessions: ["concessions", "concession", "dnr count", "defects"],
  lor: ["lor", "loss on route", "lost on route", "losses"],
  phr: ["phr", "preference honour rate", "preference honor rate"],
  dwc: ["dwc", "dwc %", "delivery workflow compliance"],
  rts: ["rts", "returned to station"],
  dnr: ["dnr", "delivered not received"],
  podFails: ["pod fails", "pod fail", "pod rejects", "photo rejects"],
  ccFails: ["cc fails", "cc fail", "contact failures"],
  delivered: ["delivered", "delivered packages"],
  dsc: ["dsc", "dsc dpmo", "delivery success conditions"],
  ce: ["ce", "customer escalation", "customer escalations"],
  cdf: ["cdf", "cdf dpmo", "customer delivery feedback"],
};

const coreMetrics = ["dcr","pod","iadc","cc","fico","ementor","psb","reattempts","concessions","lor"];
const extraMetrics = ["phr","dwc","rts","dnr","podFails","ccFails","delivered","dsc","ce","cdf"];
const allMetrics = [...coreMetrics, ...extraMetrics];
const pctMetrics = new Set(["dcr","pod","iadc","cc","psb","reattempts","phr","dwc"]);
const spreadsheetExts = new Set(["xlsx","xls","xlsm","xlsb","ods","fods","csv","tsv"]);
const textExts = new Set(["txt"]);
const htmlExts = new Set(["html","htm"]);

function clean(v){ return String(v ?? "").toLowerCase().replace(/&nbsp;/g," ").replace(/[._\-/()%]+/g," ").replace(/\s+/g," ").trim(); }
function normId(v){ return String(v ?? "").trim().toUpperCase().replace(/\s+/g,""); }
function isTrid(v){ return /^A[A-Z0-9]{8,}$/.test(normId(v)); }
function numeric(v,key){
  if(v===null||v===undefined||v===""||v==="-"||String(v).trim().toLowerCase()==="none") return null;
  let n=typeof v==="number"?v:Number(String(v).replace(/,/g,"").replace(/%/g,"").trim());
  if(!Number.isFinite(n)) return null;
  if(pctMetrics.has(key)&&n<=1.01) n*=100;
  return n;
}
function avg(arr){ return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:undefined; }
function initials(name){ return String(name||"").split(/\s+/).filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"DA"; }
function findKey(headers,wanted){
  let best=null;
  for(const h of headers||[]){
    const s=clean(h);
    if(!s) continue;
    for(const alias of aliases[wanted]||[]){
      const a=clean(alias); let score=0;
      if(s===a) score=100;
      else if(s.includes(a)||a.includes(s)) score=90;
      else { const st=new Set(s.split(" ")); const p=a.split(" "); const ov=p.filter(x=>st.has(x)).length; if(ov) score=60+(ov/p.length)*25; }
      if(!best||score>best.score) best={header:h,score};
    }
  }
  return best&&best.score>=72?best.header:null;
}
function riskFor(m){
  let p=0;
  if((m.pod??100)<97) p+=2;
  if((m.iadc??100)<80) p+=2;
  if((m.dcr??100)<98) p+=2;
  if((m.concessions??0)>4) p+=2;
  if((m.lor??0)>2) p+=2;
  if((m.fico??900)<790) p+=1;
  if((m.ementor??900)<815) p+=1;
  if((m.cc??100)<95) p+=1;
  return p>=4?"High":p>=2?"Medium":"Low";
}
function performanceFor(m){
  const parts=[];
  for(const k of ["dcr","pod","iadc","cc","reattempts"]) if(m[k]!=null) parts.push(Math.min(100,Math.max(0,m[k])));
  if(m.fico!=null) parts.push(Math.min(100,m.fico/8.5));
  if(m.ementor!=null) parts.push(Math.min(100,m.ementor/8.5));
  if(m.concessions!=null) parts.push(Math.max(0,100-m.concessions*6));
  if(m.lor!=null) parts.push(Math.max(0,100-m.lor*8));
  return Math.round(avg(parts)??0);
}
function issueFor(m,risk){
  if((m.pod??100)<97) return "POD below target";
  if((m.iadc??100)<80) return "IADC compliance below target";
  if((m.cc??100)<95) return "Contact Compliance below target";
  if((m.dcr??100)<98) return "DCR completion risk";
  if((m.ementor??900)<815) return "eMentor below 815";
  if((m.fico??900)<790) return "FICO driving score risk";
  if((m.concessions??0)>4) return "High concessions";
  if((m.podFails??0)>2) return "Repeated POD failures";
  if((m.ccFails??0)>2) return "Repeated contact failures";
  return risk==="Medium"?"Performance consistency needs review":"No active concern";
}
function uniqueHeaders(headers){
  const seen=new Map();
  return headers.map((h,i)=>{
    const base=String(h||`Column ${i+1}`).trim()||`Column ${i+1}`;
    const n=(seen.get(base)||0)+1; seen.set(base,n);
    return n===1?base:`${base} ${n}`;
  });
}
function rowsFromMatrix(matrix,fileName,label="Table"){
  if(!matrix?.length) return null;
  let headerIndex=matrix.findIndex(r=>r.some(c=>clean(c)==="transporter id"||clean(c)==="trid"));
  if(headerIndex<0) headerIndex=0;
  const headers=uniqueHeaders(matrix[headerIndex]||[]);
  const rows=[];
  for(const cells of matrix.slice(headerIndex+1)){
    if(!cells?.some(c=>String(c??"").trim())) continue;
    const row={}; headers.forEach((h,i)=>row[h]=cells[i]??""); rows.push(row);
  }
  return {fileName,label,headers,rows};
}
function tableMatrix(table){
  return Array.from(table.querySelectorAll("tr")).map(tr=>Array.from(tr.querySelectorAll(":scope > th, :scope > td")).map(c=>c.textContent.replace(/\s+/g," ").trim())).filter(r=>r.length);
}
function transporterTable(table,fileName,label){
  const matrix=tableMatrix(table);
  const headerIndex=matrix.findIndex(r=>r.some(c=>["transporter id","trid"].includes(clean(c))));
  if(headerIndex<0) return null;
  const header=matrix[headerIndex];
  const idIndex=header.findIndex(c=>["transporter id","trid"].includes(clean(c)));
  const wantedIndexes=[];
  header.forEach((h,i)=>{
    const c=clean(h);
    if(i===idIndex || ["dwc","dwc %","iadc","iadc %","contact compliance","phr","dcr","pod","cc"].includes(c)) wantedIndexes.push(i);
  });
  const useIndexes=wantedIndexes.length>1?wantedIndexes:header.map((_,i)=>i);
  const headers=uniqueHeaders(useIndexes.map(i=>header[i]));
  const rows=[];
  for(const cells of matrix.slice(headerIndex+1)){
    const id=normId(cells[idIndex]); if(!isTrid(id)) continue;
    const row={}; useIndexes.forEach((idx,j)=>row[headers[j]]=cells[idx]??""); rows.push(row);
  }
  return rows.length?{fileName,label,headers,rows}:null;
}

async function parseSpreadsheet(file){
  const XLSX=await import("xlsx");
  const ext=file.name.split(".").pop()?.toLowerCase();
  let wb;
  if(ext==="csv"||ext==="tsv") wb=XLSX.read(await file.text(),{type:"string",cellDates:true,FS:ext==="tsv"?"\t":undefined});
  else wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
  const tables=[];
  for(const sheetName of wb.SheetNames){
    const sheet=wb.Sheets[sheetName]; if(!sheet) continue;
    const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false,blankrows:false});
    const table=rowsFromMatrix(matrix,file.name,sheetName); if(table?.rows?.length) tables.push(table);
  }
  return tables;
}
async function parseJson(file){
  const obj=JSON.parse(await file.text());
  const arrays=[];
  function visit(value,label="JSON"){
    if(Array.isArray(value)&&value.length&&value.every(x=>x&&typeof x==="object"&&!Array.isArray(x))) arrays.push({label,rows:value});
    else if(value&&typeof value==="object") for(const [k,v] of Object.entries(value)) visit(v,k);
  }
  visit(obj);
  if(!arrays.length){ const rows=Array.isArray(obj)?obj:Array.isArray(obj?.rows)?obj.rows:[obj]; arrays.push({label:"JSON",rows}); }
  return arrays.map(({label,rows})=>({fileName:file.name,label,headers:rows[0]?Object.keys(rows[0]):[],rows})).filter(t=>t.rows.length);
}
async function parseXml(file){
  const doc=new DOMParser().parseFromString(await file.text(),"application/xml");
  if(doc.querySelector("parsererror")) throw new Error("Invalid XML document");
  const candidates=Array.from(doc.documentElement.children);
  const groups=new Map();
  for(const el of candidates){
    const key=el.tagName; if(!groups.has(key)) groups.set(key,[]);
    const row={}; Array.from(el.children).forEach(c=>row[c.tagName]=c.textContent.trim());
    if(Object.keys(row).length) groups.get(key).push(row);
  }
  return Array.from(groups,([label,rows])=>({fileName:file.name,label,headers:rows[0]?Object.keys(rows[0]):[],rows})).filter(t=>t.rows.length);
}
async function parseText(file){
  const text=await file.text();
  const lines=text.split(/\r?\n/).filter(Boolean);
  if(!lines.length) return [];
  const delimiter=lines[0].includes("\t")?"\t":lines[0].includes(";")?";":",";
  if(lines[0].includes(delimiter)){
    const XLSX=await import("xlsx");
    const wb=XLSX.read(text,{type:"string",FS:delimiter});
    const sheet=wb.Sheets[wb.SheetNames[0]];
    const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false,blankrows:false});
    const table=rowsFromMatrix(matrix,file.name,"Text table"); return table?[table]:[];
  }
  return [];
}
async function parseHtml(file){
  const text=await file.text();
  const doc=new DOMParser().parseFromString(text,"text/html");
  const name=file.name.toLowerCase();
  const tables=[];

  if(name.includes("dwc-iadc")||clean(doc.body?.textContent).includes("7 week rolling iadc")){
    const week=doc.querySelector('section[data-tab^="week_"]')||doc;
    for(const table of week.querySelectorAll("table")){
      const tx=clean(table.textContent);
      if(tx.includes("transporter id")&&tx.includes("dwc")&&tx.includes("iadc")){
        const parsed=transporterTable(table,file.name,"DWC / IADC weekly driver summary"); if(parsed) tables.push(parsed);
      }
    }
    if(tables.length) return tables;
  }

  if(name.includes("daily-report")){
    const summary=doc.querySelector('section[data-tab="summary"] table')||Array.from(doc.querySelectorAll("table")).find(t=>clean(t.textContent).includes("transporter id")&&clean(t.textContent).includes("pod fails"));
    if(summary){ const parsed=rowsFromMatrix(tableMatrix(summary),file.name,"Daily driver exceptions"); if(parsed) tables.push(parsed); }
    return tables;
  }

  if(name.includes("contact-compliance")){
    const summary=Array.from(doc.querySelectorAll("table")).find(t=>clean(t.textContent).includes("contact compliance")&&clean(t.textContent).includes("transporter id"));
    if(summary){ const parsed=rowsFromMatrix(tableMatrix(summary),file.name,"Contact Compliance driver summary"); if(parsed) tables.push(parsed); }
    return tables;
  }

  if(name.includes("phr")){
    const summary=Array.from(doc.querySelectorAll("table")).find(t=>clean(t.textContent).includes("transporter id")&&clean(t.textContent).includes("phr"));
    if(summary){ const parsed=rowsFromMatrix(tableMatrix(summary),file.name,"PHR driver summary"); if(parsed) tables.push(parsed); }
    return tables;
  }

  for(const [i,table] of Array.from(doc.querySelectorAll("table")).entries()){
    const parsed=transporterTable(table,file.name,`HTML table ${i+1}`)||rowsFromMatrix(tableMatrix(table),file.name,`HTML table ${i+1}`);
    if(parsed?.rows?.length) tables.push(parsed);
  }
  return tables;
}

async function extractPdf(file){
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),disableWorker:true}).promise;
  const pageTexts=[];
  for(let i=1;i<=Math.min(doc.numPages,30);i++){
    const page=await doc.getPage(i); const c=await page.getTextContent();
    let text="",lastY=null;
    for(const item of c.items){
      const y=item.transform?.[5];
      if(lastY!=null&&y!=null&&Math.abs(y-lastY)>2.5) text+="\n";
      else if(text&&!text.endsWith("\n")) text+=" ";
      text+=item.str||""; lastY=y;
      if(item.hasEOL) text+="\n";
    }
    pageTexts.push(text.replace(/[ \t]+/g," ").replace(/\n{2,}/g,"\n").trim());
  }
  const text=pageTexts.join("\n");
  return {pages:doc.numPages,text,pageTexts,preview:text.replace(/\s+/g," ").trim().slice(0,500)};
}
function pdfRowsFromPod(fileName,text){
  const rows=[];
  const re=/\b(A[A-Z0-9]{8,})\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\b/g;
  let m;
  while((m=re.exec(text))){
    const opportunities=Number(m[2]),success=Number(m[3]);
    if(!opportunities) continue;
    rows.push({"Transporter ID":m[1],"POD":Number((success/opportunities*100).toFixed(4)),"POD Opportunities":opportunities,"POD Success":success,"POD Bypass":Number(m[4]),"POD Rejects":Number(m[5])});
  }
  return rows.length?[{fileName,label:"POD Quality driver summary",headers:Object.keys(rows[0]),rows}]:[];
}
function pdfRowsFromScorecard(fileName,text){
  const rows=[];
  const normalized=text.replace(/\s+/g," ");
  const re=/\b\d+\s+(A[A-Z0-9]{8,})\s+(\d+)\s+([\d.]+%)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+%|-)\s+([\d.-]+%|-)\s+([\d.-]+)\s+([\d.-]+|-)\s+([\d.-]+)/g;
  let m;
  while((m=re.exec(normalized))){
    rows.push({"Transporter ID":m[1],"Delivered":m[2],"DCR":m[3],"DSC":m[4],"LoR":m[5],"POD":m[6],"CC":m[7],"CE":m[8],"CDF":m[9],"PSB raw":m[10]});
  }
  return rows.length?[{fileName,label:"DSP Scorecard driver summary",headers:Object.keys(rows[0]),rows}]:[];
}
function pdfRowsFromEscalations(fileName,text){
  const ids=[...text.matchAll(/\b(A[A-Z0-9]{8,})\b/g)].map(m=>m[1]);
  const unique=[...new Set(ids)];
  if(!unique.length) return [];
  const rows=unique.map(id=>({"Transporter ID":id,"CE":1}));
  return [{fileName,label:"Customer Escalations driver incidents",headers:Object.keys(rows[0]),rows}];
}
async function parsePdf(file){
  const extracted=await extractPdf(file);
  const name=file.name.toLowerCase(),text=extracted.text;
  let tables=[];
  if(name.includes("pod")||/photo on delivery quality report/i.test(text)) tables=pdfRowsFromPod(file.name,text);
  else if(name.includes("scorecard")||/dsp weekly scorecard/i.test(text)) tables=pdfRowsFromScorecard(file.name,text);
  else if(name.includes("escalation")||/customer escalations/i.test(text)) tables=pdfRowsFromEscalations(file.name,text);
  return {tables,pdf:{name:file.name,pages:extracted.pages,preview:extracted.preview,recognized:tables.length>0}};
}

async function parseFile(file){
  const ext=file.name.split(".").pop()?.toLowerCase()||"";
  if(spreadsheetExts.has(ext)) return {tables:await parseSpreadsheet(file),kind:"spreadsheet"};
  if(ext==="json") return {tables:await parseJson(file),kind:"json"};
  if(ext==="xml") return {tables:await parseXml(file),kind:"xml"};
  if(textExts.has(ext)) return {tables:await parseText(file),kind:"text"};
  if(htmlExts.has(ext)) return {tables:await parseHtml(file),kind:"html"};
  if(ext==="pdf") return {...await parsePdf(file),kind:"pdf"};
  return {tables:[],kind:ext||"unknown",unsupported:true};
}

export async function inspectPdf(file){
  try{ const x=await extractPdf(file); return {pages:x.pages,preview:x.preview}; }
  catch{ return {pages:0,preview:"PDF detected. Text preview unavailable in this browser."}; }
}


function isoWeekDetails(year, week){
  const jan4=new Date(Date.UTC(year,0,4));
  const jan4Day=jan4.getUTCDay()||7;
  const monday=new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate()-(jan4Day-1)+(week-1)*7);
  const sunday=new Date(monday);
  sunday.setUTCDate(monday.getUTCDate()+6);
  return {
    key:`${year}-W${String(week).padStart(2,"0")}`,
    weekLabel:`W${String(week).padStart(2,"0")}`,
    year,week,
    periodStart:monday.toISOString().slice(0,10),
    periodEnd:sunday.toISOString().slice(0,10),
  };
}
function isoWeekFromDate(date){
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  const day=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const year=d.getUTCFullYear();
  const yearStart=new Date(Date.UTC(year,0,1));
  const week=Math.ceil((((d-yearStart)/86400000)+1)/7);
  return isoWeekDetails(year,week);
}
function inferReportPeriod(source){
  const text=String(source||"");
  let m=text.match(/(?:week|wk|w)[\s_\-]*(\d{1,2})(?:[^0-9]|$)/i);
  if(m){
    const week=Number(m[1]);
    const yearMatch=text.match(/\b(20\d{2})\b/);
    const year=yearMatch?Number(yearMatch[1]):new Date().getUTCFullYear();
    if(week>=1&&week<=53) return isoWeekDetails(year,week);
  }
  m=text.match(/\b(20\d{2})[\-_](\d{1,2})(?![\-_]\d{1,2})\b/);
  if(m){
    const year=Number(m[1]),week=Number(m[2]);
    if(week>=1&&week<=53) return isoWeekDetails(year,week);
  }
  m=text.match(/\b(20\d{2})[\-_](\d{2})[\-_](\d{2})\b/);
  if(m){
    const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
    if(!Number.isNaN(d.getTime())) return isoWeekFromDate(d);
  }
  return isoWeekFromDate(new Date());
}
function driverFromRecord(r,key){
  const m={}; for(const [k,v] of Object.entries(r.metrics)) m[k]=avg(v);
  const risk=riskFor(m),performance=performanceFor(m),name=r.name||r.id||"Unmatched driver";
  return {
    id:r.id||key,name,initials:initials(name),site:r.site||"Unknown",performance,risk,
    dcr:m.dcr??0,pod:m.pod??0,iadc:m.iadc??0,cc:m.cc??0,fico:m.fico??0,ementor:m.ementor??0,psb:m.psb??0,
    reattempts:m.reattempts??0,concessions:m.concessions??0,lor:m.lor??0,phr:m.phr??null,dwc:m.dwc??null,
    rts:m.rts??0,dnr:m.dnr??0,podFails:m.podFails??0,ccFails:m.ccFails??0,delivered:m.delivered??null,dsc:m.dsc??null,ce:m.ce??0,cdf:m.cdf??null,
    issue:issueFor(m,risk),sources:[...r.sources],rawMetrics:m,
  };
}

export async function analyseFiles(files){
  const tables=[],pdfs=[],fileResults=[];
  for(const file of files){
    try{
      const parsed=await parseFile(file);
      const period=inferReportPeriod(`${file.name} ${parsed.pdf?.preview||""}`);
      for(const table of parsed.tables||[]) tables.push({...table,period});
      if(parsed.pdf) pdfs.push(parsed.pdf);
      const rows=(parsed.tables||[]).reduce((n,t)=>n+(t.rows?.length||0),0);
      fileResults.push({
        name:file.name,type:parsed.kind,status:parsed.unsupported?"unsupported":rows||parsed.pdf?"parsed":"read",
        rows,recognized:rows>0||!!parsed.pdf?.recognized,period
      });
    }catch(e){
      fileResults.push({name:file.name,type:file.name.split(".").pop()?.toLowerCase()||"unknown",status:"error",rows:0,recognized:false,error:e?.message||"Could not parse file"});
    }
  }

  const schedule=new Map();
  for(const t of tables){
    const idH=findKey(t.headers,"id"),nameH=findKey(t.headers,"name"),siteH=findKey(t.headers,"site");
    const metricHeaders=allMetrics.map(k=>findKey(t.headers,k)).filter(Boolean);
    const looksMaster=(idH&&nameH&&metricHeaders.length===0)||/(master|schedule|roster|driver.?list)/i.test(t.fileName);
    if(looksMaster&&idH&&nameH){
      for(const row of t.rows){
        const id=normId(row[idH]),name=String(row[nameH]??"").trim();
        if(id&&name) schedule.set(id,{name,site:siteH?String(row[siteH]??"").trim():""});
      }
    }
  }

  const aggregateRaw=new Map();
  const periodRaw=new Map();
  let matchedByTrid=0,unmatchedDrivers=0;

  function addRecord(target,key,id,name,site,master,row,metricMap,fileName){
    const cur=target.get(key)||{id,name,site:"",metrics:{},sources:new Set()};
    cur.name ||= name;
    cur.site ||= site||master?.site||"Unknown";
    for(const [h,k] of Object.entries(metricMap)){
      const n=numeric(row[h],k);
      if(n!=null){ if(!cur.metrics[k]) cur.metrics[k]=[]; cur.metrics[k].push(n); }
    }
    cur.sources.add(fileName);
    target.set(key,cur);
  }

  for(const t of tables){
    const idH=findKey(t.headers,"id"),nameH=findKey(t.headers,"name"),siteH=findKey(t.headers,"site");
    const metricMap={}; for(const k of allMetrics){ const h=findKey(t.headers,k); if(h) metricMap[h]=k; }
    if(!Object.keys(metricMap).length) continue;

    const period=t.period||inferReportPeriod(t.fileName);
    if(!periodRaw.has(period.key)) periodRaw.set(period.key,{...period,sourceFiles:new Set(),raw:new Map()});
    const periodBucket=periodRaw.get(period.key);
    periodBucket.sourceFiles.add(t.fileName);

    for(const row of t.rows){
      const id=idH?normId(row[idH]):"";
      let name=nameH?String(row[nameH]??"").trim():"";
      const master=id?schedule.get(id):null;
      if(!name&&master?.name){ name=master.name; matchedByTrid++; }
      else if(id&&name&&master?.name) matchedByTrid++;
      if(!name&&id) unmatchedDrivers++;
      if(!name&&!id) continue;
      const key=id||`NAME:${clean(name)}`;
      const site=(siteH?String(row[siteH]??"").trim():"");
      addRecord(aggregateRaw,key,id,name,site,master,row,metricMap,t.fileName);
      addRecord(periodBucket.raw,key,id,name,site,master,row,metricMap,t.fileName);
    }
  }

  const drivers=[...aggregateRaw.entries()].map(([key,r])=>driverFromRecord(r,key)).filter(d=>Object.keys(d.rawMetrics||{}).length);
  drivers.sort((a,b)=>({High:0,Medium:1,Low:2}[a.risk]-{High:0,Medium:1,Low:2}[b.risk]||a.performance-b.performance));

  const periods=[...periodRaw.values()].map(bucket=>{
    const periodDrivers=[...bucket.raw.entries()].map(([key,r])=>driverFromRecord(r,key)).filter(d=>Object.keys(d.rawMetrics||{}).length);
    const kpis={};
    for(const k of coreMetrics){
      const vals=periodDrivers.map(d=>d.rawMetrics?.[k]).filter(v=>v!=null&&Number.isFinite(v));
      const a=avg(vals); if(a!=null) kpis[k]=Number(a.toFixed(["concessions","lor"].includes(k)?2:1));
    }
    return {
      key:bucket.key,weekLabel:bucket.weekLabel,year:bucket.year,week:bucket.week,
      periodStart:bucket.periodStart,periodEnd:bucket.periodEnd,sourceFiles:[...bucket.sourceFiles],
      driverCount:periodDrivers.length,kpis,drivers:periodDrivers
    };
  }).sort((a,b)=>String(a.periodStart).localeCompare(String(b.periodStart)));

  const kpis={};
  for(const k of coreMetrics){
    const vals=drivers.map(d=>d.rawMetrics?.[k]).filter(v=>v!=null&&Number.isFinite(v));
    const a=avg(vals); if(a!=null) kpis[k]=Number(a.toFixed(["concessions","lor"].includes(k)?2:1));
  }

  const recognizedFiles=fileResults.filter(f=>f.recognized).length;
  const unsupportedFiles=fileResults.filter(f=>f.status==="unsupported").length;
  const errorFiles=fileResults.filter(f=>f.status==="error").length;
  return {
    sourceFiles:files.map(f=>f.name),fileResults,recognizedFiles,unsupportedFiles,errorFiles,
    scheduleEntries:schedule.size,matchedByTrid,unmatchedDrivers,driverCount:drivers.length,
    kpis,drivers,periods,pdfs
  };
}
