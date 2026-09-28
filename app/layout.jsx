import "./marketing-base.css";
import "./public-pages.css";
import StructuredData from "../components/StructuredData";
import GoogleAnalytics from "../components/GoogleAnalytics";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_NAME,
  SITE_URL,
  organizationSchema,
  softwareSchema,
  websiteSchema,
} from "../lib/seo/site";

const googleSiteVerification =
  process.env.GOOGLE_SITE_VERIFICATION || process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "";


const PWA_BOOTSTRAP_SCRIPT = `
(() => {
  const captureInstall = (event) => {
    event.preventDefault();
    window.__metrixiqInstallPrompt = event;
    window.dispatchEvent(new CustomEvent("metrixiq:pwa-install-available"));
  };

  const installed = () => {
    window.__metrixiqInstallPrompt = null;
    window.dispatchEvent(new CustomEvent("metrixiq:pwa-installed"));
  };

  window.addEventListener("beforeinstallprompt", captureInstall);
  window.addEventListener("appinstalled", installed);

  const registerServiceWorker = () => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  };

  const deferServiceWorker = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(registerServiceWorker, { timeout: 2500 });
    } else {
      window.setTimeout(registerServiceWorker, 1800);
    }
  };

  if (document.readyState === "complete") {
    deferServiceWorker();
  } else {
    window.addEventListener("load", deferServiceWorker, { once: true });
  }

  const standalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true;
  document.documentElement.dataset.pwa = standalone ? "standalone" : "browser";
})();
`;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | MetrixIQ",
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: {
    canonical: "/",
    languages: { "en-GB": "/" },
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    locale: "en_GB",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
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
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  ...(googleSiteVerification
    ? { verification: { google: googleSiteVerification } }
    : {}),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1f33",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <body>
        <StructuredData data={[organizationSchema, websiteSchema, softwareSchema]} />
        <script id="metrixiq-pwa-bootstrap" dangerouslySetInnerHTML={{ __html: PWA_BOOTSTRAP_SCRIPT }} />
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
