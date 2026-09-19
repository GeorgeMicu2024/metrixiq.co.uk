export const PLAN_CATALOG = Object.freeze([
  {
    key: "free",
    name: "Free",
    monthlyPence: 0,
    annualPence: 0,
    description: "Core fleet visibility for small teams",
    features: ["Dashboard", "Drivers", "Core performance"],
  },
  {
    key: "pro",
    name: "Starter",
    monthlyPence: 2900,
    annualPence: 29000,
    description: "Weekly operational scorecards and quality tools",
    features: ["Scorecards", "IADC / Mentor / CDF", "Coaching & reports"],
  },
  {
    key: "business",
    name: "Professional",
    monthlyPence: 6900,
    annualPence: 69000,
    description: "Advanced fleet intelligence for growing operations",
    features: ["Everything in Starter", "Operational Intelligence", "Team Management"],
  },
  {
    key: "full",
    name: "Business",
    monthlyPence: 14900,
    annualPence: 149000,
    description: "Maximum MetrixIQ capability for larger operations",
    features: ["Everything in Professional", "Full platform access", "Premium capability"],
  },
]);

export function getPlanDefinition(key) {
  return PLAN_CATALOG.find((plan) => plan.key === key) || PLAN_CATALOG[0];
}

export function formatPlanPrice(plan, cycle = "month") {
  const pence = cycle === "year" ? plan.annualPence : plan.monthlyPence;
  if (!pence) return "£0";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(pence / 100);
}
