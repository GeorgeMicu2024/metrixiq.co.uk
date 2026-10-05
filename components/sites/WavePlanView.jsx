"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

const COLORS={PURPLE:"#762db3",BLUE:"#087fcf",GREEN:"#05ad58",RED:"#d62828",YELLOW:"#d7ad00",ORANGE:"#e67e22",WAVE1:"#35b51b",WAVE2:"#f5a000"};
const clean=v=>String(v??"").trim();
const norm=v=>clean(v).toUpperCase().replace(/\s+/g," ");
const routeOf=c=>{const m=c.map(clean).join(" ").match(/\b(?:CA|SA)[_\s-]*A?[0-9O]{2,4}\b/i);return m?m[0].replace(/\s+/g,"_").replace(/O/g,"0").toUpperCase():""};
const timeOf=c=>{let t=c.map(clean).join(" ").toUpperCase().replace(/O/g,"0");const m=t.match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\s*(AM|PM)?\b/i)||t.match(/\b(\d{1,2})(\d{2})\s*(AM|PM)\b/i);return m?`${m[1]}:${m[2]} ${m[3]||""}`.trim():""};
const stageOf=c=>{const t=c.map(clean).join(" ");const colour=t.match(/\b(PURPLE|BLUE|GREEN|RED|YELLOW|ORANGE)\s*[. -]?\s*(\d{1,2})\b/i);const base=t.match(/\bSTG\s*[-.]?\s*([A-Z])\b/i);if(colour)return `STG-${base?.[1]?.toUpperCase()||"A"} ${colour[1].toUpperCase()}.${colour[2]}`;const numbered=t.match(/\bSTG\s*[-.]?\s*([A-Z])\s*[. -]?\s*(\d{1,2})\b/i);if(numbered)return `STG-${numbered[1].toUpperCase()}.${numbered[2]}`;return base?`STG-${base[1].toUpperCase()}`:""};
const stageLoose=t=>{const s=clean(t).toUpperCase().replace(/\s+/g,"").replace(/O/g,"0");const m=s.match(/STG[-.]?([A-Z])[.-]?(\d{1,2})\b/);if(m)return `STG-${m[1]}.${m[2]}`;const w=s.match(/(PURPLE|BLUE|GREEN|RED|YELLOW|ORANGE)[.-]?(\d{1,2})\b/);return w?`STG-A ${w[1]}.${w[2]}`:""};
const waveOf=(stage,c,route="",explicitWave="")=>{const ew=norm(explicitWave),numbered=ew.match(/\bWAVE\s*([1-9]\d*)\b/);if(numbered)return "WAVE"+numbered[1];return /^SA_/i.test(route)?"SAMEDAY":Object.keys(COLORS).filter(x=>!/^WAVE/.test(x)).find(x=>norm(stage+" "+c.join(" ")).includes(x))||(()=>{
 const n=Number(clean(stage).match(/(?:\.|-|\s)(\d+)$/)?.[1]);
 if(!Number.isFinite(n))return "OTHER";
 if(n>=15&&n<=20)return "PURPLE";
 if(n>=1&&n<=14)return "BLUE";
 return "OTHER";
})()};
const companyLike=s=>/\b(DANUBE|COURIER|SERVICES|LIMITED|LTD|DCSL|DSP)\b/i.test(s);
const candidate=(c,route,time,stage)=>c.map(clean).find(x=>x&&x!==route&&x!==time&&x!==stage&&/[A-Za-z]/.test(x)&&!/^A[A-Z0-9]{8,}$/i.test(x)&&!companyLike(x)&&!/STG|WAVE|ROUTE|DRIVER|TIME|LOCATION|STATION|SAMEDAY|PARCEL|VEHICLE/i.test(x)&&!/^(STANDARD|LARGE|SMALL)\b/i.test(x)&&!/^\d+$/.test(x))||"";
const toMinutes=v=>{const m=clean(v).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);if(!m)return null;let h=+m[1],n=+m[2],a=(m[3]||"").toUpperCase();if(a==="PM"&&h<12)h+=12;if(a==="AM"&&h===12)h=0;return h*60+n};
const formatMinutes=n=>{n=(n+1440)%1440;let h=Math.floor(n/60),m=n%60,a=h>=12?"PM":"AM";return `${h%12||12}:${String(m).padStart(2,"0")} ${a}`};
const adjustTime=(v,delta)=>{const n=toMinutes(v);return n==null?clean(v):formatMinutes(n+delta)};
async function workbookRows(file){const b=await file.arrayBuffer(),wb=XLSX.read(b,{type:"array",cellStyles:true}),rows=[];for(const sheet of wb.SheetNames){XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:"",raw:false}).forEach((cells,i)=>rows.push({sheet,row:i+1,cells}))}return rows}

const dcslDsp=s=>/\b(?:DCSL|DANUBE\s+COURIER\s+SERVICES\s+LTD)\b/i.test(String(s||""));
const dcslOcrLabel=s=>clean(s).toUpperCase().replace(/5/g,"S").replace(/[1I|]/g,"L").replace(/[^A-Z]/g,"")==="DCSL";
const deh1RouteOf=values=>{
 const text=(values||[]).map(clean).join(" ").toUpperCase().replace(/C4/g,"CA").replace(/S4/g,"SA").replace(/\bC\s+A\b/g,"CA").replace(/\bS\s+A\b/g,"SA");
 const m=text.match(/(?:CA|SA)[_\s-]*A?[_\s-]*[0-9OQDILSAZGTB]{2,4}/i);if(!m)return"";
 const raw=m[0].replace(/\s+/g,"_").replace(/-+/g,"_").toUpperCase(),prefix=raw.startsWith("SA")?"SA":"CA";
 const digits=raw.replace(/^(?:CA|SA)_?A?_?/,"").replace(/[OQD]/g,"0").replace(/[IL]/g,"1").replace(/Z/g,"2").replace(/E/g,"3").replace(/A/g,"4").replace(/S/g,"5").replace(/G/g,"6").replace(/T/g,"7").replace(/B/g,"8").replace(/\D/g,"");
 return digits?prefix+"_A"+digits:"";
};
const deh1Time=value=>{const m=clean(value).toUpperCase().replace(/O/g,"0").match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\b/);return m?m[1]+":"+m[2]:""};
const bboxX=b=>b?((Number(b.x0)||0)+(Number(b.x1)||0))/2:0;
const bboxY=b=>b?((Number(b.y0)||0)+(Number(b.y1)||0))/2:0;
const bboxH=b=>b?Math.max(1,(Number(b.y1)||0)-(Number(b.y0)||0)):1;
const nearestByX=(items,x)=>items.reduce((best,item)=>!best||Math.abs(item.x-x)<Math.abs(best.x-x)?item:best,null);

