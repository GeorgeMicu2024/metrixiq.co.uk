import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import { buildPageMetadata } from "../../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "Contact",
  description: "Contact MetrixIQ about fleet performance intelligence, driver scorecards, compliance monitoring or product access.",
  path: "/contact",
});

export default function ContactPage() {
  const contactEmail =
    process.env.CONTACT_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

  return (
    <PublicPageShell
      eyebrow="CONTACT"
      title="Talk to us about your delivery operation."
      intro="Whether you are evaluating MetrixIQ, planning a rollout or already using the platform, choose the route below that best fits what you need."
    >
      <section>
        <h2>How can we help?</h2>
        <div className="public-contact-option">
          <div>
            <b>Product access and evaluation</b>
            <span>Create an account and explore the MetrixIQ workspace.</span>
          </div>
          <Link href="/login?mode=register">Get started →</Link>
        </div>
        <div className="public-contact-option">
          <div>
            <b>Existing customer</b>
            <span>Sign in to your workspace to continue with your current account.</span>
          </div>
          <Link href="/login">Sign in →</Link>
        </div>
        <div className="public-contact-option">
          <div>
            <b>General enquiry</b>
            <span>Questions about features, rollout or operational use cases.</span>
          </div>
          {contactEmail ? (
            <a href={`mailto:${contactEmail}`}>Email us →</a>
          ) : (
            <Link href="/login?mode=register">Start here →</Link>
          )}
        </div>
      </section>

      <section className="public-callout">
        <h2>What to include in an enquiry</h2>
        <p>
          Tell us the number of sites you manage, the reporting sources you currently use and the performance or compliance workflows you want to improve. That gives us enough context to focus the conversation on the parts of MetrixIQ that are relevant to your operation.
        </p>
      </section>
    </PublicPageShell>
  );
}
