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
  const generic=/^mentor\s*\d+\s*(?:dls\d+|dzm\d+|ddn\d+|dxm\d+|dxs\d+)?$/i.test(name.trim())||/^mentor\s*\d+/i.test(name.trim());
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
 const active=shift.filter(x=>!x.generic);
 const used=new Set(),resolved=new Set(),matched=[],review=[],missing=[];
 const candidates=routes.map(route=>({
  route,
  ranked:active.map((mentor,index)=>({...scoreNames(route.driver,mentor.name),mentor,index})).sort((a,b)=>b.score-a.score),
  approval:approved[normalize(route.driver)]||"",
 }));
 const accept=(entry,candidate,reason)=>{
  used.add(candidate.index);resolved.add(entry.route.route);
  matched.push({...entry.route,status:"matched",mentor:candidate.mentor,reason:reason||candidate.reason,confidence:candidate.score});
 };
 // Explicit mappings and exact matches are reserved first; never reuse an
 // eMentor account for two different Amazon routes.
 // Manual approvals win over automatic matching regardless of route order.
 for(const entry of candidates){
  if(!entry.approval)continue;
  const choice=entry.ranked.find(x=>normalize(x.mentor.name)===entry.approval);
  if(choice&&!used.has(choice.index))accept(entry,choice,"Approved mapping");
 }
 for(const entry of candidates){
  if(resolved.has(entry.route.route))continue;
  const choice=entry.ranked.find(x=>x.score===1&&!used.has(x.index));
  if(choice)accept(entry,choice);
 }
 for(const entry of candidates){
  if(resolved.has(entry.route.route))continue;
  const available=entry.ranked.filter(x=>!used.has(x.index));
  const top=available[0],second=available[1];
  if(!top||top.score<.7){
   missing.push({...entry.route,status:"missing",reason:"Not in eMentor Shift Report",suggestions:available.filter(x=>x.score>.48).slice(0,3)});
  }else if(top.score>=.96&&(top.score-(second?.score||0))>=.08){
   accept(entry,top);
  }else{
   review.push({...entry.route,status:"review",reason:top.reason,suggestions:available.filter(x=>x.score>.48).slice(0,3)});
  }
 }
 // An exact middle-name match can be near-perfect but should not be displaced
 // by a worse name; unresolved suggestions stay in the missing-from-confirmed list.
 const unique=new Set([...matched,...missing,...review].map(x=>x.route));
 if(unique.size!==routes.length){
  for(const route of routes)if(!unique.has(route.route))missing.push({...route,status:"missing",reason:"No confirmed account",suggestions:[]});
 }
 return {
  matched:matched.sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),
  missing:missing.sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),
  review:review.sort((a,b)=>a.route.localeCompare(b.route,undefined,{numeric:true})),
  extra:shift.filter(x=>x.generic||(active.includes(x)&&!used.has(active.indexOf(x)))),
  generic:shift.filter(x=>x.generic),
  zeroTrips:matched.filter(x=>x.mentor.trip===0),
  totalRoutes:routes.length,totalShift:shift.length
 };
}
