"use client";

export default function GlobalError({ reset }) {
  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
          <section style={{ maxWidth: 560, textAlign: "center" }}>
            <h1>MetrixIQ encountered an unexpected error</h1>
            <p>Please retry the application. Your workspace data remains stored in the backend.</p>
            <button type="button" onClick={() => reset()}>Reload application</button>
          </section>
        </main>
      </body>
    </html>
  );
}
