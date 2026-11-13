"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

// DLS4-only report; driver names resolve across the organization because away-team drivers retain their home site.
function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const split = (line) => {
    const cells = []; let value = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (c === "," && !quoted) { cells.push(value.trim()); value = ""; }
      else value += c;
    }
    cells.push(value.trim());
    return cells;
  };
  const headers = split(lines.shift() || "").map((h) => h.toLowerCase());
  const index = (name) => headers.indexOf(name.toLowerCase());
  for (const name of ["Date", "Transporter ID", "Packages Delivered", "SWC-POD"]) {
    if (index(name) < 0) throw new Error("Missing CSV column: " + name);
  }
  const entries = lines.map((line) => {
    const c = split(line);
    const report_date = c[index("Date")];
    const transporter_id = (c[index("Transporter ID")] || "").toUpperCase();
    const packages_delivered = Number(c[index("Packages Delivered")]);
    const rawPod = (c[index("SWC-POD")] || "").replace("%", "").trim();
    const pod_percent = rawPod === "" ? null : Number(rawPod);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report_date) || !transporter_id ||
        !Number.isInteger(packages_delivered) || packages_delivered < 0 ||
        (pod_percent !== null && (!Number.isFinite(pod_percent) || pod_percent < 0 || pod_percent > 100))) {
      throw new Error("Invalid row for transporter " + (transporter_id || "unknown"));
    }
    return { report_date, transporter_id, packages_delivered, pod_percent };
  });
  if (!entries.length) throw new Error("The CSV contains no drivers.");
  if (new Set(entries.map((e) => e.report_date)).size !== 1) throw new Error("Import one report date at a time.");
  if (new Set(entries.map((e) => e.transporter_id)).size !== entries.length) throw new Error("Duplicate Transporter IDs in the CSV.");
  return entries;
}

