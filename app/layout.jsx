import "./globals.css";
import "./scorecard.css";
import "./mentor.css";

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
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
