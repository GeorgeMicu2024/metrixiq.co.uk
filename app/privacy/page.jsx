import PublicPageShell from "../../components/PublicPageShell";
import { buildPageMetadata } from "../../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "Privacy Policy",
  description: "Read the MetrixIQ privacy policy covering account information, workspace data, operational uploads and website usage.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="PRIVACY"
      title="Privacy Policy"
      intro="This policy explains the main categories of information MetrixIQ may process when you visit the website or use the platform."
    >
      <section>
        <p><b>Last updated:</b> 28 September 2026</p>
        <h2>Information we process</h2>
        <p>
          Depending on how you use MetrixIQ, information may include account details, workspace membership, operational files you upload, driver and site performance data, product usage events and technical information needed to operate and secure the service.
        </p>
      </section>

      <section>
        <h2>Why we process information</h2>
        <ul>
          <li>To provide, maintain and secure the MetrixIQ service.</li>
          <li>To authenticate users and apply workspace, role and site permissions.</li>
          <li>To process operational reports and generate the views or analysis requested by users.</li>
          <li>To diagnose product issues, prevent misuse and improve reliability.</li>
          <li>To respond to account, product or support enquiries.</li>
        </ul>
      </section>

      <section>
        <h2>Workspace and uploaded data</h2>
        <p>
          Customers are responsible for ensuring they have an appropriate basis for uploading operational or personnel-related data to MetrixIQ. Workspace data is used to provide the product functionality requested by authorised users and is not intended to be published on the public website.
        </p>
      </section>

      <section>
        <h2>Service providers and retention</h2>
        <p>
          MetrixIQ may rely on infrastructure, authentication, payment or other technical service providers to operate the platform. Information is retained for as long as reasonably necessary to provide the service, meet security and operational requirements, or satisfy applicable legal obligations.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can use the contact page for privacy-related questions or account requests. Some information may need to be retained where required for security, fraud prevention, contractual records or legal obligations.
        </p>
      </section>
    </PublicPageShell>
  );
}
