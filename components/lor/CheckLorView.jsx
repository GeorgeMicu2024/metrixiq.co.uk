"use client";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import "./CheckLorView.css";

const clean = value => String(value ?? "").trim();
const norm = value => clean(value).toUpperCase();
const tracking = value => norm(value).replace(/[^A-Z0-9]/g, "");
const dateOnly = value => clean(value).slice(0, 10);
const readWorkbook = async file => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  return workbook.SheetNames.flatMap(name => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false });
    const headerIndex = rows.findIndex(row => row.some(cell => ["TRACKINGID", "SCANNABLEID", "TRACKINGNUMBER"].includes(norm(cell).replace(/[^A-Z0-9]/g, ""))));
    if (headerIndex < 0) return [];
    const headers = rows[headerIndex].map(clean);
    return rows.slice(headerIndex + 1).filter(row => row.some(clean)).map(row =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
    );
  });
};
function pick(row, aliases) {
  const columns = Object.keys(row);
  const key = columns.find(k => aliases.some(a => norm(k).replace(/[^A-Z0-9]/g, "") === a));
  return key ? row[key] : "";
}
const fields = {
  tracking: ["TRACKINGID", "SCANNABLEID", "TRACKINGNUMBER"],
  trid: ["TRANSPORTERID", "DRIVERID"],
  name: ["TRANSPORTERNAME", "ASSOCIATENAME", "DRIVERNAME"],
  status: ["PACKAGESTATUS", "ACTUALSTATUSCODE", "LASTSHIPMENTSTATUS"],
  reason: ["REASONCODE", "LASTDELIVERYATTEMPTREASON"],
  scan: ["TIMEOFLASTSCAN", "LASTDRIVERSCAN"],
  route: ["ROUTECODE", "ROUTE"],
  site: ["STATION", "SITE", "STATIONCODE"],
};
const value = (row, field) => clean(pick(row, fields[field]));
const badge = verdict => verdict === "confirmed-return" ? "green" : verdict === "confirmed-loss" ? "red" : verdict === "investigation" ? "red" : "amber";
const verdictLabel = { "confirmed-return": "Station scan confirmed", "confirmed-loss": "Confirmed loss", "investigation": "Investigation", "station-check": "Needs station check" };
const statusIsRts = status => /RETURNED TO STATION|RETURN TO STATION/.test(norm(status));
const dateSort = item => Date.parse(item.scan) || 0;

