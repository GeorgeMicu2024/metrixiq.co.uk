import Link from "next/link";
import Brand from "./Brand";
import CookieSettingsButton from "./CookieSettingsButton";
import TrackedLink from "./TrackedLink";
import LandingPricing from "./LandingPricing";
import LandingAuthModal, { LandingAuthTrigger } from "./LandingAuth";
import { PLAN_CATALOG, formatPlanPrice } from "../lib/config/plans";
import { PUBLIC_CONTACT_EMAIL, PUBLIC_LINKEDIN_URL } from "../lib/seo/site";

const benefits=["Scorecards","Compliance","Coaching","Multi-site"];
const carriers=[
  ["amazon","Amazon Logistics"],
  ["prime","Prime"],
  ["evri","Evri"],
  ["dpd","DPD"],
  ["dhl","DHL"],
  ["ups","UPS"],
  ["fedex","FedEx"],
  ["yodel","Yodel"],
];

const features=[
  ["↗","Performance Analytics","Spot movement across drivers, sites and reporting periods."],
  ["♟","Driver Scorecards","Keep the KPIs, history and coaching context together."],
  ["▣","Smart Import","Turn recurring reports into a consistent operational view."],
  ["◇","Compliance Monitoring","Surface exceptions before they become wider issues."],
  ["♧","Coaching & Alerts","Convert evidence into focused actions and follow-up."],
  ["◔","Executive Reporting","Summarise what changed and what needs attention next."],
];

const solutionLinks=[
  ["/driver-performance-scorecards","Driver Performance Scorecards","KPIs, trends and coaching context at driver level."],
  ["/fleet-compliance-monitoring","Fleet Compliance Monitoring","Operational exceptions and site trends in one view."],
  ["/delivery-operations-software","Delivery Operations Software","Recurring site workflows and management reporting."],
  ["/driver-coaching-software","Driver Coaching Software","Performance evidence into targeted follow-up."],
  ["/fleet-data-analytics","Fleet Data Analytics","Driver and site detail connected to fleet trends."],
  ["/fleet-performance-management","Fleet Performance Management","Move from KPI movement into management action."],
];

const resourceLinks=[
  ["/resources/driver-performance-scorecard-guide","Driver Performance Scorecard Guide","Build a scorecard that connects metrics, trends and coaching action."],
  ["/resources/fleet-performance-kpis","Fleet Performance KPIs","Choose KPIs managers can trace from fleet to site to driver."],
  ["/resources/delivery-driver-coaching-guide","Delivery Driver Coaching Guide","Make coaching more focused, evidence-led and measurable."],
];

const faqs=[
  ["What is MetrixIQ?","MetrixIQ is fleet and driver performance software for delivery operations. It brings operational reports, driver scorecards, compliance metrics, coaching workflows and management reporting into one workspace."],
  ["Who is MetrixIQ designed for?","Delivery operators, fleet managers, site managers and operations teams that need a clearer way to monitor driver and site performance."],
  ["Can MetrixIQ work across multiple sites?","Yes. MetrixIQ is built around site-aware data and role-based access, so teams can review individual sites while retaining fleet-level visibility where permissions allow."],
  ["What performance data can be managed?","Driver scorecards, safety and compliance metrics, recurring operational reports, coaching evidence and other structured fleet-performance data."],
  ["Does MetrixIQ replace source systems?","No. MetrixIQ is an intelligence and management layer that helps teams organise, reconcile and interpret operational evidence while keeping source reports in context."],
];

function CarrierLogo({kind,name}){
  if(kind==="amazon") return <span className="carrier-logo carrier-amazon" aria-label={name}><b>amazon</b><i>⌣</i><small>logistics</small></span>;
  if(kind==="prime") return <span className="carrier-logo carrier-prime" aria-label={name}><b>prime</b><i>⌣</i></span>;
  if(kind==="evri") return <span className="carrier-logo carrier-evri" aria-label={name}><strong>EVRi</strong><small>parcel delivery</small></span>;
  if(kind==="dpd") return <span className="carrier-logo carrier-dpd" aria-label={name}><i>◇</i><strong>dpd</strong></span>;
  if(kind==="dhl") return <span className="carrier-logo carrier-dhl" aria-label={name}><i/><strong>DHL</strong></span>;
  if(kind==="ups") return <span className="carrier-logo carrier-ups" aria-label={name}><i>ups</i></span>;
  if(kind==="fedex") return <span className="carrier-logo carrier-fedex" aria-label={name}><strong>Fed</strong><b>Ex</b></span>;
  return <span className="carrier-logo carrier-yodel" aria-label={name}><strong>YODEL</strong></span>;
}

