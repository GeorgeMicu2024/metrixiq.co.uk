import { notFound } from "next/navigation";
import ResourceArticle from "../../../components/ResourceArticle";
import { buildPageMetadata } from "../../../lib/seo/site";
import { RESOURCE_ARTICLES } from "../../../lib/seo/resources";

export function generateStaticParams() {
  return Object.keys(RESOURCE_ARTICLES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const article = RESOURCE_ARTICLES[slug];
  if (!article) return {};

  return buildPageMetadata({
    title: article.title,
    description: article.description,
    path: article.path,
  });
}

export default async function ResourcePage({ params }) {
  const { slug } = await params;
  const article = RESOURCE_ARTICLES[slug];
  if (!article) notFound();
  return <ResourceArticle article={article} />;
}
