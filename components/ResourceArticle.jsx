import Link from "next/link";
import PublicPageShell from "./PublicPageShell";
import TrackedLink from "./TrackedLink";
import StructuredData from "./StructuredData";
import { buildArticleSchemas, RESOURCE_LIST } from "../lib/seo/resources";

export default function ResourceArticle({ article }) {
  const related = RESOURCE_LIST.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <>
      <StructuredData data={buildArticleSchemas(article)} />
      <PublicPageShell
        eyebrow={article.eyebrow}
        title={article.h1}
        intro={article.intro}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Resources", href: "/resources" },
          { label: article.title },
        ]}
      >
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
            <TrackedLink href={article.relatedSolution} eventParams={{ cta_label: "Explore related solution", cta_location: "resource_article", resource: article.path }}>Explore {article.relatedSolutionLabel} →</TrackedLink>
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
