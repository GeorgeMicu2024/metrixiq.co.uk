"use client";

import { useMemo } from "react";
import { buildPredictiveInsights } from "../../lib/ai-lab/predictive-insights.mjs";
import styles from "./AiPredictivePanel.module.css";

const showNumber = (value, unit) => value === null || value === undefined ? "—" :
  `${value}${unit === "%" ? "%" : unit === "DPMO" ? " DPMO" : ""}`;

export default function AiPredictivePanel({ analysis, onAskAI = () => {} }) {
  const prediction = useMemo(() => {
    try { return buildPredictiveInsights(analysis); } catch { return null; }
  }, [analysis]);
  if (!prediction) return <section className={styles.panel} aria-label="IQ Predictive Intelligence">
    <p className={styles.error}>The selected historical data cannot be used for a predictive check.</p>
  </section>;

  const available = prediction.forecasts.filter(item => item.status === "projected").length;
  function askIQ() {
    onAskAI(prediction.context, `IQ, explain the cautious one-week predictive scenarios for ${prediction.site} using ${prediction.periods.join(", ")}. Separate backtest-supported warnings, low-confidence estimates and missing evidence. Suggest three manual checks only; do not claim a verified forecast, official score or driver fault.`);
  }

  return <section className={styles.panel} aria-label="IQ Predictive Intelligence">
    <header className={styles.header}>
      <div><span className={styles.kicker}>IQ PREDICTIVE INTELLIGENCE</span>
        <h3>What could happen next? <span aria-hidden="true">✦</span></h3>
        <p>One-week statistical outlook · {prediction.site} · historical, unweighted metrics</p></div>
      <span className={styles.tag}>{available}/4 estimates available</span>
    </header>
    <div className={styles.summary}>
      <strong>{prediction.alerts.length ? `${prediction.alerts.length} early-warning ${prediction.alerts.length === 1 ? "signal" : "signals"} to verify` : "No backtest-supported deterioration signal"}</strong>
      <span>Projections are advisory, not live monitoring or official Amazon predictions.</span>
    </div>
    <div className={styles.grid}>
      {prediction.forecasts.map(item => <article className={styles.metric} key={item.key}>
        <div className={styles.metricHead}><strong>{item.label}</strong><span className={item.status === "unavailable" ? styles.unavailable : item.confidence.startsWith("Moderate") ? styles.moderate : styles.low}>{item.confidence}</span></div>
        {item.status === "unavailable" ? <p className={styles.reason}>{item.reason}</p> : <>
          <div className={styles.values}><div><small>Latest mean</small><strong>{showNumber(item.latest, item.unit)}</strong></div>
            <span aria-hidden="true">→</span><div><small>Next-week estimate</small><strong>{showNumber(item.forecast, item.unit)}</strong></div></div>
          <p className={styles.range}>{item.indicativeRange
            ? `Indicative error band: ${showNumber(item.indicativeRange[0], item.unit)} to ${showNumber(item.indicativeRange[1], item.unit)}`
            : "No error band: fewer than two historical holdout checks."}</p>
          {item.signal && <p className={styles.alert}>⚠ {item.signal.title}</p>}
          <details className={styles.details}><summary>Evidence & model limitations</summary>
            <p>{item.model}. {item.reason}</p>
            <p>Walk-forward checks: {item.backtest.holdouts} · mean absolute error {showNumber(item.backtest.meanAbsoluteError, item.unit)} · no-change baseline {showNumber(item.backtest.persistenceBaselineError, item.unit)}.</p>
            <p>Numeric records per week: {item.sourceRows.join(" / ")}. Neither estimate nor band is a calibrated probability.</p>
          </details>
        </>}
      </article>)}
    </div>
    <footer className={styles.footer}>
      <button type="button" className={styles.ask} onClick={askIQ}>✦ Discuss the outlook with IQ</button>
      <span>IQ will prepare the question. You must explicitly approve sharing its anonymous summary in chat.</span>
    </footer>
    <details className={styles.caveats}><summary>How trustworthy is this outlook? ({prediction.warnings.length} notes)</summary>
      <ul>{prediction.warnings.map(message => <li key={message}>{message}</li>)}</ul>
    </details>
  </section>;
}
