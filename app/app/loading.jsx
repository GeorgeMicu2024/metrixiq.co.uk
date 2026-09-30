export default function AppLoading() {
  return (
    <main className="app-boot-screen" aria-busy="true" aria-live="polite">
      <div className="app-boot-card">
        <div className="app-boot-wordmark"><b>METRIX</b><span>IQ</span></div>
        <div className="app-boot-spinner" aria-hidden="true"><span /><span /><span /></div>
        <h1>Opening your workspace</h1>
        <p>Preparing MetrixIQ…</p>
        <div className="app-boot-progress"><i /></div>
      </div>
    </main>
  );
}