async function deh1RawCanvas(file){
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
 let source=null;
 if(typeof createImageBitmap==="function"){source=await createImageBitmap(file);canvas.width=source.width;canvas.height=source.height;ctx.drawImage(source,0,0);source.close?.()}
 else{const url=URL.createObjectURL(file);try{source=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url});canvas.width=source.naturalWidth||source.width;canvas.height=source.naturalHeight||source.height;ctx.drawImage(source,0,0)}finally{URL.revokeObjectURL(url)}}
 return canvas;
}
const deh1GreenLeftOf=(canvas,bbox)=>{
 if(!canvas||!bbox)return false;
 const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return false;
 const h=Math.max(1,(Number(bbox.y1)||0)-(Number(bbox.y0)||0)),right=Math.max(0,Math.floor(Number(bbox.x0)||0)-2),width=Math.min(right,Math.max(46,Math.min(95,Math.round(h*6))));
 const left=Math.max(0,right-width),top=Math.max(0,Math.floor((Number(bbox.y0)||0)+h*.08)),bottom=Math.min(canvas.height,Math.ceil((Number(bbox.y1)||0)-h*.08));
 if(right<=left||bottom<=top)return false;
 let image;try{image=ctx.getImageData(left,top,right-left,bottom-top)}catch{return false}
 let green=0,total=0;for(let i=0;i<image.data.length;i+=4){const r=image.data[i],g=image.data[i+1],b=image.data[i+2];total++;if(g>=90&&g-r>=35&&g-b>=20)green++}
 return total>0&&green/total>=.08;
};
const deh1RouteDistance=(a,b)=>{
 const ad=(clean(a).match(/(\d+)$/)||[])[1]||"",bd=(clean(b).match(/(\d+)$/)||[])[1]||"";if(!ad||ad.length!==bd.length)return 99;
 let d=0;for(let i=0;i<ad.length;i++)if(ad[i]!==bd[i])d++;return d;
};

const deh1WordKey=word=>{const b=word?.bbox||{};return [Math.round(Number(b.x0)||0),Math.round(Number(b.y0)||0),Math.round(Number(b.x1)||0),Math.round(Number(b.y1)||0)].join(":")};
const deh1WaveNumberToken=value=>{
 const raw=clean(value).toUpperCase().replace(/O/g,"0").replace(/[IL|]/g,"1").replace(/[^0-9]/g,"");
 if(!/^\d{1,2}$/.test(raw))return"";
 const n=Number(raw);return n>=1&&n<=30?String(n):"";
};
const deh1LaunchPadToken=value=>{
 const raw=clean(value).toUpperCase().replace(/O/g,"0").replace(/[IL|]/g,"1").replace(/[^0-9]/g,"");
 if(!/^\d$/.test(raw))return"";
 const n=Number(raw);return n>=1&&n<=8?String(n):"";
};
const normaliseDeh1Headers=headers=>{
 const sorted=[...(headers||[])].sort((a,b)=>a.x-b.x);
 if(sorted.length<2)return sorted;
 const nums=sorted.map(h=>Number(String(h.wave||"").replace(/\D/g,""))),mins=sorted.map(h=>toMinutes(h.time));
 if(nums.some(n=>!Number.isFinite(n))||mins.some(n=>n==null))return sorted;
 const chronological=mins.every((n,i)=>i===0||(n>mins[i-1]&&n-mins[i-1]<=45));
 const consecutive=nums.every((n,i)=>i===0||n===nums[i-1]+1);
 if(!chronological||consecutive)return sorted;
 const last=nums[nums.length-1],start=last-sorted.length+1;
 if(start<1)return sorted;
 return sorted.map((h,i)=>({...h,wave:"WAVE"+(start+i)}));
};
const deh1OcrWords=data=>{
 const words=[];
 for(const block of data?.blocks||[])for(const paragraph of block?.paragraphs||[])for(const line of paragraph?.lines||[]){
   for(const word of line?.words||[]){const text=clean(word?.text);if(text)words.push({text,bbox:word?.bbox,x:bboxX(word?.bbox),y:bboxY(word?.bbox),h:bboxH(word?.bbox)})}
 }
 return words;
};
const deh1WaveAnchors=words=>{
 const anchors=[];
 for(const word of words){
   if(!/^WAVE/i.test(word.text))continue;
   const embedded=deh1WaveNumberToken(word.text.replace(/^WAVE/i,""));
   const band=words.filter(w=>w.x>word.x&&w.x-word.x<Math.max(120,word.h*12)&&Math.abs(w.y-word.y)<=Math.max(16,word.h*1.6)).sort((a,b)=>a.x-b.x);
   const numberWord=band.find(w=>!deh1Time(w.text)&&deh1WaveNumberToken(w.text));
   const timeWord=band.find(w=>deh1Time(w.text));
   anchors.push({word,numberWord,number:embedded||deh1WaveNumberToken(numberWord?.text),timeWord});
 }
 return anchors;
};
function deh1NumberCrop(canvas,bbox,threshold=null){
 if(!canvas||!bbox)return null;
 const h=Math.max(1,(Number(bbox.y1)||0)-(Number(bbox.y0)||0)),pad=Math.max(2,Math.round(h*.45));
 const left=Math.max(0,Math.floor((Number(bbox.x0)||0)-pad)),top=Math.max(0,Math.floor((Number(bbox.y0)||0)-pad));
 const right=Math.min(canvas.width,Math.ceil((Number(bbox.x1)||0)+pad)),bottom=Math.min(canvas.height,Math.ceil((Number(bbox.y1)||0)+pad));
 if(right<=left||bottom<=top)return null;
 const scale=6,out=document.createElement("canvas"),ctx=out.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
 out.width=(right-left)*scale;out.height=(bottom-top)*scale;ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,left,top,right-left,bottom-top,0,0,out.width,out.height);
 if(threshold!=null){const img=ctx.getImageData(0,0,out.width,out.height),d=img.data;for(let i=0;i<d.length;i+=4){const gray=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2],v=gray<threshold?0:255;d[i]=v;d[i+1]=v;d[i+2]=v;d[i+3]=255}ctx.putImageData(img,0,0)}
 return out;
}
async function deh1RefinedWaveNumbers(worker,rawCanvas,data){
 const words=deh1OcrWords(data),anchors=deh1WaveAnchors(words),overrides=new Map();
 try{await worker.setParameters({tessedit_pageseg_mode:"8",tessedit_char_whitelist:"0123456789"})}catch{}
 for(const anchor of anchors.slice(0,12)){
   if(!anchor.numberWord?.bbox)continue;
   const votes=[];
   for(const threshold of [null,175]){
     const crop=deh1NumberCrop(rawCanvas,anchor.numberWord.bbox,threshold);if(!crop)continue;
     try{const {data:digitData}=await worker.recognize(crop,{}, {text:true});const n=deh1WaveNumberToken(digitData?.text);if(n)votes.push(n)}catch{}
   }
   if(!votes.length)continue;
   const counts=new Map();for(const n of votes)counts.set(n,(counts.get(n)||0)+1);
   let best=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
   const b=anchor.numberWord.bbox,ratio=((Number(b.x1)||0)-(Number(b.x0)||0))/Math.max(1,(Number(b.y1)||0)-(Number(b.y0)||0));
   const single=votes.find(n=>n.length===1),double=votes.find(n=>n.length===2);
   if(single&&double)best=ratio<.9?single:double;
   if(best)overrides.set(deh1WordKey(anchor.word),best);
 }
 return overrides;
}

