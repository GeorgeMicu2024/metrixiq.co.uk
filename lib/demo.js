const names=["Alex Adams","Amir Bailey","Ben Cole","Callum Dawson","Daria Ellis","Daniel Foster","Elena Gray","Ethan Hughes","Farah Irwin","Hannah Jones","Isaac Khan","Jamie Lewis","Kara Morris","Liam Nolan","Maya Owens","Noah Patel","Olivia Quinn","Owen Reed","Priya Shaw","Rory Turner","Sana Usher","Theo Vance","Viktor Walker","Zara Young"];
export const demoDrivers=Array.from({length:36},(_,i)=>{
  const risk=i%13===0?"High":i%6===0?"Medium":"Low";
  const performance=risk==="High"?70+(i%6):risk==="Medium"?79+(i%6):87+(i%9);
  const name=names[i%names.length];
  return {id:`TRID${String(1001+i)}`,name,initials:name.split(" ").map(x=>x[0]).join(""),site:i%8===0?"DXS1":i%11===0?"DDN1":"DLS2",performance,risk,dcr:Number((98.4+(i%14)/10).toFixed(1)),pod:Number((96.8+(i%20)/10).toFixed(1)),iadc:78+(i*7)%21,cc:Number((96.5+(i%18)/10).toFixed(1)),fico:780+(i*11)%85,ementor:800+(i*13)%80,psb:Number((95+(i%20)/10).toFixed(1)),reattempts:Number((91+(i%30)/10).toFixed(1)),concessions:risk==="High"?5+i%4:risk==="Medium"?2+i%3:i%2,lor:risk==="High"?2+i%3:i%2,issue:risk==="High"?"Repeated POD / IADC deterioration":risk==="Medium"?"Consistency below target":"No active concern"};
});
export const demoKpis={dcr:99.1,pod:97.8,iadc:87.1,cc:98.4,fico:812,ementor:834,psb:98.2,reattempts:96.4,concessions:1.34,lor:0.82};
export const trend=[81.2,82.9,81.6,84.1,85.3,87.4];
