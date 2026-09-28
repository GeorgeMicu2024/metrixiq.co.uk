import Link from "next/link";
import Brand from "./Brand";
import LandingSignInCard from "./LandingSignInCard";
import CookieSettingsButton from "./CookieSettingsButton";
import { PLAN_CATALOG, formatPlanPrice } from "../lib/config/plans";

const benefits=["Improve compliance","Boost driver performance","Reduce operational risk"];
const features=[
  ["↗","Performance Analytics","Turn fragmented operational reports into driver, site and fleet performance views."],
  ["♟","Driver Scorecards","Bring the metrics that matter into a consistent scorecard and performance history."],
  ["▣","Smart Import","Reduce manual data preparation by importing common operational report formats into one workflow."],
  ["◇","Compliance Monitoring","Track compliance evidence, identify exceptions and focus management attention where it is needed."],
  ["♧","Coaching & Alerts","Turn performance evidence into targeted coaching actions and follow-up workflows."],
  ["◔","Executive Reporting","Summarise movement, trends and operational priorities for faster management decisions."],
];

const solutionLinks=[
  ["/driver-performance-scorecards","Driver Performance Scorecards","Connect recurring KPIs, trends and coaching context at driver level."],
  ["/fleet-compliance-monitoring","Fleet Compliance Monitoring","Keep operational compliance exceptions and site trends visible."],
  ["/delivery-operations-software","Delivery Operations Software","Bring recurring site workflows, imports and management reporting together."],
  ["/driver-coaching-software","Driver Coaching Software","Turn performance evidence into focused coaching and follow-up."],
  ["/fleet-data-analytics","Fleet Data Analytics","Connect driver and site detail to wider performance trends."],
  ["/fleet-performance-management","Fleet Performance Management","Move from KPI movement into operational management action."],
];

const resourceLinks=[
  ["/resources/driver-performance-scorecard-guide","Driver Performance Scorecard Guide","Build a scorecard that connects metrics, trends, data quality and coaching action."],
  ["/resources/fleet-performance-kpis","Fleet Performance KPIs","Choose fleet KPIs that managers can trace from fleet to site to driver."],
  ["/resources/delivery-driver-coaching-guide","Delivery Driver Coaching Guide","Use evidence and follow-up to make driver coaching more focused and measurable."],
];