export default function Dls4PodYesterday({ organizationId }) {
  const [rows, setRows] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef(null);
  const imageRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  async function reload() {
    if (!organizationId) return;
    const client = getSupabaseBrowserClient();
    const [report, roster] = await Promise.all([
      client.from("dls4_pod_daily").select("report_date,transporter_id,packages_delivered,pod_percent").eq("organization_id", organizationId).order("report_date", { ascending: false }).limit(1500),
      client.from("drivers").select("trid,full_name,site").eq("organization_id", organizationId),
    ]);
    if (report.error) throw report.error;
    if (roster.error) throw roster.error;
    setRows(report.data || []);
    setDrivers(roster.data || []);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    reload().catch((e) => { if (active) setError(e.message || "Could not load POD data."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId]);

  const dates = useMemo(() => [...new Set(rows.map((r) => r.report_date))].sort().reverse(), [rows]);
  const selectedDate = dates.includes(date) ? date : (dates[0] || "");
  const names = useMemo(() => new Map(drivers.map((d) => [String(d.trid || "").trim().toUpperCase(), d.full_name])), [drivers]);
  const report = useMemo(() => rows.filter((r) => r.report_date === selectedDate).map((r) => ({
    ...r, name: names.get(String(r.transporter_id).toUpperCase()) || r.transporter_id,
  })).sort((a, b) => (a.pod_percent ?? 101) - (b.pod_percent ?? 101) || a.name.localeCompare(b.name)), [rows, selectedDate, names]);
  const avg = report.filter((r) => r.pod_percent !== null);
  const mean = avg.length ? avg.reduce((sum, r) => sum + Number(r.pod_percent), 0) / avg.length : null;

  async function importFile(file) {
    if (!file || !organizationId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!/DLS4/i.test(file.name)) throw new Error("For safety, use a DLS4 Quality Overview CSV filename.");
      const parsed = parseCsv(await file.text());
      const client = getSupabaseBrowserClient();
      const reportDate = parsed[0].report_date;
      const { data: existing, error: existingError } = await client.from("dls4_pod_daily").select("transporter_id").eq("organization_id", organizationId).eq("report_date", reportDate);
      if (existingError) throw existingError;
      if ((existing || []).some((r) => !parsed.some((p) => p.transporter_id === r.transporter_id))) {
        throw new Error("This date already contains other drivers. Import cancelled to avoid mixing two reports.");
      }
      const { error: saveError } = await client.from("dls4_pod_daily").upsert(parsed.map((r) => ({ ...r, organization_id: organizationId })), { onConflict: "organization_id,report_date,transporter_id" });
      if (saveError) throw saveError;
      await reload();
      setDate(reportDate);
      setNotice(parsed.length + " drivers imported for " + reportDate + ".");
    } catch (e) { setError(e.message || "Import failed."); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function saveImage() {
    if (!report.length || !imageRef.current) return;
    setExporting(true); setError("");
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(imageRef.current, { pixelRatio: 3, backgroundColor: "#ffffff", cacheBust: true });
      const a = document.createElement("a");
      a.href = url; a.download = "DLS4_POD_" + selectedDate + ".png";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setError(e.message || "Could not save the image."); }
    finally { setExporting(false); }
  }

  if (loading) return <div className="panel">Loading DLS4 POD report…</div>;
  return <section style={{ padding: "22px", maxWidth: 1120, margin: "0 auto", color: "#15283d" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
      <div><small style={{ color: "#64748b", fontWeight: 800 }}>DLS4 · DAILY QUALITY</small><h1 style={{ margin: "5px 0" }}>POD Yesterday</h1><p style={{ margin: 0, color: "#64748b" }}>All drivers · lowest SWC-POD first · one WhatsApp image</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select aria-label="Report date" value={selectedDate} onChange={(e) => setDate(e.target.value)}>{dates.length ? dates.map((d) => <option key={d} value={d}>{d}</option>) : <option value="">No reports</option>}</select>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <button className="btn primary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Importing…" : "Import DLS4 CSV"}</button>
        <button className="btn" disabled={!report.length || exporting} onClick={saveImage}>{exporting ? "Saving…" : "Save Image"}</button>
      </div>
    </header>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {notice && <p role="status" style={{ color: "#047857" }}>{notice}</p>}
    <div ref={imageRef} style={{ background: "#fff", padding: "14px 14px", borderRadius: 12, border: "1px solid #dce5ef", width: "100%", maxWidth: 450, margin: "0 auto", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", borderBottom: "3px solid #15283d", paddingBottom: 9, marginBottom: 8 }}>
        <div><div style={{ fontSize: 13, color: "#64748b", fontWeight: 800 }}>DLS4 · DCSL</div><h2 style={{ fontSize: 22, margin: "3px 0 0" }}>POD Daily Ranking</h2><div style={{ fontSize: 11, color: "#64748b" }}>Report date: {selectedDate || "—"}</div></div>
        <div style={{ textAlign: "right" }}><b style={{ fontSize: 20 }}>{report.length}</b><div style={{ fontSize: 12 }}>Drivers</div><b style={{ fontSize: 15 }}>{mean === null ? "—" : mean.toFixed(2) + "%"}</b><div style={{ fontSize: 12 }}>Unweighted average</div></div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead><tr style={{ background: "#eaf0f7", textAlign: "left" }}><th style={{ padding: "6px 5px", width: 22 }}>#</th><th style={{ padding: "6px 5px" }}>Driver</th><th style={{ padding: "6px 5px", textAlign: "right", width: 78 }}>SWC-POD</th></tr></thead>
        <tbody>{report.map((r, i) => <tr key={r.transporter_id} style={{ background: i % 2 ? "#f7f9fc" : "#fff", borderBottom: "1px solid #e6edf4" }}>
          <td style={{ padding: "6px 5px", fontWeight: 700 }}>{i + 1}</td><td style={{ padding: "6px 5px", fontWeight: 700 }}>{r.name}</td><td style={{ padding: "6px 5px", textAlign: "right", fontWeight: 800, color: r.pod_percent === null ? "#64748b" : Number(r.pod_percent) < 99 ? "#b91c1c" : "#166534" }}>{r.pod_percent === null ? "—" : Number(r.pod_percent).toFixed(2) + "%"}</td>
        </tr>)}</tbody>
      </table>
      {!report.length && <p style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Import a DLS4 Quality Overview CSV to create the daily ranking.</p>}
      <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 10 }}>Source: Amazon Quality Overview · SWC-POD · Sorted ascending · All reported drivers</p>
    </div>
  </section>;
}
