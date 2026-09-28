import { notFound } from "next/navigation";
import UseCaseLandingPage from "../../../components/UseCaseLandingPage";
import { buildPageMetadata } from "../../../lib/seo/site";
import { USE_CASES } from "../../../lib/seo/useCasePages";

export function generateStaticParams() {
  return Object.keys(USE_CASES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = USE_CASES[slug];
  if (!page) return {};

  return buildPageMetadata({
    title: page.title,
    description: page.description,
    path: page.path,
  });
}

export default async function UseCasePage({ params }) {
  const { slug } = await params;
  const page = USE_CASES[slug];
  if (!page) notFound();
  return <UseCaseLandingPage page={page} />;
}
