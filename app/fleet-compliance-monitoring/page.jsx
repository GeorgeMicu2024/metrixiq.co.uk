import SolutionLandingPage from "../../components/SolutionLandingPage";
import { buildPageMetadata } from "../../lib/seo/site";
import { SOLUTION_PAGES } from "../../lib/seo/solutionPages";

const page = SOLUTION_PAGES["fleet-compliance-monitoring"];

export const metadata = buildPageMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function Page() {
  return <SolutionLandingPage page={page} />;
}
