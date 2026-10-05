import PublicPageShell from "../../components/PublicPageShell";
import { buildPageMetadata } from "../../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description: "Read the terms governing access to and use of the MetrixIQ fleet and driver performance intelligence platform.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="TERMS"
      title="Terms of Service"
      intro="These terms set out the general conditions for access to and use of the MetrixIQ website and software service."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Terms" }]}
    >
      <section>
        <p><b>Last updated:</b> 28 September 2026</p>
        <h2>Use of the service</h2>
        <p>
          You must use MetrixIQ lawfully and only for purposes you are authorised to carry out. You are responsible for the accuracy and legitimacy of information uploaded to your workspace and for managing access granted to members of your organisation.
        </p>
      </section>

      <section>
        <h2>Accounts and access</h2>
        <p>
          Account credentials must be kept secure. Workspace owners and administrators are responsible for assigning appropriate roles, permissions and site access. Access may be restricted or suspended where necessary to protect the service, other users or platform security.
        </p>
      </section>

      <section>
        <h2>Operational data and outputs</h2>
        <p>
          MetrixIQ helps organise and analyse operational information provided by users or connected services. Customers remain responsible for validating important operational decisions and for checking source data where accuracy is critical.
        </p>
      </section>

      <section>
        <h2>Service availability</h2>
        <p>
          We work to keep MetrixIQ reliable, but uninterrupted availability cannot be guaranteed. Features may evolve as the service is improved, secured or adapted to changes in operational data sources.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          You must not attempt to bypass access controls, interfere with platform security, misuse another organisation's data, reverse engineer protected service components where prohibited by law, or use the platform for unlawful activity.
        </p>
      </section>
    </PublicPageShell>
  );
}
