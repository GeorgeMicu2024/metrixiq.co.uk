import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import StructuredData from "../../components/StructuredData";
import TrackedLink from "../../components/TrackedLink";
import { PLAN_CATALOG, formatPlanPrice } from "../../lib/config/plans";
import { buildPageMetadata, SITE_NAME, SITE_URL } from "../../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "Compare MetrixIQ fleet performance software plans for delivery operations, from free core visibility to full multi-site operational intelligence.",
  path: "/pricing",
});

const pricingSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}/pricing#webpage`,
  url: `${SITE_URL}/pricing`,
  name: `Pricing | ${SITE_NAME}`,
  description:
    "MetrixIQ pricing for fleet and driver performance software, including Free, Starter, Professional and Business plans.",
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@id": `${SITE_URL}/#software` },
  inLanguage: "en-GB",
};

const pricingFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${SITE_URL}/pricing#faq`,
  mainEntity: [
    {
      "@type": "Question",
      name: "Is there a free MetrixIQ plan?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The Free plan provides core fleet visibility for small teams at no monthly cost.",
      },
    },
    {
      "@type": "Question",
      name: "Can MetrixIQ be billed annually?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Paid plans have monthly and annual pricing options shown on this page.",
      },
    },
    {
      "@type": "Question",
      name: "Which plan includes full platform access?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Business plan includes full platform access and the broadest MetrixIQ capability.",
      },
    },
  ],
};

export default function PricingPage() {
  return (
    <>
      <StructuredData data={[pricingSchema, pricingFaqSchema]} />
      <PublicPageShell
        eyebrow="PRICING"
        title="Choose the MetrixIQ plan that fits your operation."
        intro="Start with core fleet visibility, then scale into scorecards, operational intelligence, team management and full platform access as your delivery operation grows."
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Pricing" }]}
      >
        <section>
          <h2>Simple plans for different levels of operational complexity</h2>
          <p>
            MetrixIQ pricing is structured around the depth of workflow your team needs.
            Monthly and annual prices are shown in GBP.
          </p>
          <div className="pricing-grid">
            {PLAN_CATALOG.map((plan, index) => (
              <article className={index === 2 ? "pricing-card featured" : "pricing-card"} key={plan.key}>
                <div>
                  <span>{index === 2 ? "POPULAR" : "PLAN"}</span>
                  <h3>{plan.name}</h3>
                  <p>{plan.description}</p>
                </div>
                <div className="pricing-price">
                  <strong>{formatPlanPrice(plan, "month")}</strong>
                  <small>/ month</small>
                </div>
                <div className="pricing-annual">
                  {plan.annualPence ? <span>{formatPlanPrice(plan, "year")} / year</span> : <span>No annual charge</span>}
                </div>
                <ul>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <TrackedLink
                  className="pricing-cta"
                  href="/login?mode=register"
                  eventParams={{
                    cta_label: `Choose ${plan.name}`,
                    cta_location: "pricing_page",
                    plan: plan.key,
                  }}
                >
                  {plan.monthlyPence ? `Choose ${plan.name}` : "Start free"}
                </TrackedLink>
              </article>
            ))}
          </div>
        </section>

        <section className="pricing-notes">
          <h2>Plan comparison</h2>
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Monthly</th>
                  <th>Annual</th>
                  <th>Best suited to</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_CATALOG.map((plan) => (
                  <tr key={plan.key}>
                    <th>{plan.name}</th>
                    <td>{formatPlanPrice(plan, "month")}</td>
                    <td>{plan.annualPence ? formatPlanPrice(plan, "year") : "£0"}</td>
                    <td>{plan.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="solution-faq">
          <h2>Pricing questions</h2>
          <div>
            <article>
              <h3>Can I start without paying?</h3>
              <p>Yes. The Free plan gives small teams access to core fleet visibility before moving into more advanced workflows.</p>
            </article>
            <article>
              <h3>Can I move between plans?</h3>
              <p>Plan selection is designed to scale with the operation, from core visibility through to full platform access.</p>
            </article>
            <article>
              <h3>What does annual billing cost?</h3>
              <p>Annual prices are shown directly alongside each plan so the billing commitment is clear before signup.</p>
            </article>
            <article>
              <h3>Need help choosing?</h3>
              <p><Link href="/contact">Contact MetrixIQ</Link> with your site count and current reporting workflow and we can focus on the relevant capability level.</p>
            </article>
          </div>
        </section>
      </PublicPageShell>
    </>
  );
}
