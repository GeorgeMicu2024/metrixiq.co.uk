export const clean = value => String(value ?? "").trim();
export const normalize = value => clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const tokens = value => normalize(value).split(" ").filter(Boolean);
const field = (obj,aliases) => {
 const key=Object.keys(obj||{}).find(k=>aliases.includes(normalize(k).replace(/ /g,"")));
 return key?clean(obj[key]):"";
};
export function parseRoutes(raw){
 const seen=new Set(),out=[];
 for(const obj of raw||[]){
  const route=field(obj,["routecode","routeid","route"]),driver=field(obj,["drivername","driverfullname"]);
  const dsp=field(obj,["dsp","company"]);
  if(!route||!driver||(/dsp/i.test(Object.keys(obj||{}).join(" "))&&dsp&&!/DANUBE|DCSL/i.test(dsp)))continue;
  const key=route.toUpperCase();if(seen.has(key))continue;seen.add(key);
  out.push({route:key,driver,trid:field(obj,["transporterid"]),site:field(obj,["site","station"])});
 }
 return out;
}
export function parseShift(raw){
 const out=[],seen=new Set();
 for(const obj of raw||[]){
  const first=field(obj,["firstname","forename"]),last=field(obj,["lastname","surname"]);
  const name=[first,last].filter(Boolean).join(" ")||field(obj,["drivername","name"]);
  if(!name)continue;
  const key=normalize(name);if(seen.has(key))continue;seen.add(key);
  const trip=field(obj,["trip","trips","tripsrecorded"]);
  const begin=field(obj,["beginroutetime","startroutetime","starttime"]);
  const generic=/^mentor\s*\d+\s*(?:dls\d+|dzm\d+|ddn\d+|dxm\d+|dxs\d+)?$/i.test(name.trim());
  out.push({name,first,last,trip:trip===""?null:Number(trip),begin,end:field(obj,["endroutetime","endtime"]),vehicle:field(obj,["vehicleidentifier","vrm","vehicle"]),generic});
 }
 return out;
}
const editDistance=(a,b)=>{
 const x=normalize(a),y=normalize(b);
 if(!x||!y)return Math.max(x.length,y.length);
 let prev=Array.from({length:y.length+1},(_,i)=>i);
 for(let i=1;i<=x.length;i++){
  const now=[i];for(let j=1;j<=y.length;j++){
   now[j]=Math.min(now[j-1]+1,prev[j]+1,prev[j-1]+(x[i-1]===y[j-1]?0:1));
  }prev=now;
 }
 return prev[y.length];
};
const similarity=(a,b)=>{const x=normalize(a),y=normalize(b);if(!x||!y)return 0;return 1-editDistance(x,y)/Math.max(x.length,y.length)};
export function scoreNames(a,b){
 const x=tokens(a),y=tokens(b);
 if(!x.length||!y.length)return {score:0,reason:""};
 if(x.join(" ")===y.join(" "))return {score:1,reason:"Exact name"};
 if(x.length===y.length&&[...x].sort().join(" ")===[...y].sort().join(" "))return {score:.99,reason:"Name order differs"};
 const intersection=x.filter(v=>y.includes(v)).length;
 const smaller=Math.min(x.length,y.length);
 if(intersection===smaller&&smaller>=2)return {score:.97,reason:"Middle name / extra surname"};
 const first=similarity(x[0],y[0]),last=similarity(x.at(-1),y.at(-1));
 const sameFamily=last>=.9,firstClose=first>=.72;
 if(sameFamily&&firstClose){
  const score=Math.min(.955,.68+.17*first+.09*last+.06*intersection/Math.max(x.length,y.length));
  return {score,reason:first<.92?"First-name spelling variation":"Similar name / middle name"};
 }
 // Reversed first/last names or compound surname
 const reversed=similarity(x[0],y.at(-1))>=.9&&similarity(x.at(-1),y[0])>=.9;
 if(reversed)return {score:.93,reason:"First / last names reversed"};
 const sharedLast=y.some(t=>similarity(x.at(-1),t)>=.9);
 if(sharedLast&&first>=.65)return {score:.81,reason:"Potential surname and given-name variation"};
 return {score:Math.min(.72,.42*first+.35*last+.23*intersection/Math.max(x.length,y.length)),reason:"Weak similarity"};
}
export function reconcileMentor(routes,shift,approved={}){
 const active=shift.filter(r=>!r.generic);
 const used=new Set(),matched=[],review=[],missing=[];
 const choices=routes.map(route=>{
  const approvedIndex=active.findIndex(s=>normalize(s.name)===approved[normalize(route.driver)]);
  const candidate=active.map((s,index)=>({...scoreNames(route.driver,s.name),index,mentor:s}))
   .sort((a,b)=>b.score-a.score);
  return {route,candidate,approvedIndex};
 });
 // Reserve all exact or explicitly approved identities before fuzzy matching.
 for(const item of choices){
  const exact=item.candidate.find(c=>c.score===1);
  const chosen=item.approvedIndex>=0?item.candidate.find(c=>c.index===item.approvedIndex):exact;
  if(!chosen)continue;
  if(used.has(chosen.index)){review.push({...item.route,status:"review",reason:"Duplicate matching eMentor account",suggestions:item.candidate.slice(0,3)});continue}
  used.add(chosen.index);
  matched.push({...item.route,mentor:chosen.mentor,status:"matched",reason:item.approvedIndex>=0?"Approved mapping":chosen.reason,confidence:chosen.score});
 }
 const reserved=new Set([...matched,...review].map(r=>r.route));
 for(const item of choices.filter(q=>!reserved.has(q.route))){
  const available=item.candidate.filter(c=>!used.has(c.index));
  const top=available[0],second=available[1];
  if(!top||top.score<.72){
   missing.push({...item.route,status:"missing",reason:"Not found in Shift Report",suggestions:available.filter(c=>c.score>=.5).slice(0,3)});
   continue;
  }
  if(top.score>=.955&&(top.score-(second?.score||0))>=.1){
   used.add(top.index);matched.push({...item.route,mentor:top.mentor,status:"matched",reason:top.reason,confidence:top.score});
  }else{
   review.push({...item.route,status:"review",reason:top.reason,suggestions:available.filter(c=>c.score>=.5).slice(0,3)});
  }
 }
 return {matched:matched.sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),
  review:review.sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),
  missing:missing.sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),
  extra:shift.filter(s=>s.generic||!used.has(shift.indexOf(s))&&!active.some((x,i)=>x===s&&used.has(i))),
  generic:shift.filter(s=>s.generic),
  zeroTrips:matched.filter(x=>x.mentor.trip===0),
  totalRoutes:routes.length,totalShift:shift.length};
}
