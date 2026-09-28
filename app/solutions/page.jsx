import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import TrackedLink from "../../components/TrackedLink";
import StructuredData from "../../components/StructuredData";
import { buildPageMetadata, SITE_URL } from "../../lib/seo/site";
import { SOLUTION_PAGE_LIST } from "../../lib/seo/solutionPages";

export const metadata = buildPageMetadata({
  title: "Fleet & Driver Performance Software Solutions",
  description:
    "Explore MetrixIQ software solutions for driver scorecards, fleet compliance, coaching, delivery operations, analytics and performance management.",
  path: "/solutions",
});

const itemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "@id": `${SITE_URL}/solutions#solutions`,
  name: "MetrixIQ solutions",
  itemListElement: SOLUTION_PAGE_LIST.map((page, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: page.title,
    url: `${SITE_URL}${page.path}`,
  })),
};

export default function SolutionsPage() {
  return (
    <>
      <StructuredData data={itemListSchema} />
      <PublicPageShell
        eyebrow="SOLUTIONS"
        title="Operational intelligence for the performance workflows delivery teams manage every week."
        intro="Explore MetrixIQ by workflow: driver scorecards, compliance, coaching, fleet analytics, delivery operations and performance management."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Solutions" }]}
      >
        <section>
          <h2>Choose the workflow you want to improve</h2>
          <p>
            Each MetrixIQ solution is part of the same operational workspace. Teams can start with the problem that matters most today and keep the driver, site and reporting context connected as the platform grows with the operation.
          </p>
          <p>
            MetrixIQ solutions are designed around recurring delivery-management workflows rather than isolated dashboards. The same driver, site and reporting context can move from scorecard review into compliance, coaching, analytics and management reporting without rebuilding the data each time.
          </p>
          <div className="solution-hub-grid">
            {SOLUTION_PAGE_LIST.map((page) => (
              <Link href={page.path} key={page.path}>
                <span>{page.eyebrow}</span>
                <h3>{page.title}</h3>
                <p>{page.description}</p>
                <b>Explore solution →</b>
              </Link>
            ))}
          </div>
        </section>

        <section className="public-callout">
          <h2>Not sure where to start?</h2>
          <p>
            Start with the operational reports your managers already review. MetrixIQ can organise those recurring inputs into driver, site and fleet views, then connect the results to coaching, compliance and management reporting.
          </p>
          <div className="public-actions">
            <TrackedLink className="primary" href="/login?mode=register" eventParams={{ cta_label: "Get started", cta_location: "solutions_hub" }}>Get started</TrackedLink>
            <TrackedLink href="/contact" eventParams={{ cta_label: "Contact MetrixIQ", cta_location: "solutions_hub" }}>Contact MetrixIQ</TrackedLink>
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
