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
    const dark=invert?brightness>=170:brightness<163;
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
  const output=[];
  const seen=new Set();
  for(const [index,row] of rows.entries()){
    const rowWords=words.filter(w=>w.y>=row.top-4&&w.y<=row.bottom+4);
    const routeWords=rowWords.filter(w=>w.x>width*.28&&w.x<width*.70).sort((a,b)=>a.x-b.x).map(w=>w.text);
    let route=dzm1RouteCode(routeWords.join(" "));
    if(!route){
      try{route=dzm1RouteCode(await scan(worker,source,{x:width*.29,y:row.top+4,w:width*.37,h:row.height-8},"CA_0123456789"))}catch{}
    }
    if(!route)continue;
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
    if(seen.has(route))continue;
    seen.add(route);
    output.push({
      sheet:"Image",row:index+1,sourceY:row.mid,
      cells:[route,time,lane?"STG-"+lane:"",wave],
      explicitWave:wave,directLoadTime:true,
      screenshotFallback:true,
      sourceColour:""
    });
  }
  return output;
}
