"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";

// Site-scoped POD report; names resolve across the organization for away-team drivers.
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
    const rawDcr = index("DCR") < 0 ? "" : (c[index("DCR")] || "").replace("%", "").trim();
    const dcr_percent = rawDcr === "" ? null : Number(rawDcr);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(report_date) || !transporter_id ||
        !Number.isInteger(packages_delivered) || packages_delivered < 0 ||
        (pod_percent !== null && (!Number.isFinite(pod_percent) || pod_percent < 0 || pod_percent > 100)) ||
        (dcr_percent !== null && (!Number.isFinite(dcr_percent) || dcr_percent < 0 || dcr_percent > 100))) {
      throw new Error("Invalid row for transporter " + (transporter_id || "unknown"));
    }
    return { report_date, transporter_id, packages_delivered, pod_percent, dcr_percent };
  });
  if (!entries.length) throw new Error("The CSV contains no drivers.");
  if (new Set(entries.map((e) => e.report_date)).size !== 1) throw new Error("Import one report date at a time.");
  if (new Set(entries.map((e) => e.transporter_id)).size !== entries.length) throw new Error("Duplicate Transporter IDs in the CSV.");
  return entries;
}

export default function Dls4PodYesterday({ organizationId, site = "DLS4", metric = "pod" }) {
  const isDcr = metric === "dcr";
  const metricKey = isDcr ? "dcr_percent" : "pod_percent";
  const metricName = isDcr ? "DCR" : "POD";
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
  const [messageCopied, setMessageCopied] = useState(false);

  async function reload() {
    if (!organizationId) return;
    const client = getSupabaseBrowserClient();
    const [report, roster] = await Promise.all([
      client.from("dls4_pod_daily").select("report_date,transporter_id,packages_delivered,pod_percent,dcr_percent").eq("organization_id", organizationId).eq("site", site).order("report_date", { ascending: false }).limit(1500),
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
  }, [organizationId, site]);

  const dates = useMemo(() => [...new Set(rows.map((r) => r.report_date))].sort().reverse(), [rows]);
  const selectedDate = dates.includes(date) ? date : (dates[0] || "");
  const names = useMemo(() => new Map(drivers.map((d) => [String(d.trid || "").trim().toUpperCase(), d.full_name])), [drivers]);
  const report = useMemo(() => rows.filter((r) => r.report_date === selectedDate).map((r) => ({
    ...r, name: names.get(String(r.transporter_id).toUpperCase()) || r.transporter_id,
  })).sort((a, b) => (a[metricKey] ?? 101) - (b[metricKey] ?? 101) || a.name.localeCompare(b.name)), [rows, selectedDate, names, metricKey]);
  const avg = report.filter((r) => r[metricKey] !== null);
  const mean = avg.length ? avg.reduce((sum, r) => sum + Number(r[metricKey]), 0) / avg.length : null;

  const belowTarget = avg.filter((r) => Number(r.pod_percent) < 100).length;
  const podMessage = report.length ? (isDcr ? [
    "📦 *DCR Yesterday – " + site + "*",
    "",
    "Average DCR: *" + (mean === null ? "N/A" : mean.toFixed(2) + "%") + "* (" + selectedDate + ").",
    "*" + belowTarget + " of " + avg.length + " drivers* scored below 100% DCR.",
    "",
    "Please aim for *100% DCR*:",
    "• Follow the delivery instructions and confirm the correct address.",
    "• Reattempt unsuccessful deliveries whenever possible.",
    "• Contact the customer using the app when appropriate.",
    "• Use the correct delivery status and return undelivered parcels to the depot.",
    "• Never mark a parcel as delivered unless it was delivered.",
    "",
    "*Let’s improve our delivery completion today!* 💪",
  ] : [
    "📸 *POD Yesterday – " + site + "*",
    "",
    "Yesterday's average POD was *" + (mean === null ? "N/A" : mean.toFixed(2) + "%") + "* (" + selectedDate + ").",
    "*" + belowTarget + " of " + report.length + " drivers* scored below 100% POD.",
    "",
    "Please aim for *100% POD* every day:",
    "• Make sure the parcel is clearly visible.",
    "• Avoid blurry or dark photos.",
    "• Take the photo at the delivery location, never inside the van.",
    "• Step back to show the parcel and its surroundings.",
    "• Check the picture and retake it if needed.",
    "",
    "*Every photo matters. Let's improve today!* 💪",
  ]).join("\n") : "";

  async function copyPodMessage() {
    if (!podMessage) return;
    try {
      await navigator.clipboard.writeText(podMessage);
      setMessageCopied(true);
      setNotice(metricName + " message copied. Paste it into WhatsApp.");
      setError("");
    } catch {
      setMessageCopied(false);
      setError("Copy was blocked by the browser. Select and copy the message below.");
    }
  }

  async function importFile(file) {
    if (!file || !organizationId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!file.name.toUpperCase().includes(site.toUpperCase())) throw new Error("The CSV filename must contain the selected site: " + site);
      const parsed = parseCsv(await file.text());
      if (isDcr && parsed.every((r) => r.dcr_percent === null)) throw new Error("No DCR values found in this CSV.");
      const client = getSupabaseBrowserClient();
      const reportDate = parsed[0].report_date;
      const { data: existing, error: existingError } = await client.from("dls4_pod_daily").select("transporter_id").eq("organization_id", organizationId).eq("site", site).eq("report_date", reportDate);
      if (existingError) throw existingError;
      if ((existing || []).some((r) => !parsed.some((p) => p.transporter_id === r.transporter_id))) {
        throw new Error("This date already contains other drivers. Import cancelled to avoid mixing two reports.");
      }
      const { error: saveError } = await client.from("dls4_pod_daily").upsert(parsed.map((r) => ({ ...r, organization_id: organizationId, site })), { onConflict: "organization_id,site,report_date,transporter_id" });
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
      const exportWidth = 580;
      const exportHeight = imageRef.current.scrollHeight;
      const url = await toPng(imageRef.current, {
        pixelRatio: 2,
        width: exportWidth,
        height: exportHeight,
        backgroundColor: "#ffffff",
        cacheBust: true,
        style: { width: exportWidth + "px", maxWidth: "none", minWidth: exportWidth + "px", margin: "0", overflow: "visible" },
      });
      const a = document.createElement("a");
      a.href = url; a.download = site + "_" + metricName + "_" + selectedDate + ".png";
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { setError(e.message || "Could not save the image."); }
    finally { setExporting(false); }
  }

  if (loading) return <div className="panel">Loading daily quality report…</div>;
  return <section style={{ padding: "22px", maxWidth: 1120, margin: "0 auto", color: "#15283d" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
      <div><small style={{ color: "#64748b", fontWeight: 800 }}>{site} · DAILY QUALITY</small><h1 style={{ margin: "5px 0" }}>{metricName} Yesterday</h1><p style={{ margin: 0, color: "#64748b" }}>All drivers · lowest {isDcr ? "DCR" : "SWC-POD"} first · one WhatsApp image</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select aria-label="Report date" value={selectedDate} onChange={(e) => setDate(e.target.value)}>{dates.length ? dates.map((d) => <option key={d} value={d}>{d}</option>) : <option value="">No reports</option>}</select>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <button className="btn primary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Importing…" : "Import {site} CSV"}</button>
        <button className="btn" disabled={!report.length || exporting} onClick={saveImage}>{exporting ? "Saving…" : "Save Image"}</button>
        <button className="btn" disabled={!report.length} onClick={copyPodMessage}>{messageCopied ? "Copy Again" : "Copy {metricName} Message"}</button>
      </div>
    </header>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {notice && <p role="status" style={{ color: "#047857" }}>{notice}</p>}
    {report.length > 0 && <div style={{ maxWidth: 580, margin: "0 auto 14px", padding: 12, background: "#fff", border: "1px solid #dce5ef", borderRadius: 10 }}>
      <div style={{ fontWeight: 800, marginBottom: 7 }}>Daily WhatsApp Message</div>
      <textarea readOnly aria-label="Daily quality WhatsApp message" value={podMessage} onFocus={(e) => e.target.select()} style={{ width: "100%", minHeight: 245, padding: 10, fontSize: 13, lineHeight: 1.5, border: "1px solid #dce5ef", borderRadius: 8, resize: "vertical", boxSizing: "border-box" }} />
    </div>}
    <div ref={imageRef} style={{ background: "#fff", padding: "14px 14px", borderRadius: 12, border: "1px solid #dce5ef", width: "100%", maxWidth: 580, margin: "0 auto", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", borderBottom: "3px solid #15283d", paddingBottom: 9, marginBottom: 8 }}>
        <div><div style={{ fontSize: 13, color: "#64748b", fontWeight: 800 }}>{site} · DCSL</div><h2 style={{ fontSize: 22, margin: "3px 0 0" }}>{metricName} Daily Ranking</h2><div style={{ fontSize: 11, color: "#64748b" }}>Report date: {selectedDate || "—"}</div></div>
        <div style={{ textAlign: "right" }}><b style={{ fontSize: 20 }}>{report.length}</b><div style={{ fontSize: 12 }}>Drivers</div><b style={{ fontSize: 15 }}>{mean === null ? "—" : mean.toFixed(2) + "%"}</b><div style={{ fontSize: 12 }}>Unweighted average</div></div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead><tr style={{ background: "#eaf0f7", textAlign: "left" }}><th style={{ padding: "6px 5px", width: 22 }}>#</th><th style={{ padding: "6px 5px" }}>Driver</th><th style={{ padding: "6px 5px", textAlign: "right", width: 95 }}>{isDcr ? "DCR" : "SWC-POD"}</th></tr></thead>
        <tbody>{report.map((r, i) => <tr key={r.transporter_id} style={{ background: i % 2 ? "#f7f9fc" : "#fff", borderBottom: "1px solid #e6edf4" }}>
          <td style={{ padding: "6px 5px", fontWeight: 700 }}>{i + 1}</td><td style={{ padding: "6px 5px", fontWeight: 700 }}>{r.name}</td><td style={{ padding: "6px 5px", textAlign: "right", fontWeight: 800, color: r.pod_percent === null ? "#64748b" : Number(r.pod_percent) < 99 ? "#b91c1c" : "#166534" }}>{r.pod_percent === null ? "—" : Number(r.pod_percent).toFixed(2) + "%"}</td>
        </tr>)}</tbody>
      </table>
      {!report.length && <p style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Import a {site} Quality Overview CSV to create the daily ranking.</p>}
      <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 10 }}>Source: Amazon Quality Overview · {isDcr ? "DCR" : "SWC-POD"} · Sorted ascending · All reported drivers</p>
    </div>
  </section>;
}
