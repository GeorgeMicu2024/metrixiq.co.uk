"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  classifyMentorMapping,
  createMentorMappingDriver,
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
  const [driverQueries, setDriverQueries] = useState({});
  const [createFor, setCreateFor] = useState(null);
  const [newDriver, setNewDriver] = useState({ full_name: "", trid: "", site: "" });

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
  }), [reconciled]);

  const visible = filter === "all" ? reconciled : reconciled.filter((r) => r.status === filter);

  async function createAndResolve() {
    if (!createFor || !newDriver.full_name.trim()) return;
    setBusy(createFor.id); setError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const driver = await createMentorMappingDriver(supabase, organizationId, newDriver);
      await resolveMentorMapping(supabase, organizationId, createFor, driver.id);
      setCreateFor(null); setNewDriver({ full_name: "", trid: "", site: "" });
      await load(); onChanged?.();
    } catch (e) { setError(e?.message || "Could not create and link driver."); }
    finally { setBusy(""); }
  }

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
        </div>
      </div>
      <div className="mentor-mapping-tabs">
        {["open","resolved","hidden","all"].map((key) => (
          <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
            {key === "open" ? "Needs review" : key[0].toUpperCase()+key.slice(1)} ({counts[key]})
          </button>
        ))}
      </div>
      {error && <div className="mentor-mapping-error">{error}</div>}
      <div className="mentor-mapping-scroll">
        <table className="mentor-mapping-table">
          <thead><tr><th>Visibility</th><th>Source name</th><th>Source ID</th><th>Site</th><th>Score</th><th>Match to driver</th></tr></thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td className="mentor-mapping-actions">
                  {row.status === "hidden"
                    ? <button type="button" disabled={busy === row.id} onClick={() => classify(row, "open")}>Unhide</button>
                    : <button type="button" disabled={busy === row.id} onClick={() => classify(row, "hidden")}>Hide</button>}
                </td>
                <td><b>{row.raw_name || "Unknown / encrypted"}</b></td>
                <td><code>{row.raw_trid || row.payload?.driver?.mentorHash || "—"}</code></td>
                <td>{row.site || "—"}</td>
                <td><b>{row.payload?.score ?? "—"}</b></td>
                <td>
                  <div className="mentor-driver-combobox">
                    <input
                      type="search"
                      autoComplete="off"
                      disabled={busy === row.id}
                      placeholder="Search name or TRID…"
                      value={driverQueries[row.id] ?? ""}
                      onChange={(e) => setDriverQueries((current) => ({ ...current, [row.id]: e.target.value }))}
                      aria-label={`Search driver for ${row.raw_name || "eMentor account"}`}
                    />
                    {(driverQueries[row.id] || "").trim() && (
                      <div className="mentor-driver-results">
                        {drivers
                          .filter((driver) => {
                            const query = (driverQueries[row.id] || "").trim().toLowerCase();
                            return !query || `${driver.full_name || ""} ${driver.trid || ""} ${driver.site || ""}`.toLowerCase().includes(query);
                          })
                          .slice(0, 12)
                          .map((driver) => (
                            <button
                              key={driver.id}
                              type="button"
                              disabled={busy === row.id}
                              onClick={() => {
                                setDriverQueries((current) => ({ ...current, [row.id]: driver.full_name || driver.trid || "" }));
                                resolve(row, driver.id);
                              }}
                            >
                              <b>{driver.full_name}</b>
                              <span>{driver.trid || "no TRID"}{driver.site ? " · " + driver.site : ""}</span>
                            </button>
                          ))}
                        {!drivers.some((driver) => {
                          const query = (driverQueries[row.id] || "").trim().toLowerCase();
                          return `${driver.full_name || ""} ${driver.trid || ""} ${driver.site || ""}`.toLowerCase().includes(query);
                        }) && <div className="mentor-driver-empty">No matching driver</div>}
                        <button type="button" className="mentor-create-driver" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                          setCreateFor(row);
                          setNewDriver({ full_name: driverQueries[row.id] || "", trid: "", site: row.site || "" });
                        }}><b>+ Create new driver</b><span>Create and permanently link this eMentor account</span></button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan="6">No rows in this category.</td></tr>}
          </tbody>
        </table>
      </div>
      {createFor && <div className="mentor-create-backdrop" role="presentation" onMouseDown={() => setCreateFor(null)}><div className="mentor-create-modal" role="dialog" aria-modal="true" aria-label="Add new driver" onMouseDown={(e) => e.stopPropagation()}><div className="mentor-create-title"><div><b>Add New Driver</b><small>Create a new driver and link it to this eMentor account.</small></div><button type="button" onClick={() => setCreateFor(null)}>×</button></div><label>Full name *<input autoFocus value={newDriver.full_name} onChange={(e) => setNewDriver(v => ({...v,full_name:e.target.value}))} placeholder="e.g. John Smith" /></label><label>TRID (optional)<input value={newDriver.trid} onChange={(e) => setNewDriver(v => ({...v,trid:e.target.value}))} placeholder="e.g. A123B456" /></label><label>Site<input value={newDriver.site} onChange={(e) => setNewDriver(v => ({...v,site:e.target.value}))} placeholder="DLS2" /></label><div className="mentor-create-actions"><button type="button" className="btn ghost" onClick={() => setCreateFor(null)}>Cancel</button><button type="button" className="btn primary" disabled={!newDriver.full_name.trim() || busy === createFor.id} onClick={createAndResolve}>Create & Link</button></div></div></div>}
    </section>
  );
}
