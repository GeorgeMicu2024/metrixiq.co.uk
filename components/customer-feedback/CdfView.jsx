"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { fetchCdfWorkspaceData } from "../../lib/data/cdf";
import { displayDriverName } from "../../lib/identity";
import { ErrorBox as ErrorPanel, Loading as LoadingPanel } from "../operations/OperationalShared";

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
  useEffect(()=>{if(weeks.length&&!week)setWeek(weeks[0]);},[weeks,week]);

  const selected = events.filter((e)=>e.week_label===week);
  const filtered = selected.filter((e)=>category==="all"||e.feedback_l1===category).filter((e)=>`${e.drivers?.full_name||""} ${e.trid_raw||""} ${e.tracking_id||""}`.toLowerCase().includes(query.toLowerCase()));
  const categories = [...new Set(selected.map((e)=>e.feedback_l1).filter(Boolean))];
  const affected = new Set(selected.map((e)=>e.driver_id||e.trid_raw).filter(Boolean)).size;
  const dnr = selected.filter((e)=>e.dnr_concession).length;
  const over25 = selected.filter((e)=>e.scanned_over_25m).length;
  const matchingCards = (load.data?.cards || []).filter((card) =>
    card.week_label === week &&
    (siteFilter === "all" || String(card.site || "").trim().toUpperCase() === siteFilter)
  );
  const siteMetric = matchingCards.length === 1 ? matchingCards[0]?.metrics?.cdf_dpmo : null;

  if(load.loading)return <LoadingPanel text="Loading customer feedback…"/>;
  if(load.error)return <ErrorPanel error={load.error}/>;

  return <>
    <div className="page-heading scorecard-page-heading"><div><span className="page-kicker">CUSTOMER EXPERIENCE</span><h1>CDF feedback</h1><p>Negative customer feedback, root causes and driver-level evidence.</p></div><div className="scorecard-filter-row"><select value={week} onChange={(e)=>setWeek(e.target.value)}>{weeks.map((w)=><option key={w}>{w}</option>)}</select><button className="btn primary" onClick={onImport}>Import CDF</button></div></div>
    <section className="ops-kpi-strip"><div><span>Negative feedback</span><strong>{selected.length}</strong><small>{week||"No week"}</small></div><div><span>Drivers affected</span><strong>{affected}</strong><small>Unique drivers</small></div><div><span>DNR concessions</span><strong>{dnr}</strong><small>Flagged in CDF</small></div><div><span>CDF DPMO</span><strong>{siteMetric?.value ?? "—"}</strong><small>{siteMetric?.standing || "From weekly scorecard"}</small></div></section>
    <section className="cdf-category-grid">{categories.slice(0,6).map((cat)=><button key={cat} className={category===cat?"active":""} onClick={()=>setCategory(category===cat?"all":cat)}><span>{cat}</span><strong>{selected.filter((e)=>e.feedback_l1===cat).length}</strong></button>)}</section>
    <section className="panel"><div className="table-tools"><input placeholder="Search driver, TRID or tracking ID…" value={query} onChange={(e)=>setQuery(e.target.value)}/><select value={category} onChange={(e)=>setCategory(e.target.value)}><option value="all">All feedback types</option>{categories.map((cat)=><option key={cat}>{cat}</option>)}</select><span>{filtered.length} events · {over25} over 25m</span></div><div className="table-wrap"><table className="data-table cdf-table"><thead><tr><th>Date</th><th>Driver</th><th>Tracking ID</th><th>Feedback</th><th>Detail</th><th>Contact</th><th>PHR</th><th>&gt;25m</th><th>DNR</th></tr></thead><tbody>
      {filtered.map((event)=><tr key={event.id}><td>{event.feedback_date||"—"}</td><td><b>{displayDriverName(event.drivers)}</b><small className="history-date">{event.trid_raw}</small></td><td>{event.tracking_id}</td><td>{event.feedback_l1||event.feedback_l0||"—"}</td><td>{event.feedback_l2||"—"}</td><td>{event.contact_compliance||"—"}</td><td>{event.phr_compliance||"—"}</td><td>{event.scanned_over_25m?"Yes":"No"}</td><td>{event.dnr_concession?"Yes":"No"}</td></tr>)}
      {!filtered.length&&<tr><td colSpan="9"><div className="ops-mini-empty">No CDF events stored for this selection.</div></td></tr>}
    </tbody></table></div></section>
  </>;
}


