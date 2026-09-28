import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import StructuredData from "../../components/StructuredData";
import { buildPageMetadata, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_E164, organizationSchema, SITE_URL } from "../../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "About MetrixIQ Fleet Performance Software",
  description: "Learn how MetrixIQ fleet and driver performance software helps delivery operations manage scorecards, compliance, coaching and reporting.",
  path: "/about",
});

const aboutPageSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": `${SITE_URL}/about#webpage`,
  url: `${SITE_URL}/about`,
  name: "About MetrixIQ Fleet Performance Software",
  description:
    "MetrixIQ is fleet and driver performance software for delivery operations, scorecards, compliance, coaching and operational reporting.",
  mainEntity: { "@id": organizationSchema["@id"] },
  isPartOf: { "@id": `${SITE_URL}/#website` },
  inLanguage: "en-GB",
};

export default function AboutPage() {
  return (
    <>
      <StructuredData data={aboutPageSchema} />
    <PublicPageShell
      eyebrow="ABOUT METRIXIQ"
      title="Operational intelligence built around the way delivery teams actually work."
      intro="MetrixIQ is fleet and driver performance software for delivery operations. It brings scorecards, compliance, coaching and operational reporting into one structured workspace so managers can spend less time reconciling files and more time improving results."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "About" }]}
    >
      <section className="public-card official-brand-card">
        <h2>Official MetrixIQ information</h2>
        <div className="official-brand-grid">
          <div><span>Product category</span><b>Fleet & driver performance software</b></div>
          <div><span>Primary market</span><b>United Kingdom</b></div>
          <div><span>Official website</span><a href={SITE_URL}>www.metrixiq.co.uk</a></div>
          <div><span>Contact</span><a href={`tel:${CONTACT_PHONE_E164}`}>{CONTACT_PHONE_DISPLAY}</a></div>
        </div>
        <p>
          MetrixIQ is the UK-focused fleet and driver performance software platform described on this website. It is built for delivery operators, fleet managers and site managers who need clearer scorecards, compliance monitoring, coaching workflows and operational analytics.
        </p>
      </section>

      <section>
        <h2>Why MetrixIQ exists</h2>
        <p>
          Delivery operations generate large amounts of performance data across scorecards, daily reports, compliance exports and coaching workflows. The difficult part is rarely getting more data. It is connecting the right evidence to the right driver, site and reporting period, then turning that evidence into a useful management action.
        </p>
        <p>
          MetrixIQ is designed to make that process clearer. It helps operations teams import structured reports, review driver and site performance, monitor compliance metrics, identify trends and keep a consistent history of the decisions that follow.
        </p>
      </section>

      <section>
        <h2>Built for operational teams</h2>
        <div className="public-grid">
          <article className="public-card">
            <h3>Driver performance</h3>
            <p>Bring scorecards, safety metrics and operational KPIs together so managers can see performance at driver, site and fleet level.</p>
          </article>
          <article className="public-card">
            <h3>Compliance monitoring</h3>
            <p>Track operational compliance evidence across reporting periods and surface exceptions that need attention.</p>
          </article>
          <article className="public-card">
            <h3>Coaching workflows</h3>
            <p>Use performance evidence to support targeted coaching, follow-up actions and a more consistent management process.</p>
          </article>
          <article className="public-card">
            <h3>Management intelligence</h3>
            <p>Turn fragmented operational reports into site trends, executive summaries and clearer next actions.</p>
          </article>
        </div>
      </section>

      <section className="public-callout">
        <h2>One workspace, less manual reconciliation</h2>
        <p>
          MetrixIQ is focused on practical operational intelligence: reliable imports, clear driver identity, site-aware reporting, performance history and actionable management views.
        </p>
        <div className="public-actions">
          <Link className="primary" href="/login?mode=register">Get started</Link>
          <Link href="/contact">Contact MetrixIQ</Link>
        </div>
      </section>
    </PublicPageShell>
    </>
  );
}
