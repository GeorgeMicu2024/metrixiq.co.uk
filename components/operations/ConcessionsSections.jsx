"use client";

import { RangeTabs, dname, openShape, trid } from "./OperationalShared";

export function ConcessionsHeader({ view, setView, range, setRange }) {
  return (
    <div className="cx2-head">
      <div>
        <span className="cx2-kicker">QUALITY INTELLIGENCE</span>
        <h1>Concessions</h1>
        <p>Weekly DNR performance, driver ranking and repeat-risk analysis.</p>
      </div>

      <div className="cx2-head-actions">
        <div className="cx2-view-tabs">
          <button
            type="button"
            className={view==="overview"?"active":""}
            onClick={()=>setView("overview")}
          >
            Overview
          </button>

          <button
            type="button"
            className={view==="matrix"?"active":""}
            onClick={()=>setView("matrix")}
          >
            Driver matrix
          </button>
        </div>

        <RangeTabs value={range} onChange={setRange}/>
      </div>
    </div>
  );
}

export function ConcessionsKpis({
  effectiveRankWeek,
  selectedTotal,
  weeks,
  selectedAffected,
  leader,
  valueFor,
  wow,
  latestWeek,
  previousWeek,
}) {
  return (
    <section className="cx2-kpis">
      <article>
        <span>
          {effectiveRankWeek==="total"
            ?"Selected period"
            :`${effectiveRankWeek} concessions`}
        </span>

        <strong>{selectedTotal}</strong>

        <small>
          {effectiveRankWeek==="total"
            ?`${weeks.length} weeks selected`
            :"Total DNR"}
        </small>
      </article>

      <article>
        <span>Affected drivers</span>
        <strong>{selectedAffected}</strong>
        <small>
          {effectiveRankWeek==="total"
            ?"Across selected period"
            :effectiveRankWeek}
        </small>
      </article>

      <article>
        <span>Highest driver</span>
        <strong>{leader?valueFor(leader):"—"}</strong>
        <small>
          {leader
            ?dname(leader.driver)
            :"No affected drivers"}
        </small>
      </article>

      <article className={wow>0?"risk":wow<0?"good":""}>
        <span>Latest movement</span>
        <strong>
          {wow==null
            ?"—"
            :wow===0
              ?"0"
              :`${wow>0?"↑":"↓"} ${Math.abs(wow)}`}
        </strong>
        <small>
          {latestWeek&&previousWeek
            ?`${latestWeek} vs ${previousWeek}`
            :"Previous week unavailable"}
        </small>
      </article>
    </section>
  );
}

