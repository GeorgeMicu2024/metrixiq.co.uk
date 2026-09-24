"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

const clean = (value) => String(value || "").trim();
const upper = (value) => clean(value).toUpperCase();
const STATUS_OPTIONS = [
  ["active", "Active"],
  ["inactive", "Inactive"],
  ["offboarded", "Offboarded"],
  ["terminated", "Fired / Terminated"],
  ["resigned", "Resigned / Gave up"],
];

export default function DriverMasterView({ organizationId, sites = [], legacyDrivers = [], canManage = false, onOpenDriver }) {
  const [assignments, setAssignments] = useState([]);
  const [query, setQuery] = useState("");
  const [homeFilter, setHomeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [statusBusy, setStatusBusy] = useState("");
  const [hiddenTrids, setHiddenTrids] = useState(() => new Set());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ fullName: "", trid: "", homeSite: "", additionalSites: [] });

  async function loadAssignments() {
    if (!organizationId) return;
    const { data, error: loadError } = await getSupabaseBrowserClient()
      .from("driver_site_assignments")
      .select("id,driver_id,site,is_home,active,valid_from,valid_to")
      .eq("organization_id", organizationId)
      .eq("active", true);
    if (loadError) throw loadError;
    setAssignments(data || []);
  }

  useEffect(() => { loadAssignments().catch(() => setAssignments([])); }, [organizationId]);

  const assignmentByDriver = useMemo(() => {
    const map = new Map();
    assignments.forEach((row) => {
      const current = map.get(row.driver_id) || { home: "", sites: [] };
      if (row.is_home) current.home = row.site;
      if (!current.sites.includes(row.site)) current.sites.push(row.site);
      map.set(row.driver_id, current);
    });
    return map;
  }, [assignments]);

  const rows = useMemo(() => legacyDrivers.map((driver) => {
    const assigned = assignmentByDriver.get(driver.dbId) || { home: "", sites: [] };
    const homeSite = assigned.home || upper(driver.site);
    const assignedSites = assigned.sites.length ? assigned.sites : (homeSite ? [homeSite] : []);
    return { ...driver, status: clean(driver.status || "active").toLowerCase(), homeSite, assignedSites };
  }).filter((driver) => {
    const haystack = [driver.name, driver.id, driver.homeSite, ...(driver.assignedSites || [])].join(" ").toLowerCase();
    if (hiddenTrids.has(driver.dbId)) return false;
    if (!haystack.includes(query.toLowerCase())) return false;
    if (statusFilter !== "all" && driver.status !== statusFilter) return false;
    return homeFilter === "all" || driver.homeSite === homeFilter;
  }), [legacyDrivers, assignmentByDriver, query, homeFilter, statusFilter, hiddenTrids]);

  async function changeStatus(driver, nextStatus) {
    if (!canManage || !driver?.dbId || statusBusy) return;
    setStatusBusy(driver.dbId); setError("");
    try {
      const { error: updateError } = await getSupabaseBrowserClient().from("drivers")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId).eq("id", driver.dbId);
      if (updateError) throw updateError;
      driver.status = nextStatus;
      setStatusFilter((current) => current);
    } catch (e) { setError(e?.message || "Could not update driver status."); }
    finally { setStatusBusy(""); }
  }


  async function changeHomeSite(driver, nextSite) {
    if (!canManage || !driver?.dbId || !nextSite) return;
    setStatusBusy(driver.dbId); setError("");
    const supabase = getSupabaseBrowserClient();
    try {
      const { error: driverError } = await supabase.from("drivers").update({ site: nextSite, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", driver.dbId);
      if (driverError) throw driverError;
      await supabase.from("driver_site_assignments").update({ is_home:false }).eq("organization_id",organizationId).eq("driver_id",driver.dbId);
      const { error: assignError } = await supabase.from("driver_site_assignments").upsert({ organization_id:organizationId,driver_id:driver.dbId,site:nextSite,is_home:true,active:true,valid_from:new Date().toISOString().slice(0,10) }, { onConflict:"organization_id,driver_id,site" });
      if (assignError) throw assignError;
      await loadAssignments(); window.location.reload();
    } catch(e) { setError(e?.message || "Could not change Home Site."); } finally { setStatusBusy(""); }
  }

  async function toggleAssignedSite(driver, site) {
    if (!canManage || !driver?.dbId || !site) return;
    const supabase=getSupabaseBrowserClient(); setStatusBusy(driver.dbId); setError("");
    try {
      const exists=(driver.assignedSites||[]).includes(site);
      if(exists && site!==driver.homeSite) {
        const {error:e}=await supabase.from("driver_site_assignments").update({active:false,valid_to:new Date().toISOString().slice(0,10)}).eq("organization_id",organizationId).eq("driver_id",driver.dbId).eq("site",site); if(e) throw e;
      } else if(!exists) {
        const {error:e}=await supabase.from("driver_site_assignments").upsert({organization_id:organizationId,driver_id:driver.dbId,site,is_home:false,active:true,valid_from:new Date().toISOString().slice(0,10),valid_to:null},{onConflict:"organization_id,driver_id,site"}); if(e) throw e;
      }
      await loadAssignments();
    } catch(e){setError(e?.message||"Could not update assigned sites.");} finally{setStatusBusy("");}
  }

  function toggleAdditional(site) {
    setDraft((current) => ({
      ...current,
      additionalSites: current.additionalSites.includes(site)
        ? current.additionalSites.filter((item) => item !== site)
        : [...current.additionalSites, site],
    }));
  }

  async function createDriver() {
    const fullName = clean(draft.fullName);
    const trid = upper(draft.trid);
    const homeSite = upper(draft.homeSite);
    if (!fullName || !trid || !homeSite) {
      setError("Full name, TRID and Home Site are required.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    try {
      const { data: existing, error: existingError } = await supabase
        .from("drivers").select("id,full_name,trid,site").eq("organization_id", organizationId).eq("trid", trid).maybeSingle();
      if (existingError) throw existingError;
      if (existing) throw new Error("TRID " + trid + " already belongs to " + existing.full_name + ".");

      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .insert({ organization_id: organizationId, trid, full_name: fullName, site: homeSite, status: "active" })
        .select("id,trid,full_name,site,status").single();
      if (driverError) throw driverError;

      const allSites = [...new Set([homeSite, ...draft.additionalSites.map(upper).filter(Boolean)])];
      const payload = allSites.map((site) => ({
        organization_id: organizationId,
        driver_id: driver.id,
        site,
        is_home: site === homeSite,
        active: true,
        valid_from: new Date().toISOString().slice(0, 10),
      }));
      const { error: assignmentError } = await supabase.from("driver_site_assignments").insert(payload);
      if (assignmentError) {
        await supabase.from("drivers").delete().eq("organization_id", organizationId).eq("id", driver.id);
        throw assignmentError;
      }

      await loadAssignments();
      setDraft({ fullName: "", trid: "", homeSite: "", additionalSites: [] });
      setOpen(false);
      window.location.reload();
    } catch (e) {
      setError(e?.code === "23505" ? "That TRID already exists in this workspace." : (e?.message || "Could not create driver."));
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="page-heading pro-heading">
      <div><span className="page-kicker">PEOPLE · IDENTITY</span><h1>Driver Master</h1><p>One global driver identity per TRID, with Home Site and cross-site assignments.</p></div>
      {canManage && <button className="btn primary" onClick={() => { setError(""); setOpen(true); }}>＋ Add driver</button>}
    </div>

    <section className="pro-kpi-grid">
      <article><span>Active drivers</span><strong>{legacyDrivers.filter((d) => clean(d.status || "active").toLowerCase() === "active").length}</strong><small>Current active workforce</small></article>
      <article><span>Explicit assignments</span><strong>{new Set(assignments.map((x) => x.driver_id)).size}</strong><small>Driver Master V1 records</small></article>
      <article><span>Sites</span><strong>{sites.length}</strong><small>Available stations</small></article>
      <article><span>Cross-site</span><strong>{[...assignmentByDriver.values()].filter((x) => x.sites.length > 1).length}</strong><small>Drivers assigned to 2+ sites</small></article>
    </section>

    <section className="panel pro-table-panel">
      <div className="pro-filterbar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, TRID or site…" />
        <select value={homeFilter} onChange={(e) => setHomeFilter(e.target.value)}><option value="all">All home sites</option>{sites.map((site) => <option key={site}>{site}</option>)}</select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{STATUS_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}<option value="all">All statuses</option></select>
        <span className="pro-filter-count">{rows.length} shown</span>
      </div>
      <div className="table-wrap"><table className="data-table pro-directory-table"><thead><tr><th>Driver</th><th>TRID</th><th>Home Site</th><th>Assigned Sites</th><th>Status</th><th /></tr></thead><tbody>
        {rows.map((driver) => <tr key={driver.dbId || driver.id}><td><b>{driver.name || "Unresolved driver"}</b></td><td><div style={{display:"flex",alignItems:"center",gap:8}}><code>{driver.id}</code><button type="button" className="profile-link" onClick={()=>setHiddenTrids(s=>new Set([...s,driver.dbId]))}>Hide</button></div></td><td>{canManage ? <select value={driver.homeSite||""} disabled={statusBusy===driver.dbId} onChange={e=>changeHomeSite(driver,e.target.value)}>{sites.map(site=><option key={site} value={site}>{site}</option>)}</select> : <span className="site-chip">{driver.homeSite||"Unassigned"}</span>}</td><td>{canManage ? <details><summary className="site-chip">{driver.assignedSites.length ? driver.assignedSites.join(", ") : "Select sites"}</summary><div style={{position:"absolute",background:"white",padding:10,border:"1px solid #dbe3ea",borderRadius:12,zIndex:20}}>{sites.map(site=><label key={site} style={{display:"block",padding:5}}><input type="checkbox" checked={driver.assignedSites.includes(site)} disabled={site===driver.homeSite||statusBusy===driver.dbId} onChange={()=>toggleAssignedSite(driver,site)} /> {site}</label>)}</div></details> : driver.assignedSites.map(site=><span className="site-chip" key={site} style={{marginRight:6}}>{site}</span>)}</td><td>{canManage ? <select value={driver.status} disabled={statusBusy===driver.dbId} onChange={(e)=>changeStatus(driver,e.target.value)}>{STATUS_OPTIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select> : <span>{driver.status}</span>}</td><td><button className="profile-link" onClick={() => onOpenDriver?.(driver)}>Open →</button></td></tr>)}
        {!rows.length && <tr><td colSpan={6}><div className="pro-empty-row">No drivers match the current filters.</div></td></tr>}
      </tbody></table></div>
    </section>

    {open && <div role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(5,10,20,.68)",display:"grid",placeItems:"center",padding:20}}>
      <section className="panel" role="dialog" aria-modal="true" style={{width:"min(620px,100%)"}}>
        <div className="panel-head"><div><span className="page-kicker">DRIVER MASTER</span><h2>Add driver</h2><p>TRID is the primary workspace identity. Names may vary in operational reports.</p></div><button className="btn ghost compact" disabled={busy} onClick={() => setOpen(false)}>×</button></div>
        {error && <div className="mgrv2-notice error">{error}</div>}
        <div style={{display:"grid",gap:14}}>
          <label><span>Full name</span><input autoFocus value={draft.fullName} onChange={(e) => setDraft((x) => ({...x,fullName:e.target.value}))} placeholder="Driver full name" /></label>
          <label><span>TRID</span><input value={draft.trid} onChange={(e) => setDraft((x) => ({...x,trid:e.target.value.toUpperCase()}))} placeholder="Primary driver identity" /></label>
          <label><span>Home Site</span><select value={draft.homeSite} onChange={(e) => setDraft((x) => ({...x,homeSite:e.target.value,additionalSites:x.additionalSites.filter((s)=>s!==e.target.value)}))}><option value="">Select home site…</option>{sites.map((site) => <option key={site}>{site}</option>)}</select></label>
          <div><span>Additional Sites</span><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>{sites.filter((site)=>site!==draft.homeSite).map((site)=><label key={site} className="site-chip" style={{cursor:"pointer"}}><input type="checkbox" checked={draft.additionalSites.includes(site)} onChange={()=>toggleAdditional(site)} /> {site}</label>)}</div></div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}><button className="btn ghost" disabled={busy} onClick={()=>setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={createDriver}>{busy?"Creating…":"Create driver"}</button></div>
        </div>
      </section>
    </div>}
  </>;
}
