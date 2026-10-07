"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

const COLORS={PURPLE:"#762db3",BLUE:"#087fcf",GREEN:"#05ad58",RED:"#d62828",YELLOW:"#d7ad00",ORANGE:"#e67e22",WAVE1:"#35b51b",WAVE2:"#f5a000",WAVE3:"#a63db8",WAVE6:"#e05252",WAVE7:"#2f9e68"};
const normaliseHex=value=>{const raw=String(value||"").replace(/^#/,"").toUpperCase();const hex=raw.length===8?raw.slice(2):raw.length===6?raw:"";return /^[0-9A-F]{6}$/.test(hex)?"#"+hex:""};
const rgbFromHex=value=>{const hex=normaliseHex(value);return hex?{r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)}:null};
const colourStats=value=>{const rgb=rgbFromHex(value);if(!rgb)return null;const max=Math.max(rgb.r,rgb.g,rgb.b),min=Math.min(rgb.r,rgb.g,rgb.b),sat=max?((max-min)/max):0,luma=(.2126*rgb.r+.7152*rgb.g+.0722*rgb.b)/255;return{...rgb,sat,luma}};
const usefulWaveColour=value=>{const stats=colourStats(value);return !!stats&&stats.luma>=.12&&stats.luma<=.94};
const quantiseColour=value=>{const rgb=rgbFromHex(value);if(!rgb)return"";const q=n=>Math.max(0,Math.min(255,Math.round(n/16)*16));return "#"+[q(rgb.r),q(rgb.g),q(rgb.b)].map(n=>n.toString(16).padStart(2,"0")).join("").toUpperCase()};
const waveTextColour=value=>{const stats=colourStats(value);return stats&&stats.luma>.62?"#06130A":"#FFFFFF"};
const waveLabel=wave=>wave==="SAMEDAY"?"Sameday":/^WAVE\d+$/.test(wave)?`Wave ${wave.slice(4)}`:/^COLOR_[0-9A-F]{6}$/.test(wave)?`Detected ${wave.slice(6)}`:`${wave?.[0]||""}${String(wave||"").slice(1).toLowerCase()} Wave`;
const excelCellColour=cell=>normaliseHex(cell?.s?.fill?.fgColor?.rgb||cell?.s?.fill?.bgColor?.rgb);
const dominantColour=values=>{const counts=new Map();for(const raw of values||[]){const colour=normaliseHex(raw);if(!usefulWaveColour(colour))continue;counts.set(colour,(counts.get(colour)||0)+1)}return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||""};
const excelRowColour=(sheet,rowIndex,range)=>{const colours=[];for(let col=range.s.c;col<=range.e.c;col++){const cell=sheet[XLSX.utils.encode_cell({r:rowIndex,c:col})];const colour=excelCellColour(cell);if(colour)colours.push(colour)}return dominantColour(colours)};
const colourForRows=(wave,rows)=>dominantColour((rows||[]).map(row=>row.sourceColour))||(/^COLOR_([0-9A-F]{6})$/.test(wave)?("#"+wave.slice(6)):COLORS[wave])||"#475569";
const clean=v=>String(v??"").trim();
const norm=v=>clean(v).toUpperCase().replace(/\s+/g," ");
const routeOf=c=>{const m=c.map(clean).join(" ").match(/\b(?:CA|CB|SA|AA)[_\s-]*A?[0-9O]{1,4}\b/i);return m?m[0].replace(/\s+/g,"_").replace(/O/g,"0").toUpperCase():""};
const timeOf=c=>{let t=c.map(clean).join(" ").toUpperCase().replace(/O/g,"0");const m=t.match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\s*(AM|PM)?\b/i)||t.match(/\b(\d{1,2})(\d{2})\s*(AM|PM)\b/i);return m?`${m[1]}:${m[2]} ${m[3]||""}`.trim():""};
const stageOf=c=>{const t=c.map(clean).join(" ");const colour=t.match(/\b(PURPLE|BLUE|GREEN|RED|YELLOW|ORANGE)\s*[. -]?\s*(\d{1,2})\b/i);const base=t.match(/\bSTG\s*[-.]?\s*([A-Z])\b/i);if(colour)return `STG-${base?.[1]?.toUpperCase()||"A"} ${colour[1].toUpperCase()}.${colour[2]}`;const numbered=t.match(/\bSTG\s*[-.]?\s*([A-Z])\s*[. -]?\s*(\d{1,2})\b/i);if(numbered)return `STG-${numbered[1].toUpperCase()}.${numbered[2]}`;return base?`STG-${base[1].toUpperCase()}`:""};
const stageLoose=t=>{const s=clean(t).toUpperCase().replace(/\s+/g,"").replace(/O/g,"0");const m=s.match(/STG[-.]?([A-Z])[.-]?(\d{1,2})\b/);if(m)return `STG-${m[1]}.${m[2]}`;const w=s.match(/(PURPLE|BLUE|GREEN|RED|YELLOW|ORANGE)[.-]?(\d{1,2})\b/);return w?`STG-A ${w[1]}.${w[2]}`:""};
const waveOf=(stage,c,route="",explicitWave="",sourceColour="")=>{const waveText=norm(`${explicitWave} ${c.join(" ")}`);const numbered=waveText.match(/\bWAVE\s*([1-9]\d*)\b/);if(numbered)return `WAVE${numbered[1]}`;if(/^SA_/i.test(route))return "SAMEDAY";const named=Object.keys(COLORS).filter(x=>!/^WAVE/.test(x)).find(x=>norm(stage+" "+c.join(" ")).includes(x));if(named)return named;const detected=normaliseHex(sourceColour);if(detected)return `COLOR_${detected.slice(1)}`;return (()=>{
 const n=Number(clean(stage).match(/(?:\.|-|\s)(\d+)$/)?.[1]);
 if(!Number.isFinite(n))return "OTHER";
 if(n>=15&&n<=20)return "PURPLE";
 if(n>=1&&n<=14)return "BLUE";
 return "OTHER";
})()};
const companyLike=s=>/\b(DANUBE|COURIER|SERVICES|LIMITED|LTD|DCSL|DSP)\b/i.test(s);
const serviceLike=s=>/\b(REMOTE\s+DEBRIEF|NURSERY\s+ROUTE|RIDE\s+ALONG|IRONHIDE|STANDARD\s+PARCEL|LARGE\s+VAN|SMALL\s+VAN|SERVICE\s+TYPE)\b/i.test(String(s||""));
const tidyDriverName=value=>clean(value).replace(/\s*\/\s*/g," / ").replace(/\s{2,}/g," ").trim();
const nameIdentityKey=value=>{const parts=tidyDriverName(value).toUpperCase().replace(/[^A-Z0-9' -]/g," ").split(/\s+/).filter(Boolean);return parts.length?parts[0]+"|"+parts[parts.length-1]:""};
const uniqueDriverNames=values=>{const seen=new Set(),out=[];for(const raw of values){const value=tidyDriverName(raw);if(!value||serviceLike(value)||companyLike(value))continue;const key=nameIdentityKey(value)||norm(value);if(seen.has(key))continue;seen.add(key);out.push(value)}return out;};
const candidate=(c,route,time,stage)=>c.map(clean).find(x=>x&&x!==route&&x!==time&&x!==stage&&/[A-Za-z]/.test(x)&&!/^A[A-Z0-9]{8,}$/i.test(x)&&!companyLike(x)&&!serviceLike(x)&&!/STG|WAVE|ROUTE|DRIVER|TIME|LOCATION|STATION|SAMEDAY|PARCEL|VEHICLE/i.test(x)&&!/^(STANDARD|LARGE|SMALL)\b/i.test(x)&&!/^\d+$/.test(x))||"";
const toMinutes=v=>{const m=clean(v).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);if(!m)return null;let h=+m[1],n=+m[2],a=(m[3]||"").toUpperCase();if(a==="PM"&&h<12)h+=12;if(a==="AM"&&h===12)h=0;return h*60+n};
const formatMinutes=n=>{n=(n+1440)%1440;let h=Math.floor(n/60),m=n%60,a=h>=12?"PM":"AM";return `${h%12||12}:${String(m).padStart(2,"0")} ${a}`};
const adjustTime=(v,delta)=>{const n=toMinutes(v);return n==null?clean(v):formatMinutes(n+delta)};
const deh1GateFallback=v=>{const n=toMinutes(v);if(n==null)return"";const m=(n-25+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`};
async function workbookRows(file){const b=await file.arrayBuffer(),wb=XLSX.read(b,{type:"array",cellStyles:true}),rows=[];for(const sheetName of wb.SheetNames){const sheet=wb.Sheets[sheetName],range=XLSX.utils.decode_range(sheet["!ref"]||"A1");XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false}).forEach((cells,i)=>rows.push({sheet:sheetName,row:i+1,cells,rowColour:excelRowColour(sheet,range.s.r+i,range)}))}return rows}
async function imageCanvas(file){const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("Canvas unavailable");if(typeof createImageBitmap==="function"){const bitmap=await createImageBitmap(file);canvas.width=bitmap.width;canvas.height=bitmap.height;ctx.drawImage(bitmap,0,0);bitmap.close?.();return{ctx,width:canvas.width,height:canvas.height}}const url=URL.createObjectURL(file);try{const img=await new Promise((resolve,reject)=>{const node=new Image();node.onload=()=>resolve(node);node.onerror=reject;node.src=url});canvas.width=img.naturalWidth||img.width;canvas.height=img.naturalHeight||img.height;ctx.drawImage(img,0,0);return{ctx,width:canvas.width,height:canvas.height}}finally{URL.revokeObjectURL(url)}}
function sampledRowColour(ctx,width,height,bbox){if(!ctx||!bbox||!width||!height)return"";const center=Math.max(0,Math.min(height-1,Math.round((bbox.y0+bbox.y1)/2))),rowHeight=Math.max(2,Math.round((bbox.y1-bbox.y0)/2)),ys=[center,Math.max(0,center-rowHeight),Math.min(height-1,center+rowHeight)],step=Math.max(3,Math.floor(width/220)),colours=[];for(const y of ys){let data;try{data=ctx.getImageData(0,y,width,1).data}catch{return""}for(let x=Math.floor(width*.03);x<Math.floor(width*.97);x+=step){const i=x*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];if(a<180)continue;const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max?((max-min)/max):0,luma=(.2126*r+.7152*g+.0722*b)/255;if(luma<.12||luma>.94)continue;colours.push(quantiseColour("#"+[r,g,b].map(n=>n.toString(16).padStart(2,"0")).join("")))}}return dominantColour(colours)}
function ocrRouteColours(blocks,ctx,width,height){const out=new Map();for(const block of blocks||[])for(const paragraph of block?.paragraphs||[])for(const line of paragraph?.lines||[]){const route=routeOf([line?.text||""]);if(!route)continue;const colour=sampledRowColour(ctx,width,height,line?.bbox);if(colour)out.set(norm(route),colour)}return out}
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
 const uniqueHeaders=[];for(const header of rawHeaders){if(!uniqueHeaders.some(h=>h.time===header.time&&Math.abs(h.x-header.x)<90))uniqueHeaders.push(header)}
 const headers=normaliseDeh1Headers(uniqueHeaders);
 if(!headers.length)return[];
 const gateFor=header=>{
   const candidates=times.filter(t=>t.y<header.y-8&&Math.abs(t.x-header.x)<Math.max(220,header.x*.7)).sort((a,b)=>Math.abs(a.x-header.x)-Math.abs(b.x-header.x)||Math.abs(a.y-header.y)-Math.abs(b.y-header.y));
   return candidates[0]?.time||"";
 };
 const launchPadBetween=(left,right)=>{
   if(!right)return"";
   const minX=left?.x??Math.max(0,right.x-120),maxX=right.x,rowTol=Math.max(7,right.h*.72);
   const candidates=words.filter(w=>w.x>minX&&w.x<maxX&&Math.abs(w.y-right.y)<=rowTol&&deh1LaunchPadToken(w.text)).sort((a,b)=>Math.abs(a.y-right.y)-Math.abs(b.y-right.y)||(right.x-a.x)-(right.x-b.x));
   return deh1LaunchPadToken(candidates[0]?.text);
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
   const dcslWord=words.filter(w=>dcslOcrLabel(w.text)&&w.x<word.x&&word.x-w.x<260&&Math.abs(w.y-word.y)<=Math.max(10,word.h*.9)).sort((a,b)=>b.x-a.x)[0];
   if(dcslWord)hint=true;
   const launchPad=launchPadBetween(dcslWord,word)||launchPadBetween(null,word);
   pushRoute(route,word,hint,launchPad,word.y);
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
 const all=[...merged.values()],byWave=new Map();
 for(const row of all){const key=row.explicitWave+"|"+row.cells[1],arr=byWave.get(key)||[];arr.push(row);byWave.set(key,arr)}
 const normalised=[];
 for(const rows of byWave.values()){
   const ordered=[...rows].sort((a,b)=>(a.sourceY??999999)-(b.sourceY??999999)),starts=new Map();
   ordered.forEach((row,i)=>{const pad=Number(row.launchPad);if(pad>=1&&pad<=8){const start=((pad-1-(i%8))+80)%8+1;starts.set(start,(starts.get(start)||0)+1)}});
   const startPad=[...starts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||1;
   ordered.forEach((row,i)=>normalised.push({...row,launchPad:String(((startPad-1+i)%8)+1)}));
 }
 return normalised.sort((a,b)=>(a.sourceY??999999)-(b.sourceY??999999));
}

const deh1ConsecutiveGroups=values=>{
 const out=[];if(!values?.length)return out;let start=values[0],prev=values[0];
 for(const value of values.slice(1)){if(value<=prev+1){prev=value;continue}out.push([start,prev]);start=prev=value}
 out.push([start,prev]);return out;
};
function deh1GridStructure(canvas,headerCount){
 if(!canvas||headerCount<1)return null;
 const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
 const {width,height}=canvas,image=ctx.getImageData(0,0,width,height).data,dark=(x,y)=>{const i=(y*width+x)*4;return image[i]<85&&image[i+1]<85&&image[i+2]<85};
 const horizontal=[];
 for(let y=Math.floor(height*.24);y<height;y++){let count=0;for(let x=0;x<width;x++)if(dark(x,y))count++;if(count>width*.55)horizontal.push(y)}
 const hGroups=deh1ConsecutiveGroups(horizontal),hLines=hGroups.map(([a])=>a);
 let best=[];
 for(let i=0;i<hLines.length;i++){const run=[hLines[i]];for(let j=i+1;j<hLines.length;j++){const gap=hLines[j]-run[run.length-1];if(gap>=14&&gap<=32)run.push(hLines[j]);else if(gap>32)break}if(run.length>best.length)best=run}
 if(best.length<6)return null;
 const top=best[0],bottom=best[best.length-1],bodyHeight=Math.max(1,bottom-top),vertical=[];
 for(let x=0;x<width;x++){let count=0;for(let y=top;y<=bottom;y++)if(dark(x,y))count++;if(count>bodyHeight*.55)vertical.push(x)}
 const xGroups=deh1ConsecutiveGroups(vertical),xLines=xGroups.map(([a,b])=>Math.round((a+b)/2)).filter(x=>x>=0&&x<width);
 if(xLines.length&&xLines[0]>6)xLines.unshift(0);
 if(!xLines.length||width-1-xLines[xLines.length-1]>20)xLines.push(width-1);
 if(xLines.length<4)return null;
 let chosen=null,score=Infinity;
 for(let start=0;start<xLines.length;start++){
   const need=headerCount*3+1,end=start+need;if(end>xLines.length)break;
   const candidate=xLines.slice(start,end),widths=candidate.slice(1).map((x,i)=>x-candidate[i]);
   if(widths.some(v=>v<12||v>Math.max(220,width*.6)))continue;
   let s=0;for(let i=0;i<headerCount;i++){const a=candidate[i*3],b=candidate[i*3+3];s+=Math.abs((b-a)-width/headerCount)}
   if(s<score){score=s;chosen=candidate}
 }
 if(!chosen&&xLines.length>=headerCount*3+1)chosen=xLines.slice(0,headerCount*3+1);
 if(!chosen)return null;
 const blocks=[];for(let i=0;i<headerCount;i++)blocks.push([chosen[i*3],chosen[i*3+1],chosen[i*3+2],chosen[i*3+3]]);
 return{rowLines:best,blocks};
}
const deh1InkRatio=(canvas,x0,x1,y0,y1)=>{
 const ctx=canvas?.getContext("2d",{willReadFrequently:true});if(!ctx||x1<=x0||y1<=y0)return 0;
 let image;try{image=ctx.getImageData(Math.max(0,Math.floor(x0)),Math.max(0,Math.floor(y0)),Math.max(1,Math.floor(x1-x0)),Math.max(1,Math.floor(y1-y0)))}catch{return 0}
 let dark=0,total=0;for(let i=0;i<image.data.length;i+=4){total++;if(image.data[i]<145&&image.data[i+1]<145&&image.data[i+2]<145)dark++}
 return total?dark/total:0;
};
function deh1RouteComposite(canvas,block,rowLines){
 const [, ,routeLeft,routeRight]=block,rowIndexes=[];
 for(let i=0;i<rowLines.length-1;i++){
   const y0=rowLines[i]+2,y1=rowLines[i+1]-2;
   if(deh1InkRatio(canvas,routeLeft+2,routeRight-2,y0,y1)>.012)rowIndexes.push(i);
 }
 if(!rowIndexes.length)return null;
 const scale=4,rowHeight=74,width=Math.max(260,Math.round((routeRight-routeLeft-4)*scale)),out=document.createElement("canvas"),ctx=out.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
 out.width=width;out.height=rowIndexes.length*rowHeight;ctx.fillStyle="#fff";ctx.fillRect(0,0,out.width,out.height);ctx.imageSmoothingEnabled=false;
 rowIndexes.forEach((rowIndex,i)=>{const y0=rowLines[rowIndex]+2,y1=rowLines[rowIndex+1]-2,srcW=Math.max(1,routeRight-routeLeft-4),srcH=Math.max(1,y1-y0),destH=Math.min(58,rowHeight-10),destW=Math.min(out.width-8,Math.round(srcW*(destH/srcH)));ctx.drawImage(canvas,routeLeft+2,y0,srcW,srcH,4,i*rowHeight+6,destW,destH)});
 const img=ctx.getImageData(0,0,out.width,out.height),d=img.data;for(let i=0;i<d.length;i+=4){const gray=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2],v=gray<180?0:255;d[i]=v;d[i+1]=v;d[i+2]=v;d[i+3]=255}ctx.putImageData(img,0,0);
 return{canvas:out,rowIndexes};
}
async function deh1GridImageRows(worker,rawCanvas,sparse){
 const words=deh1OcrWords(sparse),anchors=deh1WaveAnchors(words),rawHeaders=[],times=[];
 for(const word of words){const t=deh1Time(word.text);if(t)times.push({time:t,x:word.x,y:word.y})}
 for(const anchor of anchors){const number=anchor.number,load=anchor.timeWord?deh1Time(anchor.timeWord.text):"";if(number&&load)rawHeaders.push({wave:"WAVE"+number,time:load,x:(anchor.word.x+(anchor.timeWord?.x||anchor.word.x))/2,y:anchor.word.y})}
 const unique=[];for(const header of rawHeaders){if(!unique.some(h=>h.time===header.time&&Math.abs(h.x-header.x)<90))unique.push(header)}
 const headers=normaliseDeh1Headers(unique);if(!headers.length)return[];
 const grid=deh1GridStructure(rawCanvas,headers.length);if(!grid)return[];
 const sortedHeaders=[...headers].sort((a,b)=>a.x-b.x),rows=[];
 const gateFor=header=>{const candidates=times.filter(t=>t.y<header.y-12&&Math.abs(t.x-header.x)<Math.max(180,rawCanvas.width/headers.length*.7)&&t.time!==header.time).sort((a,b)=>Math.abs(a.x-header.x)-Math.abs(b.x-header.x)||Math.abs(a.y-header.y)-Math.abs(b.y-header.y));return candidates[0]?.time||adjustTime(header.time,-25)};
 try{await worker.setParameters({tessedit_pageseg_mode:"6",tessedit_char_whitelist:"CA_0123456789",preserve_interword_spaces:"1"})}catch{}
 for(let blockIndex=0;blockIndex<Math.min(grid.blocks.length,sortedHeaders.length);blockIndex++){
   const block=grid.blocks[blockIndex],header=sortedHeaders[blockIndex],composite=deh1RouteComposite(rawCanvas,block,grid.rowLines);if(!composite)continue;
   const {data}=await worker.recognize(composite.canvas,{}, {text:true});
   let lines=String(data?.text||"").split(/\r?\n/).map(clean).filter(Boolean);
   if(lines.length!==composite.rowIndexes.length){
     lines=[];try{await worker.setParameters({tessedit_pageseg_mode:"7",tessedit_char_whitelist:"CA_0123456789"})}catch{}
     for(const rowIndex of composite.rowIndexes){const y0=grid.rowLines[rowIndex]+2,y1=grid.rowLines[rowIndex+1]-2,routeLeft=block[2]+2,routeRight=block[3]-2,crop=document.createElement("canvas"),ctx=crop.getContext("2d",{willReadFrequently:true});if(!ctx){lines.push("");continue}crop.width=Math.max(280,(routeRight-routeLeft)*5);crop.height=90;ctx.fillStyle="#fff";ctx.fillRect(0,0,crop.width,crop.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(rawCanvas,routeLeft,y0,routeRight-routeLeft,Math.max(1,y1-y0),4,8,crop.width-8,crop.height-16);try{const single=await worker.recognize(crop,{}, {text:true});lines.push(clean(single.data?.text||""))}catch{lines.push("")}}
     try{await worker.setParameters({tessedit_pageseg_mode:"6",tessedit_char_whitelist:"CA_0123456789",preserve_interword_spaces:"1"})}catch{}
   }
   composite.rowIndexes.forEach((rowIndex,i)=>{const raw=lines[i]||"",route=deh1RouteOf([raw]);if(!route)return;rows.push({sheet:"Image",row:rowIndex+1,cells:[route,header.time,header.wave,""],directLoadTime:true,explicitWave:header.wave,gateTime:gateFor(header),launchPad:String((rowIndex%8)+1),sourceY:(grid.rowLines[rowIndex]+grid.rowLines[rowIndex+1])/2,gridCandidate:true,ocrRouteRaw:raw})});
 }
 return rows;
}

async function deh1ImageRows(file,onProgress){
 const {createWorker}=await import("tesseract.js");
 const worker=await createWorker("eng",1,{logger:m=>m.status==="recognizing text"&&onProgress?.(Math.round((m.progress||0)*100))});
 const rawCanvas=await deh1RawCanvas(file);
 try{await worker.setParameters({tessedit_pageseg_mode:"11",tessedit_char_whitelist:"",preserve_interword_spaces:"1"})}catch{}
 const {data:sparse}=await worker.recognize(file,{}, {text:true,blocks:true});
 const gridRows=await deh1GridImageRows(worker,rawCanvas,sparse);
 if(gridRows.length){await worker.terminate();return gridRows}
 const refined=await deh1RefinedWaveNumbers(worker,rawCanvas,sparse);
 try{await worker.setParameters({tessedit_pageseg_mode:"6",tessedit_char_whitelist:"",preserve_interword_spaces:"1"})}catch{}
 const {data:dense}=await worker.recognize(file,{}, {text:true,blocks:true});
 const combined={blocks:[...(sparse?.blocks||[]),...(dense?.blocks||[])]};
 const rows=deh1RowsFromOcr(combined,rawCanvas,refined);
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
 let canvasInfo=null;try{canvasInfo=await imageCanvas(file)}catch(e){console.warn("Wave colour scan unavailable",e)}
 const {data}=await worker.recognize(file,{}, {text:true,blocks:true}); await worker.terminate();
 const routeColours=canvasInfo?ocrRouteColours(data.blocks,canvasInfo.ctx,canvasInfo.width,canvasInfo.height):new Map();
 const rows=[];
 const lines=data.text.split(/\r?\n/).map(x=>x.replace(/[|]/g," ").replace(/\s+/g," ").trim()).filter(Boolean);
 for(const [i,raw] of lines.entries()){
   const upper=raw.toUpperCase();
   const routeMatch=upper.match(/\b[CS][A4]\s*[_-]?\s*A\s*[_-]?\s*[0-9O]{2,4}\b/)||upper.match(/\b(?:CA|SA)\s*[_-]?\s*[0-9O]{2,4}\b/);
   const route=routeMatch?routeMatch[0].replace(/\s+/g,"").replace(/-/g,"_").replace(/^C4/,"CA").replace(/^S4/,"SA").replace(/O/g,"0").replace(/^(CA|SA)(?!_)/,"$1_").replace(/^(CA|SA)_?(\d)/,"$1_A$2"):"";
   const time=timeOf([upper]);
   const staging=stageOf([upper])||stageLoose(upper);
   if(route) rows.push({sheet:"Image",row:i+1,cells:[route,time,staging,upper],rowColour:routeColours.get(norm(route))||""});
 }
 return rows;
}

const atlasTrackingOf=value=>{
 const compact=clean(value).toUpperCase().replace(/\s+/g,"").replace(/[^A-Z0-9]/g,"");
 const m=compact.match(/U[KX]([0-9OQDILSZGBT]{9,12})/);if(!m)return"";
 const digits=m[1].replace(/[OQD]/g,"0").replace(/[IL]/g,"1").replace(/Z/g,"2").replace(/E/g,"3").replace(/S/g,"5").replace(/G/g,"6").replace(/T/g,"7").replace(/B/g,"8").replace(/\D/g,"");
 return digits.length>=9&&digits.length<=12?"UK"+digits:"";
};
const atlasWaveOf=value=>{
 const text=clean(value).toUpperCase().replace(/O/g,"0").replace(/[IL|]/g,"1");
 const m=text.match(/W[A4]V[E3]\s*[-:]?\s*(\d{1,2})/i);return m?"Wave "+Number(m[1]):"";
};
function atlasRowsFromOcrData(data){
 const out=new Map();
 const add=(text,sourceY=0)=>{
   const tracking=atlasTrackingOf(text),route=deh1RouteOf([text])||routeOf([text]),wave=atlasWaveOf(text);
   if(!tracking||!route)return;
   const prev=out.get(tracking);
   out.set(tracking,{tracking,route:prev?.route||route,wave:prev?.wave||wave,sourceY:prev?.sourceY??sourceY});
 };
 const candidates=[];
 for(const block of data?.blocks||[])for(const paragraph of block?.paragraphs||[])for(const line of paragraph?.lines||[]){
   const text=clean(line?.text||(line?.words||[]).map(w=>w?.text||"").join(" "));
   if(text)candidates.push({text,y:bboxY(line?.bbox)});
 }
 for(const line of String(data?.text||"").split(/\r?\n/)){const text=clean(line);if(text)candidates.push({text,y:0})}
 candidates.forEach(x=>add(x.text,x.y));

 // Rebuild table rows spatially. Tesseract often splits Tracking ID, Route and Wave
 // into separate cells/lines on photographed sheets.
 const words=deh1OcrWords(data).sort((a,b)=>a.y-b.y||a.x-b.x),bands=[];
 for(const word of words){
   let best=null,bestD=Infinity;
   for(const band of bands){
     const d=Math.abs(word.y-band.y),tol=Math.max(12,Math.min(30,(word.h+band.h)*.85));
     if(d<=tol&&d<bestD){best=band;bestD=d}
   }
   if(best){best.words.push(word);best.y=(best.y*(best.words.length-1)+word.y)/best.words.length;best.h=Math.max(best.h,word.h)}
   else bands.push({y:word.y,h:word.h,words:[word]});
 }
 bands.sort((a,b)=>a.y-b.y);
 for(const band of bands){
   const row=band.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(" ");
   add(row,band.y);
 }

 // Anchor on every Tracking ID and look right across the same visual row.
 for(const band of bands){
   const ordered=band.words.sort((a,b)=>a.x-b.x),rowText=ordered.map(w=>w.text).join(" ");
   const tracking=atlasTrackingOf(rowText);
   if(!tracking)continue;
   let route=deh1RouteOf([rowText])||routeOf([rowText]),wave=atlasWaveOf(rowText);
   if(!route){
     const trackingIndex=ordered.findIndex((_,i)=>atlasTrackingOf(ordered.slice(Math.max(0,i-1),Math.min(ordered.length,i+3)).map(w=>w.text).join(" ")));
     if(trackingIndex>=0){
       const right=ordered.slice(trackingIndex).map(w=>w.text).join(" ");
       route=deh1RouteOf([right])||routeOf([right]);wave=wave||atlasWaveOf(right);
     }
   }
   if(route){
     const prev=out.get(tracking);
     out.set(tracking,{tracking,route:prev?.route||route,wave:prev?.wave||wave,sourceY:prev?.sourceY??band.y});
   }
 }
 return [...out.values()].sort((a,b)=>(a.sourceY||999999)-(b.sourceY||999999));
}
const atlasColumnRowsFromOcrData=data=>{
 const chunks=[];
 const push=value=>{const text=clean(value);if(text)chunks.push(text)};
 push(data?.text||"");
 for(const block of data?.blocks||[])for(const paragraph of block?.paragraphs||[])for(const line of paragraph?.lines||[])push(line?.text||(line?.words||[]).map(w=>w?.text||"").join(" "));
 const tracking=[],routes=[],waves=[],seenT=new Set();
 for(const chunk of chunks){
   const compact=chunk.toUpperCase().replace(/\s+/g," ");
   const tMatches=compact.match(/U\s*[KX]\s*[0-9OQDILSZGBT\s-]{9,20}/g)||[];
   for(const raw of tMatches){const t=atlasTrackingOf(raw);if(t&&!seenT.has(t)){seenT.add(t);tracking.push(t)}}
   const rMatches=compact.match(/(?:C\s*A|S\s*A|C4|S4)[_\s-]*A?[_\s-]*[0-9OQDILSAZGTB]{2,4}/g)||[];
   for(const raw of rMatches){const r=deh1RouteOf([raw])||routeOf([raw]);if(r)routes.push(r)}
   const wMatches=compact.match(/W[A4]V[E3]\s*[-:]?\s*\d{1,2}/g)||[];
   for(const raw of wMatches){const w=atlasWaveOf(raw);if(w)waves.push(w)}
 }
 const cleanRoutes=[];for(const route of routes){if(!cleanRoutes.length||cleanRoutes[cleanRoutes.length-1]!==route)cleanRoutes.push(route)}
 const count=Math.min(tracking.length,cleanRoutes.length);
 if(count<2)return[];
 return tracking.slice(0,count).map((trackingId,i)=>({tracking:trackingId,route:cleanRoutes[i],wave:waves[i]||"",sourceY:i+1,columnFallback:true}));
};
const mergeAtlasRows=(...sets)=>{
 const out=new Map();
 for(const row of sets.flat()){
   if(!row?.tracking||!row?.route)continue;
   const prev=out.get(row.tracking);
   out.set(row.tracking,{tracking:row.tracking,route:prev?.route||row.route,wave:prev?.wave||row.wave||"",sourceY:Math.min(prev?.sourceY??999999,row.sourceY??999999)});
 }
 return [...out.values()].sort((a,b)=>(a.sourceY||999999)-(b.sourceY||999999));
};
function atlasEnhancedCanvas(source){
 if(!source?.width||!source?.height)return null;
 const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)return null;
 const scale=Math.max(1.5,Math.min(2.5,1800/source.width));canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
 ctx.drawImage(source,0,0,canvas.width,canvas.height);
 const img=ctx.getImageData(0,0,canvas.width,canvas.height),d=img.data;
 for(let i=0;i<d.length;i+=4){
   const gray=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
   const v=gray<205?Math.max(0,gray*.72):255;
   d[i]=v;d[i+1]=v;d[i+2]=v;d[i+3]=255;
 }
 ctx.putImageData(img,0,0);return canvas;
}
async function atlasImageRows(file,onProgress){
 const {createWorker}=await import("tesseract.js");
 const worker=await createWorker("eng",1,{logger:m=>m.status==="recognizing text"&&onProgress?.(Math.round((m.progress||0)*100))});
 const passes=[];let rawCanvas=null,lastError=null;
 const run=async(source,mode)=>{
   try{
     try{await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:"",preserve_interword_spaces:"1"})}catch{}
     const result=await worker.recognize(source,{}, {text:true,blocks:true});
     passes.push(atlasRowsFromOcrData(result.data));
     passes.push(atlasColumnRowsFromOcrData(result.data));
   }catch(e){lastError=e;console.warn("Atlas OCR pass failed",mode,e)}
 };
 try{
   try{rawCanvas=await deh1RawCanvas(file)}catch(e){lastError=e;console.warn("Atlas canvas prep failed",e)}
   await run(file,"6");
   await run(file,"11");
   const enhanced=rawCanvas?atlasEnhancedCanvas(rawCanvas):null;
   if(enhanced)await run(enhanced,"6");
 }finally{await worker.terminate()}
 const rows=mergeAtlasRows(...passes);
 if(!rows.length&&lastError)throw lastError;
 return rows;
}

export default function WavePlanView({site="DLS2",drivers=[]}){
 const [tab,setTab]=useState("wave"),[routeFile,setRouteFile]=useState(null),[waveFile,setWaveFile]=useState(null),[routeRows,setRouteRows]=useState([]),[waveRows,setWaveRows]=useState([]),[generated,setGenerated]=useState(false),[atlasTemplate,setAtlasTemplate]=useState("Good morning,\n\nPlease find below the list of your Atlas shipment of the day - Total Tracking IDs: {count}\n\nTracking ID - Route code - Driver Name\n\n{rows}\n\nBest regards,"),[history,setHistory]=useState([]),[atlasText,setAtlasText]=useState(""),[atlasImageName,setAtlasImageName]=useState(""),[atlasOcrProgress,setAtlasOcrProgress]=useState(null),[atlasStatus,setAtlasStatus]=useState({type:"idle",message:"Upload a photo or paste an Atlas message."}),[atlasLastFile,setAtlasLastFile]=useState(null),[adjust,setAdjust]=useState(-20),[overrides,setOverrides]=useState({}),[dismissedConflicts,setDismissedConflicts]=useState(new Set()),[ocrProgress,setOcrProgress]=useState(null),[hiddenWaves,setHiddenWaves]=useState(new Set()),[planFontSize,setPlanFontSize]=useState("medium"),[dehTimeOverrides,setDehTimeOverrides]=useState({}),[dehEditorWave,setDehEditorWave]=useState("WAVE6"),[dehFontPx,setDehFontPx]=useState(13),[dehFontFamily,setDehFontFamily]=useState("Inter"),[dehBold,setDehBold]=useState(false),[dehItalic,setDehItalic]=useState(false),[dehUnderline,setDehUnderline]=useState(false);
 const routeInput=useRef(null),waveInput=useRef(null),smartInput=useRef(null),atlasImageInput=useRef(null),atlasRouteInput=useRef(null),sheetRef=useRef(null);
 const [dragging,setDragging]=useState(false),[uploadStatus,setUploadStatus]=useState([]),[editorTab,setEditorTab]=useState("waves");
 const [editNamesOpen,setEditNamesOpen]=useState(false),[editDraft,setEditDraft]=useState({});
 useEffect(()=>{
   setRouteFile(null);setWaveFile(null);setRouteRows([]);setWaveRows([]);setGenerated(false);
   setOverrides({});setDismissedConflicts(new Set());setHiddenWaves(new Set());setUploadStatus([]);
   setEditNamesOpen(false);setEditDraft({});
   setOcrProgress(null);setAtlasOcrProgress(null);setAtlasImageName("");setAtlasStatus({type:"idle",message:"Upload a photo or paste an Atlas message."});setAtlasLastFile(null);setDehTimeOverrides({});setDehEditorWave("WAVE6");
   if(atlasImageInput.current)atlasImageInput.current.value="";
   if(routeInput.current)routeInput.current.value="";
   if(waveInput.current)waveInput.current.value="";
   if(smartInput.current)smartInput.current.value="";
 },[site]);
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
 const loadAtlasImage=async file=>{
   if(!file)return;
   setAtlasLastFile(file);setAtlasImageName(file.name);setAtlasOcrProgress(0);setAtlasStatus({type:"reading",message:"Scanning Tracking ID, Route and Wave columns…"});
   try{
     const rows=await atlasImageRows(file,setAtlasOcrProgress);
     if(!rows.length){
       setAtlasText("");
       setAtlasStatus({type:"error",message:"No valid Tracking ID + Route rows were detected. Try a straighter photo or crop to the table area."});
       return;
     }
     setAtlasText(rows.map(r=>[r.tracking,r.route,r.wave].filter(Boolean).join(" - ")).join("\n"));
     setAtlasStatus({type:rows.length>=8?"success":"warning",message:"Recognised "+rows.length+" shipment"+(rows.length===1?"":"s")+". "+(rows.length>=8?"Ready to match drivers.":"Review the recognised rows before copying.")});
   }catch(e){
     console.error("Atlas image OCR failed",e);
     setAtlasText("");
     setAtlasStatus({type:"error",message:"The scan could not be completed. Retry once or upload a flatter, brighter photo."});
   }finally{setAtlasOcrProgress(null)}
 };
 const driverByTrid=useMemo(()=>new Map(drivers.map(d=>{
   const trid=d?.trid||d?.id||d?.transporter_id||d?.rawData?.trid||d?.raw_data?.trid;
   const name=d?.full_name||d?.name||d?.driver_name;
   return [norm(trid),name];
 }).filter(([trid,name])=>trid&&name&&name!=="Unresolved identity")),[drivers]);
 const routeIdentity=useMemo(()=>{const m=new Map();const header=routeRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v))));const h=header?.cells.map(v=>norm(v))||[];const ri=h.findIndex(v=>v==="ROUTE CODE"),ti=h.findIndex(v=>/TRANSPORTER ID/.test(v)),ni=h.findIndex(v=>/DRIVER NAME/.test(v)),di=h.findIndex(v=>v==="DSP");for(const x of routeRows){if(x===header)continue;if(norm(site)==="DEH1"&&di>=0&&!dcslDsp(x.cells[di]))continue;const route=ri>=0?routeOf([x.cells[ri]]):routeOf(x.cells);if(!route)continue;const key=norm(route),prev=m.get(key)||{trids:[],names:[],fallback:""};const rawTrid=ti>=0?clean(x.cells[ti]):"";const rawName=ni>=0?clean(x.cells[ni]):"";const foundTrids=[...new Set((rawTrid?rawTrid.split(/[\\/|,;\s]+/):x.cells.flatMap(v=>clean(v).split(/[\\/|,;\s]+/))).filter(v=>/^A[A-Z0-9]{8,}$/i.test(v)).map(norm))];const explicitNames=rawName?rawName.split(/[|]/).map(tidyDriverName).filter(Boolean):[];const trids=[...new Set([...prev.trids,...foundTrids])];const dbNames=trids.map(t=>driverByTrid.get(t)).filter(Boolean).map(tidyDriverName);let names;if(trids.length===1){const preferred=dbNames[0]||explicitNames[0]||prev.names[0]||"";names=preferred?[preferred]:[]}else if(explicitNames.length===trids.length&&explicitNames.length){names=uniqueDriverNames(explicitNames)}else if(dbNames.length){names=uniqueDriverNames(dbNames)}else{names=uniqueDriverNames([...prev.names,...explicitNames])}const foundName=names[0]||explicitNames[0]||candidate(x.cells,route,timeOf(x.cells),stageOf(x.cells));m.set(key,{trids,names,fallback:prev.fallback||(!companyLike(foundName)&&!serviceLike(foundName)?tidyDriverName(foundName):"")})}return m},[routeRows,driverByTrid,site]);
 const conflicts=useMemo(()=>[...routeIdentity.entries()].filter(([route,v])=>v.trids.length>1&&v.names.length!==v.trids.length&&!dismissedConflicts.has(route)),[routeIdentity,dismissedConflicts]);
 const autoRouteDrivers=useMemo(()=>{const m=new Map();for(const [route,v] of routeIdentity){const names=uniqueDriverNames(v.names);const name=(names.length?names.join(" / "):"")||tidyDriverName(v.fallback);if(name)m.set(route,name)}return m},[routeIdentity]);
 const routeDrivers=useMemo(()=>{const m=new Map(autoRouteDrivers);for(const [route,value] of Object.entries(overrides)){const manual=tidyDriverName(value);if(manual)m.set(route,manual)}return m},[autoRouteDrivers,overrides]);
 const deh1RouteDeparture=useMemo(()=>{const m=new Map();if(norm(site)!=="DEH1")return m;const header=routeRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v))));const h=header?.cells.map(v=>norm(v))||[],ri=h.findIndex(v=>v==="ROUTE CODE"),di=h.findIndex(v=>v==="DSP"),pi=h.findIndex(v=>/PLANNED DEPARTURE TIME/.test(v));if(ri<0||pi<0)return m;for(const x of routeRows){if(x===header)continue;if(di>=0&&!dcslDsp(x.cells[di]))continue;const route=routeOf([x.cells[ri]]),departure=timeOf([x.cells[pi]]);if(route&&departure)m.set(norm(route),departure)}return m},[routeRows,site]);
 const fillDeh1LaunchPads=rows=>{
   const ordered=[...rows].sort((a,b)=>(a.sourceY??999999)-(b.sourceY??999999));
   const direct=ordered.filter(r=>r.sourceY!=null);
   if(!direct.length)return ordered;
   const starts=new Map();
   direct.forEach((r,i)=>{const pad=Number(r.launchPad);if(pad>=1&&pad<=8){const start=((pad-1-(i%8))+80)%8+1;starts.set(start,(starts.get(start)||0)+1)}});
   const best=[...starts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];
   if(!best)return ordered;
   let directIndex=0;
   return ordered.map(r=>{
     if(r.sourceY==null)return r;
     const pad=((best-1+directIndex)%8)+1;directIndex++;
     return {...r,launchPad:String(pad)};
   });
 };
 const waveRouteKeys=useMemo(()=>{const header=waveRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v))));const h=header?.cells.map(v=>norm(v))||[];const ri=h.findIndex(v=>v==="ROUTE CODE");const out=[];for(const x of waveRows){if(x===header)continue;const route=ri>=0?routeOf([x.cells[ri]]):routeOf(x.cells);if(route)out.push(norm(route))}return [...new Set(out)]},[waveRows]);
 const routeCompatibility=useMemo(()=>{const available=new Set(routeIdentity.keys());const matched=waveRouteKeys.filter(route=>available.has(route));const total=waveRouteKeys.length;return{matched:matched.length,total,ratio:total?matched.length/total:1,missing:waveRouteKeys.filter(route=>!available.has(route))}},[waveRouteKeys,routeIdentity]);
 const scheduleAlignment=useMemo(()=>{const waveHeader=waveRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v))));const wh=waveHeader?.cells.map(v=>norm(v))||[];const wti=wh.findIndex(v=>v==="TIME");const routeHeader=routeRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v))));const rh=routeHeader?.cells.map(v=>norm(v))||[];const rti=rh.findIndex(v=>/PLANNED DEPARTURE TIME/.test(v));if(wti<0||rti<0)return null;const wc=new Map(),rc=new Map();for(const x of waveRows){if(x===waveHeader)continue;const m=toMinutes(timeOf([x.cells[wti]]));if(m!=null)wc.set(m,(wc.get(m)||0)+1)}for(const x of routeRows){if(x===routeHeader)continue;const m=toMinutes(timeOf([x.cells[rti]]));if(m!=null)rc.set(m,(rc.get(m)||0)+1)}let best={minutes:0,matched:0};for(let delta=-60;delta<=60;delta+=5){let score=0;for(const [m,count] of wc)score+=Math.min(count,rc.get(m+delta)||0);if(score>best.matched)best={minutes:delta,matched:score}}return best.matched?best:null},[waveRows,routeRows]);
 const plan=useMemo(()=>{
   const header=waveRows.find(x=>x.cells.some(v=>/route\s*code/i.test(clean(v)))),h=header?.cells.map(v=>norm(v))||[],ri=h.findIndex(v=>v==="ROUTE CODE"),wi=h.findIndex(v=>v==="WAVE"),si=h.findIndex(v=>/STAGING LOCATION/.test(v)),ti=h.findIndex(v=>v==="TIME"),ni=h.findIndex(v=>/DRIVER NAME/.test(v)),isDeh1=norm(site)==="DEH1",exactDeh1Routes=isDeh1?new Set(waveRows.map(row=>{const r=ri>=0?routeOf([row.cells[ri]]):routeOf(row.cells);return r&&routeIdentity.has(norm(r))?norm(r):""}).filter(Boolean)):new Set();
   const parsed=waveRows.map(x=>{
     if(x===header)return null;
     let route=ri>=0?routeOf([x.cells[ri]]):routeOf(x.cells);
     if(isDeh1&&routeIdentity.size&&route&&!routeIdentity.has(norm(route))){
       if(!x.dcslHint&&!x.gridCandidate)return null;
       const near=[...routeIdentity.keys()].filter(k=>!exactDeh1Routes.has(k)&&deh1RouteDistance(route,k)<=1);
       if(near.length!==1)return null;
       route=near[0];
     }
     const amazon=ti>=0?timeOf([x.cells[ti]]):timeOf(x.cells),staging=si>=0?clean(x.cells[si]):(stageOf(x.cells)||stageLoose(x.cells.join(" ")));
     if(!route||!amazon||(!staging&&!x.directLoadTime))return null;
     const trid=x.cells.map(clean).find(v=>/^A[A-Z0-9]{8,}$/i.test(v)),explicit=ni>=0?clean(x.cells[ni]):"",sourceColour=normaliseHex(x.rowColour),direct=Boolean(x.directLoadTime);
     const name=(trid&&driverByTrid.get(norm(trid)))||routeDrivers.get(norm(route))||((explicit&&!companyLike(explicit)&&!serviceLike(explicit))?explicit:"")||candidate(x.cells,route,amazon,staging)||"UNASSIGNED";
     return{route,driver:name,amazonTime:amazon,time:direct?amazon:adjustTime(amazon,adjust),staging:staging||"",gateTime:x.gateTime||(isDeh1&&direct?deh1GateFallback(amazon):""),launchPad:x.launchPad||"",sourceY:Number.isFinite(Number(x.sourceY))?Number(x.sourceY):null,directLoadTime:direct,sourceColour,wave:waveOf(staging,x.cells,route,x.explicitWave||(wi>=0?x.cells[wi]:""),sourceColour)};
   }).filter(Boolean);
   if(!isDeh1||!routeIdentity.size||!parsed.length)return parsed;
   const baseMap=new Map();
   for(const row of parsed){const key=norm(row.route),prev=baseMap.get(key);if(!prev||(!prev.launchPad&&row.launchPad))baseMap.set(key,row)}
   let base=[...baseMap.values()].sort((a,b)=>(a.sourceY??999999)-(b.sourceY??999999)),seen=new Set(base.map(row=>norm(row.route)));
   const templates=new Map(),candidatesByDeparture=new Map();
   for(const row of base){const departure=deh1RouteDeparture.get(norm(row.route));if(!departure)continue;const key=norm(departure),arr=candidatesByDeparture.get(key)||[];arr.push(row);candidatesByDeparture.set(key,arr)}
   for(const [departure,rows] of candidatesByDeparture){const counts=new Map();for(const row of rows){const sig=[row.wave,row.time,row.gateTime||"",row.staging||""].join("|");counts.set(sig,(counts.get(sig)||0)+1)}const best=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0],template=rows.find(row=>[row.wave,row.time,row.gateTime||"",row.staging||""].join("|")===best)||rows[0];if(template)templates.set(departure,template)}
   const rawTemplates=[...new Map(waveRows.filter(r=>r.directLoadTime&&r.explicitWave&&timeOf(r.cells)).map(r=>{const time=timeOf(r.cells),gate=r.gateTime||"";return [[r.explicitWave,time].join("|"),{wave:r.explicitWave,time,amazonTime:time,gateTime:gate,staging:"",directLoadTime:true,sourceColour:""}]})).values()].sort((a,b)=>(toMinutes(a.time)??9999)-(toMinutes(b.time)??9999));
   const departures=[...new Set([...deh1RouteDeparture.values()].map(norm))].sort((a,b)=>(toMinutes(a)??9999)-(toMinutes(b)??9999));
   if(rawTemplates.length&&departures.length){const count=Math.min(rawTemplates.length,departures.length);for(let i=0;i<count;i++)if(!templates.has(departures[i]))templates.set(departures[i],rawTemplates[i])}
   for(const route of routeIdentity.keys()){if(seen.has(route))continue;const departure=deh1RouteDeparture.get(route),template=departure?templates.get(norm(departure)):null;if(!template)continue;base.push({...template,route,driver:routeDrivers.get(route)||"UNASSIGNED",launchPad:"",sourceY:null,recoveredFromRoutePlan:true});seen.add(route)}
   const byWave=new Map();for(const row of base){const key=[row.wave,row.time,row.gateTime||""].join("|"),arr=byWave.get(key)||[];arr.push(row);byWave.set(key,arr)}
   base=[...byWave.values()].flatMap(rows=>fillDeh1LaunchPads(rows));
   return base;
 },[waveRows,routeDrivers,driverByTrid,adjust,routeIdentity,site,deh1RouteDeparture]);
 const deh1Recovery=useMemo(()=>{
   if(norm(site)!=="DEH1"||!routeIdentity.size)return{eligible:false,recoverable:0,matched:0,total:routeIdentity.size,ratio:0,delta:null};
   const resolved=new Map();
   for(const row of waveRows){
     if(!row.directLoadTime)continue;
     let route=routeOf(row.cells);
     if(route&&routeIdentity.has(norm(route)))route=norm(route);
     else if(route&&(row.dcslHint||row.gridCandidate)){
       const near=[...routeIdentity.keys()].filter(key=>deh1RouteDistance(route,key)<=1);
       if(near.length!==1)continue;
       route=near[0];
     }else continue;
     const departure=deh1RouteDeparture.get(norm(route)),load=timeOf(row.cells);
     const departureMinutes=toMinutes(departure),loadMinutes=toMinutes(load);
     if(!departure||departureMinutes==null||loadMinutes==null)continue;
     resolved.set(norm(route),{departure:norm(departure),delta:departureMinutes-loadMinutes});
   }
   const matched=resolved.size,deltas=[...resolved.values()].map(x=>x.delta).filter(Number.isFinite);
   if(matched<3||deltas.length<3)return{eligible:false,recoverable:matched,matched,total:routeIdentity.size,ratio:routeIdentity.size?matched/routeIdentity.size:0,delta:null};
   const ordered=[...deltas].sort((a,b)=>a-b),median=ordered[Math.floor(ordered.length/2)],spread=ordered[ordered.length-1]-ordered[0];
   const departureGroups=new Set([...resolved.values()].map(x=>x.departure));
   const recoverable=[...routeIdentity.keys()].filter(route=>departureGroups.has(norm(deh1RouteDeparture.get(route)))).length;
   const ratio=routeIdentity.size?recoverable/routeIdentity.size:0,eligible=spread<=10&&median>=-15&&median<=60&&ratio>=.8;
   return{eligible,recoverable,matched,total:routeIdentity.size,ratio,delta:median};
 },[site,waveRows,routeIdentity,deh1RouteDeparture]);
 const effectiveRouteCompatibility=deh1Recovery.eligible?{matched:deh1Recovery.recoverable,total:routeIdentity.size,ratio:routeIdentity.size?deh1Recovery.recoverable/routeIdentity.size:1,missing:[...routeIdentity.keys()].filter(route=>!plan.some(row=>norm(row.route)===route))}:routeCompatibility;
 const routeSetMismatch=effectiveRouteCompatibility.total>=5&&effectiveRouteCompatibility.ratio<0.5;
 const editableRoutes=useMemo(()=>{const seen=new Set(),rows=[];for(const row of plan){const route=norm(row.route);if(seen.has(route))continue;seen.add(route);const current=autoRouteDrivers.get(route)||row.driver||"UNASSIGNED";const corrected=routeDrivers.get(route)||current;rows.push({route:row.route,current,corrected})}return rows},[plan,autoRouteDrivers,routeDrivers]);
 const openNameEditor=()=>{const draft={};for(const row of editableRoutes)draft[norm(row.route)]=row.corrected;setEditDraft(draft);setEditNamesOpen(true)};
 const applyNameEdits=()=>{const next={...overrides};for(const row of editableRoutes){const key=norm(row.route),value=tidyDriverName(editDraft[key]||"");if(value&&value!==row.current)next[key]=value;else delete next[key]}setOverrides(next);setEditNamesOpen(false);setGenerated(generated||Boolean(plan.length))};
 const groups=useMemo(()=>{const m=new Map();for(const r of plan){const stg=r.staging?(r.staging.match(/STG[- ]?[A-Z]/i)?.[0]?.replace(" ","-").toUpperCase()||r.staging):"NO-STAGING",key=[r.time,r.wave,stg].join("|");if(!m.has(key))m.set(key,[]);m.get(key).push(r)}return [...m.entries()].sort((a,b)=>(toMinutes(a[0].split("|")[0])??9999)-(toMinutes(b[0].split("|")[0])??9999)||a[0].localeCompare(b[0]))},[plan]);
 const visibleGroups=useMemo(()=>groups.filter(([k])=>!hiddenWaves.has(k)),[groups,hiddenWaves]);
 const dehWaveOptions=useMemo(()=>visibleGroups.map(([k,rows])=>{const [time,wave]=k.split("|"),gate=rows.find(r=>r.gateTime)?.gateTime||"";return{key:k,wave,time,gate,rows}}),[visibleGroups]);
 const selectedDehWave=dehWaveOptions.find(x=>x.wave===dehEditorWave)||dehWaveOptions[0]||null;
 useEffect(()=>{if(norm(site)!=="DEH1"||!dehWaveOptions.length)return;if(!dehWaveOptions.some(x=>x.wave===dehEditorWave))setDehEditorWave(dehWaveOptions[0].wave)},[site,dehWaveOptions,dehEditorWave]);
 const dehDisplayTime=(wave,field,fallback)=>dehTimeOverrides[wave]?.[field]||fallback||"";
 const setDehTime=(wave,field,value)=>setDehTimeOverrides(prev=>({...prev,[wave]:{...(prev[wave]||{}),[field]:value}}));
 const dehFontStack=dehFontFamily==="Arial"?"Arial, Helvetica, sans-serif":dehFontFamily==="System"?"system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif":"Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif";
 const toggleWave=(key)=>setHiddenWaves(prev=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next});
 const atlasRows=useMemo(()=>atlasText.split(/\r?\n/).map(line=>{const tracking=atlasTrackingOf(line),route=deh1RouteOf([line])||routeOf([line]);if(!tracking||!route)return null;const trid=(line.match(/\bA[A-Z0-9]{8,}\b/i)||[])[0]?.toUpperCase()||"",wave=atlasWaveOf(line),name=(trid&&driverByTrid.get(norm(trid)))||routeDrivers.get(norm(route))||"";return{tracking,route,trid,wave,name}}).filter(Boolean),[atlasText,driverByTrid,routeDrivers]);
 const atlasDriverRows=useMemo(()=>atlasRows.map(r=>`${r.tracking} - ${r.route} - ${r.name||"DRIVER NOT FOUND"}`).join("\n"),[atlasRows]); const atlasOutput=useMemo(()=>atlasTemplate.replaceAll("{count}",String(atlasRows.length)).replaceAll("{rows}",atlasDriverRows),[atlasTemplate,atlasRows.length,atlasDriverRows]);
 const clear=()=>{if(!confirm("Clear current Wave Plan?"))return;setRouteFile(null);setWaveFile(null);setRouteRows([]);setWaveRows([]);setOverrides({});setEditDraft({});setEditNamesOpen(false);setDismissedConflicts(new Set());setHiddenWaves(new Set());setDehTimeOverrides({});setGenerated(false);if(routeInput.current)routeInput.current.value="";if(waveInput.current)waveInput.current.value=""};
 const generate=()=>{if(!plan.length){alert(norm(site)==="DEH1"?`No DCSL routes were recognised from ${waveFile?.name||"the file"}. Please upload the full DEH1 Wave Plan image/Excel with the WAVE, LOADING TIME and DCSL rows visible.`:`No usable route + time pairs were recognised from ${waveFile?.name||"the file"}. OCR found ${waveRows.length} route candidates. The parser accepts SA_Axx morning routes, CA_Axxx afternoon routes and CB_Axx Cycle 2 routes.`);return}if(routeSetMismatch){const scheduleHint=scheduleAlignment?` Schedule groups align for ${scheduleAlignment.matched}/${effectiveRouteCompatibility.total} routes at ${scheduleAlignment.minutes>=0?"+":""}${scheduleAlignment.minutes} minutes, but that does not identify the correct staging route.`:"";alert(`Route Plan mismatch: only ${effectiveRouteCompatibility.matched} of ${effectiveRouteCompatibility.total} Wave Plan route codes exist in the Route Plan.${scheduleHint} MetrixIQ will not guess driver-to-staging assignments. Upload the matching Route Plan for this Wave Plan.`);setGenerated(false);return}setGenerated(true);setHistory(h=>[{id:Date.now(),date:new Date().toLocaleDateString("en-GB"),route:routeFile?.name,wave:waveFile?.name},...h].slice(0,8))};
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
  {tab==="atlas"?<section className="panel atlas-converter atlas-pro">
  <div className="atlas-pro-head">
    <div><span className="page-kicker">HIGH-VALUE SHIPMENTS</span><h2>Atlas Driver Converter</h2><p>Upload the High-Value Transfer Sheet or paste the Amazon message. MetrixIQ reads Tracking ID + Route and matches the driver from the Route Plan.</p></div>
    <div className="atlas-match-score"><strong>{atlasRows.filter(r=>r.name).length}</strong><span>of {atlasRows.length} matched</span></div>
  </div>
  <div className={"atlas-status-card "+atlasStatus.type}>
    <div className="atlas-status-icon">{atlasStatus.type==="success"?"✓":atlasStatus.type==="error"?"!":atlasStatus.type==="warning"?"⚠":atlasStatus.type==="reading"?"⌛":"↥"}</div>
    <div><b>{atlasStatus.type==="reading"?(atlasOcrProgress!=null?"Reading photo · "+atlasOcrProgress+"%":"Reading photo"):atlasStatus.type==="success"?"Scan complete":atlasStatus.type==="warning"?"Review scan":atlasStatus.type==="error"?"Scan needs attention":"Ready to scan"}</b><span>{atlasStatus.message}</span></div>
    {atlasImageName&&<small>{atlasImageName}</small>}
  </div>
  <div className="atlas-toolbar">
    <input ref={atlasImageInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>loadAtlasImage(e.target.files?.[0])}/>
    <input ref={atlasRouteInput} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>load(e.target.files?.[0],setRouteFile,setRouteRows)}/>
    <button type="button" className="btn primary" onClick={()=>atlasImageInput.current?.click()}>📷 Upload Atlas photo</button>
    <button type="button" className="btn ghost" onClick={()=>atlasRouteInput.current?.click()}>{routeFile?"✓ Route Plan loaded":"↥ Load Route Plan"}</button>
    <button type="button" className="btn ghost" disabled={!atlasLastFile||atlasOcrProgress!=null} onClick={()=>atlasLastFile&&loadAtlasImage(atlasLastFile)}>↻ Retry OCR</button>
    <button type="button" className="btn ghost" onClick={()=>{setAtlasText("");setAtlasImageName("");setAtlasLastFile(null);setAtlasStatus({type:"idle",message:"Upload a photo or paste an Atlas message."});if(atlasImageInput.current)atlasImageInput.current.value=""}}>Clear</button>
  </div>
  <div className="atlas-workspace">
    <div className="atlas-recognised">
      <div className="atlas-section-title"><div><h3>Recognised shipments</h3><p>{atlasRows.length?atlasRows.length+" rows detected from the Atlas source.":"Nothing recognised yet."}</p></div><span>{routeFile?routeFile.name:"No Route Plan"}</span></div>
      {atlasRows.length?<div className="atlas-table-wrap"><table className="atlas-table"><thead><tr><th>Tracking ID</th><th>Route</th><th>Wave</th><th>Driver</th><th>Status</th></tr></thead><tbody>{atlasRows.map((r,i)=><tr key={r.tracking+"-"+i}><td>{r.tracking}</td><td><b>{r.route}</b></td><td>{r.wave||"—"}</td><td>{r.name||"Driver not found"}</td><td><span className={"atlas-row-status "+(r.name?"ok":"warn")}>{r.name?"Matched":"Review"}</span></td></tr>)}</tbody></table></div>:<div className="atlas-empty-state"><b>Upload a photo to scan the transfer sheet</b><span>Tracking ID and Route are the required fields. Wave is captured when available.</span></div>}
      <details className="atlas-manual"><summary>Manual input / OCR text</summary><textarea value={atlasText} onChange={e=>setAtlasText(e.target.value)} placeholder="UK tracking - Route - Wave, or paste the normal Atlas message…"/></details>
    </div>
    <div className="atlas-copy-card">
      <div className="atlas-section-title"><div><h3>Message ready to copy</h3><p>Driver names are pulled from the loaded Route Plan.</p></div></div>
      <textarea className="atlas-copy-preview" value={atlasOutput} onChange={e=>{const value=e.target.value;setAtlasTemplate(value.replace(atlasDriverRows,"{rows}").replace(String(atlasRows.length),"{count}"))}}/>
      <button className="btn primary atlas-copy-btn" disabled={!atlasRows.length} onClick={()=>navigator.clipboard.writeText(atlasOutput)}>Copy message</button>
    </div>
  </div>
  {atlasRows.some(r=>!r.name)&&<div className="atlas-inline-warning">{routeFile?"Some recognised routes do not have a driver match. Check the Route Plan or driver mapping.":"Load the Route Plan to convert recognised routes into driver names."}</div>}
  <details className="atlas-template atlas-template-collapsed"><summary>Message template</summary><textarea value={atlasTemplate} onChange={e=>setAtlasTemplate(e.target.value)}/><small>Use <b>{"{count}"}</b> for total shipments and <b>{"{rows}"}</b> where the converted list should appear.</small></details>
</section>:<>
   <section className={"smart-upload panel "+(dragging?"dragging":"")} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);smartLoad(e.dataTransfer.files)}}>
     <input ref={smartInput} hidden multiple type="file" accept=".xlsx,.xls,.csv,.txt,image/png,image/jpeg,image/webp" onChange={e=>smartLoad(e.target.files)}/>
     <div className="waveplan-file-icon">↥</div><div><b>Smart Upload</b><span>Drop Route Plan + Wave Plan here, or choose files</span><small>MetrixIQ detects each file and sends it to the correct workspace.</small></div><button className="btn primary" onClick={()=>smartInput.current?.click()}>Choose files</button>
     <div className="smart-upload-status">{routeFile?<span>✓ {routeFile.name} <b>Route Plan</b></span>:<span className="warn">Route Plan not loaded</span>}{waveFile?<span>✓ {waveFile.name} <b>Wave Plan</b></span>:<span className="warn">Wave Plan not loaded</span>}{uploadStatus.filter(x=>!["Route Plan","Wave Plan"].includes(x.kind)).map((x,i)=><span key={x.name+i} className={x.kind==="Needs review"?"warn":""}>✓ {x.name} <b>{x.kind}</b></span>)}</div>
     <div className="smart-upload-manual"><button onClick={()=>routeInput.current?.click()}>Route Plan {routeFile?"✓":""}</button><button onClick={()=>waveInput.current?.click()}>Wave Plan {waveFile?"✓":""}</button></div>
     <input ref={routeInput} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>load(e.target.files?.[0],setRouteFile,setRouteRows)}/><input ref={waveInput} hidden type="file" accept=".xlsx,.xls,.csv,image/png,image/jpeg,image/webp" onChange={e=>load(e.target.files?.[0],setWaveFile,setWaveRows)}/>
   </section>
   {routeFile&&waveFile&&!routeSetMismatch&&routeCompatibility.total>0&&<section className="waveplan-file-match ok"><span>✓ Files matched</span><b>{effectiveRouteCompatibility.matched}/{effectiveRouteCompatibility.total} {deh1Recovery.eligible?"DCSL routes reconciled from Route Plan":"Wave Plan routes found in Route Plan"}</b><small>{routeFile.name} + {waveFile.name}</small></section>}
   {routeFile&&waveFile&&routeSetMismatch&&<section className="panel dispatch-attention waveplan-mismatch"><div className="panel-head"><div><h2>⚠ Route Plan does not match this Wave Plan</h2><p>Only <b>{effectiveRouteCompatibility.matched} of {effectiveRouteCompatibility.total}</b> Wave Plan route codes exist in the uploaded Route Plan. These files are from different route sets or a stale plan is still selected. Driver-to-staging assignments cannot be recovered safely from different route codes.</p></div><span className="panel-badge danger">{effectiveRouteCompatibility.matched}/{effectiveRouteCompatibility.total} matched</span></div>{scheduleAlignment&&<p className="waveplan-mismatch-note">The time groups appear related: {scheduleAlignment.matched}/{effectiveRouteCompatibility.total} slots align at {scheduleAlignment.minutes>=0?"+":""}{scheduleAlignment.minutes} minutes. This is useful for diagnosis, but it is not enough to identify which driver belongs to each staging position.</p>}<p className="waveplan-mismatch-files"><b>Route Plan:</b> {routeFile.name}<br/><b>Wave Plan:</b> {waveFile.name}</p></section>}
   {conflicts.length>0&&<section className="panel dispatch-attention"><div className="panel-head"><div><h2>⚠ Driver identity needs attention</h2><p>More than one TRID was detected on these routes. Choose the correct driver or type the name manually.</p></div><button className="btn ghost" onClick={()=>setDismissedConflicts(new Set(conflicts.map(([r])=>r)))}>Done / Hide</button></div>{conflicts.map(([route,v])=><div className="identity-fix" key={route}><b>{route}</b><span>{v.trids.join(" / ")}</span><select value={overrides[route]||""} onChange={e=>setOverrides(o=>({...o,[route]:e.target.value}))}><option value="">Select driver…</option>{v.trids.map(t=>driverByTrid.get(t)&&<option key={t} value={driverByTrid.get(t)}>{driverByTrid.get(t)} · {t}</option>)}</select><input placeholder="or type driver name" value={overrides[route]||""} onChange={e=>setOverrides(o=>({...o,[route]:e.target.value}))}/><button className="btn ghost" onClick={()=>setDismissedConflicts(d=>new Set([...d,route]))}>✓ Save & close</button></div>)}</section>}
   <section className="panel waveplan-settings"><h2>⚙ Settings</h2><div className="dispatch-settings-grid"><label>Time adjustment<div className="time-adjust"><button onClick={()=>setAdjust(v=>v-5)}>−</button><input type="number" value={adjust} onChange={e=>setAdjust(Number(e.target.value)||0)}/><button onClick={()=>setAdjust(v=>v+5)}>+</button><span>minutes</span></div><small>{waveRows.some(r=>r.directLoadTime)?"Matrix Wave Plan loading times are kept exactly as supplied.":"Negative subtracts; positive adds to Amazon time."}</small></label><label>● Detect wave colours automatically</label><label>● {waveRows.some(r=>r.directLoadTime)?"Use supplied gate / holding time":"Group by staging location"}</label><label>Site / Station <strong>{site}</strong></label><label>Date <strong>{new Date().toLocaleDateString("en-GB")}</strong></label><label>Text size<select value={planFontSize} onChange={e=>setPlanFontSize(e.target.value)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select><small>Changes preview and Ready to Send image.</small></label></div></section>
   <section className="panel wave-hide-clean"><div><h2>◉ Hide Wave</h2><p>Select waves to hide from the generated plan. Data is never deleted.</p></div><div className="wave-hide-clean-grid">{groups.length?groups.map(([k,rows])=>{const [time,wave,stg]=k.split("|"),hidden=hiddenWaves.has(k),waveColour=colourForRows(wave,rows),textColour=waveTextColour(waveColour);return <button type="button" key={k} className={"wave-choice "+wave.toLowerCase()+" "+(hidden?"off":"")} style={{background:waveColour,color:textColour,borderColor:waveColour}} onClick={()=>toggleWave(k)}><i/><span><b>{waveLabel(wave)} {time}</b><small>{stg==="NO-STAGING"?(rows.find(r=>r.gateTime)?.gateTime?`Gate ${rows.find(r=>r.gateTime)?.gateTime}`:"No staging"):stg} · {rows.length} drivers</small></span><em>{hidden?"Hidden":"Shown"}</em></button>}):<span className="muted">Generate a plan to manage waves.</span>}</div></section>
   <div className="waveplan-actions clean"><button className="btn primary" disabled={!routeFile||!waveFile} onClick={generate}>↻ Generate Wave Plan</button><button className="btn ghost waveplan-edit-names" disabled={!plan.length} onClick={openNameEditor}>✎ Edit Driver Names</button><button className="btn ghost danger" onClick={clear}>Clear</button><button className="btn success ready" disabled={!generated||routeSetMismatch} onClick={()=>exportPng(true)}>↗ Ready to Send</button></div>
   
   <section className="waveplan-workspace"><aside><article className="panel waveplan-summary"><h2>Summary</h2>{visibleGroups.map(([k,v])=>{const [baseTime,wave]=k.split("|"),waveColour=colourForRows(wave,v),shownTime=dehDisplayTime(wave,"load",baseTime);return <p key={k}><i style={{background:waveColour}}/><span>{waveLabel(wave)}</span><b>{v.length} drivers · {shownTime}</b></p>})}<footer>Total <b>{visibleGroups.reduce((sum,[,rows])=>sum+rows.length,0)} drivers</b>{hiddenWaves.size?<small> · {hiddenWaves.size} wave hidden</small>:null}</footer></article><article className="panel waveplan-history"><h2>Recent Uploads</h2>{history.length?history.map(x=><div key={x.id}><p><b>{x.date}</b><small>✓ Generated</small><span>{x.route} + {x.wave}</span></p><button onClick={()=>setHistory(h=>h.filter(y=>y.id!==x.id))}>Delete</button></div>):<p className="muted">No generated plans in this session.</p>}</article></aside>
   <article className="panel waveplan-preview"><div className="panel-head deh-preview-head"><div><h2>Wave Plan Preview</h2><p>DCSL format · ordered chronologically · driver names cleaned and deduplicated.</p></div>{generated&&selectedDehWave?<div className="deh-preview-controls"><div className="deh-control-block"><span className="deh-control-title">◷ Time Settings</span><select className="deh-wave-select" value={dehEditorWave} onChange={e=>setDehEditorWave(e.target.value)}>{dehWaveOptions.map(x=><option key={x.key} value={x.wave}>{waveLabel(x.wave)}</option>)}</select>{selectedDehWave.gate&&<label><span>Gate Time</span><input type="text" inputMode="numeric" value={dehDisplayTime(selectedDehWave.wave,"gate",selectedDehWave.gate)} onChange={e=>setDehTime(selectedDehWave.wave,"gate",e.target.value)} placeholder="11:50"/></label>}<label><span>Load Time</span><input type="text" inputMode="numeric" value={dehDisplayTime(selectedDehWave.wave,"load",selectedDehWave.time)} onChange={e=>setDehTime(selectedDehWave.wave,"load",e.target.value)} placeholder="12:20"/></label></div>{norm(site)==="DEH1"&&<><div className="deh-control-divider"/><div className="deh-control-block deh-text-settings"><span className="deh-control-title">A&nbsp; Text Settings</span><select value={dehFontFamily} onChange={e=>setDehFontFamily(e.target.value)}><option value="Inter">Inter</option><option value="System">System</option><option value="Arial">Arial</option></select><button type="button" aria-label="Decrease font size" onClick={()=>setDehFontPx(v=>Math.max(10,v-1))}>A−</button><output>{dehFontPx}</output><button type="button" aria-label="Increase font size" onClick={()=>setDehFontPx(v=>Math.min(18,v+1))}>A+</button><button type="button" className={dehBold?"active":""} onClick={()=>setDehBold(v=>!v)}><b>B</b></button><button type="button" className={dehItalic?"active":""} onClick={()=>setDehItalic(v=>!v)}><i>I</i></button><button type="button" className={dehUnderline?"active":""} onClick={()=>setDehUnderline(v=>!v)}><u>U</u></button></div></>}</div>:null}</div>{generated?<div className={"dcsl-sheet font-"+planFontSize+(norm(site)==="DEH1"?" deh1-polished":"")} style={norm(site)==="DEH1"?{"--deh-body-font-size":dehFontPx+"px","--deh-body-font-family":dehFontStack,"--deh-body-font-weight":dehBold?"800":"650","--deh-body-font-style":dehItalic?"italic":"normal","--deh-body-text-decoration":dehUnderline?"underline":"none"}:undefined} ref={sheetRef}><header><div className="dcsl-brand"><img className="dcsl-mark-image" src={"data:image/webp;base64,UklGRqQFAABXRUJQVlA4IJgFAACQKQCdASrvAPAAPikSh0KhoQslogAMAUJZW7gK30Pu/fdKvTkwbmn5M8onovmX/T/cB9APS1t/vNZ+t/7Y+6V0gH7HdeRoquqThJokxelxtfYwZJK+4QIbOE8xW3Yu6GarNqklw3S9GS/ap7XLH4+eMzxnRR5aEIKElspcN0vRkv2gBSbO3VjXNTdVohYa8CVqjG4Df2fmaJyQ6BN2aHbDKCERqgp/cSNuS2rnX314kHDYjWtw70c25Qbt4CIb27fjsD+QBGQXPCdwnOi2ES3zvV0ut2IdsUjbktsRHX3Yh2xSNuS2xEdfdiHa9VIXMeRJwd/qBWlgD8vg+CsNTK0qwHjhPLwI2b/1MjUQbs6e7D6hIM6rxL6s5EaaciMrq/VzjjMHcEuen2Lu8w/q+Le32iX2YPB1KSX7GFh+ABkSiQSawqUKUzDKdTDydU5GeKhb42yeeAD++Ob7c/kM+wNcfHxANZsNFef1e67o1HQeE25rEv//YaL7qH+3QT/7iN/dAlT/7tYy33/0PxAsuploGAwgVJFK2G0FbSzV4SzuKeeuAwZwiAM/KxHC4DhuB9gAoQiyQHmGHATYaYkDkv8Bfqfmh3UL+otk5FP8PqQZBV1qKr9f8Vn+x1T17MMvAvellLag464LR3V5rjVLS3GEaDdghCQj4snAx2mnHPTX9Ns4veX69gn3gXJlbG2wj8cBQ3eOPSmSH4F6QXz3SZqIxFvig0+2gE9Y/p5lTmD6nSz2/rN9IpURcHlJ4TVEYNG9qar9cVJZZdABm/YKIT5BMS3uCOCf3nOg+5IRIzsgYBdi4A79obpcthagc90xDPfTI5yVhvAcsx+CPO8WH+/BLIqbElza2lIvYlSYjW5nZex3NbkGCPu3brvt6OYHHWpL67/iofOveLqW/BpmMINllH7xJOqZ3HjoX+IMWUUAjeGGCHRtwW1QzJ7Ep/1egDNvet7T563QvrnTxFb3itY6qvyn4UtU4RrP37sMAB0kFT9oRszykxqhOn8mFG2vGV1/+SbkH/Zdn8RquHJd//J1EIzYf42wFPnfBAA2vW3ylkt4RkKRoEMGqXZLHVyD3mRQ305CYJZDWEH+snUv9s4aU5JwDkemJjb1Bf45DNYew76f/WIF9r+d0svBhifujsqQQEiF/4d0x6Fgdue/t8cVKM4IwCvqx2Sn8r6Nvp7bMb0G/pBbc5QRQ7f6oXjzL/zJrh2dbcQ6d/v5L7G1kjHNbpPfjj25zJ1KADJpvoY4Cc9OsenCmJobhXv/aZiHXDS5ulSBGnY2rKcXSVkoNULTL4Yga5EXMu5PY2sW9UjEKU11uYyXVAA/aXIAmR/ys//l6cQdZdaHaa0gww50XrGxhJK+TP0RI+0L/F6bfC8GFZw5OEwBCwG17N2byIioT/chWqYvZPzcg8i8nrIStk1dnLxUwDVzj1AAFaZHgYvpZFAxbyNrWk2+t/XrTx6tKBTHpwpiaG4V/OdeGtaMC3mUirQeYXRcFKGnJZizuph2cp0awL99YpoDYrgJVjn9e5Gu1QifxuqcVkR1hz7gmqRdEMzbSqtk6V77TtuapJIi3ycLZ8w2TtsY7eFui+t6pD2tNmOPNHyxMLEqfd/9rsiE61H1I8cU3V6t0e3vqPl7dEfKtMXdHckPF17/1Bn3/q9qJFIvn/Pue9qTLnFFT5OaxB3eYfSNfMCuhJ/+DMrbPPxtTWZUc7SyNHzyf60eFOCPTTNhCeT4VYG/Odv96GKUgD7ZsGWXPS99ml6x+Z8QVQS5vkZzTnXBrRKRLJhMeyrhb8Wh2oamZOLMHbRwT5Qfn/mIGYl/++gyD5r4p6oJdXHJM+xmTaUQaqAv9feXBiVjbA9S4OmNI+sVBZ0aqMDm4wHEdwht4ETnIY0tzq/8qiC03odBWYAA"} alt="DCSL logo mark" /><div><strong className="dcsl-logo">DCSL</strong><small>DELIVERING A BRIGHTER TOMORROW</small></div></div><div className="dcsl-title"><h3>Wave Plan</h3><span>▣ {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</span></div><div className="dcsl-site"><b>{site}</b><span>{plan.some(r=>r.staging)?"STG - A":"GATE / HOLDING"}</span></div><div className="dcsl-values"><span>PEOPLE</span><span>ROUTES</span><span>PERFORMANCE</span></div></header>{norm(site)!=="DEH1"&&<div className="dcsl-columns"><b>ROUTE</b><b>DRIVER NAME</b><b>◷ &nbsp; LOAD TIME</b><b>⌖ &nbsp; {plan.some(r=>r.staging)?"STAGING":"GATE / HOLDING"}</b></div>}{visibleGroups.map(([k,rows])=>{const [time,wave,stg]=k.split("|"),waveColour=colourForRows(wave,rows),textColour=waveTextColour(waveColour),gate=rows.find(r=>r.gateTime)?.gateTime||"",deh=norm(site)==="DEH1",shownGate=dehDisplayTime(wave,"gate",gate),shownLoad=dehDisplayTime(wave,"load",time);return <section key={k} className={"dcsl-wave wave-"+wave.toLowerCase()} style={{"--wave":waveColour,"--wave-text":textColour}}>{deh?<><header className="deh-wave-summary"><div className="deh-wave-name"><small>DISPATCH WAVE</small><strong>{waveLabel(wave).toUpperCase()}</strong><span>{rows.length} drivers</span></div><div className="deh-wave-time gate"><small>GATE TIME</small><strong>{shownGate||"—"}</strong></div><div className="deh-wave-time load"><small>LOAD TIME</small><strong>{shownLoad}</strong></div></header><div className="deh-wave-columns"><b>ROUTE</b><b>DRIVER NAME</b><b>GATE TIME</b><b>LOAD TIME</b></div></>:<h4>{waveLabel(wave).toUpperCase()}&nbsp; - &nbsp;{shownLoad}{shownGate?` · GATE ${shownGate}`:stg!=="NO-STAGING"?` ${stg.replace("-"," ")}`:""}</h4>}{rows.map((r,i)=><div className={deh?"deh-driver-row":""} key={r.route+"-"+i}><b>{r.route}</b><strong>{r.driver.toUpperCase()}</strong>{deh?<><span className="dcsl-gate">{shownGate||"—"}</span><span className="dcsl-load">{shownLoad||"—"}</span></>:<><span>{shownLoad}</span><em>{r.staging||r.gateTime||"—"}</em></>}</div>)}</section>})}<footer><div className="dcsl-foot-team"><b>●●●</b><span>ONE TEAM<br/>SAFER DELIVERIES<br/>STRONGER TOMORROW</span></div><div className="dcsl-foot-brand"><strong>DCSL</strong><span>DRIVE &nbsp;|&nbsp; DELIVER &nbsp;|&nbsp; SUCCEED</span></div><div className="dcsl-foot-site"><b>{site}</b><span>Make It Happen</span></div></footer></div>:<div className="waveplan-empty">Upload Route Plan + Wave Plan and select <b>Generate Wave Plan</b>.</div>}</article></section>
  </>}
  {editNamesOpen&&<div className="wave-name-editor-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditNamesOpen(false)}}><aside className="wave-name-editor" role="dialog" aria-modal="true" aria-label="Edit Driver Names"><header><div><span className="page-kicker">DRIVER CLEANUP</span><h2>👥 Edit Driver Names</h2><p>Review and correct names before generating or sending the final wave plan.</p></div><button type="button" aria-label="Close name editor" onClick={()=>setEditNamesOpen(false)}>×</button></header><div className="wave-name-editor-info">ⓘ Driver names are automatically deduplicated. You can override any route manually when needed.</div><div className="wave-name-editor-table"><div className="head"><span>Route</span><span>Current name</span><span>Corrected name</span></div>{editableRoutes.map(row=>{const key=norm(row.route);return <div className="row" key={key}><b>{row.route}</b><span title={row.current}>{row.current}</span><input value={editDraft[key]??row.corrected} onChange={e=>setEditDraft(d=>({...d,[key]:e.target.value}))} aria-label={"Corrected name for "+row.route}/></div>})}</div><div className="wave-name-editor-tip">💡 Changes apply immediately to the preview after you select <b>Apply Changes</b>.</div><footer><button type="button" className="btn ghost" onClick={()=>setEditNamesOpen(false)}>Cancel</button><button type="button" className="btn primary" onClick={applyNameEdits}>✓ Apply Changes</button></footer></aside></div>}
 </div>
}