export function ConcessionsMatrix({
  effectiveRankWeek,
  selectedTotal,
  selectedAffected,
  setRankWeek,
  importedWeeks,
  showMode,
  setShowMode,
  sortMode,
  setSortMode,
  query,
  setQuery,
  weeks,
  presentSet,
  chooseWeek,
  weekTotals,
  filtered,
  siteLabel,
  onOpenDriver,
}) {
  return (
    <section className="cx2-card cx2-matrix-card">
        <div className="cx2-card-head">
          <div>
            <span>DRIVER DETAIL</span>
            <h2>Weekly concession ranking</h2>
            <p>Select a week to instantly rank drivers by that week.</p>
          </div>

          <div className="cx2-summary-pill">
            <b>
              {effectiveRankWeek==="total"
                ?"Period total"
                :effectiveRankWeek}
            </b>
            <span>
              {selectedTotal} concessions · {selectedAffected} affected
            </span>
          </div>
        </div>

        <div className="cx2-toolbar">
          <label>
            <span>Rank by</span>
            <select
              value={effectiveRankWeek}
              onChange={e=>setRankWeek(e.target.value)}
            >
              <option value="total">Total period</option>

              {importedWeeks.map(w=>
                <option key={w} value={w}>{w}</option>
              )}
            </select>
          </label>

          <label>
            <span>Show</span>
            <select
              value={showMode}
              onChange={e=>setShowMode(e.target.value)}
            >
              <option value="all">All drivers</option>
              <option value="affected">Affected only</option>
              <option value="repeat">Repeat drivers</option>
            </select>
          </label>

          <label>
            <span>Sort</span>
            <select
              value={sortMode}
              onChange={e=>setSortMode(e.target.value)}
            >
              <option value="desc">Highest first</option>
              <option value="asc">Lowest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>

          <label className="cx2-search-label">
            <span>Search</span>
            <input
              value={query}
              onChange={e=>setQuery(e.target.value)}
              placeholder="Driver name or TRID…"
            />
          </label>

          <button
            type="button"
            className="cx2-reset"
            onClick={()=>{
              setRankWeek("");
              setSortMode("desc");
              setShowMode("all");
              setQuery("");
            }}
          >
            Reset
          </button>
        </div>

        <div className="cx2-week-strip">
          {weeks.map((w,i)=>{
            const imported=presentSet.has(w);
            const selected=effectiveRankWeek===w;

            return <button
              key={w}
              type="button"
              disabled={!imported}
              className={`${selected?"selected":""} ${!imported?"missing":""}`}
              onClick={()=>chooseWeek(w)}
            >
              <span>{w}</span>
              <strong>{imported?weekTotals[i]:"—"}</strong>
            </button>;
          })}

          <button
            type="button"
            className={effectiveRankWeek==="total"?"selected":""}
            onClick={()=>{
              setRankWeek("total");
              setSortMode("desc");
            }}
          >
            <span>Total</span>
            <strong>{weekTotals.reduce((a,b)=>a+b,0)}</strong>
          </button>
        </div>

        <div className="cx2-table-wrap">
          <table className="cx2-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Driver</th>
                <th>TRID</th>

                {weeks.map(w=>
                  <th
                    key={w}
                    className={effectiveRankWeek===w?"selected-col":""}
                  >
                    <button
                      type="button"
                      disabled={!presentSet.has(w)}
                      onClick={()=>chooseWeek(w)}
                    >
                      {w}
                    </button>
                  </th>
                )}

                <th className={effectiveRankWeek==="total"?"selected-col":""}>
                  Total
                </th>

                <th>Affected</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((item,index)=>
                <tr
                  key={item.id}
                  className={index<3&&sortMode==="desc"?"top-row":""}
                >
                  <td>
                    <span className="cx2-rank">{index+1}</span>
                  </td>

                  <td className="cx2-driver-cell">
                    <b>{dname(item.driver)}</b>
                    <small>{siteLabel(item.driver)}</small>
                  </td>

                  <td>
                    <code>{trid(item.driver)}</code>
                  </td>

                  {item.values.map((value,j)=>{
                    const week=weeks[j];
                    const imported=presentSet.has(week);
                    const selected=effectiveRankWeek===week;

                    if(!imported){
                      return <td
                        key={week}
                        className={`cx2-empty ${selected?"selected-col":""}`}
                      >
                        —
                      </td>;
                    }

                    if(value==null){
                      return <td
                        key={week}
                        className={selected?"selected-col":""}
                      >
                        <span className="cx2-score zero">—</span>
                      </td>;
                    }

                    const tone=
                      value===0
                        ?"good"
                        :value===1
                          ?"warn"
                          :value===2
                            ?"med"
                            :"high";

                    return <td
                      key={week}
                      className={selected?"selected-col":""}
                    >
                      <span className={`cx2-score ${tone}`}>
                        {value}
                      </span>
                    </td>;
                  })}

                  <td className={effectiveRankWeek==="total"?"selected-col":""}>
                    <b className="cx2-total">{item.total}</b>
                  </td>

                  <td>
                    <span className="cx2-affected">
                      {item.affected}/{item.reported}
                    </span>
                  </td>

                  <td>
                    <button
                      className="profile-link"
                      onClick={()=>onOpenDriver?.(
                        openShape(item.row,{concessions:item.total})
                      )}
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              )}

              {!filtered.length&&
                <tr>
                  <td colSpan={6+weeks.length}>
                    <div className="v10-empty">
                      No drivers match the selected filters.
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div className="cx2-footnote">
          <span>{filtered.length} drivers shown</span>
          <span>Click any week header to rank by that week.</span>
        </div>
      </section>
  );
}

