import PublicPageShell from "../../components/PublicPageShell";
import { buildPageMetadata } from "../../lib/seo/site";

export const metadata = buildPageMetadata({
  title: "Security",
  description: "Learn about the security principles used to protect MetrixIQ workspaces, roles, operational data and platform access.",
  path: "/security",
});

export default function SecurityPage() {
  return (
    <PublicPageShell
      eyebrow="SECURITY"
      title="Security controls designed for operational data and multi-site teams."
      intro="MetrixIQ is built around scoped access, controlled data operations and clear separation between public product pages and authenticated workspace data."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Security" }]}
    >
      <section>
        <h2>Access control</h2>
        <p>
          Workspace access is role-based and site-aware. Product areas can be restricted by role, permission and site scope so users see the operational data that is relevant to their responsibilities.
        </p>
      </section>

      <section>
        <h2>Data protection principles</h2>
        <div className="public-grid">
          <article className="public-card">
            <h3>Authenticated workspaces</h3>
            <p>Operational views and API routes are separated from public marketing content and require authenticated access where appropriate.</p>
          </article>
          <article className="public-card">
            <h3>Database access policies</h3>
            <p>Workspace data uses database-level access controls and row-level policies to reduce cross-workspace exposure.</p>
          </article>
          <article className="public-card">
            <h3>Auditable actions</h3>
            <p>Administrative and operational workflows are designed to preserve important action history instead of relying only on transient UI state.</p>
          </article>
          <article className="public-card">
            <h3>Controlled integrations</h3>
            <p>Integration credentials and machine-facing access are handled separately from normal end-user workspace data.</p>
          </article>
        </div>
      </section>

      <section>
        <h2>Responsible disclosure</h2>
        <p>
          If you believe you have found a security issue, use the contact page and include enough technical detail to reproduce the problem safely. Do not include customer data or other sensitive information in an initial report.
        </p>
      </section>
    </PublicPageShell>
  );
}
