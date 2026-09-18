"use client";

export default function Error({ reset }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
      <section style={{ maxWidth: 560, textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>MetrixIQ could not complete this request. You can retry without leaving the application.</p>
        <button type="button" onClick={() => reset()}>Try again</button>
      </section>
    </main>
  );
}