function DashboardPreview(){
  const rows=[["1","Driver 001","978"],["2","Driver 002","965"],["3","Driver 003","960"],["4","Driver 004","958"],["5","Driver 005","955"]];
  return <div className="mk-dashboard">
    <aside><div className="mk-mini-logo"><span>▥</span> MetrixIQ</div>{["Dashboard","Drivers","Performance","Scorecards","IADC / DWC","POD","DCR","Concessions","Reports","Settings"].map((x,i)=><div className={i===0?"on":""} key={x}>{x}</div>)}</aside>
    <section>
      <div className="mk-dash-head"><div><small>Performance Overview</small><b>Live insights across your fleet</b></div><div><span>Last 7 days⌄</span><span>All Sites⌄</span></div></div>
      <div className="mk-kpis">{[["Fleet Index","92.4","↑ 2.1%"],["eMentor","821","↑ 12"],["DCR","96.3%","↑ 1.8%"],["IADC","87.1%","↑ 3.4%"]].map(x=><article key={x[0]}><small>{x[0]}</small><strong>{x[1]}</strong><em>{x[2]}</em></article>)}</div>
      <div className="mk-dash-grid"><article><div className="mk-card-title">Fleet Performance Trend <span>Last 7 days⌄</span></div><svg viewBox="0 0 500 190" preserveAspectRatio="none" aria-hidden="true"><path d="M0 132 C45 120 80 136 120 110 S190 105 225 94 S300 88 345 72 S420 79 500 62" fill="none" stroke="#35d78c" strokeWidth="4"/><path d="M0 132 C45 120 80 136 120 110 S190 105 225 94 S300 88 345 72 S420 79 500 62 L500 190 L0 190Z" fill="url(#area)" opacity=".32"/><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35d78c"/><stop offset="1" stopColor="#fff"/></linearGradient></defs></svg><div className="mk-days"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div></article><article><div className="mk-card-title">Top Performers <span>View all</span></div><div className="mk-leaders">{rows.map(r=><div key={r[0]}><i>{r[0]}</i><span>{r[1]}</span><b>{r[2]}</b></div>)}</div></article></div>
    </section>
  </div>
}

