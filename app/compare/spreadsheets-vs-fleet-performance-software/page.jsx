import Link from "next/link";
import PublicPageShell from "../../../components/PublicPageShell";
import TrackedLink from "../../../components/TrackedLink";
import StructuredData from "../../../components/StructuredData";
import { buildPageMetadata } from "../../../lib/seo/site";
import { COMPARISON_PAGE, buildComparisonSchemas } from "../../../lib/seo/useCasePages";

export const metadata = buildPageMetadata({
  title: COMPARISON_PAGE.title,
  description: COMPARISON_PAGE.description,
  path: COMPARISON_PAGE.path,
});

export default function ComparisonPage() {
  return (
    <>
      <StructuredData data={buildComparisonSchemas()} />
      <PublicPageShell
        eyebrow={COMPARISON_PAGE.eyebrow}
        title={COMPARISON_PAGE.h1}
        intro={COMPARISON_PAGE.intro}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Use cases", href: "/use-cases" },
          { label: COMPARISON_PAGE.title },
        ]}
      >
        <section>
          <h2>Workflow comparison</h2>
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Spreadsheet workflow</th>
                  <th>Fleet performance software</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_PAGE.rows.map(([area, spreadsheet, software]) => (
                  <tr key={area}>
                    <th>{area}</th>
                    <td>{spreadsheet}</td>
                    <td>{software}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="comparison-columns">
          <article>
            <h2>When spreadsheets can still work well</h2>
            <ul>{COMPARISON_PAGE.whenSpreadsheetWorks.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          <article>
            <h2>When dedicated software starts to help</h2>
            <ul>{COMPARISON_PAGE.whenSoftwareHelps.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        </section>

        <section className="solution-faq">
          <h2>Frequently asked questions</h2>
          <div>
            {COMPARISON_PAGE.faqs.map(([question, answer]) => (
              <article key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-callout">
          <h2>Keep the flexibility of source files without rebuilding the management layer every week</h2>
          <p>
            MetrixIQ can ingest structured operational files while keeping driver identity, site scope,
            history, compliance and coaching context in a repeatable workspace.
          </p>
          <div className="public-actions">
            <TrackedLink className="primary" href="/fleet-performance-management" eventParams={{ cta_label: "Explore Fleet Performance Management", cta_location: "comparison_page" }}>Explore Fleet Performance Management</TrackedLink>
            <TrackedLink href="/login?mode=register" eventParams={{ cta_label: "Get started", cta_location: "comparison_page" }}>Get started</TrackedLink>
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
