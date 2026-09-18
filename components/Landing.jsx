"use client";
import Link from "next/link";
import Brand from "./Brand";
import { PLAN_CATALOG, formatPlanPrice } from "../lib/config/plans";

const metrics=[
  {k:"DCR",v:"99.1%",s:"Watch"},{k:"POD",v:"97.8%",s:"Watch"},{k:"IADC",v:"87.1%",s:"Healthy"},{k:"FICO",v:"812",s:"Watch"}
];
const features=[
  ["01","Smart ingestion","Import Excel, CSV and digital PDFs in one batch. MetrixIQ detects report structure, reporting periods and operational metrics before analysis."],
  ["02","TRID identity mapping","Use schedule or master files to translate transporter IDs into real driver profiles automatically, with unmatched records held for review."],
  ["03","Driver intelligence","Combine DCR, POD, IADC, FICO, eMentor, PSB, concessions and reattempts into risk, coaching and management priorities."],
  ["04","Management reporting","Turn fragmented weekly files into one consistent operating view across sites, drivers and performance periods."],
];


function ProductPreview(){
  return <div className="product-window">
    <div className="window-top"><div className="window-brand"><span className="mini-mark">M</span><b>MetrixIQ</b></div><div className="window-search">Search drivers, reports, sites…</div><span className="avatar">GM</span></div>
    <div className="window-body">
      <aside className="preview-side"><b>Overview</b><span>Drivers</span><span>Performance</span><span>Coaching</span><span>Intelligence</span><span>Imports</span></aside>
      <section className="preview-main">
        <div className="preview-head"><div><small>Fleet overview</small><h3>Good morning, George</h3></div><span className="status-dot">● Live</span></div>
        <div className="preview-metrics">{metrics.map((m)=><div className="preview-metric" key={m.k}><small>{m.k}</small><strong>{m.v}</strong><span className={m.s==="Watch"?"watch":"ok"}>{m.s}</span></div>)}</div>
        <div className="preview-grid">
          <div className="preview-card"><div className="card-head"><b>Performance trend</b><span>4 weeks</span></div><svg className="preview-chart" width="100%" height="150" viewBox="0 0 500 150" preserveAspectRatio="none"><path d="M0 118 C65 110 80 90 140 96 S235 70 290 75 S375 36 500 26" fill="none" stroke="#16a38f" strokeWidth="4"/><path d="M0 118 C65 110 80 90 140 96 S235 70 290 75 S375 36 500 26 L500 150 L0 150Z" fill="url(#g)" opacity=".7"/><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b9eee4"/><stop offset="1" stopColor="#ffffff"/></linearGradient></defs></svg></div>
          <div className="preview-card risk-card"><div className="card-head"><b>Driver risk</b><span>36 active</span></div><div className="risk-ring"><div><strong>7</strong><span>high risk</span></div></div><div className="risk-legend"><span><i className="low"/>Low 24</span><span><i className="med"/>Medium 5</span><span><i className="high"/>High 7</span></div></div>
        </div>
      </section>
    </div>
  </div>;
}

