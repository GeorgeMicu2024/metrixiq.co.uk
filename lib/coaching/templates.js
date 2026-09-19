export const COACHING_TEMPLATES = Object.freeze([
  {
    id: "fico",
    label: "FICO / eMentor",
    metric: "FICO",
    priority: "high",
    dueDays: 7,
    title: "FICO performance coaching",
    reason: "Review driving behaviour contributing to the FICO result, agree the corrective action, and verify improvement at the next scorecard.",
    checklist: [
      "Review the current FICO score and the contributing driving events.",
      "Confirm the expected minimum score of 815+.",
      "Discuss speeding and other high-impact behaviours where relevant.",
      "Agree one measurable action for the next working week.",
      "Review the next available score before closing the case.",
    ],
  },
  {
    id: "dcr",
    label: "DCR",
    metric: "DCR",
    priority: "high",
    dueDays: 7,
    title: "DCR workflow coaching",
    reason: "Review delivery completion behaviour, reattempts, correct status selection and end-of-day recovery opportunities.",
    checklist: [
      "Review failed delivery reasons and route evidence.",
      "Reinforce reattempt expectations where appropriate.",
      "Confirm correct delivery status selection.",
      "Check whether route completion issues are repeated.",
      "Review the next weekly DCR result.",
    ],
  },
  {
    id: "pod",
    label: "POD",
    metric: "POD",
    priority: "medium",
    dueDays: 7,
    title: "POD quality coaching",
    reason: "Reinforce clear proof-of-delivery workflow and correct customer handover process.",
    checklist: [
      "Review recent POD exceptions.",
      "Reinforce clear, compliant photo positioning.",
      "Confirm the customer handover workflow.",
      "Avoid rushed or obstructed POD evidence.",
      "Review the next POD result.",
    ],
  },
  {
    id: "cc",
    label: "CC",
    metric: "CC",
    priority: "medium",
    dueDays: 7,
    title: "Customer contact coaching",
    reason: "Review contact compliance and correct Notify of Arrival / customer contact workflow.",
    checklist: [
      "Review contact-compliance exceptions.",
      "Reinforce Notify of Arrival where applicable.",
      "Follow the first workflow option in the delivery app.",
      "Complete contact actions at the delivery location.",
      "Review the next CC result.",
    ],
  },
  {
    id: "concessions",
    label: "Concessions",
    metric: "Concessions",
    priority: "high",
    dueDays: 5,
    title: "Concessions quality review",
    reason: "Investigate current concessions, identify repeat causes and agree a prevention action.",
    checklist: [
      "Review every concession in the selected week.",
      "Identify repeated address or delivery-quality patterns.",
      "Check POD / contact evidence where available.",
      "Agree a prevention action.",
      "Verify whether concessions recur next week.",
    ],
  },
  {
    id: "fair-poor",
    label: "Fair / Poor scorecard",
    metric: "Total Score",
    priority: "high",
    dueDays: 7,
    title: "Driver scorecard recovery plan",
    reason: "Review the point-band scorecard, identify the largest lost-point components and agree a focused recovery plan.",
    checklist: [
      "Review the Total Score and current tier.",
      "Identify the two largest lost-point components.",
      "Agree one action per priority component.",
      "Set a follow-up date.",
      "Compare the next scorecard against the baseline.",
    ],
  },
  {
    id: "general",
    label: "General performance",
    metric: null,
    priority: "medium",
    dueDays: 7,
    title: "Performance coaching",
    reason: "Document the performance concern, expected standard and agreed next action.",
    checklist: [
      "Record the evidence discussed.",
      "Explain the expected standard.",
      "Agree a measurable action.",
      "Set a review date.",
      "Document the follow-up result.",
    ],
  },
]);

export function coachingTemplate(id) {
  return COACHING_TEMPLATES.find((item) => item.id === id) || COACHING_TEMPLATES.at(-1);
}

export function templateForMetric(metric = "") {
  const value = String(metric || "").toLowerCase();
  if (value.includes("fico") || value.includes("mentor")) return coachingTemplate("fico");
  if (value.includes("dcr")) return coachingTemplate("dcr");
  if (value.includes("pod")) return coachingTemplate("pod");
  if (value === "cc" || value.includes("customer contact")) return coachingTemplate("cc");
  if (value.includes("concession")) return coachingTemplate("concessions");
  if (value.includes("score") || value.includes("tier")) return coachingTemplate("fair-poor");
  return coachingTemplate("general");
}
