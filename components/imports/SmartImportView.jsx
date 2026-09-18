"use client";

import { useRef, useState } from "react";
import { analyseFiles } from "../../lib/analyzer";

export default function SmartImportView({ onImported, analysis }) {
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    if (!files.length) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await analyseFiles(files);
      const saved = await onImported(result, files);
      setMessage(`Processed ${files.length} file(s) · ${result.recognizedFiles ?? 0} recognised · ${result.errorFiles ?? 0} errors · ${saved?.savedMetrics ?? 0} driver-week records · ${saved?.savedScorecards ?? 0} site scorecards · ${saved?.savedFeedback ?? 0} CDF events · ${saved?.unmatched ?? 0} unmatched.`);
    } catch (e) {
      setMessage(`Import failed: ${e?.message || "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  return <><div className="page-heading"><div><span className="page-kicker">DATA</span><h1>Smart Import</h1><p>Upload weekly reports together. MetrixIQ detects reporting periods, maps TRIDs and stores history permanently.</p></div><button className="btn primary" onClick={() => input.current?.click()}>Choose files</button></div>
    <input ref={input} type="file" multiple hidden accept=".xlsx,.xls,.xlsb,.ods,.csv,.tsv,.html,.htm,.pdf,.json,.xml,.txt" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
    <section className="import-drop" onClick={() => input.current?.click()}><div className="upload-icon">⇧</div><h2>Drop operational reports here</h2><p>Excel, CSV/TSV, ODS, HTML, PDF, JSON, XML and text · Multiple weeks supported · TRID mapping</p><button className="btn ghost">Browse files</button></section>
    {files.length > 0 && <section className="panel import-review"><div className="panel-head"><div><h2>Ready to process</h2><p>{files.length} selected file(s)</p></div><button className="btn primary" onClick={run} disabled={busy}>{busy ? "Analysing & saving…" : "Analyse & save history"}</button></div>
      <div className="file-list">{files.map((f) => <div key={f.name}><span className="file-type">{f.name.split(".").pop()?.toUpperCase()}</span><div><b>{f.name}</b><small>{(f.size / 1024 / 1024).toFixed(2)} MB</small></div><em>{analysis?.fileResults?.find((r) => r.name === f.name)?.status || "Selected"}</em></div>)}</div>
      {message && <div className={message.startsWith("Import failed") ? "import-message error" : "import-message"}>{message}</div>}
    </section>}
    {analysis && <section className="panel import-result">
      <div className="panel-head"><div><h2>Latest analysis</h2><p>Parsed data is persisted as weekly historical evidence in your workspace.</p></div><span className="panel-badge good">Saved</span></div>
      <div className="result-grid"><div><span>Drivers</span><strong>{analysis.driverCount}</strong></div><div><span>Periods</span><strong>{analysis.periods?.length || 0}</strong></div><div><span>TRID matches</span><strong>{analysis.matchedByTrid}</strong></div><div><span>Unmatched</span><strong>{analysis.unmatchedDrivers}</strong></div></div>
      <div className="import-diagnostics">
        <div className="panel-head"><div><h2>File diagnostics</h2><p>Detection result for every uploaded report.</p></div><span>{analysis.recognizedFiles || 0}/{analysis.fileResults?.length || 0} recognised</span></div>
        <div className="table-wrap">
          <table className="data-table import-diagnostics-table">
            <thead><tr><th>File</th><th>Detected report</th><th>Period</th><th>Rows</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {(analysis.fileResults || []).map((result) => {
                const period = result.period?.key || (result.period?.weekLabel ? `${result.period?.year || ""} ${result.period.weekLabel}`.trim() : "—");
                const status = result.status || "read";
                return <tr key={result.name}>
                  <td><b>{result.name}</b><small className="history-date">{String(result.type || "").toUpperCase()}</small></td>
                  <td>{result.reportType || "Not classified"}</td>
                  <td>{period}</td>
                  <td>{result.rows ?? 0}</td>
                  <td><span className={`import-status ${status}`}>{status}</span></td>
                  <td>{result.error || (result.recognized ? "Ready and stored" : status === "unsupported" ? "Unsupported file type" : "File read, but no supported report structure was detected")}</td>
                </tr>;
              })}
              {!analysis.fileResults?.length && <tr><td colSpan="6"><div className="ops-mini-empty">No file diagnostics available.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>}
  </>;
}

