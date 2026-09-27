"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFourWeekConcessionMatrix,
  fetchConcessionSnapshots,
  latestFourConcessionWeeks,
} from "../../lib/data/concessions";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { ErrorBox, Loading } from "./OperationalShared";

const cellTone = (value) => {
  const n = Number(value || 0);
  if (n === 0) return "zero";
  if (n === 1) return "one";
  if (n === 2) return "two";
  return "high";
};

export default function ConcessionsSimpleView({
  organizationId,
  onOpenDriver,
  siteFilter = "all",
  refreshKey = 0,
}) {
  const [load, setLoad] = useState({ loading: true, error: "", rows: [] });
  const [localSite, setLocalSite] = useState("");
  const [query, setQuery] = useState("");
  const [show, setShow] = useState("all");

  useEffect(() => {
    let alive = true;
    if (!organizationId) {
      setLoad({ loading: false, error: "", rows: [] });
      return () => {};
    }

    (async () => {
      try {
        setLoad((current) => ({ ...current, loading: true, error: "" }));
        const rows = await fetchConcessionSnapshots(
          getSupabaseBrowserClient(),
          organizationId,
          siteFilter
        );
        if (alive) setLoad({ loading: false, error: "", rows });
      } catch (error) {
        if (alive) {
          setLoad({
            loading: false,
            error: error?.message || "Could not load concessions.",
            rows: [],
          });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [organizationId, siteFilter, refreshKey]);

  const globalSite = String(siteFilter || "all").trim().toUpperCase();
  const availableSites = useMemo(
    () =>
      [...new Set((load.rows || []).map((row) => String(row.site || "").toUpperCase()).filter(Boolean))]
        .sort(),
    [load.rows]
  );

  const site =
    globalSite !== "ALL"
      ? globalSite
      : availableSites.includes(localSite)
        ? localSite
        : availableSites[0] || "";

  const weeks = useMemo(
    () => latestFourConcessionWeeks(load.rows || [], site),
    [load.rows, site]
  );

  const matrix = useMemo(
    () => buildFourWeekConcessionMatrix(load.rows || [], site, weeks),
    [load.rows, site, weeks]
  );

  const weekly = useMemo(
    () =>
      weeks.map((week) => {
        const rows = (load.rows || []).filter(
          (row) => row.site === site && row.week_label === week && Number(row.dnr || 0) > 0
        );
        return {
          week,
          total: rows.reduce((sum, row) => sum + Number(row.dnr || 0), 0),
          affected: new Set(rows.map((row) => row.driver_trid)).size,
          source: rows[0]?.source_file || "",
        };
      }),
    [load.rows, site, weeks]
  );

  const latestWeek = weeks[weeks.length - 1] || "";
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return matrix.filter((row) => {
      if (show === "repeat" && row.affectedWeeks < 2) return false;
      if (show === "latest" && Number(row.byWeek?.[latestWeek] || 0) <= 0) return false;
      if (!needle) return true;
      return `${row.driver_name} ${row.driver_trid}`.toLowerCase().includes(needle);
    });
  }, [matrix, query, show, latestWeek]);

  const fourWeekTotal = weekly.reduce((sum, week) => sum + week.total, 0);
  const uniqueAffected = matrix.length;
  const repeatDrivers = matrix.filter((row) => row.affectedWeeks >= 2).length;
  const latestTotal = weekly.find((week) => week.week === latestWeek)?.total || 0;

  if (load.loading) return <Loading text="Loading clean concessions history…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="cx4">
      <header className="cx4-hero">
        <div>
          <span className="page-kicker">QUALITY INTELLIGENCE</span>
          <h1>Concessions — Last 4 Weeks</h1>
          <p>
            Dedicated DNR snapshots only. No scorecard, IADC, POD or mixed operational rows are used here.
          </p>
        </div>
        <div className="cx4-lock">
          <span>ISOLATED DATASET</span>
          <strong>{site || "No site"}</strong>
        </div>
      </header>

      <section className={"cx4-toolbar " + (globalSite === "ALL" ? "with-site" : "")}>
        {globalSite === "ALL" && (
          <label>
            <span>Site</span>
            <select
              value={site}
              onChange={(event) => {
                setLocalSite(event.target.value);
                setQuery("");
              }}
            >
              {availableSites.length ? (
                availableSites.map((item) => <option key={item}>{item}</option>)
              ) : (
                <option value="">No site data</option>
              )}
            </select>
          </label>
        )}

        <label className="cx4-search">
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
            <option value="all">All affected drivers</option>
            <option value="repeat">Repeat · 2+ weeks</option>
            <option value="latest">Latest week only</option>
          </select>
        </label>
      </section>

      {!site || !weeks.length ? (
        <section className="panel cx4-empty">
          <h2>No clean concessions snapshots available</h2>
          <p>Import a dedicated Associates Concessions CSV for this site.</p>
        </section>
      ) : (
        <>
          <section className="cx4-kpis">
            <article>
              <span>4W DNR</span>
              <strong>{fourWeekTotal}</strong>
              <small>{weeks[0]}–{latestWeek}</small>
            </article>
            <article>
              <span>Unique affected</span>
              <strong>{uniqueAffected}</strong>
              <small>Across four weeks</small>
            </article>
            <article className="warn">
              <span>Repeat drivers</span>
              <strong>{repeatDrivers}</strong>
              <small>Affected in 2+ weeks</small>
            </article>
            <article className="latest">
              <span>{latestWeek} DNR</span>
              <strong>{latestTotal}</strong>
              <small>Latest clean report</small>
            </article>
          </section>

          <section className="cx4-weeks">
            {weekly.map((item, index) => (
              <article key={item.week} className={index === weekly.length - 1 ? "current" : ""}>
                <div>
                  <span>{item.week}</span>
                  {index === weekly.length - 1 && <b>LATEST</b>}
                </div>
                <strong>{item.total}</strong>
                <small>{item.affected} affected drivers</small>
                <em title={item.source}>{item.source || "Dedicated concessions source"}</em>
              </article>
            ))}
          </section>

          <section className="panel cx4-table-card">
            <div className="cx4-card-head">
              <div>
                <span>4-WEEK DRIVER MATRIX</span>
                <h2>{site} · {weeks[0]}–{latestWeek}</h2>
              </div>
              <b>{filtered.length} drivers</b>
            </div>

            <div className="cx4-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    <th>TRID</th>
                    {weeks.map((week) => <th key={week}>{week}</th>)}
                    <th>4W Total</th>
                    <th>Affected</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, index) => (
                    <tr key={row.driver_trid}>
                      <td><span className="cx4-rank">{index + 1}</span></td>
                      <td><b>{row.driver_name}</b></td>
                      <td><code>{row.driver_trid}</code></td>
                      {weeks.map((week) => {
                        const value = Number(row.byWeek?.[week] || 0);
                        return (
                          <td key={week}>
                            <span className={"cx4-cell " + cellTone(value)}>{value || "—"}</span>
                          </td>
                        );
                      })}
                      <td><span className="cx4-total">{row.total}</span></td>
                      <td>{row.affectedWeeks}/4</td>
                      <td>
                        <button
                          type="button"
                          disabled={!row.driver_id}
                          onClick={() =>
                            row.driver_id &&
                            onOpenDriver?.({
                              id: row.driver_trid,
                              dbId: row.driver_id,
                              name: row.driver_name,
                              site,
                              concessions: row.total,
                            })
                          }
                        >
                          Open →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <style jsx global>{`
        .cx4{display:grid;gap:14px;padding-bottom:28px}
        .cx4-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:22px 24px;border:1px solid #dce6ed;border-radius:16px;background:linear-gradient(135deg,#fff 0%,#f7fbfa 62%,#eef8f5 100%)}
        .cx4-hero h1{margin:5px 0 6px;font-size:30px;color:#12273a;letter-spacing:-.035em}.cx4-hero p{margin:0;color:#6e7f90;font-size:13px}
        .cx4-lock{display:flex;flex-direction:column;align-items:flex-end;gap:3px;border:1px solid #cde6de;background:#eff9f5;color:#2b7665;border-radius:10px;padding:10px 12px}.cx4-lock span{font-size:9px;font-weight:900;letter-spacing:.08em}.cx4-lock strong{font-size:14px}
        .cx4-toolbar{display:grid;grid-template-columns:minmax(280px,1fr) 220px;gap:10px;padding:13px;border:1px solid #dfe7ed;border-radius:13px;background:#fff}.cx4-toolbar.with-site{grid-template-columns:160px minmax(260px,1fr) 220px}
        .cx4-toolbar label{display:grid;gap:5px}.cx4-toolbar label>span{font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#8794a2}.cx4-toolbar select,.cx4-toolbar input{height:40px;border:1px solid #d4dee6;border-radius:9px;background:#fff;padding:0 11px;color:#21364a;font-weight:700;outline:none;width:100%}
        .cx4-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cx4-kpis article{padding:16px 17px;border:1px solid #dfe7ed;border-radius:14px;background:#fff}.cx4-kpis article.warn{border-top:3px solid #e5a21a}.cx4-kpis article.latest{border-top:3px solid #2d8f79}.cx4-kpis span{display:block;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#7b8998}.cx4-kpis strong{display:block;margin:8px 0 4px;font-size:29px;color:#142a3f}.cx4-kpis small{color:#7c8b9a;font-size:11px}
        .cx4-weeks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.cx4-weeks article{padding:15px 16px;border:1px solid #dfe7ed;border-radius:13px;background:#fff}.cx4-weeks article.current{border-color:#8fd2bf;box-shadow:inset 0 3px #2d8f79}.cx4-weeks article>div{display:flex;align-items:center;justify-content:space-between}.cx4-weeks span{font-size:11px;font-weight:900;color:#516477}.cx4-weeks b{font-size:8px;color:#267a67;background:#eaf7f2;border-radius:999px;padding:4px 7px}.cx4-weeks strong{display:block;font-size:28px;margin:9px 0 3px;color:#142a3f}.cx4-weeks small{display:block;color:#6f8090;font-size:11px}.cx4-weeks em{display:block;margin-top:9px;color:#99a4ae;font-size:9px;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cx4-table-card{overflow:hidden;border-radius:14px}.cx4-card-head{display:flex;justify-content:space-between;align-items:center;padding:15px 16px;border-bottom:1px solid #e5ebef}.cx4-card-head span{font-size:9px;font-weight:900;letter-spacing:.1em;color:#4b927f}.cx4-card-head h2{margin:3px 0 0;font-size:17px}.cx4-card-head>b{font-size:11px;color:#708091}
        .cx4-table-wrap{max-height:650px;overflow:auto}.cx4-table-wrap table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0}.cx4-table-wrap th{position:sticky;top:0;background:#f7f9fb;padding:10px 12px;text-align:left;border-bottom:1px solid #dfe7ed;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#738293}.cx4-table-wrap td{padding:10px 12px;border-bottom:1px solid #edf1f4;font-size:12px;color:#263a4e}.cx4-table-wrap code{font-size:10px;background:#f2f5f7;padding:4px 6px;border-radius:6px;color:#5d6f81}
        .cx4-rank{display:grid;place-items:center;width:27px;height:27px;border-radius:8px;background:#edf2f5;font-weight:850}.cx4-cell{display:inline-flex;justify-content:center;min-width:34px;border-radius:7px;padding:5px 7px;font-weight:900}.cx4-cell.zero{background:#edf8f2;color:#4f8068}.cx4-cell.one{background:#fff4cf;color:#8b6818}.cx4-cell.two{background:#fde6b7;color:#945f08}.cx4-cell.high{background:#f7dde0;color:#a3424b}.cx4-total{display:inline-flex;justify-content:center;min-width:38px;border-radius:7px;padding:6px 8px;background:#edf2f5;font-weight:900;color:#1f3a50}
        .cx4-table-wrap td:last-child button{border:1px solid #d5dee5;background:#fff;border-radius:7px;padding:6px 10px;color:#376f64;font-weight:800;cursor:pointer}.cx4-table-wrap td:last-child button:disabled{opacity:.4;cursor:not-allowed}
        .cx4-empty{padding:38px;text-align:center;border-radius:14px}.cx4-empty h2{margin:0 0 8px}.cx4-empty p{margin:0;color:#738394}
        @media(max-width:900px){.cx4-toolbar,.cx4-toolbar.with-site{grid-template-columns:1fr 1fr}.cx4-search{grid-column:1/-1}.cx4-kpis,.cx4-weeks{grid-template-columns:1fr 1fr}}
        @media(max-width:620px){.cx4-hero{align-items:flex-start;flex-direction:column}.cx4-lock{align-items:flex-start}.cx4-toolbar,.cx4-toolbar.with-site{grid-template-columns:1fr}.cx4-search{grid-column:auto}.cx4-kpis,.cx4-weeks{grid-template-columns:1fr 1fr}}
      `}</style>
    </div>
  );
}
