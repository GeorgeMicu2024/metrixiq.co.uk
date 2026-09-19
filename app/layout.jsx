import "./globals.css";
import "./scorecard.css";
import "./scorecards-v22.css";
import "./mentor.css";
import "./governance-v2.css";
import "./manager-intelligence-v3.css";
import "./operations-intelligence-v4.css";
import "./intelligence-reporting-v5.css";
import "./platform-mobile-v6.css";
import "./enterprise-portfolio-v7.css";
import PwaBootstrap from "../components/pwa/PwaBootstrap";

export const metadata = {
  metadataBase: new URL("https://www.metrixiq.co.uk"),
  title: {
    default: "MetrixIQ — Fleet & Driver Intelligence",
    template: "%s | MetrixIQ",
  },
  description: "Fleet and driver performance intelligence for modern delivery operations.",
  applicationName: "MetrixIQ",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "MetrixIQ",
    title: "MetrixIQ — Fleet & Driver Intelligence",
    description: "Fleet and driver performance intelligence for modern delivery operations.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MetrixIQ — Fleet & Driver Intelligence",
    description: "Fleet and driver performance intelligence for modern delivery operations.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MetrixIQ",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1f33",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><PwaBootstrap />{children}</body>
    </html>
  );
}
