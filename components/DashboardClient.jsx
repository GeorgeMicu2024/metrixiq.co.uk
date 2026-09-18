"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import {BillingProView, PlanOnboardingView, PlatformAdminView, SuspendedWorkspaceView, TeamManagementView } from "./SaasFoundation";
import { canAccessNav } from "../lib/permissions/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { aggregateFleetHistory } from "./HistoricalAnalytics";
import CdfView from "./customer-feedback/CdfView";
import DataQualityView from "./data-quality/DataQualityView";
import { DriverScorecardsView, SiteScorecardsView } from "./scorecards/ScorecardViews";
import PerformanceView from "./performance/PerformanceView";
import DriverDirectoryView from "./drivers/DriverDirectoryView";
import IadcView from "./operations/IadcView";
import MentorView from "./operations/MentorView";
import ConcessionsView from "./operations/ConcessionsView";
import CoachingAlertsView from "./coaching/CoachingAlertsView";
import { NAV_ICONS as icon, NAV_ITEMS as nav, navSection } from "./dashboard/navigation";
import { avg, initials } from "./dashboard/utils";
import { loadWorkspaceContext } from "../lib/data/workspace";
import { fetchDriverHistory } from "../lib/data/driverMetrics";
import { mapScorecardRow } from "../lib/data/scorecards";
import { persistWorkspaceImport } from "../lib/data/importWorkflow";
import { DashboardView, DriverScorecardView, IntelligenceView, ReportsView, SettingsView } from "./dashboard/DashboardViews";
import SmartImportView from "./imports/SmartImportView";

