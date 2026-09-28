import { SITE_NAME, SITE_URL } from "./site";

export const RESOURCE_ARTICLES = {
  "driver-performance-scorecard-guide": {
    slug: "driver-performance-scorecard-guide",
    path: "/resources/driver-performance-scorecard-guide",
    title: "Driver Performance Scorecard Guide",
    description:
      "A practical guide to building driver performance scorecards for delivery operations, including metrics, trend context, data quality and coaching use.",
    eyebrow: "PRACTICAL GUIDE",
    h1: "How to build a driver performance scorecard that managers can actually use.",
    intro:
      "A useful driver scorecard does more than rank people. It should make performance easier to understand, connect the headline result to supporting evidence and help a manager decide what to review next.",
    readingTime: "8 min read",
    updated: "28 September 2026",
    relatedSolution: "/driver-performance-scorecards",
    relatedSolutionLabel: "Driver Performance Scorecards",
    sections: [
      {
        title: "Start with the management decision",
        paragraphs: [
          "Before choosing metrics, define what the scorecard is supposed to help a manager decide. In delivery operations that usually means identifying sustained strong performance, detecting meaningful deterioration, separating isolated events from repeated patterns and focusing coaching on behaviour that can be changed.",
          "A scorecard becomes less useful when it mixes every available metric without a clear operational purpose. The better approach is to select measures that are understandable, repeatable and connected to a management action."
        ]
      },
      {
        title: "Use a balanced set of metrics",
        paragraphs: [
          "A driver scorecard normally needs more than one dimension. Safety, delivery quality, compliance and customer-impact measures can behave differently, so a single metric rarely explains the full picture.",
          "The exact weighting depends on the operation, but the structure should remain transparent. Managers should be able to see which metric changed the overall result and whether the change is material enough to justify follow-up."
        ],
        bullets: [
          "Use metrics with a stable definition across reporting periods.",
          "Keep the direction of good performance obvious: higher-is-better or lower-is-better.",
          "Avoid hidden weighting logic that managers cannot explain.",
          "Keep missing data visible instead of silently treating it as a neutral score."
        ]
      },
      {
        title: "Preserve week-over-week context",
        paragraphs: [
          "One reporting period can be noisy. A useful scorecard keeps enough historical context to show whether a result is new, improving, declining or broadly stable.",
          "That context changes the management conversation. A single weak result after a long period of strong performance is different from the same result after three consecutive declines. The scorecard should make that distinction easy to see."
        ]
      },
      {
        title: "Separate performance from data quality",
        paragraphs: [
          "Bad data and bad performance are not the same thing. If a driver identity is unmatched, a report is incomplete or a metric is missing, the system should flag the data-quality issue before it is interpreted as a performance problem.",
          "This is especially important when several operational systems use different names, IDs or reporting schedules. Identity reconciliation and source traceability are part of scorecard reliability, not an optional extra."
        ]
      },
      {
        title: "Use the scorecard as the start of coaching, not the end",
        paragraphs: [
          "The strongest scorecards lead directly into a focused coaching conversation. The manager should be able to identify the metric that moved, review the supporting trend and agree a clear next action.",
          "At the next reporting period, the same driver history should make it easy to see whether the targeted behaviour improved. This closes the loop between reporting and operational management."
        ]
      }
    ]
  },

  "fleet-performance-kpis": {
    slug: "fleet-performance-kpis",
    path: "/resources/fleet-performance-kpis",
    title: "Fleet Performance KPIs for Delivery Operations",
    description:
      "A practical framework for selecting and reviewing fleet performance KPIs across drivers, sites and recurring delivery operations.",
    eyebrow: "KPI FRAMEWORK",
    h1: "Fleet performance KPIs: what to track and how to keep them actionable.",
    intro:
      "The value of a fleet KPI is not the number itself. The value comes from knowing what changed, where the change came from and whether a manager can act on it.",
    readingTime: "7 min read",
    updated: "28 September 2026",
    relatedSolution: "/fleet-performance-management",
    relatedSolutionLabel: "Fleet Performance Management",
    sections: [
      {
        title: "Choose KPIs that answer operational questions",
        paragraphs: [
          "Fleet reporting becomes cluttered when every available measure is promoted to a headline KPI. A better framework starts with the questions senior and site managers repeatedly need to answer: Are drivers operating safely? Is delivery quality stable? Are compliance behaviours improving? Which sites or drivers are driving the change?",
          "Once the operational questions are clear, the KPI set can be kept smaller and more meaningful."
        ]
      },
      {
        title: "Group metrics by purpose",
        paragraphs: [
          "Grouping KPIs helps managers interpret them quickly and reduces the risk of comparing unrelated measures as if they represented the same type of performance."
        ],
        bullets: [
          "Safety: driving behaviour, risk events and recurring safety signals.",
          "Delivery quality: successful completion, proof quality and customer-impact measures.",
          "Compliance: process adherence and evidence that required actions were completed correctly.",
          "Productivity and execution: operational throughput and repeatable execution measures.",
          "Data quality: missing, unmatched or stale evidence that could distort the performance view."
        ]
      },
      {
        title: "Keep site and driver drilldown available",
        paragraphs: [
          "A fleet average can hide large differences between sites. The same is true inside a site, where a small number of drivers can create most of the movement in a metric.",
          "Good KPI reporting therefore needs a clear path from fleet to site to driver. Managers should be able to move from the headline trend into the underlying contributors without rebuilding the analysis in a separate spreadsheet."
        ]
      },
      {
        title: "Use thresholds carefully",
        paragraphs: [
          "Thresholds are useful for prioritisation, but they should not replace trend context. A driver just above a threshold but deteriorating rapidly may need more attention than a stable driver just below it.",
          "Where targets are used, keep their source, definition and effective period explicit. This avoids confusion when operational standards change over time."
        ]
      },
      {
        title: "Review movement, not only rank",
        paragraphs: [
          "Rank can be motivational, but movement often provides more operational value. A driver who moves from poor to fair may represent a successful coaching intervention even if the absolute rank remains low.",
          "Weekly KPI review should therefore include both current status and direction of travel."
        ]
      }
    ]
  },

  "delivery-driver-coaching-guide": {
    slug: "delivery-driver-coaching-guide",
    path: "/resources/delivery-driver-coaching-guide",
    title: "Delivery Driver Coaching Guide",
    description:
      "A practical driver coaching framework for delivery operations using performance evidence, trends and measurable follow-up.",
    eyebrow: "COACHING GUIDE",
    h1: "A practical framework for evidence-led driver coaching.",
    intro:
      "Effective coaching is specific, evidence-led and measurable. The aim is not to repeat a score to the driver; it is to connect the score to a behaviour, agree what should change and review the result later.",
    readingTime: "7 min read",
    updated: "28 September 2026",
    relatedSolution: "/driver-coaching-software",
    relatedSolutionLabel: "Driver Coaching Software",
    sections: [
      {
        title: "Coach the behaviour, not the label",
        paragraphs: [
          "Broad labels such as good, fair or poor are useful summaries, but they do not tell a driver what to do differently. Coaching should identify the specific metric or operational behaviour behind the result.",
          "A manager should be able to explain the evidence in simple terms and link it to an action the driver can control."
        ]
      },
      {
        title: "Check whether the issue is isolated or repeated",
        paragraphs: [
          "Before coaching, review earlier reporting periods. A single event may require a reminder, while repeated deterioration may justify a more structured improvement plan.",
          "Historical context also makes coaching fairer because it shows whether the driver has otherwise been consistent or whether the same issue has already been discussed."
        ]
      },
      {
        title: "Keep the coaching conversation focused",
        bullets: [
          "Start with one or two priority behaviours rather than every weak metric.",
          "Use recent evidence the driver can recognise and understand.",
          "Agree what good performance should look like in the next reporting period.",
          "Record the follow-up date or review point."
        ]
      },
      {
        title: "Review the next period against the same evidence",
        paragraphs: [
          "Coaching becomes measurable when the next period is compared with the reason the coaching happened. If the targeted metric improves, the manager can recognise the progress. If it does not, the history provides a stronger basis for the next action.",
          "This closed-loop process is more useful than isolated coaching notes because it connects management action to an observable performance outcome."
        ]
      },
      {
        title: "Use coaching data to improve the wider operation",
        paragraphs: [
          "Repeated coaching themes across many drivers can signal a process problem rather than an individual problem. If the same issue appears across one site or one reporting period, managers should investigate training, communication or operational conditions as well as individual performance."
        ]
      }
    ]
  },

  "fleet-compliance-monitoring-guide": {
    slug: "fleet-compliance-monitoring-guide",
    path: "/resources/fleet-compliance-monitoring-guide",
    title: "Fleet Compliance Monitoring Guide",
    description:
      "A practical guide to monitoring recurring fleet and driver compliance evidence across delivery operations and multiple sites.",
    eyebrow: "COMPLIANCE GUIDE",
    h1: "How to build a repeatable fleet compliance monitoring process.",
    intro:
      "Compliance monitoring works best when the team can identify exceptions quickly, trace them to the correct driver and site, and keep enough history to recognise repeated issues.",
    readingTime: "7 min read",
    updated: "28 September 2026",
    relatedSolution: "/fleet-compliance-monitoring",
    relatedSolutionLabel: "Fleet Compliance Monitoring",
    sections: [
      {
        title: "Define the evidence before the target",
        paragraphs: [
          "A compliance percentage is only useful if everyone understands what evidence sits behind it. Start by defining the event, action or record that proves the process was followed.",
          "This prevents a common reporting problem where the team debates the score instead of reviewing the underlying behaviour."
        ]
      },
      {
        title: "Review exceptions first",
        paragraphs: [
          "Managers rarely need to read every compliant record. The operational value comes from finding the missing, late or weak evidence that needs attention.",
          "An exception-first view makes daily review faster and leaves more time for coaching or operational correction."
        ]
      },
      {
        title: "Keep driver and site context attached",
        paragraphs: [
          "Compliance issues are easier to act on when the record already includes the correct driver, site and reporting date. If identity matching happens manually every time, the compliance process becomes slow and inconsistent.",
          "A structured workspace should preserve that identity context across imports and future reporting periods."
        ]
      },
      {
        title: "Separate a one-off miss from a recurring pattern",
        paragraphs: [
          "A single missed action and a repeated compliance problem should not trigger the same response. Historical context helps managers decide whether the next step is a reminder, targeted coaching or a broader operational review.",
          "The same logic applies at site level. Repeated exceptions across multiple drivers can indicate a communication or process issue rather than several unrelated individual failures."
        ]
      },
      {
        title: "Close the loop with follow-up",
        bullets: [
          "Record the exception and the relevant source evidence.",
          "Assign the management action or coaching priority.",
          "Check the next reporting period for improvement.",
          "Escalate repeated issues using the organisation's own operational process."
        ]
      }
    ]
  },

  "delivery-operations-data-quality": {
    slug: "delivery-operations-data-quality",
    path: "/resources/delivery-operations-data-quality",
    title: "Delivery Operations Data Quality",
    description:
      "How to improve data quality in delivery operations by handling driver identity, duplicate records, missing metrics and reporting-period consistency.",
    eyebrow: "DATA QUALITY",
    h1: "Delivery operations data quality: the foundation behind reliable performance reporting.",
    intro:
      "Performance analytics can only be trusted when the records behind it are matched to the right driver, site and reporting period. Data-quality controls make that reliability visible.",
    readingTime: "8 min read",
    updated: "28 September 2026",
    relatedSolution: "/fleet-data-analytics",
    relatedSolutionLabel: "Fleet Data Analytics",
    sections: [
      {
        title: "Driver identity is a data-quality problem",
        paragraphs: [
          "The same person can appear differently across operational systems: full name, shortened name, transporter ID, encrypted identifier or another source-specific reference. If those identities are not reconciled, the same driver can be split into several records or matched to the wrong history.",
          "Identity mapping should therefore be explicit, reusable and auditable rather than hidden inside one import."
        ]
      },
      {
        title: "Duplicate data should be detected, not silently averaged",
        paragraphs: [
          "Duplicate rows can be legitimate when a source contains multiple events for one driver, but they can also result from repeated uploads or inconsistent source files.",
          "The system should preserve enough source information to explain why a duplicate exists before it affects a driver or site metric."
        ]
      },
      {
        title: "Missing is not the same as zero",
        paragraphs: [
          "A missing value, a zero score and a report that does not contain the metric are three different states. Treating them as equivalent can make a dashboard look complete while changing the underlying meaning.",
          "Reliable analytics should retain the distinction and surface incomplete evidence where it matters."
        ]
      },
      {
        title: "Keep reporting periods consistent",
        paragraphs: [
          "Daily and weekly data should not be mixed without an explicit rule. The same metric can mean something different when it represents one day, a rolling period or an official weekly scorecard.",
          "Store the reporting date, reporting granularity and source file alongside the metric so later analysis can compare like with like."
        ]
      },
      {
        title: "Make data-quality issues visible to managers",
        bullets: [
          "Show unmatched driver records that require reconciliation.",
          "Flag missing or stale source data before the dashboard is interpreted.",
          "Keep source-file and reporting-period context available for investigation.",
          "Track manual mappings so repeated imports become more reliable over time."
        ]
      }
    ]
  }
};

export const RESOURCE_LIST = Object.values(RESOURCE_ARTICLES);

export function buildArticleSchemas(article) {
  const url = `${SITE_URL}${article.path}`;
  const isoDate = "2026-09-28";

  return [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": `${url}#article`,
      headline: article.h1,
      description: article.description,
      datePublished: isoDate,
      dateModified: isoDate,
      mainEntityOfPage: url,
      author: { "@id": `${SITE_URL}/#organization` },
      publisher: { "@id": `${SITE_URL}/#organization` }
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Resources", item: `${SITE_URL}/resources` },
        { "@type": "ListItem", position: 3, name: article.title, item: url }
      ]
    }
  ];
}

export function resourceHubSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/resources#collection`,
    url: `${SITE_URL}/resources`,
    name: `Resources | ${SITE_NAME}`,
    description:
      "Practical guides for delivery operations covering driver performance, scorecards, KPIs, compliance, coaching and data quality.",
    isPartOf: { "@id": `${SITE_URL}/#website` }
  };
}
