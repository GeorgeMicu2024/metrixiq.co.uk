export const NAV_ITEMS = [
  ["dashboard", "Dashboard"],
  ["site-scorecards", "Site Scorecards"],
  ["driver-scorecards", "Driver Scorecards"],
  ["drivers", "Drivers"],
  ["performance", "Performance"],
  ["iadc", "IADC"],
  ["cdf", "CDF Feedback"],
  ["mentor", "Mentor"],
  ["concessions", "Concessions"],
  ["coaching", "Coaching"],
  ["intelligence", "Intelligence"],
  ["imports", "Smart Import"],
  ["data-quality", "Data Quality"],
  ["management-views", "Management Views"],
  ["audit", "Audit Center"],
  ["reports", "Reports"],
  ["billing", "Plans & Billing"],
  ["team", "Team & Access"],
  ["settings", "Settings"],
  ["admin", "Super Admin"],
];

export const NAV_ICONS = Object.freeze({
  dashboard: "▦",
  "site-scorecards": "▤",
  "driver-scorecards": "◫",
  drivers: "◎",
  performance: "↗",
  iadc: "✓",
  cdf: "◈",
  mentor: "◇",
  concessions: "◆",
  coaching: "✓",
  intelligence: "✦",
  imports: "⇧",
  "data-quality": "⌁",
  "management-views": "☷",
  audit: "◴",
  reports: "▤",
  billing: "£",
  settings: "⚙",
  team: "◉",
  admin: "♛",
});

export function navSection(index) {
  if (index === 1) return "SCORECARDS";
  if (index === 3) return "OPERATIONS";
  if (index === 10) return "INTELLIGENCE";
  if (index === 11) return "DATA";
  if (index === 13) return "GOVERNANCE";
  if (index === 15) return "REPORTING";
  if (index === 16) return "ACCOUNT";
  if (index === 19) return "PLATFORM";
  return "";
}
