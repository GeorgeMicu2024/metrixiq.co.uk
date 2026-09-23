function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function generatedLabel(value) {
  if (!value) return "Live workspace evidence";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Live workspace evidence";
  return `Updated ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function mapPriorityDrivers(summary, drivers, fallback = []) {
  const byDbId = new Map(drivers.map((driver) => [String(driver.dbId || ""), driver]));
  const byTrid = new Map(drivers.map((driver) => [String(driver.id || "").toUpperCase(), driver]));
  const matched = [];

  for (const item of summary?.priority_drivers || []) {
    const driver =
      byDbId.get(String(item.driver_id || "")) ||
      byTrid.get(String(item.trid || "").toUpperCase());

    if (driver && !matched.some((entry) => entry.driver === driver)) {
      matched.push({ driver, evidence: item });
    }
  }

  if (matched.length) return matched.slice(0, 4);

  return fallback.slice(0, 4).map((item) => ({
    driver: item.driver,
    evidence: {
      alert_count: item.reasons?.length || 0,
      high_count: String(item.driver?.risk || "").toLowerCase() === "high" ? 1 : 0,
      alerts: [],
    },
  }));
}

export default function CommandCenterPanel({
  summary,
  intelligence,
  drivers,
  history = [],
  siteFilter = "all",
  onCoaching,
  onConcessions,
  onImport,
  onPerformance,
  onDataQuality,
  onOpenDriver,
}) {
  const alerts = summary?.alerts || {};
  const coaching = summary?.coaching || {};
  const priorityAlerts = n(alerts.critical) + n(alerts.high);
  const deterioration = n(alerts.dcr_drop) + n(alerts.deteriorating);
  const priorities = mapPriorityDrivers(summary, drivers, intelligence.priorityDrivers);
  const trendRows = Array.isArray(history) ? history.slice(-8) : [];
  const trendMetrics = [
    ["IADC", "iadc"], ["DCR", "dcr"], ["POD", "pod"], ["eMentor", "fico"], ["Concessions", "concessions"],
  ];
  const metricValue = (row, key) => {
    const value = Number(row?.[key]);
    return Number.isFinite(value) ? value : null;
  };
  const latestTrend = trendRows[trendRows.length - 1] || null;
  const previousTrend = trendRows[trendRows.length - 2] || null;

  const cards = [
    {
      key: "alerts",
      label: "Priority alerts",
      value: priorityAlerts,
      note: `${n(alerts.critical)} critical · ${n(alerts.high)} high`,
      tone: priorityAlerts ? "danger" : "good",
      action: onCoaching,
    },
    {
      key: "coaching",
      label: "Overdue coaching",
      value: n(coaching.overdue),
      note: `${n(coaching.open)} open case${n(coaching.open) === 1 ? "" : "s"}`,
      tone: n(coaching.overdue) ? "warn" : "good",
      action: onCoaching,
    },
    {
      key: "concessions",
      label: "Repeat concessions",
      value: n(alerts.repeat_concessions),
      note: "Current alert period",
      tone: n(alerts.repeat_concessions) ? "warn" : "good",
      action: onConcessions,
    },
    {
      key: "trend",
      label: "Deterioration signals",
      value: deterioration,
      note: `${n(alerts.dcr_drop)} DCR drop · ${n(alerts.deteriorating)} trend`,
      tone: deterioration ? "warn" : "good",
      action: onPerformance,
    },
  ];

  return (
    <section className="command-center">
      <div className="command-center-head">
        <div>
          <span className="page-kicker">TODAY · COMMAND CENTER</span>
          <h2>Management priorities</h2>
          <p>
            {summary?.period_label ? `Latest alert period: ${summary.period_label}` : "Latest available workspace evidence"}
            {" · "}
            {intelligence.completeness}% evidence coverage
          </p>
        </div>
        <div className="command-center-meta">
          <span>{generatedLabel(summary?.generated_at)}</span>
          <button type="button" className="btn ghost" onClick={onImport}>Import evidence</button>
        </div>
      </div>

      <div className="command-center-grid">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`command-center-card ${card.tone}`}
            onClick={card.action}
            disabled={!card.action}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </button>
        ))}
      </div>

      <div className="command-center-trends" style={{marginTop:16}}>
        <div className="command-center-section-head">
          <div><b>{siteFilter === "all" ? "All Sites performance trend" : `${siteFilter} performance trend`}</b><span>Last {trendRows.length || 0} reporting periods · Activity Site evidence.</span></div>
        </div>
        <div className="command-center-grid">
          {trendMetrics.map(([label,key]) => {
            const current = metricValue(latestTrend,key);
            const previous = metricValue(previousTrend,key);
            const delta = current != null && previous != null ? current - previous : null;
            return <div key={key} className="command-center-card">
              <span>{label}</span><strong>{current == null ? "—" : (key === "fico" ? Math.round(current) : current.toFixed(1))}</strong>
              <small>{delta == null ? "No comparison yet" : `${delta >= 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)} vs previous period`}</small>
            </div>;
          })}
        </div>
        {trendRows.length > 1 ? <div style={{display:"grid",gridTemplateColumns:`repeat(${trendRows.length},minmax(0,1fr))`,gap:6,alignItems:"end",height:92,marginTop:14}}>
          {trendRows.map((row,index) => { const value=metricValue(row,"performance") ?? metricValue(row,"iadc") ?? 0; return <div key={row.week||row.week_label||index} title={String(row.week||row.week_label||index+1)} style={{height:`${Math.max(8,Math.min(100,value))}%`,borderRadius:"6px 6px 2px 2px",background:"var(--miq-accent)",opacity:.45+index/(trendRows.length*2)}} />; })}
        </div> : null}
      </div>

      <div className="command-center-lower">
        <div className="command-center-priorities">
          <div className="command-center-section-head">
            <div>
              <b>Priority drivers</b>
              <span>Server-side alerts matched to the current driver directory.</span>
            </div>
            <button type="button" onClick={onCoaching}>Open coaching →</button>
          </div>

          <div className="command-center-driver-list">
            {priorities.length ? priorities.map(({ driver, evidence }, index) => (
              <button
                key={driver.dbId || driver.id || index}
                type="button"
                onClick={() => onOpenDriver?.(driver)}
              >
                <span className="command-center-rank">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{driver.name || "Unresolved identity"}</b>
                  <small>{driver.site || "No site"} · {driver.id || "No TRID"}</small>
                </div>
                <strong>{n(evidence.alert_count)}</strong>
                <em>alert{n(evidence.alert_count) === 1 ? "" : "s"}</em>
              </button>
            )) : (
              <div className="command-center-empty">
                <b>No priority driver alert is active.</b>
                <span>Current evidence does not require immediate driver intervention.</span>
              </div>
            )}
          </div>
        </div>

        <div className="command-center-actions">
          <div className="command-center-section-head">
            <div>
              <b>Next best actions</b>
              <span>Evidence-led management workflow.</span>
            </div>
          </div>

          {intelligence.actions.slice(0, 3).map((action, index) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                if (action.destination === "coaching") return onCoaching?.();
                if (action.destination === "imports") return onImport?.();
                if (action.destination === "data-quality") return onDataQuality?.();
                if (action.destination === "performance") return onPerformance?.();
                if (action.id === "concessions") return onConcessions?.();
                return onCoaching?.();
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <b>{action.title}</b>
                <small>{action.text}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
