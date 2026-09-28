export const SITE_URL = "https://www.metrixiq.co.uk";

export const SITE_NAME = "MetrixIQ";

export const CONTACT_PHONE_E164 = "+447490544199";
export const CONTACT_PHONE_DISPLAY = "07490 544199";

export const PUBLIC_CONTACT_EMAIL =
  process.env.CONTACT_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

const validPublicUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
};

export const PUBLIC_LINKEDIN_URL = validPublicUrl(process.env.LINKEDIN_URL);
export const PUBLIC_X_URL = validPublicUrl(process.env.X_URL);
export const PUBLIC_SAME_AS = [PUBLIC_LINKEDIN_URL, PUBLIC_X_URL].filter(Boolean);

export const DEFAULT_TITLE = "MetrixIQ — Fleet & Driver Performance Software";

export const DEFAULT_DESCRIPTION =
  "Fleet and driver performance software for delivery operations. Monitor scorecards, compliance, coaching and operational trends in one workspace.";

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
  alternateName: "MetrixIQ Fleet Performance Intelligence",
  url: SITE_URL,
  logo: `${SITE_URL}/metrixiq-logo.svg`,
  image: `${SITE_URL}/opengraph-image`,
  telephone: CONTACT_PHONE_E164,
  ...(PUBLIC_CONTACT_EMAIL ? { email: PUBLIC_CONTACT_EMAIL } : {}),
  ...(PUBLIC_SAME_AS.length ? { sameAs: PUBLIC_SAME_AS } : {}),
  contactPoint: [
    {
      "@type": "ContactPoint",
      telephone: CONTACT_PHONE_E164,
      ...(PUBLIC_CONTACT_EMAIL ? { email: PUBLIC_CONTACT_EMAIL } : {}),
      contactType: "sales",
      areaServed: "GB",
      availableLanguage: ["en"],
    },
    {
      "@type": "ContactPoint",
      telephone: CONTACT_PHONE_E164,
      ...(PUBLIC_CONTACT_EMAIL ? { email: PUBLIC_CONTACT_EMAIL } : {}),
      contactType: "customer support",
      areaServed: "GB",
      availableLanguage: ["en"],
    },
  ],
  description: DEFAULT_DESCRIPTION,
  disambiguatingDescription:
    "UK-focused fleet and driver performance software for delivery operations, driver scorecards, compliance monitoring, coaching and operational analytics.",
  areaServed: {
    "@type": "Country",
    name: "United Kingdom",
  },
  knowsAbout: [
    "Fleet performance management",
    "Driver performance scorecards",
    "Fleet compliance monitoring",
    "Driver coaching",
    "Delivery operations analytics",
  ],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  alternateName: "MetrixIQ Fleet & Driver Performance Software",
  inLanguage: "en-GB",
  publisher: { "@id": `${SITE_URL}/#organization` },
};

export const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#software`,
  name: SITE_NAME,
  alternateName: "MetrixIQ Fleet & Driver Performance Software",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Fleet performance management software",
  operatingSystem: "Web",
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  brand: {
    "@type": "Brand",
    name: SITE_NAME,
  },
  inLanguage: "en-GB",
  areaServed: {
    "@type": "Country",
    name: "United Kingdom",
  },
  audience: {
    "@type": "BusinessAudience",
    audienceType: "Delivery operators, fleet managers and site managers",
  },
  featureList: [
    "Driver performance scorecards",
    "Fleet compliance monitoring",
    "Driver coaching workflows",
    "Multi-site performance analytics",
    "Operational report imports",
    "Executive performance reporting",
  ],
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
