import Landing from "../components/Landing";
import StructuredData from "../components/StructuredData";
import { buildPageMetadata, SITE_URL } from "../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "Fleet & Driver Performance Intelligence",
  description:
    "AI-powered fleet and driver performance intelligence for delivery operations. Manage scorecards, compliance, coaching and operational reporting in one workspace.",
  path: "/",
});

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE_URL}/#faq`,
  mainEntity: [
    {
      "@type": "Question",
      name: "What is MetrixIQ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MetrixIQ is a fleet and driver performance intelligence platform for delivery operations. It brings operational reports, driver scorecards, compliance metrics, coaching workflows and management reporting into one workspace.",
      },
    },
    {
      "@type": "Question",
      name: "Who is MetrixIQ designed for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MetrixIQ is designed for delivery operators, fleet managers, site managers and operations teams that need a clearer way to monitor driver and site performance across recurring reporting periods.",
      },
    },
    {
      "@type": "Question",
      name: "Can MetrixIQ work across multiple sites?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. MetrixIQ is built around site-aware data and role-based access, allowing operational teams to review individual sites while retaining fleet-level visibility where permissions allow.",
      },
    },
    {
      "@type": "Question",
      name: "What types of performance data can be managed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MetrixIQ is designed to organise driver scorecards, safety and compliance metrics, daily operational reports, coaching evidence and other structured fleet-performance data used by delivery teams.",
      },
    },
    {
      "@type": "Question",
      name: "Does MetrixIQ replace operational source systems?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. MetrixIQ is an intelligence and management layer that helps teams organise, reconcile and interpret operational evidence while keeping source reports and original operational systems in context.",
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <StructuredData data={faqSchema} />
      <Landing />
    </>
  );
}
