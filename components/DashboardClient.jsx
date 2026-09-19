"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import { BillingProView } from "./billing/BillingProView";
import TeamAccessHub from "./team/TeamAccessHub";
import { PlatformAdminView } from "./admin/PlatformAdminView";
import { PlanOnboardingView } from "./saas/PlanOnboardingView";
import { SuspendedWorkspaceView } from "./saas/SuspendedWorkspaceView";
import { canAccessNav } from "../lib/permissions/navigation";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { aggregateFleetHistory } from "./HistoricalAnalytics";
import CdfView from "./customer-feedback/CdfView";
import DataQualityV2 from "./data-quality/DataQualityV2";
import AuditCenter from "./governance/AuditCenter";
import SavedViewsBulkActions from "./management/SavedViewsBulkActions";
import { DriverScorecardsView, SiteScorecardsView } from "./scorecards/ScorecardViews";
import PerformanceView from "./performance/PerformanceView";
import DriverDirectoryView from "./drivers/DriverDirectoryView";
import IadcView from "./operations/IadcView";
import MentorView from "./operations/MentorView";
import ConcessionsView from "./operations/ConcessionsView";
import CoachingV3 from "./coaching/CoachingV3";
import { NAV_ICONS as icon, NAV_ITEMS as nav, navSection } from "./dashboard/navigation";
import { avg, initials } from "./dashboard/utils";
import { loadWorkspaceContext } from "../lib/data/workspace";
import { fetchDriverHistory } from "../lib/data/driverMetrics";
import { mapScorecardRow } from "../lib/data/scorecards";
import { persistWorkspaceImport } from "../lib/data/importWorkflow";
import { DashboardView, SettingsView } from "./dashboard/DashboardViews";
import ReportBuilderV2 from "./reports/ReportBuilderV2";
import ExecutiveAnalystV2 from "./intelligence/ExecutiveAnalystV2";
import ImportCenterV2 from "./imports/ImportCenterV2";
import NotificationsCenterV2 from "./notifications/NotificationsCenterV2";
import NotificationsPageV2 from "./notifications/NotificationsPageV2";
import ManagerControlCenterV2 from "./management/ManagerControlCenterV2";
import WhatIfSimulator from "./simulator/WhatIfSimulator";
import Driver360V2 from "./drivers/Driver360V2";
import EvidenceIncidentCenter from "./evidence/EvidenceIncidentCenter";
import SiteOperationsCenter from "./sites/SiteOperationsCenter";

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
  const [commandCenter, setCommandCenter] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const searchRef = useRef(null);

  function navigate(id) {
    if (
      id === "dashboard" ||
      id === "driver-profile" ||
      canAccessNav(id, access, platformAdmin, session?.role, permissions)
    ) {
      setActive(id);
      return true;
    }
    return false;
  }

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

        const {
          resolved,
          profile,
          platformAdmin: adminFlag,
          access: accessState,
          commandCenter: commandCenterState,
          scorecards,
          metricRows,
        } = context;

        const { data: permissionState, error: permissionError } = await supabase.rpc("get_my_effective_permissions", {
          p_organization_id: resolved.organization.id,
        });
        if (permissionError) throw permissionError;

        setPlatformAdmin(adminFlag);
        setAccess(accessState);
        setPermissions(permissionState || {});
        setCommandCenter(commandCenterState);
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


  useEffect(() => {
    function handleWorkspaceShortcut(event) {
      const key = String(event.key || "").toLowerCase();

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (key === "escape" && document.activeElement === searchRef.current) {
        event.preventDefault();
        setGlobalSearch("");
        searchRef.current?.blur();
      }
    }

    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, []);

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

    const { saved, scorecards, metricRows, commandCenter: nextCommandCenter } = await persistWorkspaceImport({
      supabase: getSupabaseBrowserClient(),
      organizationId,
      analysis: result,
      files,
    });

    setAnalysis(result);
    setDbDrivers(scorecards.map(mapScorecardRow));
    setMetricHistoryRows(metricRows);
    setCommandCenter(nextCommandCenter);
    return saved;
  }
  async function logout() { try { await getSupabaseBrowserClient().auth.signOut(); } finally { localStorage.removeItem("metrixiq.analysis"); router.replace("/login"); } }
  async function openDriver(driver) {
    setPreviousActive(active === "driver-profile" ? "drivers" : active);
    setSelectedDriver(driver);
    setDriverHistory([]);
    navigate("driver-profile");
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
  function backFromDriver() {
    setSelectedDriver(null);
    setDriverHistory([]);
    if (!navigate(previousActive || "drivers")) navigate("dashboard");
  }

  const routedActive =
    active === "driver-profile" ||
    active === "dashboard" ||
    canAccessNav(active, access, platformAdmin, session?.role, permissions)
      ? active
      : "dashboard";

  let view;
  switch (routedActive) {
    case "site-operations": view = <SiteOperationsCenter organizationId={workspace?.organization?.id} sites={sites} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} onOpenDriver={openDriver} onOpenEvidence={() => navigate("evidence")} onOpenCoaching={() => navigate("coaching")} onOpenImports={() => navigate("imports")} onOpenDataQuality={() => navigate("data-quality")} onOpenScorecards={() => navigate("site-scorecards")} />; break;
    case "site-scorecards": view = <SiteScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} />; break;
    case "driver-scorecards": view = <DriverScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} />; break;
    case "drivers": view = <DriverDirectoryView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    case "performance": view = <PerformanceView kpis={kpis} history={visibleFleetHistory} rows={visibleMetricHistoryRows} onOpenDriver={openDriver} />; break;
    case "iadc": view = <IadcView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} />; break;
    case "cdf": view = <CdfView organizationId={workspace?.organization?.id} onImport={() => navigate("imports")} siteFilter={siteFilter} />; break;
    case "mentor": view = <MentorView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} />; break;
    case "concessions": view = <ConcessionsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} siteFilter={siteFilter} />; break;
    case "evidence": view = <EvidenceIncidentCenter organizationId={workspace?.organization?.id} siteFilter={siteFilter} drivers={drivers} initialDriverId={selectedDriver?.dbId || ""} canManage={platformAdmin || permissions?.manage_incidents} onOpenDriver={openDriver} onOpenCoaching={() => navigate("coaching")} />; break;
    case "manager-control": view = <ManagerControlCenterV2 organizationId={workspace?.organization?.id} siteFilter={siteFilter} canManage={platformAdmin || permissions?.manage_coaching} onOpenDriver={openDriver} onOpenCoaching={() => navigate("coaching")} onOpenDataQuality={() => navigate("data-quality")} onOpenImports={() => navigate("imports")} />; break;
    case "coaching": view = <CoachingV3 organizationId={workspace?.organization?.id} siteFilter={siteFilter} drivers={drivers} onOpenDriver={openDriver} canManage={platformAdmin || permissions?.manage_coaching} />; break;
    case "notifications": view = <NotificationsPageV2 organizationId={workspace?.organization?.id} siteFilter={siteFilter} canManage={platformAdmin || permissions?.manage_coaching} onOpenDriver={openDriver} onOpenCoaching={() => navigate("coaching")} onOpenImports={() => navigate("imports")} onOpenDataQuality={() => navigate("data-quality")} onNavigate={navigate} />; break;
    case "intelligence": view = <ExecutiveAnalystV2 organizationId={workspace?.organization?.id} sites={sites} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} onOpenDriver={openDriver} onNavigate={navigate} />; break;
    case "simulator": view = <WhatIfSimulator organizationId={workspace?.organization?.id} siteFilter={siteFilter} initialDriverId={selectedDriver?.dbId || ""} onOpenDriver={openDriver} />; break;
    case "imports": view = <ImportCenterV2 organizationId={workspace?.organization?.id} onImported={imported} analysis={analysis} canManage={platformAdmin || permissions?.manage_imports} />; break;
    case "data-quality": view = <DataQualityV2 organizationId={workspace?.organization?.id} onImport={() => navigate("imports")} canResolve={platformAdmin || permissions?.resolve_data_quality} />; break;
    case "management-views": view = <SavedViewsBulkActions organizationId={workspace?.organization?.id} siteFilter={siteFilter} canBulk={platformAdmin || permissions?.bulk_actions} />; break;
    case "audit": view = <AuditCenter organizationId={workspace?.organization?.id} canReset={platformAdmin || permissions?.reset_overrides} />; break;
    case "reports": view = <ReportBuilderV2 organizationId={workspace?.organization?.id} sites={sites} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} />; break;
    case "billing": view = <BillingProView access={access} organizationId={workspace?.organization?.id} platformAdmin={platformAdmin} onAccessChanged={setAccess} />; break;
    case "team": view = <TeamAccessHub organizationId={workspace?.organization?.id} workspaceRole={session?.role} platformAdmin={platformAdmin} />; break;
    case "settings": view = <SettingsView session={session || {}} onLogout={logout} />; break;
    case "admin": view = platformAdmin ? <PlatformAdminView /> : <SettingsView session={session || {}} onLogout={logout} />; break;
    case "driver-profile": view = selectedDriver ? <Driver360V2 organizationId={workspace?.organization?.id} driver={selectedDriver} history={driverHistory} historyLoading={historyLoading} canManage={platformAdmin || permissions?.manage_incidents || permissions?.manage_coaching} onBack={backFromDriver} onOpenCoaching={() => navigate("coaching")} onOpenSimulator={() => navigate("simulator")} onOpenEvidence={() => navigate("evidence")} /> : <DriverDirectoryView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    default: view = <DashboardView commandCenter={commandCenter} drivers={drivers} kpis={kpis} history={visibleFleetHistory} onImport={() => navigate("imports")} onOpenDriver={openDriver} onDrivers={() => navigate("drivers")} onPerformance={() => navigate("performance")} onCoaching={() => navigate("coaching")} onConcessions={() => navigate("concessions")} onDataQuality={() => navigate("data-quality")} />;
  }

  if (authLoading) return <main className="app-loading"><div className="auth-spinner" /><h1>MetrixIQ</h1><p>Loading secure workspace…</p></main>;
  if (loadError) return <main className="app-loading"><h1>Workspace unavailable</h1><p>{loadError}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button><button className="btn ghost" onClick={logout}>Sign out</button></main>;
  if (!session) return null;
  if (!platformAdmin && access?.suspended) return <SuspendedWorkspaceView access={access} onLogout={logout} />;
  if (!platformAdmin && access && !access.onboarding_completed) return <PlanOnboardingView organizationId={workspace?.organization?.id} organizationName={workspace?.organization?.name} onComplete={setAccess} onLogout={logout} />;

  return <div className="app-shell"><aside className={mobile ? "sidebar open" : "sidebar"}><div className="sidebar-brand"><Brand inverse /><button className="mobile-close" onClick={() => setMobile(false)}>×</button></div><div className="workspace-chip"><span>{initials(session.organisation)}</span><div><b>{session.organisation || "My Fleet"}</b><small>{platformAdmin ? "Platform Owner" : access?.subscription_status === "trialing" ? "Full trial" : `${String(access?.effective_plan || "free").toUpperCase()} plan`}</small></div></div><nav className="app-nav">{nav.filter(([id]) => canAccessNav(id, access, platformAdmin, session?.role, permissions)).map(([id, label], i) => <div key={id}>{navSection(i) && <small className="nav-section">{navSection(i)}</small>}<button onClick={() => { navigate(id); setSelectedDriver(null); setMobile(false); }} className={active === id ? "active" : ""}><span>{icon[id]}</span>{label}{id === "intelligence" && <em>SMART</em>}</button></div>)}</nav><div className="sidebar-user"><span>{initials(session.name)}</span><div><b>{session.name}</b><small>{session.email}</small></div><button aria-label="Sign out" title="Sign out" onClick={logout}>↪</button></div></aside>{mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Close navigation" />}<div className="app-body"><header className="topbar"><div className="topbar-left"><button className="menu-btn" onClick={() => setMobile(true)}>☰</button><div className="search-box">⌕ <input ref={searchRef} aria-label="Search drivers" placeholder="Search drivers by name or TRID…" value={globalSearch} onChange={(e)=>{setGlobalSearch(e.target.value); if(e.target.value) navigate("drivers");}} /><kbd>⌘ / Ctrl K</kbd></div></div><div className="topbar-right"><NotificationsCenterV2 organizationId={workspace?.organization?.id} siteFilter={siteFilter} refreshKey={commandCenter?.generated_at || ""} canManage={platformAdmin || permissions?.manage_coaching} onOpenDriver={openDriver} onOpenNotifications={() => navigate("notifications")} onOpenCoaching={() => navigate("coaching")} onOpenImports={() => navigate("imports")} onOpenDataQuality={() => navigate("data-quality")} onNavigate={navigate} /><select className="site-select" aria-label="Filter workspace by site" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}><option value="all">All sites</option>{sites.map((site) => <option key={site} value={site}>{site}</option>)}</select><span className="top-avatar">{initials(session.name)}</span></div></header><main className="app-main">{view}</main></div></div>;
}
