import Link from "next/link";
import PublicPageShell from "./PublicPageShell";
import StructuredData from "./StructuredData";
import { SOLUTION_PAGES, buildSolutionSchemas } from "../lib/seo/solutionPages";

export default function SolutionLandingPage({ page }) {
  return (
    <>
      <StructuredData data={buildSolutionSchemas(page)} />
      <PublicPageShell
        eyebrow={page.eyebrow}
        title={page.h1}
        intro={page.intro}
      >
        <section>
          <h2>{page.problemTitle}</h2>
          {page.problem.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>

        <section>
          <h2>What MetrixIQ brings together</h2>
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
          <h2>How the workflow fits together</h2>
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
          <h2>{page.outcomesTitle}</h2>
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
          <h2>See how MetrixIQ fits your operation</h2>
          <p>
            Start with the operational reports and workflows your team already uses, then bring the performance, compliance and management context into one structured workspace.
          </p>
          <div className="public-actions">
            <Link className="primary" href="/login?mode=register">Get started</Link>
            <Link href="/contact">Contact MetrixIQ</Link>
          </div>
        </section>

        <section className="solution-related">
          <h2>Related MetrixIQ solutions</h2>
          <div>
            {page.related.map((slug) => {
              const related = SOLUTION_PAGES[slug];
              return (
                <Link key={slug} href={related.path}>
                  <span>{related.eyebrow}</span>
                  <b>{related.title}</b>
                  <small>Explore solution →</small>
                </Link>
              );
            })}
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
