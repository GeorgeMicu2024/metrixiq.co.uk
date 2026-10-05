import "./public-pages.css";
import Link from "next/link";
import Brand from "../components/Brand";

export const metadata = {
  title: "Page not found",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function NotFound() {
  return (
    <main className="seo-not-found">
      <header className="public-header">
        <Link href="/" aria-label="MetrixIQ home"><Brand /></Link>
      </header>
      <section className="seo-not-found-inner">
        <span className="seo-not-found-code">404</span>
        <h1>Page not found</h1>
        <p>
          The page you requested does not exist or has moved. Use one of the links below
          to continue through the public MetrixIQ site.
        </p>
        <div className="seo-not-found-actions">
          <Link className="primary" href="/">Return home</Link>
          <Link href="/solutions">Explore solutions</Link>
          <Link href="/resources">Browse resources</Link>
        </div>
      </section>
    </main>
  );
}
