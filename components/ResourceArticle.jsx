import Link from "next/link";
import PublicPageShell from "./PublicPageShell";
import StructuredData from "./StructuredData";
import { buildArticleSchemas, RESOURCE_LIST } from "../lib/seo/resources";

export default function ResourceArticle({ article }) {
  const related = RESOURCE_LIST.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <>
      <StructuredData data={buildArticleSchemas(article)} />
      <PublicPageShell eyebrow={article.eyebrow} title={article.h1} intro={article.intro}>
        <article className="resource-article">
          <div className="resource-meta">
            <span>{article.readingTime}</span>
            <span>Updated {article.updated}</span>
          </div>

          {article.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {(section.paragraphs || []).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets?.length ? (
                <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
              ) : null}
            </section>
          ))}

          <section className="resource-product-link">
            <span>RELATED METRIXIQ SOLUTION</span>
            <h2>{article.relatedSolutionLabel}</h2>
            <p>See how the ideas in this guide connect to the product workflow inside MetrixIQ.</p>
            <Link href={article.relatedSolution}>Explore {article.relatedSolutionLabel} →</Link>
          </section>

          <section className="resource-related">
            <h2>Continue reading</h2>
            <div>
              {related.map((item) => (
                <Link href={item.path} key={item.slug}>
                  <span>{item.eyebrow}</span>
                  <b>{item.title}</b>
                  <small>{item.readingTime}</small>
                </Link>
              ))}
            </div>
          </section>
        </article>
      </PublicPageShell>
    </>
  );
}
