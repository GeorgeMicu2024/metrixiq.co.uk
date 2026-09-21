"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  classifyMentorMapping,
  fetchMentorMappingDrivers,
  fetchMentorMappingRows,
  resolveMentorMapping,
} from "../../lib/data/mentorMapping";

export default function MentorMappingPanel({ organizationId, reportDate, onChanged }) {
  const [rows, setRows] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    if (!organizationId) return;
    const supabase = getSupabaseBrowserClient();
    const [mappingRows, driverRows] = await Promise.all([
      fetchMentorMappingRows(supabase, organizationId),
      fetchMentorMappingDrivers(supabase, organizationId),
    ]);
    setRows(mappingRows);
    setDrivers(driverRows);
  }

  useEffect(() => {
    load().catch((e) => setError(e?.message || "Could not load eMentor mappings."));
  }, [organizationId]);

  const dated = useMemo(() => rows.filter((row) => {
    const date = String(row.payload?.reportDate || "");
    return !reportDate || date === reportDate;
  }), [rows, reportDate]);

  const reconciled = useMemo(() => {
    const byIdentity = new Map();
    const rank = { resolved: 4, hidden: 3, transporter: 2, open: 1 };

    for (const row of dated) {
      const sourceKey = String(
        row.payload?.driver?.mentorHash ||
        row.payload?.driver?.details?.mentor?.identityKey ||
        row.raw_trid ||
        row.normalized_name ||
        row.id
      ).trim();
      const current = byIdentity.get(sourceKey);

      if (
        !current ||
        (rank[row.status] || 0) > (rank[current.status] || 0) ||
        ((rank[row.status] || 0) === (rank[current.status] || 0) &&
          String(row.created_at || "") > String(current.created_at || ""))
      ) {
        byIdentity.set(sourceKey, { ...row, reconciliation_key: sourceKey });
      }
    }

    return [...byIdentity.values()];
  }, [dated]);

  const counts = useMemo(() => ({
    all: reconciled.length,
    open: reconciled.filter((r) => r.status === "open").length,
    resolved: reconciled.filter((r) => r.status === "resolved").length,
    hidden: reconciled.filter((r) => r.status === "hidden").length,
    transporter: reconciled.filter((r) => r.status === "transporter").length,
  }), [reconciled]);

  const visible = filter === "all" ? reconciled : reconciled.filter((r) => r.status === filter);

  async function resolve(row, driverId) {
    if (!driverId) return;
    setBusy(row.id); setError("");
    try {
      await resolveMentorMapping(getSupabaseBrowserClient(), organizationId, row, driverId);
      await load(); onChanged?.();
    } catch (e) { setError(e?.message || "Could not save mapping."); }
    finally { setBusy(""); }
  }

  async function classify(row, status) {
    setBusy(row.id); setError("");
    try {
      await classifyMentorMapping(getSupabaseBrowserClient(), organizationId, row.id, status);
      await load(); onChanged?.();
    } catch (e) { setError(e?.message || "Could not update row."); }
    finally { setBusy(""); }
  }

  if (!dated.length) return null;

  return (
    <section className="mentor-mapping-panel">
      <div className="mentor-mapping-head">
        <div>
          <span className="page-kicker">IMPORT RECONCILIATION</span>
          <h2>Driver Mapping</h2>
          <p>Review rows that could not be matched automatically. Manual mappings are reused on future imports.</p>
        </div>
        <div className="mentor-mapping-counts">
          <b>{reconciled.length} unique source accounts</b>
          <span>{counts.open} need review</span>
          <span>{counts.resolved} mapped</span>
          <span>{counts.hidden} hidden</span>
          <span>{counts.transporter} transporter</span>
        </div>
      </div>
      <div className="mentor-mapping-tabs">
        {["open","resolved","hidden","transporter","all"].map((key) => (
          <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
            {key === "open" ? "Needs review" : key[0].toUpperCase()+key.slice(1)} ({counts[key]})
          </button>
        ))}
      </div>
      {error && <div className="mentor-mapping-error">{error}</div>}
      <div className="mentor-mapping-scroll">
        <table className="mentor-mapping-table">
          <thead><tr><th>Source name</th><th>Source ID</th><th>Site</th><th>Score</th><th>Match to driver</th><th>Visibility</th></tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td><b>{row.raw_name || "Unknown / encrypted"}</b></td>
                <td><code>{row.raw_trid || row.payload?.driver?.mentorHash || "—"}</code></td>
                <td>{row.site || "—"}</td>
                <td><b>{row.payload?.score ?? "—"}</b></td>
                <td>
                  <select disabled={busy === row.id} value={row.matched_driver_id || ""} onChange={(e) => resolve(row, e.target.value)}>
                    <option value="">Select driver…</option>
                    {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name} · {driver.trid || "no TRID"}{driver.site ? " · "+driver.site : ""}</option>)}
                  </select>
                </td>
                <td className="mentor-mapping-actions">
                  <button type="button" disabled={busy === row.id} onClick={() => classify(row, "hidden")}>Hide</button>
                  <button type="button" disabled={busy === row.id} onClick={() => classify(row, "transporter")}>Transporter</button>
                  {row.status !== "open" && <button type="button" disabled={busy === row.id} onClick={() => classify(row, "open")}>Restore</button>}
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan="6">No rows in this category.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
