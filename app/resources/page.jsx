import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import TrackedLink from "../../components/TrackedLink";
import StructuredData from "../../components/StructuredData";
import { buildPageMetadata } from "../../lib/seo/site";
import { RESOURCE_LIST, resourceHubSchema } from "../../lib/seo/resources";

export const metadata = buildPageMetadata({
  title: "Resources",
  description:
    "Practical guides for delivery operations covering driver performance scorecards, fleet KPIs, compliance monitoring, coaching and data quality.",
  path: "/resources",
});

export default function ResourcesPage() {
  return (
    <>
      <StructuredData data={resourceHubSchema()} />
      <PublicPageShell
        eyebrow="RESOURCES"
        title="Practical guides for better delivery operations."
        intro="Clear, operational guidance on driver performance, scorecards, compliance, coaching, fleet KPIs and data quality."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Resources" }]}
      >
        <section>
          <h2>Performance and operations guides</h2>
          <div className="resource-grid">
            {RESOURCE_LIST.map((article) => (
              <Link href={article.path} key={article.slug}>
                <span>{article.eyebrow}</span>
                <h3>{article.title}</h3>
                <p>{article.description}</p>
                <div><small>{article.readingTime}</small><b>Read guide →</b></div>
              </Link>
            ))}
          </div>
        </section>

        <section className="public-callout">
          <h2>Turn the guidance into a repeatable workflow</h2>
          <p>MetrixIQ connects driver performance, compliance, coaching and reporting so the same operational evidence can move from analysis into action.</p>
          <div className="public-actions">
            <TrackedLink className="primary" href="/solutions" eventParams={{ cta_label: "Explore solutions", cta_location: "resources_hub" }}>Explore solutions</TrackedLink>
            <TrackedLink href="/login?mode=register" eventParams={{ cta_label: "Get started", cta_location: "resources_hub" }}>Get started</TrackedLink>
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
