import Link from "next/link";
import Brand from "./Brand";

export default function PublicPageShell({ eyebrow, title, intro, children }) {
  return (
    <main className="public-page">
      <header className="public-header">
        <Link href="/" aria-label="MetrixIQ home"><Brand /></Link>
        <nav aria-label="Public navigation">
          <Link href="/#features">Features</Link>
          <Link href="/solutions">Solutions</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="public-header-actions">
          <Link href="/login">Sign in</Link>
          <Link className="primary-btn small" href="/login?mode=register">Get started</Link>
        </div>
      </header>

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
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
