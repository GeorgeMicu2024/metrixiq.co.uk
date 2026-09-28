import Link from "next/link";
import PublicPageShell from "../../components/PublicPageShell";
import StructuredData from "../../components/StructuredData";
import TrackedPhoneLink from "../../components/TrackedPhoneLink";
import { buildPageMetadata, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_E164, PUBLIC_CONTACT_EMAIL, PUBLIC_LINKEDIN_URL, organizationSchema, SITE_URL } from "../../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "Contact MetrixIQ",
  description: "Contact MetrixIQ about fleet and driver performance software, scorecards, compliance monitoring, coaching or product access.",
  path: "/contact",
});

const contactPageSchema = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  "@id": `${SITE_URL}/contact#webpage`,
  url: `${SITE_URL}/contact`,
  name: "Contact MetrixIQ",
  mainEntity: { "@id": organizationSchema["@id"] },
  isPartOf: { "@id": `${SITE_URL}/#website` },
  inLanguage: "en-GB",
};

export default function ContactPage() {
  return (
    <>
      <StructuredData data={contactPageSchema} />
    <PublicPageShell
      eyebrow="CONTACT"
      title="Talk to us about your delivery operation."
      intro="Whether you are evaluating MetrixIQ, planning a rollout or already using the platform, choose the route below that best fits what you need."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Contact" }]}
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
            <b>Call MetrixIQ</b>
            <span>Product, rollout or account enquiries.</span>
          </div>
          <TrackedPhoneLink phoneE164={CONTACT_PHONE_E164} display={CONTACT_PHONE_DISPLAY} location="contact_page">{CONTACT_PHONE_DISPLAY} →</TrackedPhoneLink>
        </div>
        {PUBLIC_LINKEDIN_URL ? (
          <div className="public-contact-option">
            <div>
              <b>LinkedIn</b>
              <span>Follow the official MetrixIQ company profile.</span>
            </div>
            <a href={PUBLIC_LINKEDIN_URL} rel="me noopener noreferrer" target="_blank">View LinkedIn →</a>
          </div>
        ) : null}
        <div className="public-contact-option">
          <div>
            <b>General enquiry</b>
            <span>Questions about features, rollout or operational use cases.</span>
          </div>
          {PUBLIC_CONTACT_EMAIL ? (
            <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`}>Email us →</a>
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
    </>
  );
}
