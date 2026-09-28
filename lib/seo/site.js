export const SITE_URL = "https://www.metrixiq.co.uk";

export const SITE_NAME = "MetrixIQ";

export const DEFAULT_TITLE = "MetrixIQ — Fleet & Driver Performance Intelligence";

export const DEFAULT_DESCRIPTION =
  "AI-powered fleet and driver performance intelligence for delivery operations. Monitor performance, compliance, coaching and operational trends in one workspace.";

export const PUBLIC_PAGES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/solutions", changeFrequency: "monthly", priority: 0.95 },
  { path: "/resources", changeFrequency: "weekly", priority: 0.9 },
  { path: "/use-cases", changeFrequency: "monthly", priority: 0.9 },
  { path: "/compare/spreadsheets-vs-fleet-performance-software", changeFrequency: "monthly", priority: 0.8 },
  { path: "/driver-performance-scorecards", changeFrequency: "monthly", priority: 0.9 },
  { path: "/fleet-compliance-monitoring", changeFrequency: "monthly", priority: 0.9 },
  { path: "/delivery-operations-software", changeFrequency: "monthly", priority: 0.9 },
  { path: "/driver-coaching-software", changeFrequency: "monthly", priority: 0.85 },
  { path: "/fleet-data-analytics", changeFrequency: "monthly", priority: 0.85 },
  { path: "/fleet-performance-management", changeFrequency: "monthly", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.7 },
  { path: "/security", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.5 },
];

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.svg`,
  description: DEFAULT_DESCRIPTION,
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  publisher: { "@id": `${SITE_URL}/#organization` },
};

export const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#software`,
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  publisher: { "@id": `${SITE_URL}/#organization` },
};


export function buildPageMetadata({ title, description, path }) {
  const canonicalPath = path === "/" ? "/" : path;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
      languages: { "en-GB": canonicalPath },
    },
    openGraph: {
      type: "website",
      url: canonicalPath,
      siteName: SITE_NAME,
      locale: "en_GB",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "MetrixIQ fleet and driver performance intelligence",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: ["/twitter-image"],
    },
  };
}
