import Link from "next/link";
import PublicPageShell from "./PublicPageShell";
import StructuredData from "./StructuredData";
import { buildUseCaseSchemas, USE_CASE_LIST } from "../lib/seo/useCasePages";

export default function UseCaseLandingPage({ page }) {
  const related = USE_CASE_LIST.filter((item) => item.slug !== page.slug).slice(0, 3);

  return (
    <>
      <StructuredData data={buildUseCaseSchemas(page)} />
      <PublicPageShell eyebrow={page.eyebrow} title={page.h1} intro={page.intro}>
        <section>
          <h2>{page.challengeTitle}</h2>
          {page.challenge.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>

        <section>
          <h2>How MetrixIQ supports this workflow</h2>
          <div className="public-grid">
            {page.capabilities.map(([title, body]) => (
              <article className="public-card" key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2>From source report to management action</h2>
          <div className="solution-workflow">
            {page.workflow.map(([title, body], index) => (
              <article key={title}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2>Operational outcomes</h2>
          <ul className="solution-outcomes">
            {page.outcomes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section className="solution-faq">
          <h2>Frequently asked questions</h2>
          <div>
            {page.faqs.map(([question, answer]) => (
              <article key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-callout">
          <span className="use-case-related-label">RELATED METRIXIQ SOLUTION</span>
          <h2>{page.relatedSolutionLabel}</h2>
          <p>See the product workflow that supports this operational use case.</p>
          <div className="public-actions">
            <Link className="primary" href={page.relatedSolution}>Explore {page.relatedSolutionLabel}</Link>
            <Link href="/login?mode=register">Get started</Link>
          </div>
        </section>

        <section className="use-case-related">
          <h2>Related use cases</h2>
          <div>
            {related.map((item) => (
              <Link href={item.path} key={item.slug}>
                <span>{item.eyebrow}</span>
                <b>{item.title}</b>
                <small>Explore use case →</small>
              </Link>
            ))}
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