export default function CheckLorView({ organizationId, siteFilter = "all", drivers = [], canManage = false }) {
  const [riskFile, setRiskFile] = useState(null);
  const [csvFiles, setCsvFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [saved, setSaved] = useState([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState("station-check");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewReady, setReviewReady] = useState(false);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let active = true;
    if (!organizationId) return;
    supabase.from("lor_investigations").select("*").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(1500)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError("History unavailable: " + loadError.message);
        else setSaved(data || []);
      });
    return () => { active = false; };
  }, [organizationId, supabase]);

  const driverByTrid = useMemo(() => new Map(drivers.map(d => [norm(d.id || d.trid), d.name]).filter(pair => pair[0])), [drivers]);
  const current = results.find(r => r.tracking_id === selected);
  const currentHistory = saved.filter(r => current && (r.transporter_id === current.transporter_id || r.tracking_id === current.tracking_id));
  const filtered = results.filter(r =>
    (filter === "all" || r.verdict === filter) &&
    [r.driver_name, r.tracking_id, r.reason, r.transporter_id].join(" ").toLowerCase().includes(query.toLowerCase())
  );
  const counts = {
    risk: results.length,
    rts: results.filter(r => r.route_status === "Returned to station").length,
    noRts: results.filter(r => r.route_status !== "Returned to station").length,
    verified: results.filter(r => r.verdict === "confirmed-return").length,
    drivers: new Set(results.map(r => r.transporter_id).filter(Boolean)).size,
  };

  async function runCheck() {
    if (!riskFile || !csvFiles.length) { setError("Upload an Amazon LOR report and at least one Packages CSV."); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const riskRows = await readWorkbook(riskFile);
      const packageRows = (await Promise.all(csvFiles.map(readWorkbook))).flat();
      const packageMap = new Map();
      for (const row of packageRows) {
        const id = tracking(value(row, "tracking"));
        if (!id) continue;
        const entry = { status: value(row, "status"), reason: value(row, "reason"), scan: value(row, "scan"), route: value(row, "route"), trid: value(row, "trid"), site: value(row, "site") };
        packageMap.set(id, [...(packageMap.get(id) || []), entry]);
      }
      const unique = new Map();
      for (const row of riskRows) {
        const id = tracking(value(row, "tracking"));
        if (!/^UK[A-Z0-9]+$/.test(id)) continue;
        const riskTrid = norm(value(row, "trid"));
        const matches = (packageMap.get(id) || []).sort((a,b) => dateSort(a) - dateSort(b));
        const latest = matches[matches.length - 1];
        const lastRts = [...matches].reverse().find(m => statusIsRts(m.status));
        const previous = saved.find(s => s.tracking_id === id);
        const trid = riskTrid && riskTrid !== "UNASSIGNED" ? riskTrid : norm(latest?.trid);
        const name = driverByTrid.get(trid) || (value(row, "name") || "Unmatched driver");
        const code = norm(value(row, "site") || latest?.site || siteFilter);
        const result = {
          tracking_id: id, transporter_id: trid, driver_name: name,
          site: code === "ALL" ? "" : code,
          route_code: latest?.route || "",
          last_scan: value(row, "scan") || latest?.scan || "",
          reason: value(row, "reason") || latest?.reason || "",
          amazon_status: value(row, "status") || "MISSING",
          route_status: lastRts ? "Returned to station" : latest?.status || "Not found",
          rts_at: lastRts?.scan || "",
          verdict: previous?.verdict || (lastRts ? "station-check" : "investigation"),
          evidence: matches,
        };
        if (siteFilter === "all" || !code || code === norm(siteFilter)) unique.set(id, result);
      }
      if (!unique.size) throw new Error("No valid UK tracking IDs found. Please check the Amazon report headers.");
      setResults([...unique.values()]); setSelected([...unique.keys()][0]); setReviewReady(true);
      setMessage(unique.size + " risk parcels matched. Route RTS is not proof of a physical station scan.");
    } catch (e) { setError(e.message || "Unable to read files."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!current) return;
    setDecision(current.verdict);
    setNote(saved.find(r => r.tracking_id === current.tracking_id)?.manager_note || "");
  }, [selected, results]);

  async function saveDecision() {
    if (!current || !organizationId || !canManage) return;
    if (!current.site && siteFilter === "all") { setError("Select a specific site before saving this investigation."); return; }
    setLoading(true); setError(""); setMessage("");
    const record = {
      organization_id: organizationId, site: current.site || (siteFilter !== "all" ? siteFilter : null),
      tracking_id: current.tracking_id, transporter_id: current.transporter_id || null,
      driver_name: current.driver_name, route_code: current.route_code || null,
      risk_scan_at: current.last_scan || null, amazon_status: current.amazon_status,
      route_status: current.route_status, route_rts_at: current.rts_at || null,
      verdict: decision, manager_note: note.trim(), updated_at: new Date().toISOString()
    };
    const { data, error: saveError } = await supabase.from("lor_investigations")
      .upsert(record, { onConflict: "organization_id,tracking_id" }).select().single();
    if (saveError) setError("Could not save: " + saveError.message);
    else {
      setSaved(old => [data, ...old.filter(r => r.tracking_id !== data.tracking_id)]);
      setResults(old => old.map(r => r.tracking_id === data.tracking_id ? { ...r, verdict: decision } : r));
      setMessage("Investigation saved. Raw uploads are not stored.");
    }
    setLoading(false);
  }

  function clearUploads() {
    setRiskFile(null); setCsvFiles([]); setResults([]); setSelected(""); setReviewReady(false);
    setMessage("Temporary source files cleared from this session.");
  }

  return <main className="lor-page">
    <div className="lor-heading"><h1>CHECK LOR</h1><p>Lost on Road Investigation • Match Amazon reports with route exports</p></div>
    <section className="lor-uploads">
      <div className="lor-card"><h3><span className="lor-file-icon">X</span> 1. Amazon LOR Risk Report</h3><p>Upload the Amazon Lost on Road risk report (.xlsx, .xls, .csv)</p>
        <label className="lor-drop">☁ &nbsp; Drag & drop or choose report<input type="file" accept=".xlsx,.xls,.csv" onChange={e => { setRiskFile(e.target.files?.[0] || null); setReviewReady(false); }} /></label>
        <div className="lor-uploaded">{riskFile ? "✓ " + riskFile.name : "No file selected"}</div></div>
      <div className="lor-card"><h3><span className="lor-file-icon blue">CSV</span> 2. Packages / Route CSVs</h3><p>Upload one or more Packages CSV exports for the relevant dates</p>
        <label className="lor-drop">☁ &nbsp; Choose multiple CSV files<input type="file" accept=".csv,.xlsx,.xls" multiple onChange={e => { setCsvFiles(Array.from(e.target.files || [])); setReviewReady(false); }} /></label>
        <div className="lor-uploaded">{csvFiles.length ? csvFiles.length + " files selected" : "No CSV files selected"}</div></div>
      <div className="lor-card lor-actions"><p className="lor-info">ⓘ Temporary files are processed in this browser. Only reviewed results are saved.</p>
        <button className="lor-primary" onClick={runCheck} disabled={loading || !riskFile || !csvFiles.length}>{loading ? "Checking…" : "▶ Run LOR Check"}</button>
        <button className="lor-secondary" onClick={clearUploads}>Clear uploaded files</button></div>
    </section>
    {error && <div className="lor-alert error" role="alert">{error}</div>}
    {message && <div className="lor-alert">{message}</div>}
    <section className="lor-kpis">
      {[["⚠",counts.risk,"At risk","red"],["▣",counts.rts,"RTS in exports","green"],["!",counts.noRts,"No RTS in exports","amber"],["✓",counts.verified,"Confirmed station scans","green"],["♙",counts.drivers,"Drivers linked","blue"]].map(([symbol,number,label,tone]) =>
        <div className={"lor-kpi "+tone} key={label}><span>{symbol}</span><strong>{number}</strong><small>{label}</small></div>)}
    </section>
    <div className="lor-columns">
      <section className="lor-card lor-results"><div className="lor-section-title"><h2>LOR Investigation Results ({results.length})</h2><input aria-label="Search investigation" placeholder="Search driver, tracking ID or reason…" value={query} onChange={e=>setQuery(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option><option value="station-check">Needs station check</option><option value="investigation">Investigation</option><option value="confirmed-return">Confirmed return</option><option value="confirmed-loss">Confirmed loss</option></select></div>
        <div className="lor-table-scroll"><table><thead><tr><th>Driver</th><th>Tracking ID</th><th>Last attempt</th><th>Route CSV status</th><th>Station scan</th><th>Verdict</th><th>Actions</th></tr></thead><tbody>
          {filtered.map(r => <tr key={r.tracking_id} className={selected===r.tracking_id?"selected":""}><td><b>{r.driver_name}</b></td><td className="lor-tracking">{r.tracking_id}</td><td>{r.reason || "—"}</td><td><span className={"lor-pill "+(r.route_status==="Returned to station"?"green":"red")}>{r.route_status}</span></td><td>{r.verdict==="confirmed-return"?"Manager confirmed":r.rts_at?"Not confirmed":"Not found"}</td><td><span className={"lor-pill "+badge(r.verdict)}>{verdictLabel[r.verdict]}</span></td><td><button className="lor-small" onClick={()=>setSelected(r.tracking_id)}>View</button></td></tr>)}
          {!filtered.length && <tr><td colSpan="7" className="lor-empty">{reviewReady?"No matching parcels":"Upload reports and run LOR Check to see results."}</td></tr>}
        </tbody></table></div></section>
      <aside className="lor-card lor-history"><h2>◴ Driver LOR History</h2>
        {current ? <><div className="lor-driver-name">{current.driver_name}<small>{current.transporter_id || "Unmatched ID"}</small></div>
        <div className="lor-history-summary">{currentHistory.length} saved investigations • {currentHistory.filter(r=>r.verdict==="confirmed-loss").length} confirmed losses</div>
        <h4>Parcel timeline</h4><div className="lor-timeline">
          <div><b>Amazon status: {current.amazon_status}</b><small>{current.last_scan || "Date unavailable"}</small></div>
          {current.evidence.map((ev,i)=><div key={i}><b>{ev.status || "Unknown scan"} — {ev.reason || "No reason"}</b><small>{ev.scan || "Date unavailable"}</small></div>)}
          {!current.evidence.length && <div><small>No matching CSV history found.</small></div>}
        </div><label>Investigation result<select value={decision} onChange={e=>setDecision(e.target.value)}><option value="station-check">Needs station check</option><option value="investigation">Investigation</option><option value="confirmed-return">Confirmed station return (manual verification)</option><option value="confirmed-loss">Confirmed Lost on Road</option></select></label>
        <label>Manager notes<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Record station evidence or follow-up details…" rows={3}/></label>
        <button className="lor-primary" disabled={!canManage || loading} onClick={saveDecision}>▣ Save investigation result</button>
        {!canManage && <small>Manager permission required to save.</small>}</> : <p>Choose a parcel to view its evidence and driver history.</p>}
      </aside>
    </div>
    <section className="lor-legend"><b>Status legend</b><div><span className="lor-pill green">RTS in export</span> Route status only, not proof of physical return.</div><div><span className="lor-pill green">Confirmed station scan</span> Manager-verified station evidence.</div><div><span className="lor-pill amber">Needs station check</span> Station receipt not confirmed.</div></section>
    <p className="lor-footnote">ⓘ Source files are never uploaded to the server. Clear uploaded files after review. Only investigation records are retained.</p>
  </main>;
}
