import { PUBLIC_PAGES, SITE_URL } from "../lib/seo/site";
import { RESOURCE_LIST } from "../lib/seo/resources";
import { USE_CASE_LIST } from "../lib/seo/useCasePages";

export default function sitemap() {
  const pages = PUBLIC_PAGES.map((page) => ({
    url: `${SITE_URL}${page.path === "/" ? "" : page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  const resources = RESOURCE_LIST.map((article) => ({
    url: `${SITE_URL}${article.path}`,
    lastModified: "2026-09-28",
    changeFrequency: "monthly",
    priority: 0.75,
  }));

  const useCases = USE_CASE_LIST.map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified: "2026-09-28",
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...pages, ...resources, ...useCases];
}
