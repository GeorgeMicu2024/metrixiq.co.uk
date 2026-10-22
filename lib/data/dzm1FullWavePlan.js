// DZM1's new depot Wave Plan is a full-site XLSX, containing multiple DSPs.
// Select only exact DCSL rows; never infer membership from route numbers alone.
const upper = x => String(x ?? "").trim().toUpperCase().replace(/\s+/g," ");
const isDcsl = x => /^(DCSL|DANUBE COURIER SERVICES (?:LTD|LIMITED))$/.test(upper(x));
const routeCode = x => /^((?:CA|CB|SA|AA)_A\d{1,4})$/.exec(upper(x))?.[1] || "";
const normalWave = value => {
  const s=upper(value);
  const number=/^(?:WAVE\s*)?(\d{1,3})$/.exec(s);
  return number&&+number[1]>0?"WAVE"+Number(number[1]):"";
};
const realTime = value => {
  const s=upper(value);
  const m=/^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?$/.exec(s);
  if(!m)return "";
  const h=Number(m[1]);
  if(m[3] ? h<1||h>12 : h>23)return "";
  return s;
};
export function dzm1FullWavePlanHeaders(rows) {
  for(let i=0;i<(rows||[]).length;i++) {
    const h=(rows[i]?.cells||[]).map(upper);
    const column=(name)=>h.indexOf(name);
    const names=["DSP","ROUTE CODE","WAVE START","WAVE FINISH","WAVE NUMBER","STAGING LOCATION"];
    if(!names.every(name=>column(name)>=0))continue;
    const col=Object.fromEntries(names.map(name=>[name,column(name)]));
    return {index:i,col};
  }
  return null;
}
// Returns null when file is not this format, so existing screenshots and
// other spreadsheet layouts continue to use the original parser.
export function dzm1DCSLWaveRows(rows) {
  const header=dzm1FullWavePlanHeaders(rows);
  if(!header)return null;
  const {index,col}=header,out=[],seen=new Set();
  for(const source of rows.slice(index+1)){
    const cells=source.cells||[];
    if(!isDcsl(cells[col["DSP"]]))continue;
    const route=routeCode(cells[col["ROUTE CODE"]]);
    const start=realTime(cells[col["WAVE START"]]);
    const finish=realTime(cells[col["WAVE FINISH"]]);
    const wave=normalWave(cells[col["WAVE NUMBER"]]);
    const staging=upper(cells[col["STAGING LOCATION"]]);
    // Refuse incomplete rows rather than assigning guessed positions/times.
    if(!route||!start||!finish||!wave||!/^STG-[A-Z]\d{1,3}$/.test(staging)||seen.has(route))continue;
    seen.add(route);
    out.push({
      sheet:source.sheet||"Wave Plan",
      row:source.row,
      sourceY:source.row,
      // Existing WavePlanView parser accepts a route, a real Wave Start,
      // staging and explicit WAVE# from the same source row.
      cells:[route,start,staging,wave,"DCSL"],
      directLoadTime:true,
      explicitWave:wave,
      stagingCode:staging,
      waveFinish:finish,
      dcslHint:true
    });
  }
  return out;
}