function HeroDashboardPreview(){
  const metrics=[
    ["♟","Active Drivers","611","Current scope","blue"],
    ["▥","eMentor (Avg)","806","Below target","red"],
    ["◇","IADC","73.8%","Needs attention","green"],
    ["◆","DCR","98.8%","On target","gold"],
    ["◉","FICO (Avg)","806","Live score","cyan"],
  ];
  const priorities=[
    ["↗","Check eMentor drivers below 815","54 drivers below target","red"],
    ["△","Review IADC failures","46 drivers below 80% this week","amber"],
    ["◷","Monitor wave timings","Review today’s waves","blue"],
  ];
  const sites=[
    ["DDN1","83.38","Great","99.06%","867","39"],
    ["DEH1","71.90","Great","97.47%","261","0"],
  ];
  return <div className="mk-live-preview">
    <aside>
      <div className="mk-live-brand"><span>W</span><b>MetrixIQ</b></div>
      <div className="mk-live-nav on">⌂ <span>Home</span></div>
      <div className="mk-live-nav">▦ <span>Command Center</span></div>
      <small>OPERATION</small>
      {["Daily Dispatch","IADC","POD","DCR","Customer Compliance","Driver Coaching","Incidents","Reports"].map((item)=><div className="mk-live-nav" key={item}>◇ <span>{item}</span></div>)}
    </aside>
    <section>
      <header className="mk-live-topbar">
        <div className="mk-live-site">▣ <b>All Sites</b>⌄</div>
        <div className="mk-live-top-actions"><span>▣ Week 42</span><i>✉</i><i>♧</i><b>Workspace Admin⌄</b></div>
      </header>
      <div className="mk-live-heading">
        <div><h3>Good morning, Team</h3><p>Here’s today’s overview for all sites</p></div>
        <span><small>LIVE DASHBOARD</small><b>All Sites</b></span>
      </div>
      <div className="mk-live-kpis">{metrics.map(([icon,label,value,detail,tone])=><article className={tone} key={label}><i>{icon}</i><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>)}</div>
      <div className="mk-live-grid">
        <article className="mk-live-priorities">
          <h4>Today’s Priorities <b>4</b></h4>
          {priorities.map(([icon,title,detail,tone])=><div key={title}><i className={tone}>{icon}</i><span><b>{title}</b><small>{detail}</small></span><em>›</em></div>)}
        </article>
        <article className="mk-live-sites">
          <div className="mk-live-sites-head"><h4>Site Performance</h4><span>View Details</span></div>
          <div className="mk-live-table-head"><b>Site</b><b>Overall Score</b><b>DCR</b><b>DSC DPMO</b><b>LoR</b></div>
          {sites.map((row)=><div className="mk-live-table-row" key={row[0]}><b>{row[0]}</b><span>{row[1]} <i>{row[2]}</i></span><span className={row[3].startsWith("97")?"bad":""}>{row[3]}</span><span>{row[4]}</span><span>{row[5]}</span></div>)}
        </article>
      </div>
    </section>
  </div>
}

function HeroSignals(){
  return <div className="mk-hero-signals" aria-hidden="true">
    <article className="signal-card signal-a"><span>DRIVER SCORE</span><strong>Great</strong><i>↑ weekly trend</i></article>
    <article className="signal-card signal-b"><span>COMPLIANCE</span><strong>96.3%</strong><i>+1.8%</i></article>
    <article className="signal-card signal-c"><span>COACHING</span><strong>3 priorities</strong><i>Ready for review</i></article>
    <svg className="signal-network" viewBox="0 0 260 190">
      <path d="M18 142 C52 112 72 126 103 91 S160 74 190 54 S229 50 246 26" fill="none" stroke="#43e39a" strokeWidth="3"/>
      <circle cx="18" cy="142" r="6" fill="#43e39a"/><circle cx="103" cy="91" r="6" fill="#43e39a"/><circle cx="190" cy="54" r="6" fill="#43e39a"/><circle cx="246" cy="26" r="6" fill="#43e39a"/>
    </svg>
  </div>
}

function VisualCards(){
  return <div className="mk-visual-grid">
    <article className="mk-visual-card">
      <div className="mk-visual-head"><span>DRIVER TREND</span><b>Weekly movement</b></div>
      <div className="mk-bars" aria-hidden="true">{[42,56,48,69,74,82,88].map((v,i)=><i key={i} style={{height:v+"%"}}/>)}</div>
      <footer><strong>Driver scorecards</strong><span>History that managers can act on.</span></footer>
    </article>
    <article className="mk-visual-card">
      <div className="mk-visual-head"><span>COMPLIANCE</span><b>Exceptions first</b></div>
      <div className="mk-ring" aria-hidden="true"><div><strong>87%</strong><span>on track</span></div></div>
      <footer><strong>Compliance view</strong><span>Focus attention where evidence is missing.</span></footer>
    </article>
    <article className="mk-visual-card">
      <div className="mk-visual-head"><span>COACHING QUEUE</span><b>Prioritised</b></div>
      <div className="mk-queue" aria-hidden="true"><i><b>01</b><span>Speeding trend</span><em>High</em></i><i><b>02</b><span>POD quality</span><em>Review</em></i><i><b>03</b><span>IADC movement</span><em>Watch</em></i></div>
      <footer><strong>Manager workflow</strong><span>Move from signal to follow-up quickly.</span></footer>
    </article>
  </div>
}

