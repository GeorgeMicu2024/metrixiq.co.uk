"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchCdfWorkspaceData } from "../../lib/data/cdf";
import { displayDriverName } from "../../lib/identity";
import { ErrorBox as ErrorPanel, Loading as LoadingPanel } from "../operations/OperationalShared";


const CDF_TIPS = {
  "Never Received Delivery": "Check address and GPS pin; take a clear POD photo.",
  "Delivered To Wrong Address": "Verify house number, street and delivery pin.",
  "Not Delivered To Preferred Location": "Follow the customer's preferred location instructions.",
  "Driver Mishandled Package": "Handle parcels carefully and protect them from bad weather.",
  "Received Wrong Item": "Check the parcel label and tracking ID before delivery.",
  "Driver Was Unprofessional": "Keep every customer interaction polite and professional."
};
function groupCdf(events) {
  const map = new Map();
  for (const event of events) {
    const id = event.driver_id || event.trid_raw || event.id;
    if (!map.has(id)) map.set(id, { name: displayDriverName(event.drivers), trid: event.trid_raw || "", events: [] });
    map.get(id).events.push(event);
  }
  return [...map.values()].map(driver => {
    const count = new Map();
    for (const event of driver.events) {
      const type = event.feedback_l1 || event.feedback_l0 || "Other";
      count.set(type, (count.get(type) || 0) + 1);
    }
    const reasons = [...count.entries()].sort((a,b)=>b[1]-a[1]);
    return { ...driver, reasons, tips: [...new Set(reasons.map(([type])=>CDF_TIPS[type] || "Review the reported delivery issue and follow the correct procedure."))] };
  }).sort((a,b)=>b.events.length-a.events.length || a.name.localeCompare(b.name));
}



function createCdfZip(files) {
  const encoder=new TextEncoder();
  const chunks=[],central=[];
  let offset=0;
  const crc32=(data)=>{
    let crc=0xffffffff;
    for(const byte of data){
      crc^=byte;
      for(let i=0;i<8;i++) crc=(crc>>>1)^(0xedb88320&-(crc&1));
    }
    return (crc^0xffffffff)>>>0;
  };
  for(const file of files){
    const name=encoder.encode(file.name),data=file.bytes,crc=crc32(data);
    const local=new Uint8Array(30+name.length),a=new DataView(local.buffer);
    a.setUint32(0,0x04034b50,true);a.setUint16(4,20,true);a.setUint16(6,0x0800,true);
    a.setUint32(14,crc,true);a.setUint32(18,data.length,true);a.setUint32(22,data.length,true);
    a.setUint16(26,name.length,true);local.set(name,30);
    chunks.push(local,data);
    const item=new Uint8Array(46+name.length),b=new DataView(item.buffer);
    b.setUint32(0,0x02014b50,true);b.setUint16(4,20,true);b.setUint16(6,20,true);
    b.setUint16(8,0x0800,true);b.setUint32(16,crc,true);
    b.setUint32(20,data.length,true);b.setUint32(24,data.length,true);
    b.setUint16(28,name.length,true);b.setUint32(42,offset,true);
    item.set(name,46);central.push(item);
    offset+=local.length+data.length;
  }
  const total=central.reduce((sum,x)=>sum+x.length,0);
  const end=new Uint8Array(22),v=new DataView(end.buffer);
  v.setUint32(0,0x06054b50,true);
  v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);
  v.setUint32(12,total,true);v.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:"application/zip"});
}

function useLoad(loader, deps = []) {
  const [state, setState] = useState({ loading: true, error: "", data: null });

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: "" }));

    loader()
      .then((data) => alive && setState({ loading: false, error: "", data }))
      .catch((error) => alive && setState({
        loading: false,
        error: error?.message || "Could not load data.",
        data: null,
      }));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}


