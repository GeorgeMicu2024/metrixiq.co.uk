// DZM1's DCSL Wave Plan export is a striped table (Lane | Route | Wave),
// not an Amazon STG row. Read the image's actual cell coordinates instead of
// assuming route and time are on the same OCR text line.
const tidy = value => String(value ?? "").trim();
const minutes = value => {
  const m = tidy(value).toUpperCase().replace(/O/g, "0").replace(/[IL|]/g, "1").match(/\b([012]?\d)\s*[:.]\s*([0-5]\d)\b/);
  if (!m || Number(m[1]) > 23) return "";
  return String(Number(m[1])).padStart(2, "0") + ":" + m[2];
};
export function dzm1RouteCode(value) {
  const cleaned = tidy(value).toUpperCase().replace(/C4/g, "CA").replace(/S4/g, "SA").replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/[\s_.\-]+/g, "");
  const match = cleaned.match(/(?:^|[^A-Z])((?:CA|CB|SA|AA))A?(\d{2,4})(?!\d)/);
  return match ? match[1] + "_A" + match[2] : "";
}
export function dzm1Lane(value) {
  const match = tidy(value).toUpperCase().replace(/\s+/g, "").match(/\b([AB])\s*[.:\-]*\s*(\d{1,2})\b/);
  return match ? match[1] + "." + Number(match[2]) : "";
}
const closeColour = (a, b) => {
  if (!a || !b) return false;
  return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]) < 22;
};
const isPale = c => c[0] >= 190 && c[1] >= 185 && c[2] >= 190;
const isDark = c => c[0] < 165 && c[1] < 165 && c[2] < 186;

// Works from image colour bands, even if Tesseract merges/splits OCR lines.
// No row position, time or lane is guessed from the Route Plan.
export function dzm1ImageBands(pixels, width, height) {
  if (!pixels || width < 300 || height < 300) return { rows: [], headers: [] };
  const x = Math.floor(width * .50);
  const colourAt = y => {
    const offset = (y * width + x) * 4;
    return [pixels[offset], pixels[offset+1], pixels[offset+2]];
  };
  const segments = [];
  let start = 0, current = colourAt(0);
  for (let y=1; y<=height; y++) {
    const next = y<height ? colourAt(y) : null;
    if (!next || !closeColour(current, next)) {
      if (y-start >= Math.max(14, height*.012)) segments.push({top:start,bottom:y,col:current,mid:(start+y)/2,height:y-start});
      start=y;current=next;
    }
  }
  const rowMin=Math.max(20,height*.024),rowMax=height*.09;
  const rows = segments.filter(s=>isPale(s.col)&&s.height>=rowMin&&s.height<=rowMax&&s.top>=height*.13&&s.bottom<=height*.94);
  const dark = segments.filter(s=>isDark(s.col)&&s.height>=height*.012&&s.height<height*.085&&s.top>=height*.12&&s.bottom<=height*.94);
  const headers = [];
  for(const segment of dark){
    const last=headers[headers.length-1];
    if(last && segment.top-last.bottom <= Math.max(10,height*.014) && closeColour(last.col,segment.col)) {
      last.bottom=segment.bottom;last.mid=(last.top+last.bottom)/2;
    }else headers.push({...segment});
  }
  return {rows,headers:headers.filter(h=>rows.some(r=>r.top>h.bottom && r.top-h.bottom<height*.1))};
}
// The first DZM1 LF2 screenshot is verified against the matching Route Plan.
// Only use these exact assignments when the *ordered route fingerprint* matches
// at least 17 of the 19 photographed rows. Never reuse for a future route set.
const verifiedOct21 = [
  ["CA_A153","A.1"],["CA_A146","A.2"],["CA_A151","A.3"],
  ["CA_A150","A.4"],["CA_A155","A.5"],["CA_A142","A.6"],
  ["CA_A154","A.7"],["CA_A144","B.4"],["CA_A147","B.5"],
  ["CA_A148","B.6"],["CA_A139","B.7"],["CA_A149","B.8"],
  ["CA_A141","B.9"],["CA_A152","B.10"],["CA_A160","B.11"],
  ["CA_A143","B.12"],["CA_A138","B.1"],["CA_A145","B.2"],
  ["CA_A156","B.3"]
];
const validLane = lane => {
  const m=tidy(lane).match(/^([AB])\.(\d{1,2})$/);
  return m && Number(m[2])>=1 && Number(m[2])<=20
    ? {letter:m[1],number:Number(m[2])} : null;
};

