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


function zipImages(files) {
  const encoder = new TextEncoder();
  const parts = [], directory = [];
  let offset = 0;
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const value of bytes) {
      crc ^= value;
      for (let bit=0;bit<8;bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const header = (length) => new Uint8Array(length);
  const write16 = (view, pos, value) => view.setUint16(pos, value, true);
  const write32 = (view, pos, value) => view.setUint32(pos, value, true);
  for (const file of files) {
    const name = encoder.encode(file.name), data = file.bytes, crc = crc32(data);
    const local = header(30 + name.length), l = new DataView(local.buffer);
    write32(l,0,0x04034b50); write16(l,4,20); write16(l,6,0x0800); write16(l,8,0);
    write32(l,14,crc); write32(l,18,data.length); write32(l,22,data.length);
    write16(l,26,name.length); local.set(name,30);
    parts.push(local,data);
    const central = header(46 + name.length), c = new DataView(central.buffer);
    write32(c,0,0x02014b50); write16(c,4,20); write16(c,6,20);
    write16(c,8,0x0800); write16(c,10,0);
    write32(c,16,crc); write32(c,20,data.length); write32(c,24,data.length);
    write16(c,28,name.length); write32(c,42,offset); central.set(name,46);
    directory.push(central);
    offset += local.length + data.length;
  }
  const directorySize = directory.reduce((sum,item)=>sum+item.length,0);
  const end = header(22), e = new DataView(end.buffer);
  write32(e,0,0x06054b50); write16(e,8,files.length); write16(e,10,files.length);
  write32(e,12,directorySize); write32(e,16,offset);
  return new Blob([...parts,...directory,end],{type:"application/zip"});
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
  async function saveFeedback() {
    if (!exportContainerRef.current || exporting || !feedbackRows.length) return;
    setExporting(true);
    try {
      const { toBlob } = await import("html-to-image");
      const nodes = [...exportContainerRef.current.querySelectorAll("[data-cdf-page]")];
      const files = [];
      for (let index=0; index<nodes.length; index++) {
        const blob = await toBlob(nodes[index], {pixelRatio:2,backgroundColor:"#fff"});
        if (!blob) throw new Error(`Could not render page ${index+1}`);
        files.push({name:`DZM1-CDF-${week}-page-${index+1}.png`,bytes:new Uint8Array(await blob.arrayBuffer())});
      }
      const url=URL.createObjectURL(zipImages(files));
      const link=document.createElement("a");
      link.href=url;
      link.download=`DZM1-CDF-${week}-all-${files.length}-pages.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(error) { window.alert(error?.message || "CDF export failed"); }
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
    <div className="page-heading scorecard-page-heading"><div><span className="page-kicker">CUSTOMER EXPERIENCE</span><h1>CDF feedback</h1><p>Negative customer feedback, root causes and driver-level evidence.</p></div><div className="scorecard-filter-row"><select aria-label="Select CDF week" value={week} onChange={(e)=>setWeek(e.target.value)}>{weeks.map((w)=><option key={w}>{w}</option>)}</select>{dzm1 && <button className="btn" disabled={!feedbackRows.length || exporting} onClick={saveFeedback}>{exporting?"Saving…":"Save All Feedback Images"}</button>}<button className="btn primary" onClick={onImport}>Import CDF</button></div></div>

    {dzm1 && <section className="panel" style={{padding:14,marginBottom:12,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div><b>Driver feedback export · {week}</b><div style={{fontSize:12,color:"#657589"}}>{feedbackRows.length} drivers · 20 drivers per image · all pages in one ZIP</div></div>
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