function deh1RowsFromOcr(data,colourCanvas,waveNumberOverrides=new Map()){
 const words=deh1OcrWords(data),anchors=deh1WaveAnchors(words),rawHeaders=[],times=[];
 for(const word of words){const t=deh1Time(word.text);if(t)times.push({time:t,x:word.x,y:word.y})}
 for(const anchor of anchors){
   const number=waveNumberOverrides.get(deh1WordKey(anchor.word))||anchor.number;
   const load=anchor.timeWord?deh1Time(anchor.timeWord.text):"";
   if(number&&load)rawHeaders.push({wave:"WAVE"+number,time:load,x:(anchor.word.x+(anchor.timeWord?.x||anchor.word.x))/2,y:anchor.word.y});
 }
 const headers=normaliseDeh1Headers(rawHeaders);
 if(!headers.length)return[];
 const gateFor=header=>{
   const candidates=times.filter(t=>t.y<header.y-8&&Math.abs(t.x-header.x)<Math.max(220,header.x*.7)).sort((a,b)=>Math.abs(a.x-header.x)-Math.abs(b.x-header.x)||Math.abs(a.y-header.y)-Math.abs(b.y-header.y));
   return candidates[0]?.time||"";
 };
 const launchPadBetween=(left,right)=>{
   if(!right)return"";
   const minX=left?.x??Math.max(0,right.x-150),maxX=right.x;
   const candidates=words.filter(w=>w.x>minX&&w.x<maxX&&Math.abs(w.y-right.y)<=Math.max(16,right.h*1.5)).sort((a,b)=>a.x-b.x);
   for(const word of candidates){const pad=deh1LaunchPadToken(word.text);if(pad)return pad}
   return"";
 };
 const out=[];
 const pushRoute=(route,anchor,dcslHint=false,launchPad="",sourceY=null)=>{
   if(!route||!anchor)return;
   const header=nearestByX(headers,anchor.x);if(!header)return;
   out.push({sheet:"Image",row:out.length+1,cells:[route,header.time,header.wave,dcslHint?"DCSL":""],directLoadTime:true,explicitWave:header.wave,gateTime:gateFor(header),dcslHint:Boolean(dcslHint),launchPad:deh1LaunchPadToken(launchPad),sourceY:sourceY??anchor.y??null});
 };
 for(const word of words){
   let route=deh1RouteOf([word.text]),hint=deh1GreenLeftOf(colourCanvas,word.bbox);
   if(!route&&hint){
     const numeric=clean(word.text).replace(/[OQD]/g,"0").replace(/[IL|]/g,"1").replace(/Z/g,"2").replace(/E/g,"3").replace(/A/g,"4").replace(/S/g,"5").replace(/G/g,"6").replace(/T/g,"7").replace(/B/g,"8");
     if(/^\d{2,4}$/.test(numeric))route="CA_A"+numeric;
   }
   if(!route)continue;
   const dcslWord=words.filter(w=>dcslOcrLabel(w.text)&&w.x<word.x&&word.x-w.x<260&&Math.abs(w.y-word.y)<=Math.max(18,word.h*1.8)).sort((a,b)=>b.x-a.x)[0];
   if(dcslWord)hint=true;
   const launchPad=launchPadBetween(dcslWord,word)||launchPadBetween(null,word);
   if(hint)pushRoute(route,word,hint,launchPad,word.y);
 }
 for(const word of words){
   if(!dcslOcrLabel(word.text))continue;
   const band=words.filter(w=>w.x>word.x&&w.x-word.x<420&&Math.abs(w.y-word.y)<=Math.max(28,word.h*2.2)).sort((a,b)=>a.x-b.x);
   const padWord=band.find(w=>deh1LaunchPadToken(w.text)),launchPad=deh1LaunchPadToken(padWord?.text);
   const routeBand=padWord?band.filter(w=>w.x>padWord.x):band;
   let route="",anchor=null;
   for(let i=0;i<routeBand.length;i++){route=deh1RouteOf(routeBand.slice(i,i+5).map(w=>w.text));if(route){anchor=routeBand[i];break}}
   if(route)pushRoute(route,anchor||word,true,launchPad,word.y);
 }
 const merged=new Map();
 for(const row of out){
   const key=norm(row.cells[0])+"|"+row.explicitWave,prev=merged.get(key);
   if(!prev){merged.set(key,row);continue}
   merged.set(key,{...prev,launchPad:prev.launchPad||row.launchPad,dcslHint:prev.dcslHint||row.dcslHint,sourceY:prev.sourceY??row.sourceY});
 }
 return [...merged.values()].sort((a,b)=>(a.sourceY??999999)-(b.sourceY??999999));
}
async function deh1ImageRows(file,onProgress){
 const {createWorker}=await import("tesseract.js");
 const worker=await createWorker("eng",1,{logger:m=>m.status==="recognizing text"&&onProgress?.(Math.round((m.progress||0)*100))});
 const rawCanvas=await deh1RawCanvas(file);
 try{await worker.setParameters({tessedit_pageseg_mode:"11",preserve_interword_spaces:"1"})}catch{}
 const {data}=await worker.recognize(file,{}, {text:true,blocks:true});
 const refined=await deh1RefinedWaveNumbers(worker,rawCanvas,data);
 const rows=deh1RowsFromOcr(data,rawCanvas,refined);
 await worker.terminate();return rows;
}

function deh1WorkbookRows(rows){
 const out=[];
 for(const sheet of [...new Set((rows||[]).map(r=>r.sheet))]){
  const sheetRows=(rows||[]).filter(r=>r.sheet===sheet),headers=[],gates=[];
  for(const row of sheetRows)row.cells.forEach((value,col)=>{
   const text=norm(value),m=text.match(/\bWAVE\s*([1-9]\d*)\b[\s\S]{0,50}?(\d{1,2})\s*[:.]\s*(\d{2})/);
   if(m)headers.push({wave:"WAVE"+m[1],time:m[2]+":"+m[3],x:col});
   if(/GATE\s*\/?\s*HOLDING\s+AREA/.test(text)){const time=deh1Time(text);if(time)gates.push({time,x:col})}
  });
  const fixedHeaders=normaliseDeh1Headers(headers);
  if(!fixedHeaders.length)continue;
  for(const row of sheetRows)for(let col=0;col<row.cells.length;col++){
   if(!/^DCSL\b/i.test(clean(row.cells[col])))continue;
   const launchPad=deh1LaunchPadToken(row.cells[col+1]),route=deh1RouteOf(row.cells.slice(col+2,col+6))||deh1RouteOf(row.cells.slice(col,col+5));if(!route)continue;
   const header=nearestByX(fixedHeaders,col);if(!header)continue;
   out.push({sheet,row:row.row,cells:[route,header.time,header.wave,"DCSL"],directLoadTime:true,explicitWave:header.wave,gateTime:nearestByX(gates,col)?.time||"",launchPad,sourceY:row.row});
  }
 }
 return out;
}


