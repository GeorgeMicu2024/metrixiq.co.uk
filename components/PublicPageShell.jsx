import Link from "next/link";
import Brand from "./Brand";
import CookieSettingsButton from "./CookieSettingsButton";
import PublicBreadcrumbs from "./PublicBreadcrumbs";
import TrackedLink from "./TrackedLink";
import { PUBLIC_CONTACT_EMAIL, PUBLIC_LINKEDIN_URL } from "../lib/seo/site";

export default function PublicPageShell({ eyebrow, title, intro, breadcrumbs = [], children }) {
  return (
    <main className="public-page">
      <header className="public-header">
        <Link href="/" aria-label="MetrixIQ home"><Brand /></Link>
        <nav aria-label="Public navigation">
          <Link href="/#features">Features</Link>
          <Link href="/solutions">Solutions</Link>
          <Link href="/use-cases">Use cases</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/resources">Resources</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="public-header-actions">
          <Link href="/login">Sign in</Link>
          <TrackedLink className="primary-btn small" href="/login?mode=register" eventParams={{ cta_label: "Get started", cta_location: "public_header" }}>Get started</TrackedLink>
        </div>
      </header>

      {breadcrumbs.length ? <div className="public-breadcrumb-wrap"><PublicBreadcrumbs items={breadcrumbs} /></div> : null}

      <section className="public-hero">
        <div>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
      </section>

      <section className="public-content">{children}</section>

      <footer className="public-footer">
        <div>
          <Link href="/" aria-label="MetrixIQ home"><Brand /></Link>
          <p>Fleet and driver performance intelligence for modern delivery operations.</p>
          <nav aria-label="Legal and company links">
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            {PUBLIC_CONTACT_EMAIL ? <a href={`mailto:${PUBLIC_CONTACT_EMAIL}`}>Email</a> : null}
            {PUBLIC_LINKEDIN_URL ? <a href={PUBLIC_LINKEDIN_URL} rel="me noopener noreferrer" target="_blank">LinkedIn</a> : null}
            <Link href="/resources">Resources</Link>
            <Link href="/use-cases">Use cases</Link>
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <CookieSettingsButton />
          </nav>
        </div>
      </footer>
    </main>
  );
}
