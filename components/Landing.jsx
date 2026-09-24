"use client";
import Link from "next/link";
import Brand from "./Brand";
import { PLAN_CATALOG } from "../lib/config/plans";

const benefits=["Improve compliance","Boost driver performance","Reduce operational risk"];
const features=[
  ["↗","Performance Analytics","Turn data into action"],
  ["♟","Driver Scorecards","Identify strengths and support growth"],
  ["▣","Smart Import","Automate data ingestion from operational reports"],
  ["◇","Compliance Monitoring","Stay ahead of risk"],
  ["♧","Coaching & Alerts","Proactive insights for better results"],
  ["◔","Executive Reporting","Make smarter decisions, faster"],
];

function DashboardPreview(){
  const rows=[["1","Driver 001","978"],["2","Driver 002","965"],["3","Driver 003","960"],["4","Driver 004","958"],["5","Driver 005","955"]];
  return <div className="mk-dashboard">
    <aside><div className="mk-mini-logo"><span>▥</span> MetrixIQ</div>{["Dashboard","Drivers","Performance","Scorecards","IADC / DWC","POD","DCR","Concessions","Reports","Settings"].map((x,i)=><div className={i===0?"on":""} key={x}>{x}</div>)}</aside>
    <section>
      <div className="mk-dash-head"><div><small>Performance Overview</small><b>Live insights across your fleet</b></div><div><span>Last 7 days⌄</span><span>All Sites⌄</span></div></div>
      <div className="mk-kpis">{[["Fleet Index","92.4","↑ 2.1%"],["eMentor","821","↑ 12"],["DCR","96.3%","↑ 1.8%"],["IADC","87.1%","↑ 3.4%"]].map(x=><article key={x[0]}><small>{x[0]}</small><strong>{x[1]}</strong><em>{x[2]}</em></article>)}</div>
      <div className="mk-dash-grid"><article><div className="mk-card-title">Fleet Performance Trend <span>Last 7 days⌄</span></div><svg viewBox="0 0 500 190" preserveAspectRatio="none"><path d="M0 132 C45 120 80 136 120 110 S190 105 225 94 S300 88 345 72 S420 79 500 62" fill="none" stroke="#35d78c" strokeWidth="4"/><path d="M0 132 C45 120 80 136 120 110 S190 105 225 94 S300 88 345 72 S420 79 500 62 L500 190 L0 190Z" fill="url(#area)" opacity=".32"/><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35d78c"/><stop offset="1" stopColor="#fff"/></linearGradient></defs></svg><div className="mk-days"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div></article><article><div className="mk-card-title">Top Performers <span>View all</span></div><div className="mk-leaders">{rows.map(r=><div key={r[0]}><i>{r[0]}</i><span>{r[1]}</span><b>{r[2]}</b></div>)}</div></article></div>
    </section>
  </div>
}

function SignInCard(){
 return <div className="mk-login-card"><Brand/><small>WELCOME BACK</small><h3>Sign in to your account</h3><label>✉ <span>Email address</span></label><label>♙ <span>Password</span><b>◉</b></label><div className="mk-remember"><span>□ &nbsp; Remember me</span><Link href="/login">Forgot password?</Link></div><Link className="mk-signin" href="/login">Sign in</Link><div className="mk-or"><span/>OR CONTINUE WITH<span/></div><Link className="mk-google" href="/login">ⓖ &nbsp; Continue with Google</Link><p>Don't have an account? <Link href="/login?mode=register">Create account</Link></p></div>
}

export default function Landing(){
 const plans=PLAN_CATALOG;
 return <main className="marketing mk-home">
  <header className="mk-header"><Link href="/"><Brand inverse/></Link><nav><a href="#features">Features</a><a href="#solutions">Solutions</a><a href="#pricing">Pricing</a><a href="#resources">Resources</a><a href="#about">About</a></nav><div><Link href="/login">Sign in</Link><Link className="mk-get" href="/login?mode=register">Get started</Link></div></header>
  <section className="mk-hero"><div className="mk-hero-bg"/><div className="mk-hero-copy"><span>FLEET PERFORMANCE INTELLIGENCE</span><h1>Smarter data.<br/>Stronger teams.<br/><em>Better results.</em></h1><p>Turn operational data into real performance. MetrixIQ helps delivery operations monitor, analyse and improve driver and fleet performance with powerful AI-driven insights.</p><div className="mk-actions"><Link href="/login?mode=register">Get started <b>→</b></Link><a href="#solutions">▶ &nbsp; See how it works</a></div><div className="mk-benefits">{benefits.map((x,i)=><span key={x}>{i===1?"↗":"◇"} {x}</span>)}</div></div><div className="mk-script">Data<br/>People<br/>Performance<i/></div><SignInCard/></section>
  <section className="mk-stats">{[["↗","+25%","Driver performance"],["◷","-40%","Operational issues"],["◇","+30%","Compliance rate"],["♟","Happier","and more productive teams"]].map(x=><article key={x[1]}><i>{x[0]}</i><div><strong>{x[1]}</strong><span>{x[2]}</span></div></article>)}</section>
  <section id="solutions" className="mk-operations"><div className="mk-ops-copy"><small>TRUSTED BY FORWARD-THINKING DSPs</small><h2>Built for real operations.<br/><em>Designed for growth.</em></h2><p>From daily performance tracking to strategic decision-making, MetrixIQ gives you the tools to manage, coach and grow your fleet with confidence.</p><div className="mk-audience"><b>DELIVERY OPERATIONS</b><span>DSP OPERATORS</span><span>FLEET MANAGERS</span><span>OPERATIONS TEAMS</span></div></div><DashboardPreview/></section>
  <section id="features" className="mk-features">{features.map(x=><article key={x[1]}><i>{x[0]}</i><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</section>
  <section id="pricing" className="mk-closing" data-plan-count={plans.length}><b>MetrixIQ.</b> More insight. A stronger tomorrow.</section>
 </main>
}