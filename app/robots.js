export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/auth", "/api"],
    },
    sitemap: "https://www.metrixiq.co.uk/sitemap.xml",
  };
}
