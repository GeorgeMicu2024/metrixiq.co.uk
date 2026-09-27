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
  const count = Number(value || 0);
  if (count === 0) return "zero";
  if (count === 1) return "one";
  if (count === 2) return "two";
  return "high";
};

export default function ConcessionsSimpleView({
  organizationId,
  onOpenDriver,
  siteFilter = "all",
  onSiteFilterChange,
  refreshKey = 0,
}) {
  const [load, setLoad] = useState({ loading: true, error: "", rows: [] });
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
      [...new Set(
        (load.rows || [])
          .map((row) => String(row.site || "").toUpperCase())
          .filter(Boolean)
      )].sort(),
    [load.rows]
  );

  useEffect(() => {
    if (
      !load.loading &&
      globalSite === "ALL" &&
      availableSites.length &&
      onSiteFilterChange
    ) {
      onSiteFilterChange(availableSites[0]);
    }
  }, [load.loading, globalSite, availableSites.join("|"), onSiteFilterChange]);

  const site =
    globalSite !== "ALL"
      ? globalSite
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
      weeks.map((week, index) => {
        const rows = (load.rows || []).filter(
          (row) =>
            row.site === site &&
            row.week_label === week &&
            Number(row.dnr || 0) > 0
        );
        const total = rows.reduce(
          (sum, row) => sum + Number(row.dnr || 0),
          0
        );
        const previous =
          index > 0
            ? (load.rows || [])
                .filter(
                  (row) =>
                    row.site === site &&
                    row.week_label === weeks[index - 1] &&
                    Number(row.dnr || 0) > 0
                )
                .reduce((sum, row) => sum + Number(row.dnr || 0), 0)
            : null;

        return {
          week,
          total,
          affected: new Set(rows.map((row) => row.driver_trid)).size,
          source: rows[0]?.source_file || "",
          delta: previous == null ? null : total - previous,
        };
      }),
    [load.rows, site, weeks]
  );

  const latestWeek = weeks[weeks.length - 1] || "";
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return matrix.filter((row) => {
      if (show === "repeat" && row.affectedWeeks < 2) return false;
      if (show === "latest" && Number(row.byWeek?.[latestWeek] || 0) <= 0) {
        return false;
      }

      if (!needle) return true;
      return `${row.driver_name} ${row.driver_trid}`
        .toLowerCase()
        .includes(needle);
    });
  }, [matrix, query, show, latestWeek]);

  const fourWeekTotal = weekly.reduce((sum, item) => sum + item.total, 0);
  const uniqueAffected = matrix.length;
  const repeatDrivers = matrix.filter((row) => row.affectedWeeks >= 2).length;
  const latestTotal =
    weekly.find((item) => item.week === latestWeek)?.total || 0;
  const maxWeek = Math.max(1, ...weekly.map((item) => item.total));

  if (load.loading) return <Loading text="Loading clean concessions history…" />;
  if (load.error) return <ErrorBox error={load.error} />;

  return (
    <div className="cx5">
      <header className="cx5-heading">
        <div>
          <span className="page-kicker">QUALITY INTELLIGENCE</span>
          <h1>Concessions</h1>
          <p>
            Clean DNR history from dedicated Associates Concessions snapshots.
            The view always shows the latest four available weeks.
          </p>
        </div>
        <div className="cx5-heading-meta">
          <span>4-week view</span>
          <b>Verified snapshots</b>
        </div>
      </header>

      {!site || !weeks.length ? (
        <section className="panel cx5-empty">
          <div className="cx5-empty-icon">!</div>
          <h2>No clean concessions history for this site</h2>
          <p>
            Use the Site selector in the top bar, then import a dedicated
            Associates Concessions CSV for that station.
          </p>
        </section>
      ) : (
        <>
          <section className="panel cx5-summary">
            <div>
              <span>4W DNR</span>
              <strong>{fourWeekTotal}</strong>
              <small>{weeks[0]}–{latestWeek}</small>
            </div>
            <div>
              <span>Unique affected</span>
              <strong>{uniqueAffected}</strong>
              <small>Across the 4-week window</small>
            </div>
            <div>
              <span>Repeat drivers</span>
              <strong>{repeatDrivers}</strong>
              <small>Affected in 2+ weeks</small>
            </div>
            <div className="latest">
              <span>{latestWeek} DNR</span>
              <strong>{latestTotal}</strong>
              <small>Latest imported week</small>
            </div>
          </section>

          <section className="panel cx5-trend">
            <div className="cx5-section-head">
              <div>
                <span className="page-kicker">WEEKLY TREND</span>
                <h2>Four-week movement</h2>
              </div>
              <small>Lower DNR is better</small>
            </div>

            <div className="cx5-trend-grid">
              {weekly.map((item, index) => {
                const isLatest = index === weekly.length - 1;
                const deltaClass =
                  item.delta == null
                    ? "neutral"
                    : item.delta < 0
                      ? "better"
                      : item.delta > 0
                        ? "worse"
                        : "neutral";

                return (
                  <article key={item.week} className={isLatest ? "latest" : ""}>
                    <div className="cx5-trend-top">
                      <span>{item.week}</span>
                      {isLatest && <em>LATEST</em>}
                    </div>
                    <div className="cx5-trend-value">
                      <strong>{item.total}</strong>
                      <small>DNR</small>
                    </div>
                    <div className="cx5-trend-bar">
                      <i style={{ width: `${Math.max(8, (item.total / maxWeek) * 100)}%` }} />
                    </div>
                    <div className="cx5-trend-foot">
                      <span>{item.affected} drivers</span>
                      <b className={deltaClass}>
                        {item.delta == null
                          ? "Baseline"
                          : item.delta === 0
                            ? "No change"
                            : `${item.delta > 0 ? "+" : ""}${item.delta} vs prev`}
                      </b>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel cx5-matrix">
            <div className="cx5-matrix-head">
              <div>
                <span className="page-kicker">DRIVER DETAIL</span>
                <h2>4-week concession matrix</h2>
                <p>
                  Compare individual DNR movement and identify repeat patterns.
                </p>
              </div>

              <div className="cx5-filterbar">
                <label className="cx5-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search driver or TRID…"
                  />
                </label>

                <select
                  value={show}
                  onChange={(event) => setShow(event.target.value)}
                  aria-label="Filter concessions drivers"
                >
                  <option value="all">All affected drivers</option>
                  <option value="repeat">Repeat · 2+ weeks</option>
                  <option value="latest">Latest week only</option>
                </select>
              </div>
            </div>

            <div className="cx5-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Driver</th>
                    <th>TRID</th>
                    {weeks.map((week) => (
                      <th
                        key={week}
                        className={week === latestWeek ? "latest-col" : ""}
                      >
                        {week}
                      </th>
                    ))}
                    <th>4W total</th>
                    <th>Weeks</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, index) => (
                    <tr key={row.driver_trid}>
                      <td>
                        <span className="cx5-rank">{index + 1}</span>
                      </td>
                      <td>
                        <div className="cx5-driver">
                          <b>{row.driver_name}</b>
                          {row.affectedWeeks >= 3 && <small>Repeat pattern</small>}
                        </div>
                      </td>
                      <td>
                        <code>{row.driver_trid}</code>
                      </td>
                      {weeks.map((week) => {
                        const value = Number(row.byWeek?.[week] || 0);
                        return (
                          <td
                            key={week}
                            className={week === latestWeek ? "latest-col" : ""}
                          >
                            <span className={"cx5-cell " + cellTone(value)}>
                              {value || "—"}
                            </span>
                          </td>
                        );
                      })}
                      <td>
                        <span className="cx5-total">{row.total}</span>
                      </td>
                      <td>
                        <span className={row.affectedWeeks >= 2 ? "cx5-repeat" : "cx5-weeks"}>
                          {row.affectedWeeks}/4
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cx5-open"
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
                          Open
                          <span>→</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={weeks.length + 6}>
                        <div className="cx5-no-results">
                          No drivers match the current filter.
                        </div>
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
        .cx5{display:grid;gap:14px;padding-bottom:28px;max-width:1600px;margin:0 auto}
        .cx5-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:28px;padding:10px 2px 4px}
        .cx5-heading h1{margin:5px 0 5px;font-size:30px;line-height:1.05;letter-spacing:-.035em;color:#10263a}
        .cx5-heading p{margin:0;max-width:780px;font-size:12px;line-height:1.55;color:#738395}
        .cx5-heading-meta{display:flex;align-items:center;gap:8px;white-space:nowrap}
        .cx5-heading-meta span,.cx5-heading-meta b{display:inline-flex;align-items:center;height:30px;padding:0 10px;border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
        .cx5-heading-meta span{border:1px solid #dce5eb;background:#fff;color:#66798b}
        .cx5-heading-meta b{border:1px solid #c8e5da;background:#eff9f5;color:#25725f}

        .cx5-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));overflow:hidden;padding:0;border-radius:14px}
        .cx5-summary>div{padding:17px 20px;border-right:1px solid #e5ebef;min-height:96px}
        .cx5-summary>div:last-child{border-right:0}
        .cx5-summary>div.latest{background:linear-gradient(180deg,#f6fcfa 0%,#fff 100%)}
        .cx5-summary span{display:block;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#788898}
        .cx5-summary strong{display:block;margin:7px 0 3px;font-size:27px;line-height:1;color:#132a3e}
        .cx5-summary small{font-size:10px;color:#85929f}

        .cx5-trend{padding:16px 18px 18px;border-radius:14px}
        .cx5-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:12px}
        .cx5-section-head h2{margin:3px 0 0;font-size:16px;color:#173047}
        .cx5-section-head>small{font-size:10px;color:#8995a0}
        .cx5-trend-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #e3e9ee;border-radius:11px;overflow:hidden}
        .cx5-trend-grid article{padding:13px 15px;border-right:1px solid #e7ecef;background:#fff}
        .cx5-trend-grid article:last-child{border-right:0}
        .cx5-trend-grid article.latest{background:#f5fbf9}
        .cx5-trend-top{display:flex;align-items:center;justify-content:space-between}
        .cx5-trend-top>span{font-size:10px;font-weight:900;color:#5e7081}
        .cx5-trend-top em{font-size:8px;font-style:normal;font-weight:900;color:#20715e;background:#dff3eb;border-radius:999px;padding:3px 6px}
        .cx5-trend-value{display:flex;align-items:flex-end;gap:5px;margin:8px 0}
        .cx5-trend-value strong{font-size:23px;line-height:1;color:#152b40}
        .cx5-trend-value small{font-size:9px;color:#82909e;padding-bottom:2px}
        .cx5-trend-bar{height:5px;border-radius:99px;background:#edf1f4;overflow:hidden}
        .cx5-trend-bar i{display:block;height:100%;border-radius:99px;background:#2d8f79}
        .cx5-trend-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:9px}
        .cx5-trend-foot span{color:#81909d}
        .cx5-trend-foot b{font-weight:850}
        .cx5-trend-foot b.better{color:#19805e}
        .cx5-trend-foot b.worse{color:#b44a54}
        .cx5-trend-foot b.neutral{color:#7b8996}

        .cx5-matrix{overflow:hidden;border-radius:14px;padding:0}
        .cx5-matrix-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:16px 18px;border-bottom:1px solid #e6ebef}
        .cx5-matrix-head h2{margin:3px 0 2px;font-size:17px;color:#142b40}
        .cx5-matrix-head p{margin:0;font-size:10px;color:#81909e}
        .cx5-filterbar{display:flex;align-items:center;gap:8px;min-width:min(520px,48vw)}
        .cx5-search{display:flex;align-items:center;gap:7px;flex:1;height:38px;padding:0 11px;border:1px solid #d3dde5;border-radius:9px;background:#fff}
        .cx5-search span{font-size:15px;color:#84929f}
        .cx5-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#173047;font-size:11px}
        .cx5-filterbar select{height:38px;min-width:170px;border:1px solid #d3dde5;border-radius:9px;background:#fff;padding:0 10px;color:#334b60;font-size:10px;font-weight:750}

        .cx5-table-wrap{max-height:600px;overflow:auto}
        .cx5-table-wrap table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0}
        .cx5-table-wrap th{position:sticky;top:0;z-index:2;padding:10px 12px;background:#f7f9fa;border-bottom:1px solid #dce4ea;text-align:left;font-size:8px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:#778797}
        .cx5-table-wrap th.latest-col,.cx5-table-wrap td.latest-col{background:#f3faf7}
        .cx5-table-wrap td{padding:9px 12px;border-bottom:1px solid #edf1f4;font-size:11px;color:#253b50;vertical-align:middle}
        .cx5-table-wrap tbody tr:hover td{background:#fafcfd}
        .cx5-table-wrap tbody tr:hover td.latest-col{background:#eff8f4}
        .cx5-rank{display:grid;place-items:center;width:25px;height:25px;border-radius:7px;background:#edf2f5;color:#486075;font-size:10px;font-weight:850}
        .cx5-driver{display:grid;gap:2px}
        .cx5-driver b{font-size:11px;color:#13283c}
        .cx5-driver small{font-size:8px;font-weight:800;color:#a45a61;text-transform:uppercase;letter-spacing:.04em}
        .cx5-table-wrap code{font-size:9px;background:#f1f4f6;color:#68798a;border-radius:5px;padding:3px 5px}
        .cx5-cell{display:inline-flex;align-items:center;justify-content:center;min-width:31px;height:25px;border-radius:7px;font-size:10px;font-weight:900}
        .cx5-cell.zero{background:#edf7f2;color:#4f8068}
        .cx5-cell.one{background:#fff3d5;color:#8b6818}
        .cx5-cell.two{background:#fde8bd;color:#935f08}
        .cx5-cell.high{background:#f8dfe2;color:#a43f49}
        .cx5-total{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:26px;padding:0 7px;border-radius:7px;background:#eaf0f4;color:#1a364d;font-weight:900}
        .cx5-weeks,.cx5-repeat{display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:24px;padding:0 7px;border-radius:999px;font-size:9px;font-weight:850}
        .cx5-weeks{background:#eff3f6;color:#617486}
        .cx5-repeat{background:#fff0df;color:#986119}
        .cx5-open{display:inline-flex;align-items:center;gap:5px;border:1px solid #d3dee6;background:#fff;border-radius:7px;height:29px;padding:0 9px;color:#2b7162;font-size:9px;font-weight:850;cursor:pointer}
        .cx5-open:disabled{opacity:.4;cursor:not-allowed}
        .cx5-no-results{padding:30px;text-align:center;color:#83909c}

        .cx5-empty{display:grid;justify-items:center;text-align:center;gap:7px;padding:44px;border-radius:14px}
        .cx5-empty-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#f0f5f7;color:#5a7184;font-weight:900}
        .cx5-empty h2{margin:3px 0 0;font-size:18px}
        .cx5-empty p{margin:0;max-width:600px;color:#748493;font-size:11px;line-height:1.5}

        @media(max-width:980px){
          .cx5-summary,.cx5-trend-grid{grid-template-columns:1fr 1fr}
          .cx5-summary>div:nth-child(2){border-right:0}
          .cx5-summary>div:nth-child(-n+2){border-bottom:1px solid #e5ebef}
          .cx5-trend-grid article:nth-child(2){border-right:0}
          .cx5-trend-grid article:nth-child(-n+2){border-bottom:1px solid #e7ecef}
          .cx5-matrix-head{align-items:stretch;flex-direction:column}
          .cx5-filterbar{min-width:0;width:100%}
        }
        @media(max-width:640px){
          .cx5-heading{align-items:flex-start;flex-direction:column}
          .cx5-heading-meta{align-self:flex-start}
          .cx5-summary,.cx5-trend-grid{grid-template-columns:1fr 1fr}
          .cx5-filterbar{flex-direction:column;align-items:stretch}
          .cx5-filterbar select{width:100%}
        }
      `}</style>
    </div>
  );
}
