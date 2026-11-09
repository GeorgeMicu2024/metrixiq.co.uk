"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { applyNdnrDriverAssignments, findNdnrDriverSuggestions, groupNdnrByRoute, matchNdnrParcels, parseNdnrReport } from "../../lib/ndnr/ndnrMatching.mjs";
import { createNdnrPng } from "../../lib/ndnr/ndnrPngExport.mjs";
import "./NdnrView.css";

const normalizedHeader = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const validHeader = value => ["SCANNABLEID", "TRACKINGID", "TRACKINGNUMBER"].includes(normalizedHeader(value));

async function workbookRows(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const rows = [];
  for (const name of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: "", raw: false });
    const at = matrix.findIndex(row => row.some(validHeader));
    if (at < 0) continue;
    const headers = matrix[at].map(String);
    for (const row of matrix.slice(at + 1)) {
      if (!row.some(value => String(value || "").trim())) continue;
      rows.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
    }
  }
  return rows;
}

function displayDateTime(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/);
  return match ? `${match[3]}/${match[2]}/${match[1]}${match[4] ? " " + match[4] : ""}` : "—";
}

function stateLabel(state) {
  return state === "returned" ? "RTS scanned" : state === "review" ? "Check scan time" : "Awaiting return";
}

export default function NdnrView({ organizationId, siteFilter = "all", drivers = [] }) {
  const [screenshot, setScreenshot] = useState(null);
  const [reportText, setReportText] = useState("");
  const [packageFiles, setPackageFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [csvCount, setCsvCount] = useState(0);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [hiddenKeys, setHiddenKeys] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  const [routeAssignments, setRouteAssignments] = useState({});
  const [editingRoute, setEditingRoute] = useState("");
  const [driverDraft, setDriverDraft] = useState("");
  const [masterDrivers, setMasterDrivers] = useState([]);
  const [directoryError, setDirectoryError] = useState("");
  const ocrToken = useRef(0);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let active = true;
    if (!organizationId) { setMasterDrivers([]); return; }
    setDirectoryError("");
    supabase.from("drivers").select("trid,full_name,site").eq("organization_id", organizationId)
      .order("full_name", { ascending: true }).limit(2000)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setDirectoryError("Driver Master suggestions unavailable. You can still type a name manually."); setMasterDrivers([]); }
        else setMasterDrivers(data || []);
      });
    return () => { active = false; };
  }, [organizationId, supabase]);
  const report = useMemo(() => parseNdnrReport(reportText), [reportText]);
  const hidden = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  const assignedRows = useMemo(() => applyNdnrDriverAssignments(rows, routeAssignments), [rows, routeAssignments]);
  const groups = useMemo(() => groupNdnrByRoute(assignedRows), [assignedRows]);
  const driverSuggestions = useMemo(() => {
    const unique = new Map();
    for (const item of [...masterDrivers, ...drivers, ...rows]) {
      const name = String(item.full_name || item.name || item.driver_name || "").trim();
      if (!name || name === "Unassigned driver") continue;
      const site = String(item.site || "").trim().toUpperCase();
      const key = name.toUpperCase();
      if (!unique.has(key)) unique.set(key, { name, site });
    }
    return [...unique.values()];
  }, [masterDrivers, drivers, rows]);
  const suggestedDrivers = useMemo(() => findNdnrDriverSuggestions(driverSuggestions, driverDraft), [driverSuggestions, driverDraft]);
  const displayed = useMemo(() => groups.filter(group => hidden.has(group.key) === showHidden).map(group => ({
    ...group, parcels: group.parcels.filter(row => (filter === "all" || row.state === filter) &&
      [row.tracking_id, row.route_code, row.driver_name, row.status, row.reason].join(" ").toLowerCase().includes(search.toLowerCase())),
  })).filter(group => group.parcels.length), [groups, hidden, showHidden, filter, search]);
  const visibleForExport = displayed.flatMap(group => group.parcels);
  const returned = rows.filter(row => row.state === "returned").length;
  const review = rows.filter(row => row.state === "review").length;
  const awaiting = rows.length - returned - review;
  const matchedCsv = rows.filter(row => row.status !== "Not found in CSV").length;

  async function handleScreenshot(file) {
    const token = ++ocrToken.current;
    setScreenshot(file || null);
    setReportText(""); setRows([]); setRouteAssignments({}); setEditingRoute(""); setError(""); setMessage("");
    if (!file) return;
    setOcrBusy(true); setOcrProgress(0);
    let worker;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", 1, { logger: event => {
        if (event.status === "recognizing text" && token === ocrToken.current) setOcrProgress(Math.round((event.progress || 0) * 100));
      } });
      const { data } = await worker.recognize(file);
      if (token !== ocrToken.current) return;
      setReportText(data.text || "");
      const count = parseNdnrReport(data.text).parcels.length;
      setMessage(count ? `Screenshot read: ${count} unique UK IDs. Review the detected count before checking returns.` : "No UK IDs detected. Open 'Review OCR text' and paste or correct the Slack message.");
    } catch (caught) {
      if (token === ocrToken.current) setError(`Could not read screenshot: ${caught.message || "OCR unavailable"}. Paste the Slack text below instead.`);
    } finally {
      if (worker) await worker.terminate();
      if (token === ocrToken.current) { setOcrBusy(false); setOcrProgress(null); }
    }
  }

  function editReport(text) {
    ++ocrToken.current;
    setReportText(text); setRows([]); setRouteAssignments({}); setEditingRoute(""); setError(""); setMessage("");
    setOcrBusy(false); setOcrProgress(null);
  }

  async function runCheck() {
    if (!report.parcels.length || !packageFiles.length) { setError("Add a Slack screenshot or paste its text, and select a Packages CSV."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const packageRows = (await Promise.all(packageFiles.map(workbookRows))).flat();
      if (!packageRows.length) throw new Error("No package table found. The CSV must contain a Scannable Id or Tracking ID column.");
      const names = new Map(drivers.map(driver => [
        String(driver.trid || driver.transporter_id || driver.rawData?.trid || "").toUpperCase(),
        String(driver.full_name || driver.name || driver.driver_name || "").trim(),
      ]).filter(([id, name]) => id && name));
      const next = matchNdnrParcels(report, packageRows, names);
      setRows(next); setCsvCount(packageRows.length); setHiddenKeys([]); setShowHidden(false); setSearch(""); setFilter("all"); setRouteAssignments({}); setEditingRoute("");
      const confirmed = next.filter(row => row.state === "returned").length;
      setMessage(`${next.length} NDNR parcels checked: ${confirmed} returned with RTS scan + timestamp; ${next.length - confirmed} still need checking.`);
    } catch (caught) { setError(caught.message || "Unable to match packages."); }
    finally { setBusy(false); }
  }

  async function exportPng() {
    if (!visibleForExport.length || exportBusy) return;
    setExportBusy(true); setError("");
    try {
      const site = siteFilter === "all" ? "ALL SITES" : siteFilter;
      const blob = await createNdnrPng(visibleForExport, { site, reportDate: report.generatedDate });
      const filename = `${site.replace(/\s+/g, "_")}_NDNR_Return_Check_${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" })}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${site} NDNR returns` });
          setMessage("PNG ready. On iPhone, select Save Image or Save to Files.");
          return;
        } catch (caught) { if (caught?.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage("NDNR PNG downloaded with the visible parcels only.");
    } catch (caught) { setError(caught.message || "Unable to export PNG."); }
    finally { setExportBusy(false); }
  }

  function clearAll() {
    ++ocrToken.current;
    setScreenshot(null); setReportText(""); setPackageFiles([]); setRows([]); setCsvCount(0);
    setHiddenKeys([]); setShowHidden(false); setRouteAssignments({}); setEditingRoute(""); setError(""); setMessage(""); setOcrBusy(false); setOcrProgress(null);
  }

  function startDriverAssignment(route) {
    setEditingRoute(route);
    setDriverDraft(routeAssignments[route] || "");
  }

  function saveDriverAssignment(event) {
    event.preventDefault();
    const name = driverDraft.trim().replace(/\s+/g, " ");
    if (!name || !editingRoute) return;
    setRouteAssignments(current => ({ ...current, [editingRoute]: name }));
    setHiddenKeys([]); setShowHidden(false);
    setMessage(`${editingRoute} assigned to ${name} for this NDNR report only. Amazon's original CSV remains unchanged.`);
    setEditingRoute(""); setDriverDraft("");
  }

  function clearDriverAssignment(route) {
    setRouteAssignments(current => { const next = { ...current }; delete next[route]; return next; });
    setHiddenKeys([]); setShowHidden(false); setEditingRoute("");
  }

  return <main className="ndnr-page">
    <header className="ndnr-heading"><div><h1>NDNR Investigation</h1><p>Not Delivered, Not Received · Match Slack reports with Amazon return scans</p></div>
      <button className="ndnr-export" type="button" disabled={!visibleForExport.length || exportBusy || busy} onClick={exportPng}>{exportBusy ? "Creating PNG…" : "↓ Export PNG"}</button>
    </header>
    <section className="ndnr-uploads">
      <div className="ndnr-card ndnr-upload-card"><h2><span>1</span> Slack Screenshot</h2><p>Upload Amazon's evening NDNR report (PNG, JPG) or paste its text.</p>
        <label className="ndnr-drop"><strong>☁ &nbsp; Choose screenshot</strong><small>{screenshot?.name || "Photo or snip from Slack"}</small><input type="file" accept="image/png,image/jpeg,image/webp,image/*" onChange={event => handleScreenshot(event.target.files?.[0] || null)} /></label>
        {ocrBusy && <div className="ndnr-progress"><span>Reading screenshot… {ocrProgress == null ? "" : `${ocrProgress}%`}</span><progress max="100" value={ocrProgress ?? 0} /></div>}
        <div className="ndnr-extraction"><strong>{report.parcels.length} UK IDs detected</strong><small>{report.generatedDate ? `Report ${report.generatedDate}` : "No report date detected"}</small></div>
        <details className="ndnr-review"><summary>Review OCR text / paste Slack report</summary><textarea value={reportText} onChange={event => editReport(event.target.value)} rows={8} placeholder="Paste the NDNR report from Slack here, including Route lines and UK tracking numbers…" /></details>
        {report.warnings.map((warning, index) => <div className="ndnr-warning" key={index}>{warning}</div>)}
      </div>
      <div className="ndnr-card ndnr-upload-card"><h2><span>2</span> Packages / Route CSV</h2><p>Select Amazon Packages exports for the same day. Multiple CSV/XLSX files are supported.</p>
        <label className="ndnr-drop"><strong>▣ &nbsp; Choose package files</strong><small>{packageFiles.length ? packageFiles.map(file => file.name).join(", ") : "CSV, XLS or XLSX"}</small><input type="file" accept=".csv,.xls,.xlsx" multiple onChange={event => { setPackageFiles(Array.from(event.target.files || [])); setRows([]); setRouteAssignments({}); setEditingRoute(""); }} /></label>
        <div className="ndnr-check-help"><b>Return scan rule</b><p>Amazon status <strong>Returned to station</strong> + scan timestamp = <strong>RTS scanned</strong>. Otherwise the parcel stays open.</p></div>
      </div>
      <div className="ndnr-card ndnr-run-card"><h2>3. Check Returns</h2><p>Match UK tracking IDs, route codes, drivers and their last Amazon scan.</p>
        <button className="ndnr-primary" type="button" onClick={runCheck} disabled={ocrBusy || busy || !report.parcels.length || !packageFiles.length}>{busy ? "Matching…" : "↻ Match & Check Returns"}</button>
        <button className="ndnr-clear" type="button" onClick={clearAll}>Clear uploaded files</button>
        <small>Files stay in this browser session. Nothing is changed in CHECK LOR or other modules.</small>
      </div>
    </section>

    {error && <div className="ndnr-notice error" role="alert">{error}</div>}
    {message && <div className="ndnr-notice" role="status">{message}</div>}
    <section className="ndnr-summary">
      <div><small>NDNR parcels</small><strong>{rows.length}</strong><span>From Slack report</span></div>
      <div className="ndnr-green"><small>RTS scanned ✓</small><strong>{returned}</strong><span>Amazon status + timestamp</span></div>
      <div className="ndnr-amber"><small>Awaiting return</small><strong>{awaiting}</strong><span>No RTS scan found</span></div>
      <div className="ndnr-rose"><small>Need review</small><strong>{review}</strong><span>RTS without scan time</span></div>
    </section>
    <div className="ndnr-evidence">ⓘ A parcel counts as returned only when its latest Amazon CSV status is Returned to station and the scan time is present. Matched {matchedCsv}/{rows.length || 0} packages in {csvCount} CSV rows.</div>

    <section className="ndnr-card ndnr-results"><div className="ndnr-result-head"><h2>NDNR Results <span>({rows.length})</span></h2><div className="ndnr-filters"><input type="search" aria-label="Search NDNR parcels" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search driver, route, UK number…" />
      <select aria-label="Filter NDNR status" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="awaiting">Awaiting return</option><option value="returned">RTS scanned</option><option value="review">Needs review</option></select></div></div>
      <div className="ndnr-display-tools"><button type="button" onClick={() => setShowHidden(value => !value)} disabled={!hiddenKeys.length && !showHidden}>{showHidden ? "Show active" : `Hidden (${hiddenKeys.length})`}</button><small>Hide excludes a driver from this screen and PNG only; Restore brings them back.</small></div>
      {displayed.map(group => <section className="ndnr-route" key={group.key}>
        <header><div><strong>{group.route} · {group.driver}</strong><small>{group.parcels.length} parcels{group.parcels.some(parcel => parcel.driver_assigned) ? " · Manually assigned for this report" : group.parcels.some(parcel => parcel.driver_inferred) ? " · Some driver names inferred from route" : ""}</small></div>
          <div className="ndnr-route-actions">
            {(group.driver === "Unassigned driver" || group.parcels.some(parcel => parcel.driver_assigned || parcel.driver_inferred)) && <button type="button" onClick={() => startDriverAssignment(group.route)}>{routeAssignments[group.route] ? "Edit driver" : "Assign driver"}</button>}
            {routeAssignments[group.route] && <button type="button" onClick={() => clearDriverAssignment(group.route)}>Reset</button>}
            <button type="button" onClick={() => setHiddenKeys(keys => hidden.has(group.key) ? keys.filter(k => k !== group.key) : [...keys, group.key])}>{showHidden ? "Restore" : "Hide"}</button>
          </div></header>
        {editingRoute === group.route && <form className="ndnr-assign-form" onSubmit={saveDriverAssignment}>
          <label htmlFor="ndnr-assigned-name">Driver for {group.route}</label>
          <div className="ndnr-driver-search"><input id="ndnr-assigned-name" value={driverDraft} onChange={event => setDriverDraft(event.target.value)} autoComplete="off" placeholder="Search first name or surname" autoFocus />
            {suggestedDrivers.length > 0 && <div className="ndnr-driver-options" role="listbox" aria-label="Drivers from Driver Master">
              {suggestedDrivers.map(driver => <button key={`${driver.name}|${driver.site}`} type="button" role="option" aria-selected={driverDraft === driver.name} onClick={() => setDriverDraft(driver.name)}><strong>{driver.name}</strong>{driver.site && <small>{driver.site}</small>}</button>)}
            </div>}
          </div>
          <button type="submit" disabled={!driverDraft.trim()}>Save driver</button>
          <button type="button" onClick={() => setEditingRoute("")}>Cancel</button>
          <small>{directoryError || "Suggestions include all drivers in your organisation, across stations. Assignment applies to this report only."}</small>
        </form>}
        <div className="ndnr-table-wrap"><table><thead><tr><th>Tracking ID</th><th>CSV status</th><th>Last scan</th><th>Return check</th></tr></thead><tbody>
          {group.parcels.map(parcel => <tr key={parcel.tracking_id}><td data-label="Tracking ID"><b>{parcel.tracking_id}</b>{parcel.route_mismatch && <small className="ndnr-mismatch">Route differs from CSV ({parcel.csv_route})</small>}</td><td data-label="CSV status">{parcel.status}</td><td data-label="Last scan">{displayDateTime(parcel.last_scan)}</td><td data-label="Return check"><span className={`ndnr-badge ${parcel.state}`}>{stateLabel(parcel.state)}</span></td></tr>)}
        </tbody></table></div>
      </section>)}
      {!displayed.length && <div className="ndnr-empty">{rows.length ? "No parcels match the selected filters." : "Upload the Slack report and Packages CSV to check NDNR parcels by route and driver."}</div>}
    </section>
  </main>;
}
