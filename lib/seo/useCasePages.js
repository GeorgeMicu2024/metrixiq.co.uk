import { SITE_NAME, SITE_URL } from "./site";

export const USE_CASES = {
  "multi-site-delivery-performance": {
    slug: "multi-site-delivery-performance",
    path: "/use-cases/multi-site-delivery-performance",
    title: "Multi-Site Delivery Performance Management",
    description:
      "Manage driver and site performance across multiple delivery locations with consistent KPIs, site-aware access, trend comparison and executive reporting.",
    eyebrow: "MULTI-SITE OPERATIONS",
    h1: "Multi-site delivery performance without rebuilding the same report for every location.",
    intro:
      "MetrixIQ helps operations teams keep driver, site and fleet performance connected across multiple locations while preserving local ownership, permissions and reporting context.",
    challengeTitle: "The challenge: every site reports differently, but leadership needs one performance picture",
    challenge: [
      "Multi-site delivery operations often use the same broad KPIs but manage them through separate spreadsheets, local reporting habits and different levels of data quality. That makes site-to-site comparison slow and can hide whether a weak result is local, widespread or simply caused by inconsistent reporting.",
      "MetrixIQ keeps site scope explicit while giving authorised users a broader fleet view. Managers can review their own operation without losing the structure needed for regional or executive reporting."
    ],
    capabilities: [
      ["Site-aware views","Keep drivers, scorecards and operational evidence tied to the correct site and reporting period."],
      ["Consistent KPI structure","Use the same metric definitions and reporting logic across locations instead of rebuilding local versions."],
      ["Cross-site trends","Compare movement between sites and identify where improvement or deterioration is concentrated."],
      ["Role-based access","Give local managers the site visibility they need while preserving broader oversight for authorised leaders."]
    ],
    workflow: [
      ["Import by site","Load recurring operational reports with site context intact."],
      ["Normalise","Match driver identities and reporting periods consistently across locations."],
      ["Compare","Review site movement and drill into the drivers or metrics behind it."],
      ["Report","Summarise cross-site performance for weekly and executive review."]
    ],
    outcomes: [
      "Reduce duplicate reporting work between individual sites.",
      "Make site comparisons more consistent and explainable.",
      "Keep local management ownership while improving fleet-level visibility.",
      "Trace fleet movement back to the site and driver evidence behind it."
    ],
    faqs: [
      ["Can MetrixIQ keep site data separated?","Yes. MetrixIQ is built around site-aware data and permission scopes so users can be limited to the locations relevant to their role."],
      ["Can senior managers compare multiple sites?","Yes, where their workspace permissions allow it. Broader views can compare recurring performance across sites while retaining the ability to drill into local detail."],
      ["Does every site need to use identical source files?","Not necessarily. The important requirement is that imported data can be mapped into a consistent metric and identity structure so comparisons remain meaningful."],
      ["Can site-level results be included in executive reporting?","Yes. Site trends and operational drivers can be summarised into broader management views without losing the underlying source context."]
    ],
    relatedSolution: "/fleet-performance-management",
    relatedSolutionLabel: "Fleet Performance Management"
  },

  "fleet-performance-dashboard": {
    slug: "fleet-performance-dashboard",
    path: "/use-cases/fleet-performance-dashboard",
    title: "Fleet Performance Dashboard",
    description:
      "A fleet performance dashboard for delivery operations that connects driver KPIs, site trends, compliance signals and operational follow-up.",
    eyebrow: "PERFORMANCE DASHBOARD",
    h1: "A fleet performance dashboard that shows the trend and the evidence behind it.",
    intro:
      "MetrixIQ combines fleet, site and driver performance into a structured dashboard so managers can see movement quickly and investigate the operational detail behind it.",
    challengeTitle: "The challenge: dashboards often stop at the headline number",
    challenge: [
      "A dashboard can show that performance moved, but managers still need to understand which site, driver or metric created the movement. When that investigation requires separate files, the dashboard becomes a display layer rather than a management tool.",
      "MetrixIQ connects the headline KPI to the site and driver context behind it, making it easier to move from trend recognition into operational action."
    ],
    capabilities: [
      ["Fleet KPI overview","Track recurring performance indicators in one management view."],
      ["Site contribution","See where fleet movement is concentrated and compare reporting periods."],
      ["Driver drilldown","Move from a site or fleet signal into the driver-level evidence behind it."],
      ["Exception visibility","Keep weak, missing or unusual data visible rather than hiding it inside an average."]
    ],
    workflow: [
      ["Measure","Bring recurring KPI data into the correct reporting period."],
      ["Spot movement","Identify improving, declining or unusual fleet trends."],
      ["Drill down","Open the sites and drivers contributing to the result."],
      ["Act","Move the finding into coaching, compliance review or management reporting."]
    ],
    outcomes: [
      "Reduce the time between seeing a KPI change and understanding the cause.",
      "Keep fleet, site and driver views connected to the same evidence.",
      "Make weekly performance meetings more focused on exceptions and movement.",
      "Use one reporting structure for operational and executive review."
    ],
    faqs: [
      ["What should a fleet performance dashboard show?","A useful fleet dashboard should show current KPI status, movement over time, site contribution, driver-level drilldown and enough data-quality context to explain the result."],
      ["Can MetrixIQ show previous reporting periods?","Yes. Historical reporting context is part of the performance workflow so managers can compare current results with earlier periods."],
      ["Can the dashboard be filtered by site?","Yes. Site scope is built into the platform and can be combined with user permissions."],
      ["Does the dashboard replace source reports?","No. MetrixIQ organises and analyses operational source data while keeping the source context available when a manager needs to investigate further."]
    ],
    relatedSolution: "/fleet-data-analytics",
    relatedSolutionLabel: "Fleet Data Analytics"
  },

  "driver-safety-analytics": {
    slug: "driver-safety-analytics",
    path: "/use-cases/driver-safety-analytics",
    title: "Driver Safety Analytics",
    description:
      "Driver safety analytics for delivery fleets, combining recurring safety signals, trend movement and coaching context in one operational workflow.",
    eyebrow: "DRIVER SAFETY",
    h1: "Driver safety analytics that turns recurring safety signals into focused follow-up.",
    intro:
      "MetrixIQ helps delivery operations review driver safety evidence in context, distinguish isolated events from repeated patterns and connect the result to coaching and follow-up.",
    challengeTitle: "The challenge: one safety score rarely tells the full story",
    challenge: [
      "Safety data is most useful when managers can see what changed, whether the behaviour is repeated and how it compares with the driver's recent history. A single score without context can lead to overreaction or missed patterns.",
      "MetrixIQ keeps recurring safety signals close to the broader driver performance record so managers can review trend direction before deciding the next action."
    ],
    capabilities: [
      ["Safety trend history","Compare recurring safety results rather than reviewing each period in isolation."],
      ["Driver context","Review safety evidence alongside broader performance and compliance information."],
      ["Priority detection","Surface weak or deteriorating results that deserve attention."],
      ["Coaching follow-up","Connect the safety signal to a focused driver conversation and later recheck."]
    ],
    workflow: [
      ["Capture","Import recurring driver safety evidence."],
      ["Contextualise","Match it to the correct driver, site and reporting period."],
      ["Prioritise","Identify deteriorating or repeated safety patterns."],
      ["Coach and recheck","Agree an action and review later evidence for improvement."]
    ],
    outcomes: [
      "Focus safety coaching on repeatable evidence rather than broad labels.",
      "Distinguish a one-off event from a sustained pattern.",
      "Keep safety performance connected to the wider driver record.",
      "Measure whether follow-up is associated with later improvement."
    ],
    faqs: [
      ["What is driver safety analytics?","Driver safety analytics is the structured review of recurring safety-related evidence to identify trends, exceptions and behaviours that may require management attention."],
      ["Can safety analytics be used for coaching?","Yes. The strongest use is to connect a specific safety signal to a focused coaching priority and then review later periods for improvement."],
      ["Does MetrixIQ make automatic safety decisions?","No. MetrixIQ helps organise and surface evidence. Managers remain responsible for interpreting context and deciding the appropriate operational response."],
      ["Can safety trends be reviewed by site?","Yes. Safety evidence can be reviewed within site-aware views where user permissions allow access."]
    ],
    relatedSolution: "/driver-coaching-software",
    relatedSolutionLabel: "Driver Coaching Software"
  },

  "delivery-compliance-dashboard": {
    slug: "delivery-compliance-dashboard",
    path: "/use-cases/delivery-compliance-dashboard",
    title: "Delivery Compliance Dashboard",
    description:
      "A delivery compliance dashboard for monitoring recurring driver and site compliance evidence, exceptions and follow-up across delivery operations.",
    eyebrow: "COMPLIANCE DASHBOARD",
    h1: "A delivery compliance dashboard built around exceptions, evidence and follow-up.",
    intro:
      "MetrixIQ helps managers review compliance status quickly, identify missing or weak evidence and keep driver and site context attached to the issue.",
    challengeTitle: "The challenge: compliance review is slow when the exceptions are buried in full reports",
    challenge: [
      "Operational compliance reports can contain hundreds of successful records while only a small number require attention. Managers lose time when they have to search the entire report for those exceptions and then manually match them back to a driver.",
      "MetrixIQ is designed to make the exception the starting point, while preserving enough source and historical context to understand whether the problem is isolated or repeated."
    ],
    capabilities: [
      ["Exception-first review","Focus attention on missing, weak or unusual compliance evidence."],
      ["Driver and site matching","Keep each exception tied to the correct operational identity and location."],
      ["Historical pattern","See whether a compliance issue has appeared in earlier reporting periods."],
      ["Follow-up context","Use the evidence as the basis for reminders, coaching or operational action."]
    ],
    workflow: [
      ["Import","Load the recurring compliance evidence used by the operation."],
      ["Validate","Keep identity, date and site context attached to each record."],
      ["Review exceptions","Prioritise the records that need management attention."],
      ["Follow up","Track the relevant operational action and review the next period."]
    ],
    outcomes: [
      "Spend less time searching full compliance reports for the few records that matter.",
      "Keep exception history connected to the same driver and site.",
      "Create a repeatable compliance review process across locations.",
      "Give managers clearer evidence for follow-up conversations."
    ],
    faqs: [
      ["What is a delivery compliance dashboard?","A delivery compliance dashboard is a management view that summarises recurring compliance evidence and highlights the exceptions that need review."],
      ["Can MetrixIQ show missing evidence?","Yes. The product is designed to keep missing and incomplete data visible rather than treating it as a normal result."],
      ["Can managers review compliance by driver?","Yes. Compliance evidence can be connected to driver-level records where the source identity can be matched reliably."],
      ["Can compliance be compared over time?","Yes. Recurring reporting periods make it possible to distinguish a one-off miss from a repeated compliance issue."]
    ],
    relatedSolution: "/fleet-compliance-monitoring",
    relatedSolutionLabel: "Fleet Compliance Monitoring"
  },

  "delivery-management-reporting": {
    slug: "delivery-management-reporting",
    path: "/use-cases/delivery-management-reporting",
    title: "Delivery Management Reporting",
    description:
      "Delivery management reporting software for turning recurring site and driver data into consistent weekly summaries and executive performance views.",
    eyebrow: "MANAGEMENT REPORTING",
    h1: "Delivery management reporting that keeps the operational detail behind the summary.",
    intro:
      "MetrixIQ helps operations teams move from recurring site and driver reports into clearer weekly and executive reporting without losing the evidence behind the headline.",
    challengeTitle: "The challenge: weekly reporting often repeats the same manual consolidation",
    challenge: [
      "Managers may spend hours collecting site updates, comparing scorecards, checking compliance files and rebuilding the same summary every week. The result is often useful, but the process is repetitive and difficult to scale across multiple locations.",
      "MetrixIQ creates a structured reporting layer so recurring evidence can be reused for site review, management summaries and executive visibility."
    ],
    capabilities: [
      ["Recurring reporting periods","Keep weekly and daily evidence organised by the period it actually represents."],
      ["Site-to-executive rollup","Summarise site-level movement into broader management views."],
      ["Root-cause context","Keep the drivers, sites and metrics behind a headline change available for investigation."],
      ["Reusable reporting structure","Reduce repeated spreadsheet preparation by using the same operational data model each period."]
    ],
    workflow: [
      ["Collect","Import the recurring reports already used by managers."],
      ["Reconcile","Resolve identity, site and reporting-period context."],
      ["Summarise","Review the movement, exceptions and operational contributors."],
      ["Communicate","Publish the weekly or executive view with the supporting evidence still available."]
    ],
    outcomes: [
      "Reduce recurring manual consolidation before management meetings.",
      "Keep weekly reporting consistent across sites.",
      "Explain headline movement with the underlying operational contributors.",
      "Reuse the same evidence across site, fleet and executive reporting."
    ],
    faqs: [
      ["What is delivery management reporting?","Delivery management reporting is the recurring process of summarising driver, site, compliance and operational performance for local and senior management review."],
      ["Can MetrixIQ support weekly executive reporting?","Yes. The platform is designed to preserve recurring reporting-period context and roll site evidence into broader management views."],
      ["Can managers trace a summary back to individual drivers?","Where permissions allow, MetrixIQ can connect higher-level movement to the site and driver data behind it."],
      ["Does MetrixIQ replace all reporting tools?","No. It provides an operational intelligence layer that can reduce repeated manual consolidation and make the underlying evidence easier to reuse."]
    ],
    relatedSolution: "/delivery-operations-software",
    relatedSolutionLabel: "Delivery Operations Software"
  }
};

