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

  const belowTarget = avg.filter((r) => Number(r[metricKey]) < 100).length;
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

  const history = useMemo(() => {
    const valid = rows.filter((r) => r[metricKey] !== null && r[metricKey] !== undefined && Number.isFinite(Number(r[metricKey])));
    const datesAvailable = [...new Set(valid.map((r) => r.report_date))].sort().reverse();
    const priorDate = datesAvailable.find((d) => d < selectedDate);
    const prior = priorDate ? valid.filter((r) => r.report_date === priorDate) : [];
    const priorMap = new Map(prior.map((r) => [r.transporter_id, Number(r[metricKey])]));
    const common = avg.filter((r) => priorMap.has(r.transporter_id));
    const change = common.length ? common.reduce((total, r) => total + Number(r[metricKey]) - priorMap.get(r.transporter_id), 0) / common.length : null;
    const end = new Date(selectedDate + "T00:00:00Z");
    const dayDifference = (d) => Math.round((end - new Date(d + "T00:00:00Z")) / 86400000);
    const last7 = valid.filter((r) => { const days = dayDifference(r.report_date); return days >= 0 && days < 7; });
    const last30 = valid.filter((r) => { const days = dayDifference(r.report_date); return days >= 0 && days < 30; });
    const avgOf = (arr) => arr.length ? arr.reduce((sum, r) => sum + Number(r[metricKey]), 0) / arr.length : null;
    const perDriver = new Map();
    for (const r of last30) {
      const key = r.transporter_id;
      if (!perDriver.has(key)) perDriver.set(key, []);
      perDriver.get(key).push(r);
    }
    const driversHistory = [...perDriver.entries()].map(([id, records]) => {
      const recent = records.filter((r) => dayDifference(r.report_date) < 7);
      const byDate = new Map(records.map((r) => [r.report_date, Number(r[metricKey])]));
      let streak = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date(end); d.setUTCDate(d.getUTCDate() - i);
        const key = d.toISOString().slice(0, 10);
        if (!byDate.has(key) || byDate.get(key) >= 100) break;
        streak++;
      }
      return { id, name: names.get(id) || id, average7: avgOf(recent), average30: avgOf(records), belowDays: records.filter((r) => Number(r[metricKey]) < 100).length, days: records.length, streak };
    }).sort((a,b) => b.belowDays - a.belowDays || (a.average30 ?? 101) - (b.average30 ?? 101));
    return { priorDate, comparable: common.length, change, last7Days: new Set(last7.map((r) => r.report_date)).size, last30Days: new Set(last30.map((r) => r.report_date)).size, average7: avgOf(last7), average30: avgOf(last30), driversHistory };
  }, [rows, metricKey, selectedDate, avg.length, names]);
  const fullScores = avg.length - belowTarget;
  const statBox = { borderRadius: 12, padding: "14px 16px", background: "#f2f6fa", flex: "1 1 0", minWidth: 0 };
  const panelBox = { background: "#fff", border: "1px solid #dce5ef", borderRadius: 16, padding: 16, boxShadow: "0 4px 15px rgba(25,50,80,0.04)" };
  const formatScore = (v) => v === null || v === undefined ? "—" : Number(v).toFixed(2) + "%";

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
  return <section style={{ padding: "22px", maxWidth: 1500, margin: "0 auto", color: "#15283d" }}>
    <header style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
      <div>
        <small style={{ color: "#64748b", fontWeight: 800 }}>{site} · DAILY QUALITY</small>
        <h1 style={{ margin: "5px 0", fontSize: 30 }}>{isDcr ? "📦" : "📸"} {metricName} Yesterday</h1>
        <p style={{ margin: 0, color: "#64748b" }}>Daily performance · WhatsApp message · driver history</p>
      </div>
      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}>
        <select aria-label="Report date" value={selectedDate} onChange={(e) => { setDate(e.target.value); setMessageCopied(false); }} style={{ padding: 9, borderRadius: 9, border: "1px solid #dce5ef" }}>{dates.length ? dates.map((d) => <option key={d} value={d}>{d}</option>) : <option value="">No reports</option>}</select>
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <button className="btn primary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Importing…" : "Import " + site + " CSV"}</button>
        <button className="btn" disabled={!report.length || exporting} onClick={saveImage}>{exporting ? "Saving…" : "Save Image"}</button>
        <button className="btn" disabled={!report.length} onClick={copyPodMessage}>{messageCopied ? "Copied ✓" : "Copy Message"}</button>
      </div>
    </header>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    {notice && <p role="status" style={{ color: "#047857" }}>{notice}</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: 16, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
        <div style={panelBox}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ ...statBox, background: "#edf8f4" }}><div style={{ fontSize: 12, fontWeight: 800 }}>🎯 {metricName} Average</div><strong style={{ fontSize: 27 }}>{formatScore(mean)}</strong><div style={{ fontSize: 11, color: "#64748b" }}>Unweighted · {avg.length} scores</div></div>
            <div style={statBox}><div style={{ fontSize: 12, fontWeight: 800 }}>👥 Drivers</div><strong style={{ fontSize: 27 }}>{report.length}</strong><div style={{ fontSize: 11, color: "#64748b" }}>Imported rows</div></div>
            <div style={{ ...statBox, background: "#fff0f1" }}><div style={{ fontSize: 12, fontWeight: 800, color: "#b91c1c" }}>⚠ Below 100%</div><strong style={{ fontSize: 27, color: "#b91c1c" }}>{belowTarget}</strong><div style={{ fontSize: 11, color: "#b91c1c" }}>{avg.length ? (100 * belowTarget / avg.length).toFixed(1) + "%" : "No scores"}</div></div>
          </div>
        </div>
        <div style={panelBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <strong style={{ fontSize: 17 }}>💬 Daily WhatsApp Message</strong>
            <button className="btn" disabled={!report.length} onClick={copyPodMessage}>Copy</button>
          </div>
          <textarea readOnly aria-label="Daily quality WhatsApp message" value={podMessage} onFocus={(e) => e.target.select()} style={{ width: "100%", minHeight: 280, padding: 13, fontSize: 14, lineHeight: 1.55, background: "#f4fbfa", border: "1px solid #cce9e3", borderRadius: 10, resize: "vertical", boxSizing: "border-box" }} />
        </div>
        <div style={panelBox}>
          <strong style={{ fontSize: 17 }}>🎯 Drivers Below 100%</strong>
          <div style={{ marginTop: 12, maxHeight: 240, overflowY: "auto" }}>
            {avg.filter((r) => Number(r[metricKey]) < 100).map((r, i) => <div key={r.transporter_id} style={{ display: "grid", gridTemplateColumns: "25px minmax(0,1fr) 76px", gap: 8, padding: "7px 8px", fontSize: 13, background: i % 2 ? "#f2f6fa" : "#fff", alignItems: "center" }}><b>{i + 1}</b><b>{r.name}</b><b style={{ color: "#b91c1c", textAlign: "right" }}>{formatScore(r[metricKey])}</b></div>)}
            {!belowTarget && <p style={{ color: "#64748b" }}>{avg.length ? "All reported scores are 100%." : "No scores available."}</p>}
          </div>
        </div>
        <div style={panelBox}>
          <strong style={{ fontSize: 17 }}>📊 {metricName} Insights</strong>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div style={{ ...statBox, background: "#edf8f4" }}><div style={{ fontSize: 12 }}>100% {metricName}</div><strong style={{ fontSize: 24, color: "#047857" }}>{fullScores}</strong></div>
            <div style={{ ...statBox, background: "#fff0f1" }}><div style={{ fontSize: 12 }}>Below 100%</div><strong style={{ fontSize: 24, color: "#b91c1c" }}>{belowTarget}</strong></div>
            <div style={statBox}><div style={{ fontSize: 12 }}>vs previous report</div><strong style={{ fontSize: 21, color: history.change === null ? "#64748b" : history.change >= 0 ? "#047857" : "#b91c1c" }}>{history.change === null ? "—" : (history.change > 0 ? "+" : "") + history.change.toFixed(2) + " pp"}</strong><div style={{ fontSize: 10, color: "#64748b" }}>{history.comparable ? history.comparable + " matched drivers · " + history.priorDate : "No comparable prior data"}</div></div>
          </div>
        </div>
        <div style={panelBox}>
          <strong style={{ fontSize: 17 }}>📅 Driver History · Last 30 Days</strong>
          <p style={{ fontSize: 12, color: "#64748b", margin: "8px 0" }}>Calculated from imported daily reports only. Missing days are not treated as failures.</p>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={statBox}><div style={{ fontSize: 12 }}>7-day mean</div><strong>{formatScore(history.average7)}</strong><div style={{ fontSize: 11 }}>{history.last7Days} dates imported</div></div>
            <div style={statBox}><div style={{ fontSize: 12 }}>30-day mean</div><strong>{formatScore(history.average30)}</strong><div style={{ fontSize: 11 }}>{history.last30Days} dates imported</div></div>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 330, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ textAlign: "left", background: "#eaf0f7" }}><th style={{ padding: 7 }}>Driver</th><th>7d avg</th><th>30d avg</th><th>Below 100%</th><th>Streak</th></tr></thead>
              <tbody>{history.driversHistory.map((r, i) => <tr key={r.id} style={{ background: i % 2 ? "#f4f7fb" : "#fff" }}><td style={{ padding: 7, fontWeight: 700 }}>{r.name}</td><td>{formatScore(r.average7)}</td><td>{formatScore(r.average30)}</td><td>{r.belowDays}/{r.days}</td><td style={{ color: r.streak >= 3 ? "#b91c1c" : "#64748b", fontWeight: 800 }}>{r.streak >= 3 ? "⚠ " : ""}{r.streak}d</td></tr>)}</tbody>
            </table>
            {!history.driversHistory.length && <p style={{ color: "#64748b" }}>No imported history.</p>}
          </div>
          <p style={{ fontSize: 11, color: "#64748b" }}>Streak counts consecutive calendar days below 100%, ending on the selected report date. A 3-day streak is flagged.</p>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...panelBox, padding: 12 }}>
          <div ref={imageRef} style={{ background: "#fff", padding: "14px 14px", borderRadius: 12, width: "100%", maxWidth: 580, margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", borderBottom: "3px solid #15283d", paddingBottom: 9, marginBottom: 8 }}>
              <div><div style={{ fontSize: 13, color: "#64748b", fontWeight: 800 }}>{site} · DCSL</div><h2 style={{ fontSize: 22, margin: "3px 0 0" }}>🏆 {metricName} Daily Ranking</h2><div style={{ fontSize: 11, color: "#64748b" }}>Report date: {selectedDate || "—"}</div></div>
              <div style={{ textAlign: "right" }}><b style={{ fontSize: 20 }}>{report.length}</b><div style={{ fontSize: 12 }}>Drivers</div><b style={{ fontSize: 15 }}>{formatScore(mean)}</b><div style={{ fontSize: 12 }}>Unweighted average</div></div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ background: "#eaf0f7", textAlign: "left" }}><th style={{ padding: "6px 5px", width: 22 }}>#</th><th style={{ padding: "6px 5px" }}>Driver</th><th style={{ padding: "6px 5px", textAlign: "right", width: 95 }}>{isDcr ? "DCR" : "SWC-POD"}</th></tr></thead>
              <tbody>{report.map((r, i) => <tr key={r.transporter_id} style={{ background: i % 2 ? "#f7f9fc" : "#fff", borderBottom: "1px solid #e6edf4" }}>
                <td style={{ padding: "6px 5px", fontWeight: 700 }}>{i + 1}</td><td style={{ padding: "6px 5px", fontWeight: 700 }}>{r.name}</td><td style={{ padding: "6px 5px", textAlign: "right", fontWeight: 800, color: r[metricKey] === null ? "#64748b" : Number(r[metricKey]) < 100 ? "#b91c1c" : "#166534" }}>{formatScore(r[metricKey])}</td>
              </tr>)}</tbody>
            </table>
            {!report.length && <p style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Import a {site} Quality Overview CSV to create the daily ranking.</p>}
            <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 10 }}>Source: Amazon Quality Overview · {isDcr ? "DCR" : "SWC-POD"} · Sorted ascending · All reported drivers</p>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