export default function Landing(){
 const plans=PLAN_CATALOG;
 const planPrice=(plan)=>formatPlanPrice(plan,"month");
 return <main className="marketing mk-home">
  <header className="mk-header"><Link href="/"><Brand inverse/></Link><nav><a href="#features">Features</a><Link href="/solutions">Solutions</Link><Link href="/use-cases">Use cases</Link><a href="#pricing">Pricing</a><Link href="/resources">Resources</Link><Link href="/about">About</Link></nav><div><LandingAuthTrigger mode="signin" fallbackHref="/login" ctaLocation="homepage_header">Sign in</LandingAuthTrigger><LandingAuthTrigger className="mk-get" mode="register" intent="trial" fallbackHref="/login?mode=register&start=trial" ctaLocation="homepage_header">Start 7-Day Free Trial <b>→</b></LandingAuthTrigger></div></header>

  <section className="mk-hero">
    <img
      className="mk-hero-photo"
      src="https://assets.aboutamazon.com/49/85/bc84c02248f388b84841f22255f5/unp-amazon-41776-dst1-stoke-on-trent-34.JPG"
      alt=""
      aria-hidden="true"
      fetchPriority="high"
      decoding="async"
    />
    <div className="mk-hero-bg"/>
    <div className="mk-hero-amazon-sign" aria-hidden="true"><b>amazon</b><i>⌣</i></div>
    <div className="mk-hero-copy">
      <span>FLEET OPERATIONS INTELLIGENCE</span>
      <h1>Turn fleet data into <em>clear action.</em></h1>
      <p>Scorecards, compliance, coaching and multi-site performance in one powerful platform. Give your teams the insights they need to drive safer, more efficient operations.</p>
      <div className="mk-actions"><LandingAuthTrigger mode="register" intent="trial" fallbackHref="/login?mode=register&start=trial" ctaLocation="homepage_hero">Start 7-Day Free Trial <b>→</b></LandingAuthTrigger><a href="#pricing">View Pricing</a></div>
      <div className="mk-benefits mk-trial-benefits">
        <span><i>✓</i><b>No card required</b></span>
        <span><i>✓</i><b>Full platform access for 7 days</b></span>
        <span><i>✓</i><b>Secure Stripe billing</b></span>
        <span><i>✓</i><b>Cancel anytime</b></span>
      </div>
    </div>
    <div className="mk-hero-product-preview" aria-label="MetrixIQ product preview"><HeroDashboardPreview/></div>
  </section>

  <section className="mk-network-strip" aria-label="Delivery network examples">
    <div><span>DELIVERY NETWORK WORKFLOWS</span><small>Examples only — no affiliation implied.</small></div>
    <div className="mk-network-logos">{carriers.map(([key,name])=><CarrierLogo kind={key} name={name} key={key}/>)}</div>
  </section>

  <LandingPricing/>

  <section id="product" className="mk-product-showcase">
    <div className="mk-product-copy">
      <span>ONE OPERATIONS COCKPIT</span>
      <h2>See the fleet. Find the exception. Take the next action.</h2>
      <p>MetrixIQ brings recurring driver, safety and compliance evidence into one view so managers can move from reporting to action without rebuilding spreadsheets.</p>
      <div className="mk-product-points"><span>✓ Driver-level history</span><span>✓ Site comparisons</span><span>✓ Coaching follow-up</span><span>✓ Executive reporting</span></div>
      <TrackedLink href="/solutions" eventParams={{ cta_label: "Explore solutions", cta_location: "homepage_product" }}>Explore the platform →</TrackedLink>
    </div>
    <div className="mk-dashboard-wrap"><DashboardPreview/><div className="mk-floating-chip chip-one"><span>Site trend</span><strong>Improving</strong></div><div className="mk-floating-chip chip-two"><span>Alerts</span><strong>3 priorities</strong></div></div>
  </section>

  <section className="mk-stats" aria-label="Platform capabilities">
    {[["◎","Driver-level","performance history"],["⌘","Multi-site","operational visibility"],["◫","Recurring","report imports"],["◇","Role-based","workspace access"]].map(x=><article key={x[1]}><i>{x[0]}</i><div><strong>{x[1]}</strong><span>{x[2]}</span></div></article>)}
  </section>

  <section id="features" className="mk-feature-section">
    <div className="mk-feature-intro">
      <span>CORE CAPABILITIES</span>
      <h2>Less reporting clutter. More operational clarity.</h2>
      <p>Six connected workflows cover the path from raw operational evidence to management action.</p>
    </div>
    <div className="mk-features">{features.map(x=><article key={x[1]}><i>{x[0]}</i><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div>
  </section>

  <section className="mk-flow">
    <div className="mk-feature-intro compact"><span>FROM REPORT TO ACTION</span><h2>A simple operational flow.</h2></div>
    <div className="mk-flow-grid">
      {[["01","Import","Bring recurring reports into one workflow."],["02","Match","Keep driver identity and site scope consistent."],["03","Analyse","See movement, exceptions and trends."],["04","Act","Coach, follow up and report with context."]].map(x=><article key={x[0]}><b>{x[0]}</b><i/><h3>{x[1]}</h3><p>{x[2]}</p></article>)}
    </div>
  </section>

  <section className="mk-visual-section">
    <div className="mk-feature-intro compact"><span>VISUAL INTELLIGENCE</span><h2>Make the important signal impossible to miss.</h2><p>Compact operational views keep managers focused on movement, exceptions and the next action.</p></div>
    <VisualCards/>
    <div className="mk-use-cases-more"><Link href="/use-cases">Explore all use cases →</Link></div>
  </section>

  <section className="mk-solution-links">
    <div className="mk-feature-intro compact"><span>EXPLORE SOLUTIONS</span><h2>Choose the workflow that matches the problem.</h2></div>
    <div className="mk-solution-links-grid">{solutionLinks.map(([href,title,body],index)=><Link href={href} key={href}><i>{String(index+1).padStart(2,"0")}</i><b>{title}</b><p>{body}</p><span>Explore →</span></Link>)}</div>
  </section>

  <section className="mk-resource-links">
    <div className="mk-feature-intro compact"><span>OPERATIONS RESOURCES</span><h2>Practical guidance, without the filler.</h2></div>
    <div className="mk-resource-links-grid">{resourceLinks.map(([href,title,body],index)=><Link href={href} key={href}><div className={"mk-resource-art art-"+index}><span>METRIXIQ</span><b>{index===0?"SCORECARD":index===1?"KPI":"COACHING"}</b></div><strong>{title}</strong><p>{body}</p><span>Read guide →</span></Link>)}</div>
    <div className="mk-resource-more"><Link href="/resources">View all resources →</Link></div>
  </section>

  <section id="faq" className="mk-faq">
    <div className="mk-feature-intro compact"><span>FAQ</span><h2>Quick answers for delivery teams.</h2></div>
    <div className="mk-faq-grid">{faqs.map(([q,a],i)=><details key={q} open={i===0}><summary>{q}<span>＋</span></summary><p>{a}</p></details>)}</div>
  </section>

  <section id="get-started" className="mk-closing" data-plan-count={plans.length} data-starting-price={planPrice(plans[0])}><div><span>READY TO SEE IT IN YOUR OPERATION?</span><h2>Bring the data together. Make the next action obvious.</h2></div><LandingAuthTrigger mode="register" fallbackHref="/login?mode=register" ctaLocation="homepage_closing">Get started →</LandingAuthTrigger></section>

  <footer className="mk-public-footer">
    <Link href="/"><Brand /></Link>
    <p>Fleet and driver performance intelligence for modern delivery operations.</p>
    <nav><Link href="/use-cases">Use cases</Link><Link href="/resources">Resources</Link><Link href="/about">About</Link><Link href="/contact">Contact</Link>{PUBLIC_CONTACT_EMAIL ? <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`}>Email</a> : null}{PUBLIC_LINKEDIN_URL ? <a href={PUBLIC_LINKEDIN_URL} rel="me noopener noreferrer" target="_blank">LinkedIn</a> : null}<Link href="/security">Security</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><CookieSettingsButton /></nav>
  </footer>
  <LandingAuthModal/>
 </main>
}