const faqs=[
  ["What is MetrixIQ?","MetrixIQ is a fleet and driver performance intelligence platform for delivery operations. It brings operational reports, driver scorecards, compliance metrics, coaching workflows and management reporting into one workspace."],
  ["Who is MetrixIQ designed for?","The platform is designed for delivery operators, fleet managers, site managers and operations teams that need a clearer way to monitor driver and site performance across recurring reporting periods."],
  ["Can MetrixIQ work across multiple sites?","Yes. MetrixIQ is built around site-aware data and role-based access, allowing operational teams to review individual sites while retaining fleet-level visibility where permissions allow."],
  ["What types of performance data can be managed?","MetrixIQ is designed to organise driver scorecards, safety and compliance metrics, daily operational reports, coaching evidence and other structured fleet-performance data used by delivery teams."],
  ["Does MetrixIQ replace operational source systems?","No. MetrixIQ is an intelligence and management layer. It helps teams organise, reconcile and interpret operational evidence while keeping important source reports and original operational systems in context."],
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

export default function Landing(){
 const plans=PLAN_CATALOG;
 const planPrice=(plan)=>formatPlanPrice(plan,"month");
 return <main className="marketing mk-home">
  <header className="mk-header"><Link href="/"><Brand inverse/></Link><nav><a href="#features">Features</a><Link href="/solutions">Solutions</Link><a href="#pricing">Pricing</a><Link href="/resources">Resources</Link><Link href="/about">About</Link></nav><div><a href="#sign-in">Sign in</a><Link className="mk-get" href="/login?mode=register">Get started</Link></div></header>

  <section className="mk-hero"><div className="mk-hero-bg"/><div className="mk-hero-copy"><span>FLEET PERFORMANCE INTELLIGENCE</span><h1>Smarter data.<br/>Stronger teams.<br/><em>Better results.</em></h1><p>Turn operational data into real performance. MetrixIQ helps delivery operations monitor, analyse and improve driver and fleet performance with powerful AI-driven insights.</p><div className="mk-actions"><Link href="/login?mode=register">Get started <b>→</b></Link><a href="#solutions">▶ &nbsp; See how it works</a></div><div className="mk-benefits">{benefits.map((x,i)=><span key={x}>{i===1?"↗":"◇"} {x}</span>)}</div></div><div className="mk-script">Data<br/>People<br/>Performance<i/></div><LandingSignInCard/></section>

  <section className="mk-stats" aria-label="Product outcomes">{[["↗","+25%","Driver performance"],["◷","-40%","Operational issues"],["◇","+30%","Compliance rate"],["♟","Happier","and more productive teams"]].map(x=><article key={x[1]}><i>{x[0]}</i><div><strong>{x[1]}</strong><span>{x[2]}</span></div></article>)}</section>

  <section id="solutions" className="mk-operations"><div className="mk-ops-copy"><small>BUILT FOR DELIVERY OPERATIONS</small><h2>Built for real operations.<br/><em>Designed for growth.</em></h2><p>From daily performance tracking to strategic decision-making, MetrixIQ gives you the tools to manage, coach and grow your fleet with confidence.</p><div className="mk-audience"><b>DELIVERY OPERATIONS</b><span>DSP OPERATORS</span><span>FLEET MANAGERS</span><span>OPERATIONS TEAMS</span></div></div><DashboardPreview/></section>

  <section id="features" className="mk-feature-section">
    <div className="mk-feature-intro">
      <span>ONE OPERATIONAL WORKSPACE</span>
      <h2>Fleet and driver performance intelligence without the spreadsheet chaos.</h2>
      <p>MetrixIQ connects the recurring reports managers already use with a structured driver, site and fleet view. Instead of rebuilding the same analysis every day or every week, teams can keep performance history, compliance evidence and coaching context together.</p>
    </div>
    <div className="mk-features">{features.map(x=><article key={x[1]}><i>{x[0]}</i><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div>
  </section>

  <section className="mk-seo-story">
    <div>
      <span>FROM REPORT TO ACTION</span>
      <h2>See what changed, understand why it matters, and know what to do next.</h2>
    </div>
    <div className="mk-seo-story-copy">
      <p>Fleet performance management often starts with a collection of files: scorecards, safety reports, compliance exports, delivery-quality data and site-specific operational reports. Each source can be useful on its own, but managers still need to match drivers correctly, compare periods and decide which issues deserve attention first.</p>
      <p>MetrixIQ provides a consistent layer above those sources. It helps operational teams import structured evidence, keep driver identity and site scope clear, and review performance through repeatable dashboards rather than one-off spreadsheet analysis.</p>
      <p>The goal is not simply to display more charts. The goal is to make operational data easier to act on: identify a drop in a metric, see whether it is isolated or repeated, review the relevant driver or site history, and move directly into coaching, follow-up or management reporting.</p>
    </div>
  </section>

  <section className="mk-use-cases">
    <div className="mk-feature-intro compact">
      <span>DAILY TO EXECUTIVE</span>
      <h2>Designed for the full performance cycle.</h2>
      <p>Use the same operational evidence at different levels of the organisation without losing the context behind the numbers.</p>
    </div>
    <div className="mk-use-grid">
      <article><b>01</b><h3>Daily operations</h3><p>Review daily safety, delivery and compliance signals, identify missing or unusual records and focus managers on the exceptions that need attention.</p></article>
      <article><b>02</b><h3>Driver performance reviews</h3><p>Bring scorecards and supporting metrics into a driver-level view that makes strengths, risks, movement and coaching priorities easier to understand.</p></article>
      <article><b>03</b><h3>Site and fleet reporting</h3><p>Compare operational performance across sites and reporting periods, then summarise the movement and root causes that matter to senior management.</p></article>
    </div>
  </section>

  <section className="mk-solution-links">
    <div className="mk-feature-intro compact">
      <span>EXPLORE SOLUTIONS</span>
      <h2>Find the MetrixIQ workflow that matches your operational priority.</h2>
      <p>Each solution page goes deeper into a specific performance, compliance, coaching or analytics workflow while remaining part of the same MetrixIQ workspace.</p>
    </div>
    <div className="mk-solution-links-grid">
      {solutionLinks.map(([href,title,body])=><Link href={href} key={href}><b>{title}</b><p>{body}</p><span>Explore →</span></Link>)}
    </div>
  </section>

  <section className="mk-resource-links">
    <div className="mk-feature-intro compact">
      <span>OPERATIONS RESOURCES</span>
      <h2>Practical guidance for the management work behind the metrics.</h2>
      <p>Use the MetrixIQ resource library to improve scorecards, KPI review, compliance monitoring and driver coaching workflows.</p>
    </div>
    <div className="mk-resource-links-grid">
      {resourceLinks.map(([href,title,body])=><Link href={href} key={href}><b>{title}</b><p>{body}</p><span>Read guide →</span></Link>)}
    </div>
    <div className="mk-resource-more"><Link href="/resources">View all resources →</Link></div>
  </section>

  <section id="faq" className="mk-faq">
    <div className="mk-feature-intro compact">
      <span>FREQUENTLY ASKED QUESTIONS</span>
      <h2>What delivery teams need to know about MetrixIQ.</h2>
    </div>
    <div className="mk-faq-grid">{faqs.map(([q,a])=><article key={q}><h3>{q}</h3><p>{a}</p></article>)}</div>
  </section>

  <section id="pricing" className="mk-closing" data-plan-count={plans.length} data-starting-price={planPrice(plans[0])}><b>MetrixIQ.</b> More insight. A stronger tomorrow. <Link href="/login?mode=register">Get started →</Link></section>

  <footer className="mk-public-footer">
    <Link href="/"><Brand /></Link>
    <p>Fleet and driver performance intelligence for modern delivery operations.</p>
    <nav><Link href="/resources">Resources</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><CookieSettingsButton /></nav>
  </footer>
 </main>
}