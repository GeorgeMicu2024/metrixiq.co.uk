import { SITE_NAME, SITE_URL } from "./site";

export const SOLUTION_PAGES = {
  "driver-performance-scorecards": {
    path: "/driver-performance-scorecards",
    title: "Driver Performance Scorecards",
    eyebrow: "DRIVER PERFORMANCE",
    description:
      "Driver performance scorecard software for delivery operations, combining KPIs, safety signals, trends and coaching context in one driver view.",
    h1: "Driver performance scorecards that turn weekly metrics into clear action.",
    intro:
      "MetrixIQ brings recurring driver KPIs, safety signals, compliance evidence and performance history into one structured scorecard so managers can see what changed, why it matters and where coaching should focus next.",
    problemTitle: "Move beyond static weekly scorecards",
    problem: [
      "Driver performance data often arrives in different reports, at different times and with different identifiers. Managers then spend valuable time matching names, rebuilding calculations and comparing one week with another before they can start a useful coaching conversation.",
      "MetrixIQ keeps the driver at the centre of the analysis. Scorecard metrics, trend movement and supporting operational evidence can be reviewed together instead of being spread across disconnected files.",
    ],
    capabilities: [
      ["Unified driver view","Bring recurring performance metrics into a consistent driver-level scorecard with site and reporting-period context."],
      ["Trend visibility","Compare current results with earlier periods so a single bad day is not confused with a sustained pattern."],
      ["Supporting evidence","Keep relevant safety, delivery-quality and compliance signals close to the scorecard rather than in separate spreadsheets."],
      ["Coaching context","Move from a metric change to a coaching priority without losing the performance history behind the decision."],
    ],
    workflow: [
      ["Import","Load the operational reports used by your delivery team."],
      ["Match","Connect records to the correct driver and site."],
      ["Review","See score, movement and supporting evidence in one place."],
      ["Act","Use the result for coaching, follow-up and management reporting."],
    ],
    outcomesTitle: "Built for practical driver management",
    outcomes: [
      "Reduce repeated spreadsheet reconciliation before performance reviews.",
      "Keep weekly score movement and supporting metrics in the same driver record.",
      "Give managers a clearer basis for coaching conversations and follow-up actions.",
      "Maintain a more consistent view across drivers, sites and reporting periods.",
    ],
    faqs: [
      ["What is a driver performance scorecard?","A driver performance scorecard is a structured view of the metrics used to assess a driver's operational, safety, quality and compliance performance over a defined reporting period."],
      ["Can MetrixIQ compare scorecards over time?","Yes. MetrixIQ is designed to retain reporting-period context so managers can review movement rather than treating every scorecard as an isolated snapshot."],
      ["Can scorecards be reviewed by site?","Yes. Driver and scorecard views can be scoped by site and workspace permissions so managers can focus on the areas they are responsible for."],
      ["Does MetrixIQ automatically replace manager judgement?","No. MetrixIQ organises performance evidence and highlights movement or exceptions. Managers remain responsible for interpreting the operational context and deciding the appropriate action."],
    ],
    related: ["driver-coaching-software","fleet-performance-management","fleet-data-analytics"],
  },

  "fleet-compliance-monitoring": {
    path: "/fleet-compliance-monitoring",
    title: "Fleet Compliance Monitoring",
    eyebrow: "COMPLIANCE INTELLIGENCE",
    description:
      "Fleet compliance monitoring software for delivery operations. Track compliance metrics, exceptions and site trends without rebuilding reports manually.",
    h1: "Fleet compliance monitoring that keeps exceptions visible.",
    intro:
      "MetrixIQ helps delivery operations organise recurring compliance evidence, compare performance across drivers and sites, and surface the exceptions that require management attention.",
    problemTitle: "Compliance is easier to manage when the evidence stays connected",
    problem: [
      "Operational compliance rarely lives in one report. Delivery teams may need to review contact-compliance signals, photo or delivery evidence, route procedures, safety metrics and other recurring sources before they can understand what is actually changing.",
      "MetrixIQ provides a structured layer for those reports so exceptions can be reviewed in context, linked to the correct driver or site and followed across reporting periods.",
    ],
    capabilities: [
      ["Exception-focused views","Surface low or missing compliance evidence instead of forcing managers to search entire reports manually."],
      ["Site-aware monitoring","Review one site at a time or compare broader operational performance where access allows."],
      ["Historical context","Keep recurring compliance results available so managers can distinguish isolated events from repeated issues."],
      ["Management follow-up","Use compliance evidence as the starting point for coaching, reminders, action tracking and reporting."],
    ],
    workflow: [
      ["Collect","Import the recurring compliance reports used by the operation."],
      ["Validate","Keep records tied to the correct driver, site and date."],
      ["Prioritise","Surface the exceptions and weak trends that need attention."],
      ["Follow up","Move directly into coaching or operational action."],
    ],
    outcomesTitle: "A clearer compliance workflow",
    outcomes: [
      "Reduce the time spent finding exceptions across multiple files.",
      "Create a repeatable site and driver compliance review process.",
      "Keep reporting-period history available for trend analysis.",
      "Support more consistent management follow-up with the evidence already attached.",
    ],
    faqs: [
      ["What does fleet compliance monitoring mean?","Fleet compliance monitoring is the process of reviewing recurring operational, safety and delivery-quality evidence to confirm whether drivers and sites are following required standards and procedures."],
      ["Can MetrixIQ monitor more than one compliance metric?","Yes. MetrixIQ is designed to work with multiple recurring operational metrics and report types rather than treating compliance as a single score."],
      ["Can managers filter compliance by site?","Yes. Site scope is part of the product model, allowing authorised users to focus on the operational sites relevant to them."],
      ["Does MetrixIQ create the original compliance evidence?","No. MetrixIQ organises and analyses evidence produced by operational source systems and reports. Source data should still be validated where accuracy is critical."],
    ],
    related: ["delivery-operations-software","driver-coaching-software","fleet-performance-management"],
  },

  "delivery-operations-software": {
    path: "/delivery-operations-software",
    title: "Delivery Operations Software",
    eyebrow: "DELIVERY OPERATIONS",
    description:
      "Delivery operations software for managing driver performance, compliance, site reporting and operational intelligence across recurring delivery workflows.",
    h1: "Delivery operations software built around real site workflows.",
    intro:
      "MetrixIQ connects driver performance, compliance, recurring imports and management reporting so delivery teams can spend less time rebuilding analysis and more time running the operation.",
    problemTitle: "Operational data should support the day, not slow it down",
    problem: [
      "Site managers often work across route reports, scorecards, compliance exports, driver lists and weekly performance files. Each source answers part of the operational question, but the management work happens between those systems.",
      "MetrixIQ is designed for that gap. It provides one workspace for importing recurring operational data, organising it by driver and site, and turning the results into practical views for daily and weekly management.",
    ],
    capabilities: [
      ["Daily operational views","Keep important driver, route and compliance information accessible in site-aware operational workspaces."],
      ["Driver performance","Review recurring scorecards and supporting evidence without rebuilding the driver history every week."],
      ["Smart imports","Process structured operational reports through repeatable import and identity-matching workflows."],
      ["Executive visibility","Roll site-level information into clearer performance trends and management reporting."],
    ],
    workflow: [
      ["Upload","Bring in the operational files already used by the team."],
      ["Structure","Match records to drivers, dates, sites and reporting periods."],
      ["Operate","Use focused views for daily management and exception handling."],
      ["Report","Summarise trends and priorities for weekly and executive review."],
    ],
    outcomesTitle: "One operational layer across recurring workflows",
    outcomes: [
      "Reduce duplicate analysis between daily site management and weekly reporting.",
      "Keep driver identity and site scope consistent across imported reports.",
      "Give managers faster access to the exceptions that need operational attention.",
      "Create a common performance language across sites and management levels.",
    ],
    faqs: [
      ["Who is delivery operations software for?","Delivery operations software is used by operators, site managers, fleet managers and operations teams that coordinate recurring driver, route, compliance and performance workflows."],
      ["Does MetrixIQ replace route-planning systems?","No. MetrixIQ is focused on operational intelligence, driver performance, compliance and management workflows rather than replacing the core routing systems used to execute deliveries."],
      ["Can MetrixIQ support multiple operational sites?","Yes. The platform includes site-aware data and permissions so teams can manage local operations while maintaining broader visibility where authorised."],
      ["Can MetrixIQ import existing operational reports?","Yes. Smart Import is designed to reduce repetitive preparation of common structured operational reports and connect them to the relevant workspace data."],
    ],
    related: ["fleet-performance-management","fleet-compliance-monitoring","fleet-data-analytics"],
  },

  "driver-coaching-software": {
    path: "/driver-coaching-software",
    title: "Driver Coaching Software",
    eyebrow: "COACHING & IMPROVEMENT",
    description:
      "Driver coaching software for delivery operations. Turn scorecard, safety and compliance evidence into focused coaching priorities and follow-up.",
    h1: "Driver coaching software that starts with the evidence.",
    intro:
      "MetrixIQ helps managers move from performance data to a more consistent coaching process by keeping score movement, supporting metrics and follow-up context together.",
    problemTitle: "Better coaching starts with the right context",
    problem: [
      "A coaching conversation is more useful when the manager can see whether an issue is new, repeated or already improving. That context is difficult to maintain when scorecards, compliance reports and previous actions are spread across different files.",
      "MetrixIQ connects the performance evidence around the driver so managers can focus the conversation on specific behaviour and track whether the next reporting period shows improvement.",
    ],
    capabilities: [
      ["Evidence-led priorities","Use score movement and operational metrics to identify the behaviours that deserve coaching attention."],
      ["Performance history","Review earlier reporting periods before deciding whether an issue is isolated or recurring."],
      ["Consistent follow-up","Keep the next action connected to the driver record and the evidence that triggered it."],
      ["Manager visibility","Give authorised managers a clearer view of coaching priorities across drivers and sites."],
    ],
    workflow: [
      ["Identify","Find the metric, trend or exception that needs attention."],
      ["Understand","Review the driver's supporting history and related evidence."],
      ["Coach","Focus the conversation on the specific operational behaviour."],
      ["Recheck","Use the next reporting period to see whether performance improved."],
    ],
    outcomesTitle: "Make coaching more consistent",
    outcomes: [
      "Reduce generic coaching by focusing on specific evidence and trends.",
      "Keep the reason for each coaching priority visible to managers.",
      "Review whether the next reporting period shows measurable improvement.",
      "Support consistent follow-up across managers, drivers and sites.",
    ],
    faqs: [
      ["What is driver coaching software?","Driver coaching software helps managers use performance and safety evidence to identify coaching priorities, structure follow-up and review improvement over time."],
      ["Does MetrixIQ provide automated coaching decisions?","MetrixIQ can help surface trends and priorities, but managers remain responsible for the final coaching conversation and any operational decision."],
      ["Can coaching use scorecard and compliance data together?","Yes. The platform is designed to keep driver performance and supporting operational evidence connected so coaching does not depend on one isolated metric."],
      ["Can managers review improvement after coaching?","Yes. Recurring reporting-period data makes it possible to compare later performance with the evidence that originally triggered the coaching need."],
    ],
    related: ["driver-performance-scorecards","fleet-compliance-monitoring","fleet-performance-management"],
  },

  "fleet-data-analytics": {
    path: "/fleet-data-analytics",
    title: "Fleet Data Analytics",
    eyebrow: "FLEET ANALYTICS",
    description:
      "Fleet data analytics for delivery operations. Turn recurring reports into driver, site and fleet trends without rebuilding spreadsheet analysis each week.",
    h1: "Fleet data analytics that connects the operational detail to the wider trend.",
    intro:
      "MetrixIQ turns recurring driver, site and compliance reports into a structured analytics layer so managers can compare reporting periods, understand movement and investigate the operational evidence behind the numbers.",
    problemTitle: "Analytics is useful when managers can trace the number back to the operation",
    problem: [
      "A fleet-level trend is only valuable if managers can understand which sites, drivers or metrics are creating it. Static spreadsheets often make that investigation slow because the underlying evidence is separated across files and reporting periods.",
      "MetrixIQ connects higher-level trends with the driver and site context behind them, allowing managers to move from an executive signal into the operational detail that needs action.",
    ],
    capabilities: [
      ["Trend analysis","Compare recurring performance periods and identify where metrics are improving, stable or declining."],
      ["Driver-to-fleet drilldown","Move from fleet or site summaries into the driver-level evidence behind the trend."],
      ["Data quality context","Keep unmatched identities, missing evidence and import issues visible instead of hiding uncertainty."],
      ["Operational reporting","Use structured analytics as the foundation for weekly summaries and executive performance reviews."],
    ],
    workflow: [
      ["Ingest","Import recurring operational and performance reports."],
      ["Normalise","Connect records to consistent drivers, sites and reporting periods."],
      ["Analyse","Review trend movement and investigate the contributors behind it."],
      ["Communicate","Turn the result into site and executive reporting."],
    ],
    outcomesTitle: "Analytics designed for operational decisions",
    outcomes: [
      "Spend less time consolidating recurring reports before analysis can begin.",
      "Keep driver, site and fleet views connected to the same underlying evidence.",
      "Surface data-quality gaps alongside performance trends.",
      "Create repeatable reporting instead of one-off spreadsheet analysis.",
    ],
    faqs: [
      ["What is fleet data analytics?","Fleet data analytics is the process of combining operational, driver, safety and compliance information to understand trends, exceptions and performance across a fleet."],
      ["Can MetrixIQ analyse historical reporting periods?","Yes. The platform is designed to preserve reporting-period context so current performance can be compared with earlier data."],
      ["Does MetrixIQ show data-quality issues?","The product includes data-quality and identity-matching workflows so missing or unmatched records can remain visible rather than being silently treated as valid data."],
      ["Can analytics be broken down by site and driver?","Yes. The underlying product model supports driver, site and broader fleet-level views where the user's permissions allow access."],
    ],
    related: ["fleet-performance-management","driver-performance-scorecards","delivery-operations-software"],
  },

  "fleet-performance-management": {
    path: "/fleet-performance-management",
    title: "Fleet Performance Management",
    eyebrow: "PERFORMANCE MANAGEMENT",
    description:
      "Fleet performance management software for delivery operations. Monitor driver and site KPIs, trends, compliance and coaching priorities in one operational workspace.",
    h1: "Fleet performance management that connects metrics to management action.",
    intro:
      "MetrixIQ gives delivery operations a structured way to review driver and site performance, compare recurring periods and move from a KPI change into the operational action behind it.",
    problemTitle: "Performance management is more than a dashboard",
    problem: [
      "Dashboards can show that a metric moved, but managers still need to understand what caused the movement, who is affected and what should happen next. That usually requires several reports and a separate coaching or follow-up process.",
      "MetrixIQ connects the performance view to driver-level evidence, compliance context and management workflows so the analysis can continue beyond the headline number.",
    ],
    capabilities: [
      ["Driver and site KPIs","Review operational performance at the level where managers can actually act on it."],
      ["Week-over-week movement","Keep earlier reporting periods available to distinguish real trends from short-term noise."],
      ["Performance exceptions","Surface low, missing or unusual results so attention is directed to the right part of the operation."],
      ["Coaching and reporting","Connect performance evidence to driver follow-up and higher-level management summaries."],
    ],
    workflow: [
      ["Measure","Bring the recurring KPIs into a structured reporting period."],
      ["Compare","Review movement against previous driver and site performance."],
      ["Investigate","Open the underlying evidence behind weak or unusual results."],
      ["Improve","Turn the finding into coaching, follow-up or an operational action."],
    ],
    outcomesTitle: "A repeatable performance-management cycle",
    outcomes: [
      "Create a consistent weekly performance process across sites and managers.",
      "Connect fleet-level movement with the drivers and metrics behind it.",
      "Reduce time spent rebuilding reports before management action can begin.",
      "Keep coaching and compliance context close to the performance evidence.",
    ],
    faqs: [
      ["What is fleet performance management?","Fleet performance management is the recurring process of measuring driver and site KPIs, reviewing trends, investigating exceptions and taking management action to improve operational results."],
      ["Can MetrixIQ compare sites?","Yes. Authorised users can review site-level performance and broader fleet trends while respecting workspace and site-access permissions."],
      ["Can performance management include compliance and coaching?","Yes. MetrixIQ is designed to connect KPI movement with supporting compliance evidence and driver coaching workflows rather than treating each area as a separate system."],
      ["Is MetrixIQ only for executive dashboards?","No. The platform covers daily operational detail, driver-level performance, site reporting and higher-level management intelligence."],
    ],
    related: ["fleet-data-analytics","driver-performance-scorecards","delivery-operations-software"],
  },
};

export const SOLUTION_PAGE_LIST = Object.values(SOLUTION_PAGES);

export function buildSolutionSchemas(page) {
  const pageUrl = `${SITE_URL}${page.path}`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${pageUrl}#webpage`,
      url: pageUrl,
      name: `${page.title} | ${SITE_NAME}`,
      description: page.description,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#software` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${pageUrl}#breadcrumb`,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: page.title,
          item: pageUrl,
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${pageUrl}#faq`,
      mainEntity: page.faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    },
  ];
}