export default function Landing(){
  return <main className="marketing">
    <header className="site-header"><div className="site-header-inner"><Link href="/"><Brand/></Link><nav><a href="#platform">Platform</a><a href="#workflow">Workflow</a><a href="#intelligence">Intelligence</a><a href="#pricing">Pricing</a></nav><div className="header-actions"><Link className="text-btn" href="/login">App login</Link><Link className="primary-btn small" href="/login?mode=register">Get started free <span>→</span></Link></div></div></header>
    <section className="hero"><div className="hero-grid">
      <div className="hero-copy"><div className="eyebrow-pill">Operational intelligence for delivery fleets</div><h1>Turn fragmented fleet reports into clear daily action.</h1><p>MetrixIQ brings scorecards, compliance files and driver performance into one operating workspace — with TRID mapping, risk signals, coaching priorities and management reporting built in.</p><div className="hero-actions"><Link className="primary-btn" href="/login?mode=register">Start free <span>→</span></Link><a className="secondary-btn" href="#workflow">See how it works</a></div><div className="hero-proof"><span><b>10+</b> report types</span><span><b>1</b> driver view</span><span><b>24/7</b> visibility</span></div></div>
      <div className="hero-product"><div className="product-glow"/><ProductPreview/></div>
    </div></section>
    <section className="trust-strip"><div><b>Built around real DSP operations</b><span>Excel / CSV / PDF</span><span>TRID → Driver mapping</span><span>DCR · POD · FICO · IADC</span><span>Risk & coaching</span></div></section>
    <section id="platform" className="section"><div className="section-intro"><div><span className="section-kicker">THE OPERATING LAYER</span><h2>One workspace from raw report to management decision.</h2></div><p>Import the reports you already use, validate what was detected, resolve identity and act on the drivers or sites that actually need attention.</p></div><div className="feature-grid">{features.map(([n,t,d])=><article className="feature-card" key={n}><span className="feature-number">{n}</span><h3>{t}</h3><p>{d}</p><a href="/login?mode=register">Explore capability <span>→</span></a></article>)}</div></section>
    <section id="workflow" className="dark-section"><div className="dark-inner"><div className="dark-copy"><span className="section-kicker light">HOW IT WORKS</span><h2>A management workflow, not another spreadsheet archive.</h2><p>MetrixIQ turns report ingestion into a repeatable operating process: detect, map, validate, analyse, coach and report.</p><div className="steps">{[["01","Upload"],["02","Match"],["03","Validate"],["04","Act"]].map(([n,t])=><div key={n}><span>{n}</span><b>{t}</b></div>)}</div></div><div className="workflow-panel"><div className="workflow-row"><span className="file-icon">XLSX</span><div><b>W35_Scorecard.xlsx</b><small>56 drivers · DLS2 · Week 35</small></div><em>Ready</em></div><div className="workflow-row"><span className="file-icon">CSV</span><div><b>Driver_Master.csv</b><small>56 TRIDs mapped to driver names</small></div><em>Matched</em></div><div className="workflow-summary"><div><small>Data confidence</small><strong>96%</strong></div><div><small>Matched drivers</small><strong>56 / 56</strong></div><div><small>High risk</small><strong>7</strong></div></div></div></div></section>
    <section id="intelligence" className="section intelligence"><div className="section-intro"><div><span className="section-kicker">INTELLIGENCE</span><h2>See risk before it becomes tomorrow's escalation.</h2></div><p>Prioritise repeated failures and deteriorating trends instead of reviewing every driver equally.</p></div><div className="intel-grid"><article><div className="intel-icon">↗</div><h3>Driver risk scoring</h3><p>Weights POD, IADC, DCR, FICO, eMentor, concessions and loss-on-route indicators into one clear risk level.</p></article><article><div className="intel-icon">✓</div><h3>Coaching priorities</h3><p>Translate performance signals into a ranked queue with the metric, context and next action already attached.</p></article><article><div className="intel-icon">◎</div><h3>Data confidence</h3><p>Separate confident matches from records that need human review before they influence management decisions.</p></article></div></section>
    <section id="pricing" className="pricing-section"><div className="pricing-intro"><span className="section-kicker">PRICING</span><h2>Start small. Add intelligence as the operation grows.</h2><p>Stripe-backed monthly plans with a 7-day full-platform trial for eligible new workspaces.</p></div><div className="plans">{PLAN_CATALOG.map((plan)=>{const featured=plan.key==="business";const price=formatPlanPrice(plan,"month");return <article className={featured?"plan featured":"plan"} key={plan.key}>{featured&&<span className="plan-tag">Most popular</span>}<h3>{plan.name}</h3><p>{plan.description}</p><div className="price">{price}{plan.key!=="free"&&<small>/month</small>}</div><ul>{plan.features.map((feature)=><li key={feature}>✓ {feature}</li>)}</ul><Link href="/login?mode=register" className={featured?"primary-btn full":"secondary-btn full"}>{plan.key==="free"?"Create free workspace":"Start free trial"}</Link></article>})}</div></section>
    <section className="final-cta"><div><span className="section-kicker light">METRIXIQ</span><h2>Make the next operational decision from evidence, not guesswork.</h2><p>Bring your current reports. MetrixIQ does the organising.</p></div><Link className="primary-btn mint" href="/login?mode=register">Create workspace <span>→</span></Link></section>
    <footer><div><Brand/><span>© 2026 MetrixIQ. Fleet & driver intelligence.</span><nav><a href="#platform">Platform</a><a href="#pricing">Pricing</a><Link href="/login">Login</Link></nav></div></footer>
  </main>;
}