export function ConcessionsOverview({
  chartWidth,
  chartHeight,
  chartTop,
  chartPlotHeight,
  chartLeft,
  chartRight,
  areaPoints,
  linePoints,
  trendPoints,
  effectiveRankWeek,
  chooseWeek,
  priority,
  onOpenDriver,
  missingWeeks,
  weeks,
  presentSet,
  weekTotals,
}) {
  return (
    <>
      <section className="cx2-overview-grid">
        <article className="cx2-card">
          <div className="cx2-card-head">
            <div>
              <span>WEEKLY TREND</span>
              <h2>Concessions movement</h2>
              <p>Lower is better.</p>
            </div>
          </div>

          <div className="cx2-trend-shell">
            <div className="cx2-trend-legend">
              <span><i className="dot current"/>Weekly DNR</span>
              <span className="hint">Click a week to open its driver ranking</span>
            </div>

            <div className="cx2-trend-chart">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                role="img"
                aria-label="Weekly concessions trend"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="cx2TrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4e9788" stopOpacity="0.22"/>
                    <stop offset="100%" stopColor="#4e9788" stopOpacity="0.02"/>
                  </linearGradient>
                </defs>

                {[0,0.25,0.5,0.75,1].map((step)=>{
                  const y=chartTop+step*chartPlotHeight;
                  return <line
                    key={step}
                    x1={chartLeft}
                    y1={y}
                    x2={chartWidth-chartRight}
                    y2={y}
                    className="cx2-gridline"
                  />;
                })}

                {areaPoints&&<polygon
                  points={areaPoints}
                  fill="url(#cx2TrendFill)"
                />}

                {linePoints&&<polyline
                  points={linePoints}
                  className="cx2-trend-line"
                />}

                {trendPoints.map((point)=>{
                  if(!point.imported){
                    return <g key={point.week}>
                      <circle
                        cx={point.x}
                        cy={chartTop+chartPlotHeight}
                        r="5"
                        className="cx2-missing-dot"
                      />
                      <text
                        x={point.x}
                        y={chartHeight-11}
                        textAnchor="middle"
                        className="cx2-axis-label missing"
                      >
                        {point.week}
                      </text>
                    </g>;
                  }

                  const selected=effectiveRankWeek===point.week;

                  return <g
                    key={point.week}
                    className="cx2-point-group"
                    onClick={()=>chooseWeek(point.week)}
                  >
                    {selected&&<circle
                      cx={point.x}
                      cy={point.y}
                      r="12"
                      className="cx2-selected-ring"
                    />}

                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="6"
                      className="cx2-point"
                    />

                    <text
                      x={point.x}
                      y={Math.max(18,point.y-15)}
                      textAnchor="middle"
                      className="cx2-point-value"
                    >
                      {point.value}
                    </text>

                    <text
                      x={point.x}
                      y={chartHeight-11}
                      textAnchor="middle"
                      className={`cx2-axis-label ${selected?"selected":""}`}
                    >
                      {point.week}
                    </text>
                  </g>;
                })}
              </svg>
            </div>

            <div className="cx2-delta-row">
              {trendPoints.map((point)=>
                <button
                  key={point.week}
                  type="button"
                  disabled={!point.imported}
                  onClick={()=>chooseWeek(point.week)}
                  className={`${effectiveRankWeek===point.week?"selected":""} ${!point.imported?"missing":""}`}
                >
                  <span>{point.week}</span>
                  <b>{point.imported?point.value:"—"}</b>
                  <small className={point.delta>0?"up":point.delta<0?"down":"flat"}>
                    {point.delta==null
                      ?"No comparison"
                      :point.delta>0
                        ?`+${point.delta} vs prev`
                        :point.delta<0
                          ?`${point.delta} vs prev`
                          :"No change"}
                  </small>
                </button>
              )}
            </div>
          </div>
        </article>

        <article className="cx2-card">
          <div className="cx2-card-head">
            <div>
              <span>TOP DRIVERS</span>
              <h2>
                {effectiveRankWeek==="total"
                  ?"Selected period"
                  :effectiveRankWeek}
              </h2>
              <p>Highest DNR counts.</p>
            </div>
          </div>

          <div className="cx2-top-list">
            {priority.map((item,index)=>
              <button
                key={item.id}
                type="button"
                onClick={()=>onOpenDriver?.(
                  openShape(item.row,{concessions:item.total})
                )}
              >
                <span className="cx2-rank">{index+1}</span>

                <div>
                  <b>{dname(item.driver)}</b>
                  <small>{trid(item.driver)}</small>
                </div>

                <strong>{valueFor(item)??"—"}</strong>
              </button>
            )}
          </div>
        </article>
      </section>

      <section className="cx2-card cx2-health">
        <div className="cx2-card-head">
          <div>
            <span>REPORTING HEALTH</span>
            <h2>Imported weeks</h2>
            <p>
              {missingWeeks.length
                ?`${missingWeeks.length} missing report${missingWeeks.length>1?"s":""}`
                :"All selected weeks are available."}
            </p>
          </div>
        </div>

        <div className="cx2-health-row">
          {weeks.map((w,i)=>
            <button
              key={w}
              type="button"
              disabled={!presentSet.has(w)}
              onClick={()=>chooseWeek(w)}
              className={presentSet.has(w)?"ok":"missing"}
            >
              <span>{w}</span>
              <b>
                {presentSet.has(w)
                  ?weekTotals[i]
                  :"Not imported"}
              </b>
            </button>
          )}
        </div>
      </section>
    </>
  );
}
