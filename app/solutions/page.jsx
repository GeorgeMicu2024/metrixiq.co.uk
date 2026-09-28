import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import StructuredData from "../../components/StructuredData";
import { buildPageMetadata, SITE_URL } from "../../lib/seo/site";
import { SOLUTION_PAGE_LIST } from "../../lib/seo/solutionPages";

export const metadata = buildPageMetadata({
  title: "Solutions",
  description:
    "Explore MetrixIQ solutions for driver performance scorecards, fleet compliance, coaching, delivery operations, fleet analytics and performance management.",
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
      >
        <section>
          <h2>Choose the workflow you want to improve</h2>
          <p>
            Each MetrixIQ solution is part of the same operational workspace. Teams can start with the problem that matters most today and keep the driver, site and reporting context connected as the platform grows with the operation.
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
            <Link className="primary" href="/login?mode=register">Get started</Link>
            <Link href="/contact">Contact MetrixIQ</Link>
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
