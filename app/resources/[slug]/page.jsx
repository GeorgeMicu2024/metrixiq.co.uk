import { notFound } from "next/navigation";
import ResourceArticle from "../../../components/ResourceArticle";
import { buildPageMetadata } from "../../../lib/seo/site";
import { RESOURCE_ARTICLES } from "../../../lib/seo/resources";

export function generateStaticParams() {
  return Object.keys(RESOURCE_ARTICLES).map((slug) => ({ slug }));
}

export function generateMetadata({ params }) {
  const article = RESOURCE_ARTICLES[params.slug];
  if (!article) return {};

  return buildPageMetadata({
    title: article.title,
    description: article.description,
    path: article.path,
  });
}

export default function ResourcePage({ params }) {
  const article = RESOURCE_ARTICLES[params.slug];
  if (!article) notFound();
  return <ResourceArticle article={article} />;
}
