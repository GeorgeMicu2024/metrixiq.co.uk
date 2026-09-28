import { PUBLIC_PAGES, SITE_URL } from "../lib/seo/site";

export default function sitemap() {
  return PUBLIC_PAGES.map((page) => ({
    url: `${SITE_URL}${page.path === "/" ? "" : page.path}`,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
