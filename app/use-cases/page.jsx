import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import StructuredData from "../../components/StructuredData";
import { buildPageMetadata, SITE_URL } from "../../lib/seo/site";
import { USE_CASE_LIST } from "../../lib/seo/useCasePages";

export const metadata = buildPageMetadata({
  title: "Use Cases",
  description:
    "Explore MetrixIQ use cases for multi-site delivery performance, fleet dashboards, driver safety analytics, compliance dashboards and management reporting.",
  path: "/use-cases",
});

const useCaseListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "@id": `${SITE_URL}/use-cases#use-cases`,
  name: "MetrixIQ delivery operations use cases",
  itemListElement: USE_CASE_LIST.map((page, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: page.title,
    url: `${SITE_URL}${page.path}`,
  })),
};

export default function UseCasesPage() {
  return (
    <>
      <StructuredData data={useCaseListSchema} />
      <PublicPageShell
        eyebrow="USE CASES"
        title="Operational workflows MetrixIQ helps delivery teams manage."
        intro="Explore practical use cases across performance dashboards, multi-site management, driver safety, compliance and recurring management reporting."
      >
        <section>
          <h2>Choose an operational use case</h2>
          <div className="use-case-hub-grid">
            {USE_CASE_LIST.map((page) => (
              <Link href={page.path} key={page.slug}>
                <span>{page.eyebrow}</span>
                <h3>{page.title}</h3>
                <p>{page.description}</p>
                <b>Explore use case →</b>
              </Link>
            ))}
          </div>
        </section>

        <section className="public-callout">
          <h2>Compare the reporting approach</h2>
          <p>
            If your operation still relies heavily on recurring spreadsheet consolidation,
            compare that workflow with a dedicated performance-management layer.
          </p>
          <div className="public-actions">
            <Link className="primary" href="/compare/spreadsheets-vs-fleet-performance-software">Spreadsheets vs fleet software</Link>
            <Link href="/solutions">Explore product solutions</Link>
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
