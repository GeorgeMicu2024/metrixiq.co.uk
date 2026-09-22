export const NAV_GROUPS = [
  { label: "OPERATION", items: [["daily-dispatch", "Daily Dispatch"], ["iadc", "IADC"], ["pod", "POD"], ["dcr", "DCR"], ["cc", "Customer Compliance"], ["cdf", "CDF Feedback"], ["mentor", "Mentor"], ["concessions", "Concessions"], ["evidence", "Evidence & Incidents"], ["coaching", "Coaching"], ["notifications", "Notifications"]] },
  { label: "PERFORMANCE", items: [["site-scorecards", "Site Scorecards"], ["driver-scorecards", "Driver Scorecards"], ["performance", "Performance"]] },
  { label: "PEOPLE", items: [["drivers", "Drivers"], ["team", "Team & Access"]] },
  { label: "INTELLIGENCE", items: [["intelligence", "AI Analyst"], ["simulator", "What-if Simulator"], ["management-views", "Management Views"], ["reports", "Report Builder"]] },
  { label: "DATA", items: [["imports", "Import Center"], ["data-quality", "Data Quality"], ["audit", "Audit Center"], ["integrations", "Integration Hub"], ["reliability", "Reliability Center"], ["developer-platform", "Integration & API"]] },
  { label: "ADMIN", items: [["portfolio", "Enterprise Portfolio"], ["enterprise-settings", "Enterprise Settings"], ["billing", "Plans & Billing"], ["settings", "Settings"], ["admin", "Super Admin"]] },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
export const NAV_LABELS = Object.freeze(Object.fromEntries(NAV_ITEMS));

export const NAV_ICONS = Object.freeze({
  dashboard:"▦","manager-control":"◉",automation:"⌁","mobile-manager":"▥","site-operations":"▣",
  "daily-dispatch":"＋","site-scorecards":"▤","driver-scorecards":"◫",drivers:"◎",performance:"↗",iadc:"✓",dwc:"◇",pod:"◫",dcr:"↗",cc:"◎",cdf:"◈",
  mentor:"◇",concessions:"◆",evidence:"⌕",coaching:"✓",notifications:"♢",intelligence:"✦",
  simulator:"≈",imports:"⇧","data-quality":"⌁","management-views":"☷",audit:"◴",integrations:"⇄",
  reliability:"◌","developer-platform":"⌘",portfolio:"▦","enterprise-settings":"⚙",reports:"▤",
  billing:"£",settings:"⚙",team:"◉",admin:"♛",
});

export function navSection(index) {
  let offset=0;
  for(const group of NAV_GROUPS){
    if(index===offset)return group.label;
    offset+=group.items.length;
  }
  return "";
}
