import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <section style={{ maxWidth: 560, textAlign: "center" }}>
        <p style={{ marginBottom: 8, opacity: 0.7 }}>404</p>
        <h1>Page not found</h1>
        <p>The page you requested does not exist or is no longer available.</p>
        <Link href="/">Return to MetrixIQ</Link>
      </section>
    </main>
  );
}