export const USE_CASE_LIST = Object.values(USE_CASES);

export const COMPARISON_PAGE = {
  path: "/compare/spreadsheets-vs-fleet-performance-software",
  title: "Spreadsheets vs Fleet Performance Software",
  description:
    "Compare spreadsheet-based fleet reporting with dedicated fleet performance software across data quality, recurring reporting, driver history, multi-site visibility and coaching workflows.",
  eyebrow: "WORKFLOW COMPARISON",
  h1: "Spreadsheets vs fleet performance software: when the operational workflow starts to outgrow the file.",
  intro:
    "Spreadsheets are flexible and useful, especially when a reporting process is small. The trade-off appears as the operation grows: more sites, more recurring files, more driver identities and more management follow-up.",
  rows: [
    ["Recurring imports","Manual copy, formulas and file preparation are often repeated each period.","Structured import workflows can reuse mappings and reporting context."],
    ["Driver identity","Names and IDs may need to be reconciled manually in each workbook.","Identity mappings can be retained and reused across reporting periods."],
    ["Historical context","Previous periods often live in separate tabs or files.","Driver and site history can remain connected to the current reporting view."],
    ["Multi-site reporting","Consolidation can require multiple local workbooks and a separate master file.","Site-aware data can feed broader fleet views while preserving local scope."],
    ["Data quality","Missing or duplicate data may be difficult to distinguish from valid zeros.","Unmatched, missing and incomplete evidence can be surfaced explicitly."],
    ["Coaching workflow","Performance review and coaching notes are usually managed outside the spreadsheet.","Performance evidence can connect directly to coaching and follow-up context."],
    ["Access control","File sharing can become the main permission model.","Role and site permissions can control what each user can review."]
  ],
  whenSpreadsheetWorks: [
    "A small operation with limited reporting complexity.",
    "One or two recurring data sources with stable structure.",
    "A single manager who owns both analysis and follow-up.",
    "Little need for historical driver or multi-site reporting."
  ],
  whenSoftwareHelps: [
    "The same consolidation work is repeated every week.",
    "Several sites or managers need consistent views and permissions.",
    "Driver identities vary across operational systems.",
    "Historical trends, coaching or compliance evidence must stay connected.",
    "Senior management needs a repeatable fleet-level view."
  ],
  faqs: [
    ["Are spreadsheets bad for fleet reporting?","No. Spreadsheets are flexible and can be effective for smaller or less complex workflows. The problem appears when recurring reconciliation, multi-site access and historical context become difficult to manage reliably."],
    ["When should a delivery operation move beyond spreadsheets?","A dedicated system becomes more useful when teams repeat the same consolidation each period, manage several sites or need driver-level history and controlled access."],
    ["Can MetrixIQ still work with spreadsheet exports?","Yes. MetrixIQ is designed to import structured operational files, including common spreadsheet-based reports, and organise them into a more repeatable workflow."],
    ["Does dedicated software remove the need to validate data?","No. Important operational data should still be validated. Dedicated software can make missing, unmatched or inconsistent evidence easier to identify and investigate."]
  ]
};

export function buildUseCaseSchemas(page) {
  const url = `${SITE_URL}${page.path}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: `${page.title} | ${SITE_NAME}`,
      description: page.description,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#software` }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Use cases", item: `${SITE_URL}/use-cases` },
        { "@type": "ListItem", position: 3, name: page.title, item: url }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: page.faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer }
      }))
    }
  ];
}

export function buildComparisonSchemas() {
  const url = `${SITE_URL}${COMPARISON_PAGE.path}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: `${COMPARISON_PAGE.title} | ${SITE_NAME}`,
      description: COMPARISON_PAGE.description,
      isPartOf: { "@id": `${SITE_URL}/#website` }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: COMPARISON_PAGE.faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer }
      }))
    }
  ];
}
