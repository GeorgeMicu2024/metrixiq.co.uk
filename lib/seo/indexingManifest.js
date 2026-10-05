import { PUBLIC_PAGES, SITE_URL } from "./site";
import { SOLUTION_PAGE_LIST } from "./solutionPages";
import { RESOURCE_LIST } from "./resources";
import { USE_CASE_LIST, COMPARISON_PAGE } from "./useCasePages";

const unique = (values) => [...new Set(values)];

export const INDEXING_PRIORITY_URLS = [
  "/",
  "/solutions",
  "/pricing",
  "/fleet-performance-management",
  "/driver-performance-scorecards",
  "/fleet-compliance-monitoring",
  "/delivery-operations-software",
  "/driver-coaching-software",
  "/fleet-data-analytics",
  "/use-cases",
  "/use-cases/fleet-performance-dashboard",
  "/use-cases/multi-site-delivery-performance",
  COMPARISON_PAGE.path,
];

export const DISCOVERY_URLS = unique([
  ...PUBLIC_PAGES.map((page) => page.path),
  ...SOLUTION_PAGE_LIST.map((page) => page.path),
  ...RESOURCE_LIST.map((article) => article.path),
  ...USE_CASE_LIST.map((page) => page.path),
  COMPARISON_PAGE.path,
]);

export const INDEXING_MANIFEST = DISCOVERY_URLS.map((path) => ({
  path,
  url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
  priority: INDEXING_PRIORITY_URLS.includes(path) ? "priority" : "standard",
}));

export const PRIORITY_INDEXING_MANIFEST = INDEXING_MANIFEST.filter(
  (entry) => entry.priority === "priority"
);
