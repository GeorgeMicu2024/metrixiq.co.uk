"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchTrustedConcessions } from "../../lib/data/concessions";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { ErrorBox, Loading, dname, n, openShape, trid, weekNo } from "./OperationalShared";

const statusTone = (value) => {
  const count = Number(value || 0);
  if (count === 0) return "good";
  if (count === 1) return "watch";
  if (count === 2) return "med";
  return "high";
};

const statusLabel = (value) => {
  const count = Number(value || 0);
  if (count === 0) return "Clear";
  if (count === 1) return "Watch";
  if (count === 2) return "Priority";
  return "High priority";
};

export default function ConcessionsSimpleView({
  organizationId,
  onOpenDriver,
  siteFilter = "all",
}) {
  const [load, setLoad] = useState({
    loading: true,
    error: "",
    rows: [],
    reports: [],
    rejectedRows: 0,
  });
  const [week, setWeek] = useState("");
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("affected");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    let alive = true;

    if (!organizationId) {
      setLoad({ loading: false, error: "", rows: [], reports: [], rejectedRows: 0 });
      return () => {};
    }

    (async () => {
      try {
        setLoad((current) => ({ ...current, loading: true, error: "" }));
        const result = await fetchTrustedConcessions(
          getSupabaseBrowserClient(),
          organizationId,
          siteFilter
        );
        if (alive) setLoad({ loading: false, error: "", ...result });
      } catch (error) {
        if (alive) {
          setLoad({
            loading: false,
            error: error?.message || "Could not load concessions.",
            rows: [],
            reports: [],
            rejectedRows: 0,
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [organizationId, siteFilter]);

  if (load.loading) return <Loading text="Loading trusted concessions…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  const site = String(siteFilter || "all").trim().toUpperCase();

  if (site === "ALL") {
    const trustedBySite = new Map();
    for (const report of load.reports.filter((item) => item.trusted)) {
      if (!trustedBySite.has(report.site)) trustedBySite.set(report.site, []);
      trustedBySite.get(report.site).push(report.week);
    }

    return (
      <div className="cx-simple">
        <header className="cx-simple-hero">
          <div>
            <span className="page-kicker">QUALITY INTELLIGENCE</span>
            <h1>Concessions</h1>
            <p>
              Cross-site concession totals are intentionally disabled. Select one site so every number
              comes from one canonical Associates Concessions report.
            </p>
          </div>
          <div className="cx-simple-lock">SOURCE LOCKED</div>
        </header>

        <section className="panel cx-simple-site-required">
          <div>1 SITE = 1 SOURCE</div>
          <h2>Select a site from the top-right Site menu</h2>
          <p>
            MetrixIQ now ignores scorecards, IADC/DWC, CDF and generic workbooks on this page.
            Only <code>DSP_Associates_Concessions_SITE_YYYY-W##.csv</code> is accepted.
          </p>
          {!!trustedBySite.size && (
            <div className="cx-simple-site-list">
              {[...trustedBySite.entries()].map(([name, weeks]) => (
                <span key={name}>
                  <b>{name}</b> · {weeks.sort((a,b)=>weekNo(b)-weekNo(a)).join(", ")}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const reports = load.reports
    .filter((report) => report.site === site)
    .sort((a, b) => weekNo(b.week) - weekNo(a.week));

  const trustedReports = reports.filter((report) => report.trusted);
  const weeks = trustedReports.map((report) => report.week);
  const selectedWeek = week && weeks.includes(week) ? week : weeks[0] || "";
  const activeReport = trustedReports.find((report) => report.week === selectedWeek) || null;
  const incompleteReports = reports.filter((report) => !report.trusted);

  const rows = load.rows.filter(
    (row) => row.source_site === site && row.source_week === selectedWeek
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let result = rows.filter((row) => {
      const count = Number(row.concessions || 0);
      if (show === "affected" && count <= 0) return false;
      if (show === "clear" && count !== 0) return false;

      return (
        !needle ||
        `${dname(row.drivers)} ${trid(row.drivers)}`
          .toLowerCase()
          .includes(needle)
      );
    });

    result = [...result].sort((a, b) => {
      const av = Number(a.concessions || 0);
      const bv = Number(b.concessions || 0);
      if (sortDir === "asc") return av - bv || dname(a.drivers).localeCompare(dname(b.drivers));
      return bv - av || dname(a.drivers).localeCompare(dname(b.drivers));
    });

    return result;
  }, [rows, query, show, sortDir]);

  const total = rows.reduce((sum, row) => sum + Number(row.concessions || 0), 0);
  const affected = rows.filter((row) => Number(row.concessions || 0) > 0).length;
  const clear = rows.length - affected;
  const highest = [...rows].sort(
    (a, b) => Number(b.concessions || 0) - Number(a.concessions || 0)
  )[0] || null;

  return (
    <div className="cx-simple">
      <header className="cx-simple-hero">
        <div>
          <span className="page-kicker">QUALITY INTELLIGENCE</span>
          <h1>Concessions</h1>
          <p>
            {site} · one site, one week, one canonical source. Mixed reports are ignored.
          </p>
        </div>
        <div className="cx-simple-lock">
          <span>SOURCE LOCKED</span>
          <strong>Associates CSV only</strong>
        </div>
      </header>

      <section className="cx-simple-toolbar">
        <label>
          <span>Week</span>
          <select value={selectedWeek} onChange={(event) => setWeek(event.target.value)}>
            {weeks.length ? (
              weeks.map((item) => <option key={item}>{item}</option>)
            ) : (
              <option value="">No trusted report</option>
            )}
          </select>
        </label>

        <label className="cx-simple-search">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Driver name or TRID…"
          />
        </label>

        <label>
          <span>Show</span>
          <select value={show} onChange={(event) => setShow(event.target.value)}>
            <option value="affected">Affected only</option>
            <option value="all">All drivers</option>
            <option value="clear">Zero concessions</option>
          </select>
        </label>

        <label>
          <span>Sort</span>
          <select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
            <option value="desc">Highest first</option>
            <option value="asc">Lowest first</option>
          </select>
        </label>
      </section>

      {activeReport ? (
        <div className="cx-simple-source">
          <div>
            <span>Trusted source</span>
            <b>{activeReport.fileName}</b>
          </div>
          <div>
            <span>Integrity</span>
            <b>{Math.round(activeReport.coverage * 100)}% matched</b>
          </div>
          <div>
            <span>Imported rows</span>
            <b>{activeReport.rowCount}/{activeReport.expectedRows}</b>
          </div>
        </div>
      ) : (
        <section className="panel cx-simple-empty">
          <div>!</div>
          <h2>No trusted concessions report for {site}</h2>
          <p>
            Upload a dedicated <code>DSP_Associates_Concessions_{site}_YYYY-W##.csv</code>.
            Generic Excel files, scorecards and IADC/DWC reports are no longer allowed to feed this page.
          </p>
        </section>
      )}

      {!!incompleteReports.length && (
        <div className="cx-simple-warning">
          <b>Incomplete reports hidden:</b>{" "}
          {incompleteReports.map((report) =>
            `${report.week} (${report.rowCount}/${report.expectedRows})`
          ).join(", ")}
        </div>
      )}

      {activeReport && (
        <>
          <section className="cx-simple-kpis">
            <article>
              <span>Total DNR</span>
              <strong>{total}</strong>
              <small>{site} · {selectedWeek}</small>
            </article>
            <article>
              <span>Affected drivers</span>
              <strong>{affected}</strong>
              <small>{rows.length} reported</small>
            </article>
            <article className="good">
              <span>Zero concessions</span>
              <strong>{clear}</strong>
              <small>Clean drivers</small>
            </article>
            <article className="risk">
              <span>Highest driver</span>
              <strong>{highest ? Number(highest.concessions || 0) : 0}</strong>
              <small>{highest ? dname(highest.drivers) : "—"}</small>
            </article>
          </section>

          <section className="panel cx-simple-table-card">
            <div className="cx-simple-card-head">
              <div>
                <span>DRIVER RANKING</span>
                <h2>{site} · {selectedWeek}</h2>
              </div>
              <b>{filtered.length} drivers shown</b>
            </div>

            <div className="cx-simple-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    <th>TRID</th>
                    <th>DNR</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, index) => {
                    const value = Number(row.concessions || 0);
                    const tone = statusTone(value);
                    return (
                      <tr key={row.id || `${row.driver_id}-${index}`}>
                        <td><span className="cx-simple-rank">{index + 1}</span></td>
                        <td><b>{dname(row.drivers)}</b></td>
                        <td><code>{trid(row.drivers)}</code></td>
                        <td><span className={"cx-simple-score " + tone}>{value}</span></td>
                        <td><span className={"cx-simple-status " + tone}>{statusLabel(value)}</span></td>
                        <td>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenDriver?.(
                                openShape(row, {
                                  site,
                                  concessions: n(row.concessions),
                                })
                              )
                            }
                          >
                            Open →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan="6">
                        <div className="cx-simple-no-rows">No drivers match these filters.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <style jsx global>{`
        .cx-simple{display:grid;gap:14px;padding-bottom:28px}
        .cx-simple-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:22px 24px;border:1px solid #dce6ed;border-radius:16px;background:linear-gradient(135deg,#fff 0%,#f7fbfa 65%,#eef8f5 100%)}
        .cx-simple-hero h1{margin:5px 0 6px;font-size:30px;color:#12273a;letter-spacing:-.035em}
        .cx-simple-hero p{margin:0;color:#6e7f90;font-size:13px}
        .cx-simple-lock{display:flex;flex-direction:column;align-items:flex-end;gap:3px;border:1px solid #cde6de;background:#eff9f5;color:#2b7665;border-radius:10px;padding:10px 12px;font-size:10px;font-weight:900;letter-spacing:.06em}
        .cx-simple-lock strong{font-size:12px;letter-spacing:0}
        .cx-simple-toolbar{display:grid;grid-template-columns:170px minmax(260px,1fr) 180px 180px;gap:10px;padding:13px;border:1px solid #dfe7ed;border-radius:13px;background:#fff}
        .cx-simple-toolbar label{display:grid;gap:5px}.cx-simple-toolbar label>span{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#8794a2}
        .cx-simple-toolbar select,.cx-simple-toolbar input{height:40px;border:1px solid #d4dee6;border-radius:9px;background:#fff;padding:0 11px;color:#21364a;font-weight:700;outline:none;width:100%}
        .cx-simple-source{display:grid;grid-template-columns:1fr 180px 180px;gap:10px;padding:12px 14px;border:1px solid #cfe6df;border-radius:12px;background:#f3faf7}
        .cx-simple-source div{min-width:0}.cx-simple-source span{display:block;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#779187}.cx-simple-source b{display:block;margin-top:3px;color:#245f53;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cx-simple-warning{padding:10px 12px;border:1px solid #ecd89e;border-radius:10px;background:#fff9e8;color:#8a6717;font-size:11px}
        .cx-simple-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .cx-simple-kpis article{padding:16px 17px;border:1px solid #dfe7ed;border-radius:14px;background:#fff}.cx-simple-kpis article.good{border-top:3px solid #31a16f}.cx-simple-kpis article.risk{border-top:3px solid #d35e68}
        .cx-simple-kpis span{display:block;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#7b8998}.cx-simple-kpis strong{display:block;margin:8px 0 4px;font-size:29px;color:#142a3f}.cx-simple-kpis small{color:#7c8b9a;font-size:11px}
        .cx-simple-table-card{overflow:hidden;border-radius:14px}.cx-simple-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px;border-bottom:1px solid #e6edf1}.cx-simple-card-head span{font-size:9px;font-weight:900;letter-spacing:.1em;color:#4b927f}.cx-simple-card-head h2{margin:3px 0 0;font-size:17px}.cx-simple-card-head>b{font-size:11px;color:#708091}
        .cx-simple-table-wrap{max-height:650px;overflow:auto}.cx-simple-table-wrap table{width:100%;border-collapse:separate;border-spacing:0}.cx-simple-table-wrap th{position:sticky;top:0;background:#f7f9fb;padding:10px 12px;text-align:left;border-bottom:1px solid #dfe7ed;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#738293}.cx-simple-table-wrap td{padding:10px 12px;border-bottom:1px solid #edf1f4;font-size:12px;color:#263a4e}.cx-simple-table-wrap td b{color:#152a3e}.cx-simple-table-wrap code{font-size:10px;background:#f2f5f7;padding:4px 6px;border-radius:6px;color:#5d6f81}
        .cx-simple-rank{display:grid;place-items:center;width:27px;height:27px;border-radius:8px;background:#edf2f5;font-weight:850}.cx-simple-score{display:inline-flex;min-width:34px;justify-content:center;border-radius:8px;padding:6px 8px;font-weight:900}.cx-simple-score.good{background:#e5f5ec;color:#26744f}.cx-simple-score.watch{background:#fff4cf;color:#8a6818}.cx-simple-score.med{background:#fde6b7;color:#925f0a}.cx-simple-score.high{background:#f7dde0;color:#a3424b}
        .cx-simple-status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:850}.cx-simple-status.good{background:#e7f7ee;color:#176d4e}.cx-simple-status.watch{background:#fff4d6;color:#946511}.cx-simple-status.med{background:#fff0d3;color:#9b6508}.cx-simple-status.high{background:#ffebeb;color:#a33838}
        .cx-simple-table-wrap td:last-child button{border:1px solid #d5dee5;background:#fff;border-radius:7px;padding:6px 10px;color:#376f64;font-weight:800;cursor:pointer}
        .cx-simple-empty,.cx-simple-site-required{min-height:260px;display:grid;align-content:center;justify-items:center;text-align:center;gap:8px;padding:30px}.cx-simple-empty>div,.cx-simple-site-required>div:first-child{border-radius:999px;background:#eff5f4;color:#367768;padding:8px 12px;font-size:10px;font-weight:900}.cx-simple-empty h2,.cx-simple-site-required h2{margin:4px 0 0}.cx-simple-empty p,.cx-simple-site-required p{max-width:720px;margin:0;color:#718191;line-height:1.55}.cx-simple-site-list{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:8px}.cx-simple-site-list span{border:1px solid #dce6e2;background:#f7fbf9;border-radius:9px;padding:7px 10px;color:#567166;font-size:10px}
        .cx-simple-no-rows{padding:30px;text-align:center;color:#81909f}
        @media(max-width:1000px){.cx-simple-toolbar{grid-template-columns:1fr 1fr}.cx-simple-source{grid-template-columns:1fr 1fr}.cx-simple-source div:first-child{grid-column:1/-1}.cx-simple-kpis{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){.cx-simple-hero{align-items:flex-start;flex-direction:column}.cx-simple-lock{align-items:flex-start}.cx-simple-toolbar{grid-template-columns:1fr}.cx-simple-source{grid-template-columns:1fr}.cx-simple-source div:first-child{grid-column:auto}.cx-simple-kpis{grid-template-columns:1fr 1fr}}
      `}</style>
    </div>
  );
}