export default function CdfView({ organizationId, onImport, siteFilter = "all" }) {
  const load = useLoad(
    () => fetchCdfWorkspaceData(getSupabaseBrowserClient(), organizationId),
    [organizationId]
  );

  const events = useMemo(() => {
    const allEvents = load.data?.events || [];
    if (siteFilter === "all") return allEvents;
    return allEvents.filter((event) =>
      String(event?.drivers?.site || "").trim().toUpperCase() === siteFilter
    );
  }, [load.data, siteFilter]);
  const weeks = useMemo(() => [...new Set(events.map((e)=>e.week_label).filter(Boolean))].sort((a,b)=>Number(b.replace(/\D/g,""))-Number(a.replace(/\D/g,""))), [events]);
  const [week,setWeek]=useState("");
  const [category,setCategory]=useState("all");
  const [query,setQuery]=useState("");
  const [feedbackPage,setFeedbackPage]=useState(0);
  const [exporting,setExporting]=useState(false);
  const exportContainerRef=useRef(null);
  useEffect(()=>{if(weeks.length&&!weeks.includes(week))setWeek(weeks[0]);},[weeks,week]);

  const selected = events.filter((e)=>e.week_label===week);
  const filtered = selected.filter((e)=>category==="all"||e.feedback_l1===category).filter((e)=>`${e.drivers?.full_name||""} ${e.trid_raw||""} ${e.tracking_id||""}`.toLowerCase().includes(query.toLowerCase()));
  const categories = [...new Set(selected.map((e)=>e.feedback_l1).filter(Boolean))];
  const affected = new Set(selected.map((e)=>e.driver_id||e.trid_raw).filter(Boolean)).size;
  const dnr = selected.filter((e)=>e.dnr_concession).length;
  const over25 = selected.filter((e)=>e.scanned_over_25m).length;
  const dzm1 = String(siteFilter).trim().toUpperCase() === "DZM1";
  const feedbackRows = useMemo(()=>groupCdf(selected),[events,week]);
  const pages = Math.max(1,Math.ceil(feedbackRows.length/20));
  const currentPage = Math.min(feedbackPage,pages-1);


  async function renderFeedbackPage(pageIndex) {
    const { toBlob } = await import("html-to-image");
    const node=exportContainerRef.current?.querySelectorAll("[data-cdf-page]")[pageIndex];
    if (!node) throw new Error("Feedback page not found.");
    const blob=await toBlob(node,{pixelRatio:2,backgroundColor:"#fff"});
    if (!blob) throw new Error("Could not render feedback image.");
    return new File([blob],`DZM1-CDF-${week}-page-${pageIndex+1}.png`,{type:"image/png"});
  }
  function downloadPage(file) {
    const url=URL.createObjectURL(file);
    const link=document.createElement("a");
    link.href=url;
    link.download=file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function exportFeedbackPage(pageIndex,share=false) {
    if (!exportContainerRef.current || exporting || !feedbackRows.length) return;
    setExporting(true);
    try {
      const file=await renderFeedbackPage(pageIndex);
      if (share && navigator.canShare?.({files:[file]}) && typeof navigator.share==="function") {
        try {
          await navigator.share({files:[file],title:`DZM1 CDF Feedback ${week} — Page ${pageIndex+1}`});
          return;
        } catch(error) {
          if (error?.name==="AbortError") return;
          if (error?.name!=="NotAllowedError") throw error;
        }
      }
      downloadPage(file);
      if (share) {
        window.alert("The image has been downloaded. Attach it in WhatsApp; this browser cannot attach the file automatically.");
        window.open("https://web.whatsapp.com/","_blank","noopener,noreferrer");
      }
    } catch(error) { window.alert(error?.message || "CDF export failed"); }
    finally { setExporting(false); }
  }

  async function downloadAllFeedback() {
    if (!exportContainerRef.current || exporting || !feedbackRows.length) return;
    setExporting(true);
    try {
      const files=[];
      for(let index=0;index<pages;index++){
        const file=await renderFeedbackPage(index);
        files.push({name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});
      }
      const archive=createCdfZip(files);
      const url=URL.createObjectURL(archive);
      const link=document.createElement("a");
      link.href=url;link.download=`DZM1-CDF-${week}-all-${files.length}-pages.zip`;
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch(error) { window.alert(error?.message || "Could not download all CDF pages"); }
    finally { setExporting(false); }
  }
  const matchingCards = (load.data?.cards || []).filter((card) =>
    card.week_label === week &&
    (siteFilter === "all" || String(card.site || "").trim().toUpperCase() === siteFilter)
  );
  const siteMetric = matchingCards.length === 1 ? matchingCards[0]?.metrics?.cdf_dpmo : null;

  if(load.loading)return <LoadingPanel text="Loading customer feedback…"/>;
  if(load.error)return <ErrorPanel error={load.error}/>;

  return <>
    <div className="page-heading scorecard-page-heading"><div><span className="page-kicker">CUSTOMER EXPERIENCE</span><h1>CDF feedback</h1><p>Negative customer feedback, root causes and driver-level evidence.</p></div><div className="scorecard-filter-row"><select aria-label="Select CDF week" value={week} onChange={(e)=>setWeek(e.target.value)}>{weeks.map((w)=><option key={w}>{w}</option>)}</select>{dzm1 && <button className="btn" disabled={!feedbackRows.length || exporting} onClick={()=>exportFeedbackPage(currentPage)}>{exporting?"Preparing photo…":`Save Page ${currentPage+1}`}</button>}{dzm1 && <button className="btn" style={{background:"#25D366",color:"#fff"}} disabled={!feedbackRows.length || exporting} onClick={()=>exportFeedbackPage(currentPage,true)}>WhatsApp</button>}<button className="btn primary" onClick={onImport}>Import CDF</button></div></div>

    {dzm1 && <section className="panel" style={{padding:14,marginBottom:12,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div><b>Driver feedback export · {week}</b><div style={{fontSize:12,color:"#657589"}}>{feedbackRows.length} drivers · 20 drivers per image · save each page using its own button</div></div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <button className="btn primary" disabled={!feedbackRows.length || exporting} onClick={downloadAllFeedback}>{exporting?"Preparing…":"Download All (ZIP)"}</button>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {Array.from({length:pages},(_,i)=><button key={i} className="btn" disabled={exporting} onClick={()=>exportFeedbackPage(i)}>Save Page {i+1}</button>)}
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <button className="btn" disabled={currentPage===0} onClick={()=>setFeedbackPage(p=>Math.max(0,p-1))}>Previous</button>
        <b>Page {currentPage+1}/{pages}</b>
        <button className="btn" disabled={currentPage===pages-1} onClick={()=>setFeedbackPage(p=>Math.min(pages-1,p+1))}>Next</button>
      </div>
    </section>}
    {dzm1 && <div ref={exportContainerRef} style={{position:"absolute",left:"-100000px",top:0,width:1450,pointerEvents:"none"}}>
      {Array.from({length:pages},(_,pageIndex)=><div key={pageIndex} data-cdf-page="" style={{width:1450,background:"#fff",color:"#122a42",fontFamily:"Arial,sans-serif",padding:28}}>
        <div style={{padding:20,background:"#e6f5f4",borderLeft:"8px solid #009c94",display:"flex",justifyContent:"space-between"}}>
          <div><b style={{color:"#00867d",letterSpacing:2}}>METRIXIQ · DZM1</b><div style={{fontSize:40,fontWeight:900,marginTop:6}}>CDF Driver Feedback</div><div style={{fontSize:21,marginTop:6}}>{week} · {selected.length} reports · {feedbackRows.length} drivers</div></div>
          <b>Page {pageIndex+1} / {pages}</b>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"52px 295px 85px 440px 1fr",gap:12,padding:14,background:"#10364c",color:"#fff",fontSize:21,fontWeight:800,marginTop:15}}>
          <span>#</span><span>Driver name</span><span>Cases</span><span>Reported issue</span><span>Improvement guidance</span>
        </div>
        {feedbackRows.slice(pageIndex*20,(pageIndex+1)*20).map((driver,i)=><div key={driver.trid||i} style={{display:"grid",gridTemplateColumns:"52px 295px 85px 440px 1fr",gap:12,padding:"16px 14px",background:i%2?"#f1f7f9":"#fff",borderBottom:"2px solid #d9e4eb",fontSize:20,lineHeight:1.45}}>
          <b>{pageIndex*20+i+1}</b><div><b style={{fontSize:22}}>{driver.name}</b><div style={{color:"#657589",fontSize:16}}>{driver.trid}</div></div>
          <b style={{fontSize:28,color:"#b64642"}}>{driver.events.length}</b>
          <div>{driver.reasons.map(([type,count])=><div key={type} style={{marginBottom:4}}><b>{count}×</b> {type}</div>)}</div>
          <div>{driver.tips.map((tip,j)=><div key={j} style={{marginBottom:4}}>• {tip}</div>)}</div>
        </div>)}
        <div style={{fontSize:15,color:"#67788b",marginTop:16}}>Customer feedback is not automatically a confirmed driver fault. Review the evidence before assigning responsibility.</div>
      </div>)}
    </div>}
    <section className="ops-kpi-strip"><div><span>Negative feedback</span><strong>{selected.length}</strong><small>{week||"No week"}</small></div><div><span>Drivers affected</span><strong>{affected}</strong><small>Unique drivers</small></div><div><span>DNR concessions</span><strong>{dnr}</strong><small>Flagged in CDF</small></div><div><span>CDF DPMO</span><strong>{siteMetric?.value ?? "—"}</strong><small>{siteMetric?.standing || "From weekly scorecard"}</small></div></section>
    <section className="cdf-category-grid">{categories.slice(0,6).map((cat)=><button key={cat} className={category===cat?"active":""} onClick={()=>setCategory(category===cat?"all":cat)}><span>{cat}</span><strong>{selected.filter((e)=>e.feedback_l1===cat).length}</strong></button>)}</section>
    <section className="panel"><div className="table-tools"><input aria-label="Search CDF records" placeholder="Search driver, TRID or tracking ID…" value={query} onChange={(e)=>setQuery(e.target.value)}/><select aria-label="Filter CDF category" value={category} onChange={(e)=>setCategory(e.target.value)}><option value="all">All feedback types</option>{categories.map((cat)=><option key={cat}>{cat}</option>)}</select><span>{filtered.length} events · {over25} over 25m</span></div><div className="table-wrap"><table className="data-table cdf-table"><thead><tr><th>Date</th><th>Driver</th><th>Tracking ID</th><th>Feedback</th><th>Detail</th><th>Contact</th><th>PHR</th><th>&gt;25m</th><th>DNR</th></tr></thead><tbody>
      {filtered.map((event)=><tr key={event.id}><td>{event.feedback_date||"—"}</td><td><b>{displayDriverName(event.drivers)}</b><small className="history-date">{event.trid_raw}</small></td><td>{event.tracking_id}</td><td>{event.feedback_l1||event.feedback_l0||"—"}</td><td>{event.feedback_l2||"—"}</td><td>{event.contact_compliance||"—"}</td><td>{event.phr_compliance||"—"}</td><td>{event.scanned_over_25m?"Yes":"No"}</td><td>{event.dnr_concession?"Yes":"No"}</td></tr>)}
      {!filtered.length&&<tr><td colSpan="9"><div className="ops-mini-empty">No CDF events stored for this selection.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}