async function imageRows(file,onProgress){
 const {createWorker}=await import("tesseract.js");
 const worker=await createWorker("eng",1,{logger:m=>m.status==="recognizing text"&&onProgress?.(Math.round((m.progress||0)*100))});
 const {data}=await worker.recognize(file); await worker.terminate();
 const rows=[];
 const lines=data.text.split(/\r?\n/).map(x=>x.replace(/[|]/g," ").replace(/\s+/g," ").trim()).filter(Boolean);
 for(const [i,raw] of lines.entries()){
   const upper=raw.toUpperCase();
   const routeMatch=upper.match(/\b[CS][A4]\s*[_-]?\s*A\s*[_-]?\s*[0-9O]{2,4}\b/)||upper.match(/\b(?:CA|SA)\s*[_-]?\s*[0-9O]{2,4}\b/);
   const route=routeMatch?routeMatch[0].replace(/\s+/g,"").replace(/-/g,"_").replace(/^C4/,"CA").replace(/^S4/,"SA").replace(/O/g,"0").replace(/^(CA|SA)(?!_)/,"$1_").replace(/^(CA|SA)_?(\d)/,"$1_A$2"):"";
   const time=timeOf([upper]);
   const staging=stageOf([upper])||stageLoose(upper);
   if(route) rows.push({sheet:"Image",row:i+1,cells:[route,time,staging,upper]});
 }
 return rows;
}
export default function WavePlanView({site="DLS2",drivers=[]}){
 const [tab,setTab]=useState("wave"),[routeFile,setRouteFile]=useState(null),[waveFile,setWaveFile]=useState(null),[routeRows,setRouteRows]=useState([]),[waveRows,setWaveRows]=useState([]),[generated,setGenerated]=useState(false),[atlasTemplate,setAtlasTemplate]=useState("Good morning,\n\nPlease find below the list of your Atlas shipment of the day - Total Tracking IDs: {count}\n\nTracking ID - Route code - Driver Name\n\n{rows}\n\nBest regards,"),[history,setHistory]=useState([]),[atlasText,setAtlasText]=useState(""),[adjust,setAdjust]=useState(-20),[overrides,setOverrides]=useState({}),[dismissedConflicts,setDismissedConflicts]=useState(new Set()),[ocrProgress,setOcrProgress]=useState(null),[hiddenWaves,setHiddenWaves]=useState(new Set()),[planFontSize,setPlanFontSize]=useState("medium");
 const routeInput=useRef(null),waveInput=useRef(null),smartInput=useRef(null),sheetRef=useRef(null);
 const [dragging,setDragging]=useState(false),[uploadStatus,setUploadStatus]=useState([]),[editorTab,setEditorTab]=useState("waves");
 const classifyFile=async(file)=>{
   const name=norm(file?.name);
   if(/ATLAS/.test(name))return "atlas";
   if(/ROUTE|ROUTING|DA.?ROUTE/.test(name))return "route";
   if(/WAVE|STAGING|DISPATCH/.test(name)||file?.type?.startsWith("image/"))return "wave";
   if(/\.TXT$/i.test(file?.name||""))return "atlas";
   try{
     if(!file?.type?.startsWith("image/")){
       const rows=await workbookRows(file);
       const sample=norm(rows.slice(0,30).flatMap(r=>r.cells).join(" "));
       if(/TRANSPORTER ID|DRIVER NAME/.test(sample)&&/ROUTE CODE/.test(sample))return "route";
       if(/STAGING LOCATION|WAVE/.test(sample)&&/ROUTE CODE/.test(sample))return "wave";
       if(/WAVE\s*[1-9]\d*/.test(sample)&&/LOADING TIME/.test(sample)&&/\bDCSL\b/.test(sample))return "wave";
     }
   }catch{}
   return "unknown";
 };
 const smartLoad=async(files)=>{
   const list=[...(files||[])]; if(!list.length)return;
   const status=[];
   for(const file of list){
     const kind=await classifyFile(file);
     if(kind==="route"){await load(file,setRouteFile,setRouteRows);status.push({name:file.name,kind:"Route Plan"});}
     else if(kind==="wave"){await load(file,setWaveFile,setWaveRows);status.push({name:file.name,kind:"Wave Plan"});}
     else if(kind==="atlas"){try{setAtlasText(await file.text());status.push({name:file.name,kind:"ATLAS"});}catch{status.push({name:file.name,kind:"Needs review"});}}
     else status.push({name:file.name,kind:"Needs review"});
   }
   setUploadStatus(prev=>{
     const next=[...prev];
     for(const item of status){
       const slot=["Route Plan","Wave Plan","ATLAS"].includes(item.kind)?item.kind:item.name;
       const index=next.findIndex(x=>(["Route Plan","Wave Plan","ATLAS"].includes(x.kind)?x.kind:x.name)===slot);
       if(index>=0)next[index]=item;else next.push(item);
     }
     return next.slice(-6);
   });
   if(smartInput.current)smartInput.current.value="";
 };
 const load=async(file,setFile,setRows)=>{if(!file)return;const kind=setFile===setRouteFile?"Route Plan":"Wave Plan";setFile(file);setGenerated(false);if(setFile===setRouteFile){setOverrides({});setDismissedConflicts(new Set())}try{if(file.type?.startsWith("image/")){setOcrProgress(0);setRows(norm(site)==="DEH1"?await deh1ImageRows(file,setOcrProgress):await imageRows(file,setOcrProgress));setOcrProgress(null)}else{const raw=await workbookRows(file),matrix=norm(site)==="DEH1"&&setFile===setWaveFile?deh1WorkbookRows(raw):[];setRows(matrix.length?matrix:raw)}setUploadStatus(prev=>[...prev.filter(x=>x.kind!==kind),{name:file.name,kind}].slice(-6))}catch(e){setOcrProgress(null);console.error(e);alert("Could not read this file. Try a clearer image or Excel/CSV.")}};
 const driverByTrid=useMemo(()=>new Map(drivers.map(d=>{
   const trid=d?.trid||d?.id||d?.transporter_id||d?.rawData?.trid||d?.raw_data?.trid;
   const name=d?.full_name||d?.name||d?.driver_name;
   return [norm(trid),name];
 }).filter(([trid,name])=>trid&&name&&name!=="Unresolved identity")),[drivers]);
 const routeIdentity=useMemo(()=>{const m=new Map();const header=routeRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v))));const h=header?.cells.map(v=>norm(v))||[];const ri=h.findIndex(v=>v==="ROUTE CODE"),ti=h.findIndex(v=>/TRANSPORTER ID/.test(v)),ni=h.findIndex(v=>/DRIVER NAME/.test(v)),di=h.findIndex(v=>v==="DSP");for(const x of routeRows){if(x===header)continue;if(norm(site)==="DEH1"&&di>=0&&!dcslDsp(x.cells[di]))continue;const route=ri>=0?routeOf([x.cells[ri]]):routeOf(x.cells);if(!route)continue;const key=norm(route),prev=m.get(key)||{trids:[],names:[],fallback:""};const rawTrid=ti>=0?clean(x.cells[ti]):"";const rawName=ni>=0?clean(x.cells[ni]):"";const foundTrids=[...new Set((rawTrid?rawTrid.split(/[\\/|,;\s]+/):x.cells.flatMap(v=>clean(v).split(/[\\/|,;\s]+/))).filter(v=>/^A[A-Z0-9]{8,}$/i.test(v)).map(norm))];const explicitNames=rawName?rawName.split(/[|]/).map(clean).filter(Boolean):[];const trids=[...new Set([...prev.trids,...foundTrids])];const dbNames=trids.map(t=>driverByTrid.get(t)).filter(Boolean);const names=[...new Set([...prev.names,...explicitNames,...dbNames])];const foundName=explicitNames[0]||candidate(x.cells,route,timeOf(x.cells),stageOf(x.cells));m.set(key,{trids,names,fallback:prev.fallback||(!companyLike(foundName)?foundName:"")})}return m},[routeRows,driverByTrid,site]);
 const conflicts=useMemo(()=>[...routeIdentity.entries()].filter(([route,v])=>v.trids.length>1&&v.names.length!==1&&!dismissedConflicts.has(route)),[routeIdentity,dismissedConflicts]);
 const routeDrivers=useMemo(()=>{const m=new Map();for(const [route,v] of routeIdentity){const manual=overrides[route];const name=manual||((v.trids.length===1||v.names.length===1)?v.names[0]:"")||v.fallback;if(name)m.set(route,name)}return m},[routeIdentity,overrides]);
 const deh1RouteDeparture=useMemo(()=>{const m=new Map();if(norm(site)!=="DEH1")return m;const header=routeRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v))));const h=header?.cells.map(v=>norm(v))||[],ri=h.findIndex(v=>v==="ROUTE CODE"),di=h.findIndex(v=>v==="DSP"),pi=h.findIndex(v=>/PLANNED DEPARTURE TIME/.test(v));if(ri<0||pi<0)return m;for(const x of routeRows){if(x===header)continue;if(di>=0&&!dcslDsp(x.cells[di]))continue;const route=routeOf([x.cells[ri]]),departure=timeOf([x.cells[pi]]);if(route&&departure)m.set(norm(route),departure)}return m},[routeRows,site]);
 const plan=useMemo(()=>{
   const header=waveRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v)))),h=header?.cells.map(v=>norm(v))||[],ri=h.findIndex(v=>v==="ROUTE CODE"),wi=h.findIndex(v=>v==="WAVE"),si=h.findIndex(v=>/STAGING LOCATION/.test(v)),ti=h.findIndex(v=>v==="TIME"),isDeh1=norm(site)==="DEH1",exactDeh1Routes=isDeh1?new Set(waveRows.map(row=>{const r=ri>=0?routeOf([row.cells[ri]]):routeOf(row.cells);return r&&routeIdentity.has(norm(r))?norm(r):""}).filter(Boolean)):new Set();
   const parsed=waveRows.map(x=>{if(x===header)return null;let route=ri>=0?routeOf([x.cells[ri]]):routeOf(x.cells);if(isDeh1&&routeIdentity.size&&route&&!routeIdentity.has(norm(route))){if(!x.dcslHint)return null;const near=[...routeIdentity.keys()].filter(k=>!exactDeh1Routes.has(k)&&deh1RouteDistance(route,k)<=1);if(near.length!==1)return null;route=near[0]}const amazon=ti>=0?timeOf([x.cells[ti]]):timeOf(x.cells),staging=si>=0?clean(x.cells[si]):(stageOf(x.cells)||stageLoose(x.cells.join(" ")));if(!route||!amazon||(!staging&&!x.directLoadTime))return null;const trid=x.cells.map(clean).find(v=>/^A[A-Z0-9]{8,}$/i.test(v)),name=(trid&&driverByTrid.get(norm(trid)))||routeDrivers.get(norm(route))||candidate(x.cells,route,amazon,staging)||"UNASSIGNED",direct=Boolean(x.directLoadTime);return{route,driver:name,amazonTime:amazon,time:direct?amazon:adjustTime(amazon,adjust),staging:staging||"",gateTime:x.gateTime||"",launchPad:x.launchPad||"",sourceY:Number.isFinite(Number(x.sourceY))?Number(x.sourceY):null,directLoadTime:direct,wave:waveOf(staging,x.cells,route,x.explicitWave||(wi>=0?x.cells[wi]:""))}}).filter(Boolean);
   if(!isDeh1||!routeIdentity.size||!parsed.length)return parsed;
   const baseMap=new Map();
   for(const row of parsed){const key=norm(row.route),prev=baseMap.get(key);if(!prev||(!prev.launchPad&&row.launchPad))baseMap.set(key,row)}
   const base=[...baseMap.values()].sort((a,b)=>(a.sourceY??999999)-(b.sourceY??999999)),seen=new Set(base.map(row=>norm(row.route)));
   const templates=new Map(),candidatesByDeparture=new Map();
   for(const row of base){const departure=deh1RouteDeparture.get(norm(row.route));if(!departure)continue;const key=norm(departure),arr=candidatesByDeparture.get(key)||[];arr.push(row);candidatesByDeparture.set(key,arr)}
   for(const [departure,rows] of candidatesByDeparture){const counts=new Map();for(const row of rows){const sig=[row.wave,row.time,row.gateTime||"",row.staging||""].join("|");counts.set(sig,(counts.get(sig)||0)+1)}const best=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0],template=rows.find(row=>[row.wave,row.time,row.gateTime||"",row.staging||""].join("|")===best)||rows[0];if(template)templates.set(departure,template)}
   for(const route of routeIdentity.keys()){if(seen.has(route))continue;const departure=deh1RouteDeparture.get(route),template=departure?templates.get(norm(departure)):null;if(!template)continue;base.push({...template,route,driver:routeDrivers.get(route)||"UNASSIGNED",launchPad:"",sourceY:null,recoveredFromRoutePlan:true});seen.add(route)}
   return base;
 },[waveRows,routeDrivers,driverByTrid,adjust,routeIdentity,site,deh1RouteDeparture]);
 const groups=useMemo(()=>{const m=new Map();for(const r of plan){const stg=r.staging?(r.staging.match(/STG[- ]?[A-Z]/i)?.[0]?.replace(" ","-").toUpperCase()||r.staging):"NO-STAGING",key=[r.time,r.wave,stg].join("|");if(!m.has(key))m.set(key,[]);m.get(key).push(r)}return [...m.entries()].sort((a,b)=>(toMinutes(a[0].split("|")[0])??9999)-(toMinutes(b[0].split("|")[0])??9999)||a[0].localeCompare(b[0]))},[plan]);
 const visibleGroups=useMemo(()=>groups.filter(([k])=>!hiddenWaves.has(k)),[groups,hiddenWaves]);
 const toggleWave=(key)=>setHiddenWaves(prev=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next});
 const atlasRows=useMemo(()=>atlasText.split(/\r?\n/).map(line=>{const m=line.match(/\b(UK\d+)\s*-\s*(CA[_ -]?A?\d+)\s*-\s*([A-Z0-9]{8,})\b/i);if(!m)return null;const trid=m[3].toUpperCase();return{tracking:m[1],route:m[2].replace(/ /g,"_").toUpperCase(),trid,name:driverByTrid.get(trid)||""}}).filter(Boolean),[atlasText,driverByTrid]);
 const atlasDriverRows=useMemo(()=>atlasRows.map(r=>`${r.tracking} - ${r.route} - ${r.name||"DRIVER NOT FOUND"}`).join("\n"),[atlasRows]); const atlasOutput=useMemo(()=>atlasTemplate.replaceAll("{count}",String(atlasRows.length)).replaceAll("{rows}",atlasDriverRows),[atlasTemplate,atlasRows.length,atlasDriverRows]);
 const clear=()=>{if(!confirm("Clear current Wave Plan?"))return;setRouteFile(null);setWaveFile(null);setRouteRows([]);setWaveRows([]);setOverrides({});setDismissedConflicts(new Set());setHiddenWaves(new Set());setGenerated(false);if(routeInput.current)routeInput.current.value="";if(waveInput.current)waveInput.current.value=""};
 const generate=()=>{if(!plan.length){alert(norm(site)==="DEH1"?`No DCSL routes were recognised from ${waveFile?.name||"the file"}. Please upload the full DEH1 Wave Plan image/Excel with the WAVE, LOADING TIME and DCSL rows visible.`:`No usable route + time pairs were recognised from ${waveFile?.name||"the file"}. OCR found ${waveRows.length} route candidates. The image parser accepts SA_Axx morning routes and CA_Axxx afternoon routes.`);return}setGenerated(true);setHistory(h=>[{id:Date.now(),date:new Date().toLocaleDateString("en-GB"),route:routeFile?.name,wave:waveFile?.name},...h].slice(0,8))};
 const exportPng=async(share=false)=>{
   if(!sheetRef.current)return;
   try{
     const {toPng}=await import("html-to-image");
     const node=sheetRef.current;
     const exportWidth=920;
     const exportHeight=node.scrollHeight;
     const dataUrl=await toPng(node,{pixelRatio:3,cacheBust:true,backgroundColor:"#05070a",width:exportWidth,height:exportHeight,style:{width:exportWidth+"px",maxWidth:"none",minWidth:exportWidth+"px",margin:"0",transform:"none",overflow:"visible"}});
     const blob=await (await fetch(dataUrl)).blob();
     const file=new File([blob],`DCSL-Wave-Plan-${new Date().toISOString().slice(0,10)}.png`,{type:"image/png"});
     if(share&&navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:"DCSL Wave Plan",text:`${site} Wave Plan`});return}
     const a=document.createElement("a");a.href=dataUrl;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
   }catch(e){console.error("Wave Plan image export failed",e);alert("Could not create the Wave Plan image. Please try again.")}
 };
 return <div className="waveplan-root daily-dispatch">
  <div className="waveplan-heading"><div><span className="page-kicker">SITE OPERATIONS › DAILY DISPATCH</span><h1>Daily Dispatch</h1><p>Generate the DCSL Wave Plan in the approved format.</p></div><span className={"waveplan-ready "+(generated?"ok":"")}>{generated?"✓ Ready":"Waiting for files"}</span></div>
  <div className="dispatch-tabs"><button className={tab==="wave"?"active":""} onClick={()=>setTab("wave")}>Wave Plan</button><button className={tab==="atlas"?"active":""} onClick={()=>setTab("atlas")}>Atlas</button></div>
  {tab==="atlas"?<section className="panel atlas-converter"><div className="panel-head"><div><h2>Atlas Driver Converter</h2><p>Paste the Amazon message. TRIDs are replaced only when an exact driver match exists.</p></div><span className="panel-badge">{atlasRows.filter(r=>r.name).length}/{atlasRows.length} matched</span></div><div className="atlas-grid"><label><span>Paste Atlas message</span><textarea value={atlasText} onChange={e=>setAtlasText(e.target.value)}/></label><label><span>Ready to copy</span><textarea value={atlasOutput} onChange={e=>{const value=e.target.value;setAtlasTemplate(value.replace(atlasDriverRows,"{rows}").replace(String(atlasRows.length),"{count}"))}}/></label></div><label className="atlas-template"><span>Preset message</span><textarea value={atlasTemplate} onChange={e=>setAtlasTemplate(e.target.value)}/><small>Use <b>{"{count}"}</b> for total shipments and <b>{"{rows}"}</b> where the converted list should appear.</small></label><div className="atlas-actions"><button className="btn ghost" onClick={()=>setAtlasText("")}>Clear</button><button className="btn primary" disabled={!atlasOutput} onClick={()=>navigator.clipboard.writeText(atlasOutput)}>Copy with driver names</button></div>{atlasRows.some(r=>!r.name)&&<p className="atlas-warning">Unmatched TRIDs are flagged as DRIVER NOT FOUND — TRIDs are never shown as driver names.</p>}</section>:<>
   <section className={"smart-upload panel "+(dragging?"dragging":"")} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);smartLoad(e.dataTransfer.files)}}>
     <input ref={smartInput} hidden multiple type="file" accept=".xlsx,.xls,.csv,.txt,image/png,image/jpeg,image/webp" onChange={e=>smartLoad(e.target.files)}/>
     <div className="waveplan-file-icon">↥</div><div><b>Smart Upload</b><span>Drop Route Plan + Wave Plan here, or choose files</span><small>MetrixIQ detects each file and sends it to the correct workspace.</small></div><button className="btn primary" onClick={()=>smartInput.current?.click()}>Choose files</button>
     <div className="smart-upload-status">
       {routeFile?<span>✓ {routeFile.name} <b>Route Plan</b></span>:<span className="warn">Route Plan not loaded</span>}
       {waveFile?<span>✓ {waveFile.name} <b>Wave Plan</b></span>:<span className="warn">Wave Plan not loaded</span>}
       {uploadStatus.filter(x=>!["Route Plan","Wave Plan"].includes(x.kind)).map((x,i)=><span key={x.name+i} className={x.kind==="Needs review"?"warn":""}>✓ {x.name} <b>{x.kind}</b></span>)}
     </div>
     <div className="smart-upload-manual"><button onClick={()=>routeInput.current?.click()}>Route Plan {routeFile?"✓":""}</button><button onClick={()=>waveInput.current?.click()}>Wave Plan {waveFile?"✓":""}</button></div>
     <input ref={routeInput} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>load(e.target.files?.[0],setRouteFile,setRouteRows)}/><input ref={waveInput} hidden type="file" accept=".xlsx,.xls,.csv,image/png,image/jpeg,image/webp" onChange={e=>load(e.target.files?.[0],setWaveFile,setWaveRows)}/>
   </section>
   {conflicts.length>0&&<section className="panel dispatch-attention"><div className="panel-head"><div><h2>⚠ Driver identity needs attention</h2><p>More than one TRID was detected on these routes. Choose the correct driver or type the name manually.</p></div><button className="btn ghost" onClick={()=>setDismissedConflicts(new Set(conflicts.map(([r])=>r)))}>Done / Hide</button></div>{conflicts.map(([route,v])=><div className="identity-fix" key={route}><b>{route}</b><span>{v.trids.join(" / ")}</span><select value={overrides[route]||""} onChange={e=>setOverrides(o=>({...o,[route]:e.target.value}))}><option value="">Select driver…</option>{v.trids.map(t=>driverByTrid.get(t)&&<option key={t} value={driverByTrid.get(t)}>{driverByTrid.get(t)} · {t}</option>)}</select><input placeholder="or type driver name" value={overrides[route]||""} onChange={e=>setOverrides(o=>({...o,[route]:e.target.value}))}/><button className="btn ghost" onClick={()=>setDismissedConflicts(d=>new Set([...d,route]))}>✓ Save & close</button></div>)}</section>}
   <section className="panel waveplan-settings"><h2>⚙ Settings</h2><div className="dispatch-settings-grid"><label>Time adjustment<div className="time-adjust"><button onClick={()=>setAdjust(v=>v-5)}>−</button><input type="number" value={adjust} onChange={e=>setAdjust(Number(e.target.value)||0)}/><button onClick={()=>setAdjust(v=>v+5)}>+</button><span>minutes</span></div><small>{waveRows.some(r=>r.directLoadTime)?"DEH1 loading times are used exactly as supplied.":"Negative subtracts; positive adds to Amazon time."}</small></label><label>● Detect wave colours automatically</label><label>● {waveRows.some(r=>r.directLoadTime)?"Use Gate / Holding time":"Group by staging location"}</label><label>Site / Station <strong>{site}</strong></label><label>Date <strong>{new Date().toLocaleDateString("en-GB")}</strong></label><label>Text size<select value={planFontSize} onChange={e=>setPlanFontSize(e.target.value)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select><small>Changes preview and Ready to Send image.</small></label></div></section>
   <section className="panel wave-hide-clean"><div><h2>◉ Hide Wave</h2><p>Select waves to hide from the generated plan. Data is never deleted.</p></div><div className="wave-hide-clean-grid">{groups.length?groups.map(([k,rows])=>{const [time,wave,stg]=k.split("|"),hidden=hiddenWaves.has(k);return <button type="button" key={k} className={"wave-choice "+wave.toLowerCase()+" "+(hidden?"off":"")} onClick={()=>toggleWave(k)}><i/><span><b>{wave==="SAMEDAY"?"Sameday":/^WAVE\d+$/.test(wave)?"Wave "+wave.slice(4):wave[0]+wave.slice(1).toLowerCase()} {time}</b><small>{stg==="NO-STAGING"?(rows.find(r=>r.gateTime)?.gateTime?"Gate "+rows.find(r=>r.gateTime)?.gateTime:"No staging"):stg} · {rows.length} drivers</small></span><em>{hidden?"Hidden":"Shown"}</em></button>}):<span className="muted">Generate a plan to manage waves.</span>}</div></section>
   <div className="waveplan-actions clean"><button className="btn primary" disabled={!routeFile||!waveFile} onClick={generate}>↻ Generate Wave Plan</button><button className="btn ghost danger" onClick={clear}>Clear</button><button className="btn success ready" disabled={!generated} onClick={()=>exportPng(true)}>↗ Ready to Send</button></div>
   
   <section className="waveplan-workspace"><aside><article className="panel waveplan-summary"><h2>Summary</h2>{visibleGroups.map(([k,v])=>{const wave=k.split("|")[1];return <p key={k}><i style={{background:COLORS[wave]||"#64748b"}}/><span>{wave==="SAMEDAY"?"Sameday":/^WAVE\d+$/.test(wave)?"Wave "+wave.slice(4):wave[0]+wave.slice(1).toLowerCase()+" Wave"}</span><b>{v.length} drivers · {k.split("|")[0]}</b></p>})}<footer>Total <b>{visibleGroups.reduce((sum,[,rows])=>sum+rows.length,0)} drivers</b>{hiddenWaves.size?<small> · {hiddenWaves.size} wave hidden</small>:null}</footer></article><article className="panel waveplan-history"><h2>Recent Uploads</h2>{history.length?history.map(x=><div key={x.id}><p><b>{x.date}</b><small>✓ Generated</small><span>{x.route} + {x.wave}</span></p><button onClick={()=>setHistory(h=>h.filter(y=>y.id!==x.id))}>Delete</button></div>):<p className="muted">No generated plans in this session.</p>}</article></aside>
   <article className="panel waveplan-preview"><div className="panel-head"><div><h2>Wave Plan Preview</h2><p>DCSL format · ordered chronologically.</p></div></div>{generated?<div className={"dcsl-sheet font-"+planFontSize+(plan.some(r=>r.launchPad)?" has-launch-pad":"")} ref={sheetRef}><header><div className="dcsl-brand"><img className="dcsl-mark-image" src={"data:image/webp;base64,UklGRqQFAABXRUJQVlA4IJgFAACQKQCdASrvAPAAPikSh0KhoQslogAMAUJZW7gK30Pu/fdKvTkwbmn5M8onovmX/T/cB9APS1t/vNZ+t/7Y+6V0gH7HdeRoquqThJokxelxtfYwZJK+4QIbOE8xW3Yu6GarNqklw3S9GS/ap7XLH4+eMzxnRR5aEIKElspcN0vRkv2gBSbO3VjXNTdVohYa8CVqjG4Df2fmaJyQ6BN2aHbDKCERqgp/cSNuS2rnX314kHDYjWtw70c25Qbt4CIb27fjsD+QBGQXPCdwnOi2ES3zvV0ut2IdsUjbktsRHX3Yh2xSNuS2xEdfdiHa9VIXMeRJwd/qBWlgD8vg+CsNTK0qwHjhPLwI2b/1MjUQbs6e7D6hIM6rxL6s5EaaciMrq/VzjjMHcEuen2Lu8w/q+Le32iX2YPB1KSX7GFh+ABkSiQSawqUKUzDKdTDydU5GeKhb42yeeAD++Ob7c/kM+wNcfHxANZsNFef1e67o1HQeE25rEv//YaL7qH+3QT/7iN/dAlT/7tYy33/0PxAsuploGAwgVJFK2G0FbSzV4SzuKeeuAwZwiAM/KxHC4DhuB9gAoQiyQHmGHATYaYkDkv8Bfqfmh3UL+otk5FP8PqQZBV1qKr9f8Vn+x1T17MMvAvellLag464LR3V5rjVLS3GEaDdghCQj4snAx2mnHPTX9Ns4veX69gn3gXJlbG2wj8cBQ3eOPSmSH4F6QXz3SZqIxFvig0+2gE9Y/p5lTmD6nSz2/rN9IpURcHlJ4TVEYNG9qar9cVJZZdABm/YKIT5BMS3uCOCf3nOg+5IRIzsgYBdi4A79obpcthagc90xDPfTI5yVhvAcsx+CPO8WH+/BLIqbElza2lIvYlSYjW5nZex3NbkGCPu3brvt6OYHHWpL67/iofOveLqW/BpmMINllH7xJOqZ3HjoX+IMWUUAjeGGCHRtwW1QzJ7Ep/1egDNvet7T563QvrnTxFb3itY6qvyn4UtU4RrP37sMAB0kFT9oRszykxqhOn8mFG2vGV1/+SbkH/Zdn8RquHJd//J1EIzYf42wFPnfBAA2vW3ylkt4RkKRoEMGqXZLHVyD3mRQ305CYJZDWEH+snUv9s4aU5JwDkemJjb1Bf45DNYew76f/WIF9r+d0svBhifujsqQQEiF/4d0x6Fgdue/t8cVKM4IwCvqx2Sn8r6Nvp7bMb0G/pBbc5QRQ7f6oXjzL/zJrh2dbcQ6d/v5L7G1kjHNbpPfjj25zJ1KADJpvoY4Cc9OsenCmJobhXv/aZiHXDS5ulSBGnY2rKcXSVkoNULTL4Yga5EXMu5PY2sW9UjEKU11uYyXVAA/aXIAmR/ys//l6cQdZdaHaa0gww50XrGxhJK+TP0RI+0L/F6bfC8GFZw5OEwBCwG17N2byIioT/chWqYvZPzcg8i8nrIStk1dnLxUwDVzj1AAFaZHgYvpZFAxbyNrWk2+t/XrTx6tKBTHpwpiaG4V/OdeGtaMC3mUirQeYXRcFKGnJZizuph2cp0awL99YpoDYrgJVjn9e5Gu1QifxuqcVkR1hz7gmqRdEMzbSqtk6V77TtuapJIi3ycLZ8w2TtsY7eFui+t6pD2tNmOPNHyxMLEqfd/9rsiE61H1I8cU3V6t0e3vqPl7dEfKtMXdHckPF17/1Bn3/q9qJFIvn/Pue9qTLnFFT5OaxB3eYfSNfMCuhJ/+DMrbPPxtTWZUc7SyNHzyf60eFOCPTTNhCeT4VYG/Odv96GKUgD7ZsGWXPS99ml6x+Z8QVQS5vkZzTnXBrRKRLJhMeyrhb8Wh2oamZOLMHbRwT5Qfn/mIGYl/++gyD5r4p6oJdXHJM+xmTaUQaqAv9feXBiVjbA9S4OmNI+sVBZ0aqMDm4wHEdwht4ETnIY0tzq/8qiC03odBWYAA"} alt="DCSL logo mark" /><div><strong className="dcsl-logo">DCSL</strong><small>DELIVERING A BRIGHTER TOMORROW</small></div></div><div className="dcsl-title"><h3>Wave Plan</h3><span>▣ {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</span></div><div className="dcsl-site"><b>{site}</b><span>{plan.some(r=>r.directLoadTime&&!r.staging)?"GATE / HOLDING":"STG - A"}</span></div><div className="dcsl-values"><span>PEOPLE</span><span>ROUTES</span><span>PERFORMANCE</span></div></header><div className="dcsl-columns"><b>ROUTE</b><b>DRIVER NAME</b><b>◷ &nbsp; LOAD TIME</b>{plan.some(r=>r.launchPad)&&<b>LAUNCH PAD</b>}<b>⌖ &nbsp; {plan.some(r=>r.directLoadTime&&!r.staging)?"GATE / HOLDING":"STAGING"}</b></div>{visibleGroups.map(([k,rows])=>{const [time,wave,stg]=k.split("|"),gate=rows.find(r=>r.gateTime)?.gateTime||"";return <section key={k} className={"dcsl-wave wave-"+wave.toLowerCase()} style={{"--wave":COLORS[wave]||"#475569"}}><h4>{wave==="SAMEDAY"?"SAMEDAY":/^WAVE\d+$/.test(wave)?"WAVE "+wave.slice(4):wave+" WAVE"}&nbsp; - &nbsp;{time}{gate?" · GATE "+gate:stg!=="NO-STAGING"?" "+stg.replace("-"," "):""}</h4>{rows.map((r,i)=><div key={r.route+"-"+i}><b>{r.route}</b><strong>{r.driver.toUpperCase()}</strong><span>{r.time}</span>{plan.some(x=>x.launchPad)&&<span>{r.launchPad||"—"}</span>}<em>{r.staging||r.gateTime||"—"}</em></div>)}</section>})}<footer><div className="dcsl-foot-team"><b>●●●</b><span>ONE TEAM<br/>SAFER DELIVERIES<br/>STRONGER TOMORROW</span></div><div className="dcsl-foot-brand"><strong>DCSL</strong><span>DRIVE &nbsp;|&nbsp; DELIVER &nbsp;|&nbsp; SUCCEED</span></div><div className="dcsl-foot-site"><b>{site}</b><span>Make It Happen</span></div></footer></div>:<div className="waveplan-empty">Upload Route Plan + Wave Plan and select <b>Generate Wave Plan</b>.</div>}</article></section>
  </>}
 </div>
}