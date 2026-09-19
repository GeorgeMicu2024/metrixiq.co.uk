"use client";

import { SaasStyles } from "./SaasShared";

export function SuspendedWorkspaceView({ access, onLogout }) {
  return (
    <main className="saas-fullscreen">
      <section className="saas-suspended">
        <span className="saas-kicker">WORKSPACE ACCESS</span>
        <h1>Workspace suspended</h1>
        <p>
          This workspace is currently suspended. Your data has not been deleted.
          {access?.suspended_reason ? ` Reason: ${access.suspended_reason}` : ""}
        </p>
        <button className="saas-secondary" onClick={onLogout}>Sign out</button>
      </section>
      <SaasStyles />
    </main>
  );
}