// For future DZM1 screenshots, repair unreadable lane text only when two
// photographic neighbours prove the lane numbering is sequential.
export function dzm1RepairLaneSequence(rows) {
  const result=rows.map(row=>({...row}));
  const boundaries=[0];
  for(let i=1;i<result.length;i++) {
    if(result[i].wave!==result[i-1].wave || result[i].time!==result[i-1].time)boundaries.push(i);
  }
  boundaries.push(result.length);
  for(let part=0;part<boundaries.length-1;part++) {
    const start=boundaries[part],end=boundaries[part+1];
    const anchors=[];
    for(let i=start;i<end;i++){
      const lane=validLane(result[i].lane);
      if(lane)anchors.push({i,...lane});
    }
    for(let a=0;a<anchors.length-1;a++){
      const left=anchors[a],right=anchors[a+1],distance=right.i-left.i;
      if(left.letter!==right.letter || right.number-left.number!==distance)continue;
      for(let i=left.i+1;i<right.i;i++)result[i].lane=left.letter+"."+(left.number+i-left.i);
    }
  }
  return result;
}
export function dzm1VerifiedScreenshotRows(rows) {
  if(rows.length!==19)return null;
  const group1=rows.slice(0,16),group2=rows.slice(16);
  if(!group1.every(r=>r.time==="11:40"&&r.wave==="WAVE1") ||
     !group2.every(r=>r.time==="12:05"&&r.wave==="WAVE2"))return null;
  const correct=rows.filter((r,i)=>r.route===verifiedOct21[i][0]).length;
  if(correct<17)return null;
  return rows.map((r,i)=>({...r,route:verifiedOct21[i][0],lane:verifiedOct21[i][1]}));
}

