"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { isUsablePersonName } from "../../lib/identity";
import { resolveDriverIdentity, resolveUnmatchedDriverRecord, syncDriverDirectory } from "../../lib/data/dataQuality";
import { fetchDataQualityV2 } from "../../lib/data/governanceV2";

function tone(score) {
  if (score >= 90) return "good";
  if (score >= 75) return "warn";
  return "bad";
}

export default function DataQualityV2({ organizationId, onImport, canResolve = false }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [choice, setChoice] = useState({});
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  async function load() {
    if (!organizationId) return;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await fetchDataQualityV2(getSupabaseBrowserClient(), organizationId);
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({ loading: false, error: error?.message || "Could not load Data Quality V2.", data: null });
    }
  }

  useEffect(() => { load(); }, [organizationId]);

  const quality = state.data?.quality;
  const drivers = state.data?.drivers || [];
  const imports = state.data?.imports || [];

  async function autoSync() {
    setBusy("sync"); setNotice("");
    try {
      await syncDriverDirectory(getSupabaseBrowserClient(), organizationId);
      setNotice("Identity directory synced.");
      await load();
    } catch (error) {
      setNotice(error?.message || "Could not sync identities.");
    } finally { setBusy(""); }
  }

  async function saveName(driver) {
    if (!canResolve) return;
    const name = renameValue.trim();
    if (!isUsablePersonName(name)) {
      setNotice("Enter a trusted first name and surname.");
      return;
    }
    setBusy(driver.id);
    try {
      await resolveDriverIdentity(getSupabaseBrowserClient(), {
        organizationId, driverId: driver.id, fullName: name,
      });
      setRenameId(""); setRenameValue("");
      setNotice(`${name} resolved successfully.`);
      await load();
    } catch (error) {
      setNotice(error?.message || "Could not resolve identity.");
    } finally { setBusy(""); }
  }

  async function resolveRecord(record) {
    if (!canResolve || !choice[record.id]) return;
    setBusy(record.id);
    try {
      await resolveUnmatchedDriverRecord(getSupabaseBrowserClient(), {
        organizationId,
        recordId: record.id,
        driverId: choice[record.id],
        aliasName: isUsablePersonName(record.raw_name) ? record.raw_name : "",
      });
      setNotice("Imported record mapped to trusted driver.");
      setChoice((current) => { const next = { ...current }; delete next[record.id]; return next; });
      await load();
    } catch (error) {
      setNotice(error?.message || "Could not resolve imported record.");
    } finally { setBusy(""); }
  }

  if (state.loading) return <section className="panel gov-empty"><div className="auth-spinner" /><b>Analysing workspace data quality…</b></section>;
  if (state.error) return <section className="panel gov-empty"><b>Data Quality unavailable</b><span>{state.error}</span></section>;
  if (!quality) return null;

  return <div className="dqv2-root">
    <div className="gov-heading">
      <div><span className="page-kicker">DATA QUALITY V2</span><h1>Workspace Data Health</h1><p>Identity integrity, scorecard completeness, import health and unresolved evidence.</p></div>
      <div className="gov-heading-actions">
        <button className="btn ghost" disabled={!canResolve || busy === "sync"} onClick={autoSync}>{busy === "sync" ? "Syncing…" : "Auto-match aliases"}</button>
        <button className="btn primary" onClick={onImport}>Import trusted data</button>
      </div>
    </div>

    {notice && <div className="gov-notice">{notice}</div>}

    <section className="dqv2-health">
      <div className={`dqv2-health-score ${tone(quality.healthScore)}`}><span>Data Health</span><strong>{quality.healthScore}</strong><b>/100</b><small>Weighted workspace quality</small></div>
      <div><span>Identity coverage</span><strong>{quality.identityCoverage}%</strong><small>{quality.resolvedCount}/{quality.driversCount} resolved</small></div>
      <div><span>Mapping health</span><strong>{quality.mappingHealth}%</strong><small>{quality.openUnmatched} unmatched</small></div>
      <div><span>Latest completeness</span><strong>{quality.completeness}%</strong><small>{quality.latestWeek || "No week"}</small></div>
      <div><span>Duplicate health</span><strong>{quality.duplicateHealth}%</strong><small>{quality.duplicates.length} duplicate groups</small></div>
      <div><span>Import health</span><strong>{quality.importsHealth}%</strong><small>{quality.importFailures} recent issues</small></div>
    </section>

    <div className="gov-tabs">
      {[
        ["overview","Overview"],["identities","Identities"],["unmatched","Unmatched"],["duplicates","Duplicates"],
        ["completeness","Completeness"],["imports","Imports"]
      ].map(([id,label]) => <button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </div>

    {tab === "overview" && <section className="dqv2-overview-grid">
      <article className="panel">
        <div className="panel-head"><div><h2>Latest week gaps</h2><p>{quality.latestWeek} · scorecard evidence requiring attention.</p></div><span className="panel-badge">{quality.missingRows.length}</span></div>
        <div className="dqv2-gap-list">
          {quality.missingRows.slice(0,10).map((row)=><div key={row.id}><div><b>{row.driverName}</b><small>{row.trid || "—"} · {row.site || "—"}</small></div><span>{row.missingMetrics.join(", ")}</span></div>)}
          {!quality.missingRows.length && <div className="gov-empty compact">Latest week has full scorecard coverage.</div>}
        </div>
      </article>
      <article className="panel">
        <div className="panel-head"><div><h2>Identity pressure</h2><p>Issues that can create duplicate or disconnected driver evidence.</p></div></div>
        <div className="dqv2-pressure">
          <button onClick={()=>setTab("unmatched")}><span>Open unmatched</span><strong>{quality.openUnmatched}</strong><small>Map ambiguous evidence</small></button>
          <button onClick={()=>setTab("duplicates")}><span>Duplicate names</span><strong>{quality.duplicates.length}</strong><small>Review separate TRIDs</small></button>
          <button onClick={()=>setTab("identities")}><span>Unresolved TRIDs</span><strong>{quality.unresolved.length}</strong><small>Trusted names needed</small></button>
          <div><span>Known aliases</span><strong>{quality.aliasesCount}</strong><small>{Object.keys(quality.aliasTypes).length} alias types</small></div>
        </div>
      </article>
    </section>}

    {tab === "identities" && <section className="panel">
      <div className="panel-head"><div><h2>Unresolved identities</h2><p>TRIDs without a trusted person name.</p></div><span className="panel-badge">{quality.unresolved.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>TRID</th><th>Site</th><th>Status</th><th>Resolution</th></tr></thead><tbody>
        {quality.unresolved.map((driver)=><tr key={driver.id}><td><b>{driver.trid}</b></td><td>{driver.site||"—"}</td><td>{driver.status}</td><td>
          {renameId===driver.id
            ? <div className="gov-inline"><input value={renameValue} onChange={(e)=>setRenameValue(e.target.value)} placeholder="Trusted full name"/><button disabled={!canResolve||busy===driver.id} onClick={()=>saveName(driver)}>Save</button><button onClick={()=>setRenameId("")}>Cancel</button></div>
            : <button className="profile-link" disabled={!canResolve} onClick={()=>{setRenameId(driver.id);setRenameValue("");}}>Resolve →</button>}
        </td></tr>)}
        {!quality.unresolved.length && <tr><td colSpan="4"><div className="gov-empty compact">All TRIDs have trusted names.</div></td></tr>}
      </tbody></table></div>
    </section>}

    {tab === "unmatched" && <section className="panel">
      <div className="panel-head"><div><h2>Unmatched imported evidence</h2><p>Resolve once; future imports reuse the trusted alias mapping.</p></div><span className="panel-badge">{quality.unmatched.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Source</th><th>TRID</th><th>Week</th><th>Report</th><th>Site</th><th>Trusted driver</th><th /></tr></thead><tbody>
        {quality.unmatched.map((record)=><tr key={record.id}><td>{record.raw_name||"—"}</td><td>{record.raw_trid||"—"}</td><td>{record.week_label||"—"}</td><td>{record.report_type||"—"}</td><td>{record.site||"—"}</td><td>
          <select value={choice[record.id]||""} onChange={(e)=>setChoice((c)=>({...c,[record.id]:e.target.value}))}><option value="">Choose driver…</option>
            {drivers.filter((d)=>isUsablePersonName(d.full_name)).map((driver)=><option key={driver.id} value={driver.id}>{driver.full_name} · {driver.trid}</option>)}
          </select></td><td><button className="btn primary compact" disabled={!canResolve||!choice[record.id]||busy===record.id} onClick={()=>resolveRecord(record)}>Resolve</button></td></tr>)}
        {!quality.unmatched.length && <tr><td colSpan="7"><div className="gov-empty compact">No unmatched records.</div></td></tr>}
      </tbody></table></div>
    </section>}

    {tab === "duplicates" && <section className="panel">
      <div className="panel-head"><div><h2>Duplicate identity groups</h2><p>Same trusted name connected to multiple driver records. Review before merging aliases.</p></div><span className="panel-badge">{quality.duplicates.length}</span></div>
      <div className="dqv2-duplicates">
        {quality.duplicates.map((group)=><article key={group.key}><div><b>{group.name}</b><span>{group.count} driver records · {group.sites.join(", ")||"No site"}</span></div><div>{group.drivers.map((driver)=><span key={driver.id}>{driver.trid} · {driver.site||"—"}</span>)}</div></article>)}
        {!quality.duplicates.length && <div className="gov-empty">No duplicate trusted-name groups.</div>}
      </div>
    </section>}

    {tab === "completeness" && <section className="panel">
      <div className="panel-head"><div><h2>Week completeness</h2><p>Coverage across the 9 scorecard inputs used by the point-band formula.</p></div></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Week</th><th>Drivers</th><th>Full records</th><th>Coverage</th><th>Missing FICO</th></tr></thead><tbody>
        {quality.weeks.map((week)=><tr key={week.weekLabel}><td><b>{week.weekLabel}</b></td><td>{week.rows}</td><td>{week.full}</td><td><div className="gov-progress"><i style={{width:`${week.averageCoverage}%`}}/></div><b>{week.averageCoverage}%</b></td><td>{week.ficoMissing}</td></tr>)}
      </tbody></table></div>
    </section>}

    {tab === "imports" && <section className="panel">
      <div className="panel-head"><div><h2>Import health</h2><p>Recent source ingestion and parser status.</p></div><span className="panel-badge">{imports.length}</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>File</th><th>Detected type</th><th>Status</th><th>Period</th><th>Imported</th><th>Error</th></tr></thead><tbody>
        {imports.map((item)=><tr key={item.id}><td><b>{item.file_name}</b></td><td>{item.detected_report_type||"—"}</td><td><span className={`gov-status ${item.status==="complete"?"good":"bad"}`}>{item.status}</span></td><td>{item.period_start||"—"} → {item.period_end||"—"}</td><td>{new Date(item.created_at).toLocaleString("en-GB")}</td><td>{item.error_message||"—"}</td></tr>)}
      </tbody></table></div>
    </section>}
  </div>;
}