export default function DashboardClient() {
  const router = useRouter();
  const [active, setActive] = useState("dashboard");
  const [previousActive, setPreviousActive] = useState("drivers");
  const [session, setSession] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [dbDrivers, setDbDrivers] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [driverHistory, setDriverHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [metricHistoryRows, setMetricHistoryRows] = useState([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    async function initialise() {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }

        const context = await loadWorkspaceContext(supabase, userData.user);
        if (!alive) return;

        const { resolved, profile, platformAdmin: adminFlag, access: accessState, scorecards, metricRows } = context;

        setPlatformAdmin(adminFlag);
        setAccess(accessState);
        setWorkspace(resolved);
        setSession({
          name: profile?.full_name || userData.user.user_metadata?.full_name || userData.user.email?.split("@")[0] || "MetrixIQ User",
          email: profile?.email || userData.user.email || "",
          organisation: resolved.organization.name,
          role: resolved.role,
        });
        setDbDrivers(scorecards.map(mapScorecardRow));
        setMetricHistoryRows(metricRows);
      } catch (e) {
        if (alive) setLoadError(e?.message || "Could not load the workspace.");
      } finally {
        if (alive) setAuthLoading(false);
      }
    }
    initialise();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") router.replace("/login"); });
    return () => { alive = false; authListener.subscription.unsubscribe(); };
  }, [router]);

  const sites = [...new Set(dbDrivers.map((d) => String(d.site || "").trim().toUpperCase()).filter((site) => /^[A-Z]{2,5}\d{1,3}$/.test(site)))].sort();
  const drivers = siteFilter === "all" ? dbDrivers : dbDrivers.filter((d) => d.site === siteFilter);
  const visibleMetricHistoryRows = useMemo(
    () => siteFilter === "all"
      ? metricHistoryRows
      : metricHistoryRows.filter((row) => String(row?.drivers?.site || "").trim().toUpperCase() === siteFilter),
    [metricHistoryRows, siteFilter]
  );
  const visibleFleetHistory = useMemo(
    () => aggregateFleetHistory(visibleMetricHistoryRows),
    [visibleMetricHistoryRows]
  );
  const liveKpis = dbDrivers.length ? {
    dcr: avg(drivers, "dcr"), pod: avg(drivers, "pod"), iadc: avg(drivers, "iadc"), cc: avg(drivers, "cc"),
    fico: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), ementor: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), mentor: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), psb: avg(drivers, "psb"), reattempts: avg(drivers, "reattempts"),
    concessions: avg(drivers, "concessions"), lor: avg(drivers, "lor"), data_confidence: avg(drivers, "dataConfidence"),
  } : {};
  const kpis = { ...liveKpis };

  async function imported(result, files) {
    const organizationId = workspace?.organization?.id;
    if (!organizationId) throw new Error("Workspace is not ready yet.");

    const { saved, scorecards, metricRows } = await persistWorkspaceImport({
      supabase: getSupabaseBrowserClient(),
      organizationId,
      analysis: result,
      files,
    });

    setAnalysis(result);
    setDbDrivers(scorecards.map(mapScorecardRow));
    setMetricHistoryRows(metricRows);
    return saved;
  }
  async function logout() { try { await getSupabaseBrowserClient().auth.signOut(); } finally { localStorage.removeItem("metrixiq.analysis"); router.replace("/login"); } }
  async function openDriver(driver) {
    setPreviousActive(active === "driver-profile" ? "drivers" : active);
    setSelectedDriver(driver);
    setDriverHistory([]);
    setActive("driver-profile");
    if (!driver.dbId || !workspace?.organization?.id) return;
    setHistoryLoading(true);
    try {
      const history = await fetchDriverHistory(
        getSupabaseBrowserClient(),
        workspace.organization.id,
        driver.dbId
      );
      setDriverHistory(history);
    } finally {
      setHistoryLoading(false);
    }
  }
  function backFromDriver() { setSelectedDriver(null); setDriverHistory([]); setActive(previousActive || "drivers"); }

  let view;
  switch (active) {
    case "site-scorecards": view = <SiteScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} siteFilter={siteFilter} />; break;
    case "driver-scorecards": view = <DriverScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} siteFilter={siteFilter} />; break;
    case "drivers": view = <DriverDirectoryView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    case "performance": view = <PerformanceView kpis={kpis} history={visibleFleetHistory} rows={visibleMetricHistoryRows} onOpenDriver={openDriver} />; break;
    case "iadc": view = <IadcView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} siteFilter={siteFilter} />; break;
    case "cdf": view = <CdfView organizationId={workspace?.organization?.id} onImport={() => setActive("imports")} siteFilter={siteFilter} />; break;
    case "mentor": view = <MentorView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} siteFilter={siteFilter} />; break;
    case "concessions": view = <ConcessionsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} siteFilter={siteFilter} />; break;
    case "coaching": view = <CoachingAlertsView organizationId={workspace?.organization?.id} siteFilter={siteFilter} onOpenDriver={openDriver} canManage={platformAdmin || ["owner","admin","manager","dispatcher"].includes(session?.role)} />; break;
    case "intelligence": view = <IntelligenceView drivers={drivers} onCoaching={() => setActive("coaching")} />; break;
    case "imports": view = <SmartImportView onImported={imported} analysis={analysis} />; break;
    case "data-quality": view = <DataQualityView organizationId={workspace?.organization?.id} onImport={() => setActive("imports")} />; break;
    case "reports": view = <ReportsView />; break;
    case "billing": view = <BillingProView access={access} organizationId={workspace?.organization?.id} platformAdmin={platformAdmin} onAccessChanged={setAccess} />; break;
    case "team": view = <TeamManagementView organizationId={workspace?.organization?.id} workspaceRole={session?.role} platformAdmin={platformAdmin} />; break;
    case "settings": view = <SettingsView session={session || {}} onLogout={logout} />; break;
    case "admin": view = platformAdmin ? <PlatformAdminView /> : <SettingsView session={session || {}} onLogout={logout} />; break;
    case "driver-profile": view = selectedDriver ? <DriverScorecardView driver={selectedDriver} history={driverHistory} historyLoading={historyLoading} onBack={backFromDriver} /> : <DriverDirectoryView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    default: view = <DashboardView drivers={drivers} kpis={kpis} history={visibleFleetHistory} onImport={() => setActive("imports")} onOpenDriver={openDriver} onDrivers={() => setActive("drivers")} onPerformance={() => setActive("performance")} onCoaching={() => setActive("coaching")} />;
  }

  if (authLoading) return <main className="app-loading"><div className="auth-spinner" /><h1>MetrixIQ</h1><p>Loading secure workspace…</p></main>;
  if (loadError) return <main className="app-loading"><h1>Workspace unavailable</h1><p>{loadError}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button><button className="btn ghost" onClick={logout}>Sign out</button></main>;
  if (!session) return null;
  if (!platformAdmin && access?.suspended) return <SuspendedWorkspaceView access={access} onLogout={logout} />;
  if (!platformAdmin && access && !access.onboarding_completed) return <PlanOnboardingView organizationId={workspace?.organization?.id} organizationName={workspace?.organization?.name} onComplete={setAccess} onLogout={logout} />;

  return <div className="app-shell"><aside className={mobile ? "sidebar open" : "sidebar"}><div className="sidebar-brand"><Brand inverse /><button className="mobile-close" onClick={() => setMobile(false)}>×</button></div><div className="workspace-chip"><span>{initials(session.organisation)}</span><div><b>{session.organisation || "My Fleet"}</b><small>{platformAdmin ? "Platform Owner" : access?.subscription_status === "trialing" ? "Full trial" : `${String(access?.effective_plan || "free").toUpperCase()} plan`}</small></div></div><nav className="app-nav">{nav.filter(([id]) => canAccessNav(id, access, platformAdmin, session?.role)).map(([id, label], i) => <div key={id}>{navSection(i) && <small className="nav-section">{navSection(i)}</small>}<button onClick={() => { setActive(id); setSelectedDriver(null); setMobile(false); }} className={active === id ? "active" : ""}><span>{icon[id]}</span>{label}{id === "intelligence" && <em>AI</em>}</button></div>)}</nav><div className="sidebar-user"><span>{initials(session.name)}</span><div><b>{session.name}</b><small>{session.email}</small></div><button onClick={logout}>↪</button></div></aside>{mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Close navigation" />}<div className="app-body"><header className="topbar"><div className="topbar-left"><button className="menu-btn" onClick={() => setMobile(true)}>☰</button><div className="search-box">⌕ <input aria-label="Search drivers" placeholder="Search drivers by name or TRID…" value={globalSearch} onChange={(e)=>{setGlobalSearch(e.target.value); if(e.target.value) setActive("drivers");}} /><kbd>Ctrl K</kbd></div></div><div className="topbar-right"><select className="site-select" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label="Filter workspace by site"><option value="all">All sites</option>{sites.map((site) => <option key={site} value={site}>{site}</option>)}</select><span className="top-avatar">{initials(session.name)}</span></div></header><main className="app-main">{view}</main></div></div>;
}