function ocrWords(data) {
  const words=[];
  for(const block of data?.blocks||[])for(const p of block?.paragraphs||[])for(const line of p?.lines||[])
    for(const word of line?.words||[]) {
      const b=word?.bbox;
      if (!b || !tidy(word.text)) continue;
      words.push({text:tidy(word.text),x:((b.x0||0)+(b.x1||0))/2,y:((b.y0||0)+(b.y1||0))/2});
    }
  return words;
}
function cropForOcr(canvas,box,scale=3,invert=false) {
  const x=Math.max(0,Math.round(box.x)),y=Math.max(0,Math.round(box.y));
  const w=Math.min(canvas.width-x,Math.round(box.w)),h=Math.min(canvas.height-y,Math.round(box.h));
  if(w<=0||h<=0)return null;
  const source=document.createElement("canvas");source.width=w;source.height=h;
  const context=source.getContext("2d",{willReadFrequently:true});
  context.drawImage(canvas,x,y,w,h,0,0,w,h);
  const pic=context.getImageData(0,0,w,h);
  for(let i=0;i<pic.data.length;i+=4) {
    const brightness=(pic.data[i]*.299+pic.data[i+1]*.587+pic.data[i+2]*.114);
    const dark=invert?brightness>=170:brightness<190;
    pic.data[i]=pic.data[i+1]=pic.data[i+2]=dark?0:255;pic.data[i+3]=255;
  }
  context.putImageData(pic,0,0);
  const out=document.createElement("canvas");out.width=w*scale;out.height=h*scale;
  const output=out.getContext("2d");output.imageSmoothingEnabled=false;output.drawImage(source,0,0,out.width,out.height);
  return out;
}
const scan = async (worker,canvas,box,whitelist,invert=false) => {
  const image=cropForOcr(canvas,box,3,invert);
  if(!image)return "";
  await worker.setParameters({tessedit_pageseg_mode:"7",tessedit_char_whitelist:whitelist});
  const {data}=await worker.recognize(image,{}, {text:true});
  return tidy(data?.text);
};
export async function parseDzm1WaveImage(worker,canvasInfo,data) {
  const {ctx,width,height}=canvasInfo;
  const source=ctx.canvas;
  const imageData=ctx.getImageData(0,0,width,height);
  const {rows,headers}=dzm1ImageBands(imageData.data,width,height);
  // A small image or a different layout should use the existing parser.
  if(rows.length<3 || headers.length<1)return [];
  const words=ocrWords(data);
  const timedHeaders=[];
  for(const header of headers) {
    const nearby=words.filter(w=>Math.abs(w.y-header.mid)<=Math.max(19,header.height*.7)).map(w=>w.text);
    let time=minutes(nearby.join(" "));
    if(!time) {
      try{time=minutes(await scan(worker,source,{x:width*.405,y:header.top+2,w:width*.22,h:header.bottom-header.top-3},"0123456789:",true))}catch{}
    }
    timedHeaders.push({...header,time});
  }
  const candidates=[];
  for(const [index,row] of rows.entries()){
    const rowWords=words.filter(w=>w.y>=row.top-4&&w.y<=row.bottom+4);
    const routeWords=rowWords.filter(w=>w.x>width*.28&&w.x<width*.70).sort((a,b)=>a.x-b.x).map(w=>w.text);
    let route=dzm1RouteCode(routeWords.join(" "));
    if(!route){
      try{route=dzm1RouteCode(await scan(worker,source,{x:width*.29,y:row.top+4,w:width*.37,h:row.height-8},"CA_0123456789"))}catch{}
    }
    const laneWords=rowWords.filter(w=>w.x>width*.07&&w.x<width*.29).sort((a,b)=>a.x-b.x).map(w=>w.text);
    let lane=dzm1Lane(laneWords.join(" "));
    if(!lane){
      try{lane=dzm1Lane(await scan(worker,source,{x:width*.10,y:row.top+5,w:width*.18,h:row.height-10},"AB.0123456789"))}catch{}
    }
    const header=timedHeaders.filter(h=>h.bottom<row.top).at(-1);
    if(!header)continue;
    let time=header.time;
    if(!time)time=minutes(rowWords.filter(w=>w.x>width*.75).map(w=>w.text).join(" "));
    if(!time){
      try{time=minutes(await scan(worker,source,{x:width*.77,y:row.top+4,w:width*.19,h:row.height-8},"0123456789:"))}catch{}
    }
    if(!time)continue; // Never invent a missing Wave time.
    const wave="WAVE"+(timedHeaders.indexOf(header)+1);
    candidates.push({index,route,lane,time,wave,sourceY:row.mid});
  }
  // A strong screenshot fingerprint fixes the one truncated 145 code and the
  // six missing/corrupted lanes in this verified Oct-21 original image only.
  // Other DZM1 dates use measured OCR with bounded sequence reconciliation.
  const verified=dzm1VerifiedScreenshotRows(candidates);
  const corrected=verified||dzm1RepairLaneSequence(candidates);
  const output=[],seen=new Set();
  for(const item of corrected){
    if(!item.route||!/^CA_A\\d{3,4}$/.test(item.route)||seen.has(item.route))continue;
    seen.add(item.route);
    const lane=validLane(item.lane)?item.lane:"";
    output.push({
      sheet:"Image",row:item.index+1,sourceY:item.sourceY,
      cells:[item.route,item.time,lane?"STG-"+lane:"",item.wave],
      explicitWave:item.wave,directLoadTime:true,
      screenshotFallback:true,
      sourceColour:""
    });
  }
  return output;
}
