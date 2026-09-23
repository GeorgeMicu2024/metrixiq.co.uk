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
import DriverMasterView from "./drivers/DriverMasterView";
import IadcView from "./operations/IadcView";
import PodQualityView from "./operations/PodQualityView";
import CustomerComplianceView from "./operations/CustomerComplianceView";
import MentorView from "./operations/MentorView";
import ConcessionsView from "./operations/ConcessionsView";
import CoachingV3 from "./coaching/CoachingV3";
import { NAV_ICONS as icon, NAV_ITEMS as nav, NAV_GROUPS } from "./dashboard/navigation";
import { avg, initials } from "./dashboard/utils";
import { loadWorkspaceContext } from "../lib/data/workspace";
import { fetchCommandCenterSummary } from "../lib/data/commandCenter";
import { fetchDriverHistory } from "../lib/data/driverMetrics";
import { mapScorecardRow } from "../lib/data/scorecards";
import { persistWorkspaceImport } from "../lib/data/importWorkflow";
import { autoReassessAiInterventions, refreshSlaEscalations, runAutomationEngine } from "../lib/data/automationV8";
import { DashboardView } from "./dashboard/DashboardViews";
import ReportBuilderV2 from "./reports/ReportBuilderV2";
import ExecutiveAnalystV2 from "./intelligence/ExecutiveAnalystV2";
import ImportCenterV2 from "./imports/ImportCenterV2";
import NotificationsCenterV2 from "./notifications/NotificationsCenterV2";
import NotificationsPageV2 from "./notifications/NotificationsPageV2";
import ActionCenterV2 from "./automation/ActionCenterV2";
import AutomationCenter from "./automation/AutomationCenter";
import WhatIfSimulator from "./simulator/WhatIfSimulator";
import Driver360V2 from "./drivers/Driver360V2";
import EvidenceIncidentCenter from "./evidence/EvidenceIncidentCenter";
import SiteOperationsCenter from "./sites/SiteOperationsCenter";
import WavePlanView from "./sites/WavePlanView";
import IntegrationHub from "./platform/IntegrationHub";
import ReliabilityCenter from "./platform/ReliabilityCenter";
import MobileManagerMode from "./mobile/MobileManagerMode";
import MobileCommandDock from "./mobile/MobileCommandDock";
import PortfolioDashboard from "./enterprise/PortfolioDashboard";
import EnterpriseSettings from "./enterprise/EnterpriseSettings";
import AccountSettingsView from "./account/AccountSettingsView";
import IntegrationDeliveryCenter from "./integrations/IntegrationDeliveryCenter";
import { fetchOrganizationHierarchy, upsertOrganizationSiteProfile } from "../lib/data/enterpriseV7";

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

  const [favorites, setFavorites] = useState([]);
  const [siteFilter, setSiteFilter] = useState("all");
  const [siteRegistry, setSiteRegistry] = useState([]);
  const [siteCreateOpen, setSiteCreateOpen] = useState(false);
  const [siteCreateBusy, setSiteCreateBusy] = useState(false);
  const [siteCreateError, setSiteCreateError] = useState("");
  const [siteDraft, setSiteDraft] = useState({ code: "", displayName: "", region: "", country: "United Kingdom" });
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [access, setAccess] = useState(null);
  const [commandCenter, setCommandCenter] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [workspaceOptions, setWorkspaceOptions] = useState([]);
  const [workspaceSwitching, setWorkspaceSwitching] = useState(false);
  const [branding, setBranding] = useState(null);
  const [operationalRefreshKey, setOperationalRefreshKey] = useState(0);
  const [collapsedGroups,setCollapsedGroups]=useState({});
  const [sidebarCompact,setSidebarCompact]=useState(false);
  const [now,setNow]=useState(()=>new Date());

  useEffect(() => {
    try { setFavorites(JSON.parse(localStorage.getItem("metrixiq.navFavorites") || "[]")); } catch { setFavorites([]); }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);


  function toggleFavorite(id) {
    setFavorites((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem("metrixiq.navFavorites", JSON.stringify(next));
      return next;
    });
  }

  function navigate(id) {
    if (
      id === "dashboard" ||
      id === "driver-profile" ||
      canAccessNav(id, access, platformAdmin, session?.role, permissions)
    ) {
      setActive(id);
      const params = new URLSearchParams(window.location.search);
      if (id === "dashboard") params.delete("view"); else params.set("view", id);
      const query = params.toString();
      window.history.pushState({ metrixiqView: id }, "", "/app" + (query ? "?" + query : ""));
      return true;
    }
    return false;
  }

  function applyWorkspaceContext(context, user, permissionState) {
    const {
      resolved,
      profile,
      platformAdmin: adminFlag,
      access: accessState,
      branding: brandingState,
      commandCenter: commandCenterState,
      scorecards,
      metricRows,
    } = context;

    setPlatformAdmin(adminFlag);
    setAccess(accessState);
    setPermissions(permissionState || {});
    setCommandCenter(commandCenterState);
    setWorkspace(resolved);
    setWorkspaceOptions(resolved.workspaces || []);
    setBranding(brandingState || null);
    setSession({
      name: profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "MetrixIQ User",
      email: profile?.email || user.email || "",
      organisation: resolved.organization.name,
      role: resolved.role,
      avatar_url: user.user_metadata?.avatar_url || "",
    });
    setDbDrivers(scorecards.map(mapScorecardRow));
    setMetricHistoryRows(metricRows);
    setAnalysis(null);
    setSelectedDriver(null);
    setDriverHistory([]);
    setSiteFilter("all");
    setSiteRegistry([]);
  }

  async function fetchWorkspaceContextForUser(user, preferredOrganizationId = null) {
    const supabase = getSupabaseBrowserClient();
    const context = await loadWorkspaceContext(supabase, user, preferredOrganizationId);
    const { data: permissionState, error: permissionError } = await supabase.rpc("get_my_effective_permissions", {
      p_organization_id: context.resolved.organization.id,
    });
    if (permissionError) throw permissionError;
    return { context, permissionState };
  }

  async function switchWorkspace(organizationId) {
    if (!organizationId || organizationId === workspace?.organization?.id || workspaceSwitching) return;
    setWorkspaceSwitching(true);
    setLoadError("");
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("Authentication required.");
      const { context, permissionState } = await fetchWorkspaceContextForUser(userData.user, organizationId);
      applyWorkspaceContext(context, userData.user, permissionState);
      localStorage.setItem("metrixiq.organizationId", context.resolved.organization.id);
      setActive("dashboard");
      window.history.replaceState({ metrixiqView: "dashboard" }, "", "/app");
    } catch (e) {
      setLoadError(e?.message || "Could not switch workspace.");
    } finally {
      setWorkspaceSwitching(false);
    }
  }

  async function refreshBranding() {
    const organizationId = workspace?.organization?.id;
    if (!organizationId) return;
    const { data, error } = await getSupabaseBrowserClient().rpc("get_organization_branding", {
      p_organization_id: organizationId,
    });
    if (error) throw error;
    setBranding(data || null);
  }

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();
    async function initialise() {
      try {
        const requestedView = new URLSearchParams(window.location.search).get("view");
        if (requestedView) setActive(requestedView);
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) {
          router.replace("/login");
          return;
        }

        const preferredOrganizationId = localStorage.getItem("metrixiq.organizationId");
        const { context, permissionState } = await fetchWorkspaceContextForUser(userData.user, preferredOrganizationId);
        if (!alive) return;
        applyWorkspaceContext(context, userData.user, permissionState);
        localStorage.setItem("metrixiq.organizationId", context.resolved.organization.id);
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
    const organizationId = workspace?.organization?.id;
    if (!organizationId || !(platformAdmin || permissions?.manage_automations)) return;
    const supabase = getSupabaseBrowserClient();
    Promise.allSettled([
      runAutomationEngine(supabase, organizationId, false, "workspace_open"),
      refreshSlaEscalations(supabase, organizationId),
    ]);
  }, [workspace?.organization?.id, platformAdmin, permissions?.manage_automations]);

  useEffect(() => {
    function syncViewFromHistory() {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("view") || "dashboard";
      if (requested === "dashboard" || requested === "driver-profile" || canAccessNav(requested, access, platformAdmin, session?.role, permissions)) {
        setActive(requested === "driver-profile" && !selectedDriver ? "dashboard" : requested);
      } else {
        setActive("dashboard");
      }
    }
    window.addEventListener("popstate", syncViewFromHistory);
    return () => window.removeEventListener("popstate", syncViewFromHistory);
  }, [access, platformAdmin, session?.role, permissions, selectedDriver]);


  useEffect(() => {
    const organizationId = workspace?.organization?.id;
    if (!organizationId) return;
    let cancelled = false;
    fetchOrganizationHierarchy(getSupabaseBrowserClient(), organizationId)
      .then((rows) => { if (!cancelled) setSiteRegistry(rows || []); })
      .catch(() => { if (!cancelled) setSiteRegistry([]); });
    return () => { cancelled = true; };
  }, [workspace?.organization?.id]);

  const legacySites = dbDrivers
    .map((d) => String(d.site || "").trim().toUpperCase())
    .filter((site) => /^[A-Z]{2,5}\d{1,3}$/.test(site));
  const registeredSites = siteRegistry
    .filter((row) => row.active !== false)
    .map((row) => String(row.site || "").trim().toUpperCase())
    .filter((site) => /^[A-Z]{2,5}\d{1,3}$/.test(site));
  const sites = [...new Set([...legacySites, ...registeredSites])].sort();

  async function createSiteFromDashboard() {
    const organizationId = workspace?.organization?.id;
    const code = String(siteDraft.code || "").trim().toUpperCase();
    if (!organizationId) return;
    if (!/^[A-Z]{2,5}\d{1,3}$/.test(code)) {
      setSiteCreateError("Use a valid station code such as DLS2, DXM3 or DDN1.");
      return;
    }
    if (sites.includes(code)) {
      setSiteCreateError(code + " already exists in this workspace.");
      return;
    }
    setSiteCreateBusy(true);
    setSiteCreateError("");
    try {
      await upsertOrganizationSiteProfile(getSupabaseBrowserClient(), {
        organizationId,
        site: code,
        displayName: siteDraft.displayName || code + " operations",
        region: siteDraft.region || null,
        country: siteDraft.country || "United Kingdom",
        active: true,
      });
      const rows = await fetchOrganizationHierarchy(getSupabaseBrowserClient(), organizationId);
      setSiteRegistry(rows || []);
      setSiteFilter(code);
      setSiteDraft({ code: "", displayName: "", region: "", country: "United Kingdom" });
      setSiteCreateOpen(false);
    } catch (error) {
      setSiteCreateError(error?.message || "Could not create site.");
    } finally {
      setSiteCreateBusy(false);
    }
  }
  useEffect(() => {
    const organizationId = workspace?.organization?.id;
    if (!organizationId) return;
    let cancelled = false;
    fetchCommandCenterSummary(getSupabaseBrowserClient(), organizationId, siteFilter)
      .then((summary) => { if (!cancelled) setCommandCenter(summary); })
      .catch((error) => { if (!cancelled) console.error("Command Center site refresh failed", error); });
    return () => { cancelled = true; };
  }, [workspace?.organization?.id, siteFilter]);

  const drivers = siteFilter === "all" ? dbDrivers : dbDrivers.filter((d) => d.site === siteFilter);
  const visibleMetricHistoryRows = useMemo(
    () => siteFilter === "all"
      ? metricHistoryRows
      : metricHistoryRows.filter((row) => String(row?.site || row?.drivers?.site || "").trim().toUpperCase() === siteFilter),
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

  async function imported(result, files, activitySite = null) {
    const organizationId = workspace?.organization?.id;
    if (!organizationId) throw new Error("Workspace is not ready yet.");

    const { saved, scorecards, metricRows, commandCenter: nextCommandCenter } = await persistWorkspaceImport({
      supabase: getSupabaseBrowserClient(),
      organizationId,
      analysis: result,
      files,
      site: activitySite,
    });

    setAnalysis(result);
    setDbDrivers(scorecards.map(mapScorecardRow));
    setMetricHistoryRows(metricRows);
    setCommandCenter(nextCommandCenter);
    setOperationalRefreshKey((value) => value + 1);

    if (platformAdmin || permissions?.manage_automations) {
      await Promise.allSettled([
        runAutomationEngine(getSupabaseBrowserClient(), organizationId, false, "import_completed"),
        refreshSlaEscalations(getSupabaseBrowserClient(), organizationId),
        autoReassessAiInterventions(getSupabaseBrowserClient(), organizationId),
      ]);
    }

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
    case "portfolio": view = <PortfolioDashboard organizationId={workspace?.organization?.id} workspaceOptions={workspaceOptions} canManage={platformAdmin || permissions?.manage_portfolio} onSwitchWorkspace={switchWorkspace} onOpenEnterpriseSettings={() => navigate("enterprise-settings")} />; break;
    case "enterprise-settings": view = <EnterpriseSettings organization={workspace?.organization} sites={sites} canManageHierarchy={platformAdmin || permissions?.view_enterprise_settings} canManagePolicy={platformAdmin || permissions?.manage_kpi_policy} canManageBranding={platformAdmin || permissions?.manage_branding} onBrandingChanged={refreshBranding} />; break;
    case "mobile-manager": view = <MobileManagerMode organizationId={workspace?.organization?.id} siteFilter={siteFilter} drivers={drivers} canManage={platformAdmin || permissions?.manage_coaching || permissions?.manage_incidents} onOpenDriver={openDriver} onNavigate={navigate} />; break;
    case "daily-dispatch": view = <WavePlanView site={siteFilter!=="all"?siteFilter:(sites[0]||"DLS2")} drivers={dbDrivers} />; break;
    case "site-operations": view = <SiteOperationsCenter organizationId={workspace?.organization?.id} sites={sites} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} onOpenDriver={openDriver} onOpenEvidence={() => navigate("evidence")} onOpenCoaching={() => navigate("coaching")} onOpenImports={() => navigate("imports")} onOpenDataQuality={() => navigate("data-quality")} onOpenScorecards={() => navigate("site-scorecards")} drivers={dbDrivers} />; break;
    case "site-scorecards": view = <SiteScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} />; break;
    case "driver-scorecards": view = <DriverScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} />; break;
    case "driver-master": view = <DriverMasterView organizationId={workspace?.organization?.id} sites={sites} legacyDrivers={dbDrivers} canManage={platformAdmin || ["owner","admin","manager"].includes(String(session?.role || "").toLowerCase())} onOpenDriver={openDriver} />; break;
    case "drivers": view = <DriverDirectoryView drivers={drivers} onOpen={openDriver} query="" />; break;
    case "performance": view = <PerformanceView kpis={kpis} history={visibleFleetHistory} rows={visibleMetricHistoryRows} onOpenDriver={openDriver} />; break;
    case "iadc": view = <IadcView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} onImported={imported} siteFilter={siteFilter} metric="iadc" initialComplianceTab="iadc" refreshKey={operationalRefreshKey} />; break;
    case "pod": view = <PodQualityView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImported={imported} siteFilter={siteFilter} refreshKey={operationalRefreshKey} />; break;
    case "dcr": view = <IadcView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} metric="dcr" refreshKey={operationalRefreshKey} />; break;
    case "cc": view = <CustomerComplianceView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImported={imported} siteFilter={siteFilter} refreshKey={operationalRefreshKey} />; break;
    case "cdf": view = <CdfView organizationId={workspace?.organization?.id} onImport={() => navigate("imports")} siteFilter={siteFilter} />; break;
    case "mentor": view = <MentorView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => navigate("imports")} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} refreshKey={operationalRefreshKey} />; break;
    case "concessions": view = <ConcessionsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} siteFilter={siteFilter} />; break;
    case "evidence": view = <EvidenceIncidentCenter organizationId={workspace?.organization?.id} siteFilter={siteFilter} drivers={drivers} initialDriverId={selectedDriver?.dbId || ""} canManage={platformAdmin || permissions?.manage_incidents} onOpenDriver={openDriver} onOpenCoaching={() => navigate("coaching")} />; break;
    case "manager-control": view = <ActionCenterV2 organizationId={workspace?.organization?.id} siteFilter={siteFilter} canManage={platformAdmin || permissions?.manage_workflows} canApprove={platformAdmin || permissions?.approve_workflows} onOpenDriver={openDriver} onNavigate={navigate} />; break;
    case "automation": view = <AutomationCenter organizationId={workspace?.organization?.id} sites={sites} drivers={drivers} canManage={platformAdmin || permissions?.manage_automations} canApprove={platformAdmin || permissions?.approve_workflows} onOpenDriver={openDriver} onNavigate={navigate} />; break;
    case "coaching": view = <CoachingV3 organizationId={workspace?.organization?.id} siteFilter={siteFilter} drivers={drivers} onOpenDriver={openDriver} canManage={platformAdmin || permissions?.manage_coaching} />; break;
    case "notifications": view = <NotificationsPageV2 organizationId={workspace?.organization?.id} siteFilter={siteFilter} canManage={platformAdmin || permissions?.manage_coaching} onOpenDriver={openDriver} onOpenCoaching={() => navigate("coaching")} onOpenImports={() => navigate("imports")} onOpenDataQuality={() => navigate("data-quality")} onNavigate={navigate} />; break;
    case "intelligence": view = <ExecutiveAnalystV2 organizationId={workspace?.organization?.id} sites={sites} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} onOpenDriver={openDriver} onNavigate={navigate} />; break;
    case "simulator": view = <WhatIfSimulator organizationId={workspace?.organization?.id} siteFilter={siteFilter} initialDriverId={selectedDriver?.dbId || ""} onOpenDriver={openDriver} />; break;
    case "imports": view = <ImportCenterV2 organizationId={workspace?.organization?.id} sites={sites} siteFilter={siteFilter} onImported={imported} analysis={analysis} canManage={platformAdmin || permissions?.manage_imports} />; break;
    case "data-quality": view = <DataQualityV2 organizationId={workspace?.organization?.id} onImport={() => navigate("imports")} canResolve={platformAdmin || permissions?.resolve_data_quality} />; break;
    case "management-views": view = <SavedViewsBulkActions organizationId={workspace?.organization?.id} siteFilter={siteFilter} canBulk={platformAdmin || permissions?.bulk_actions} />; break;
    case "audit": view = <AuditCenter organizationId={workspace?.organization?.id} canReset={platformAdmin || permissions?.reset_overrides} />; break;
    case "integrations": view = <IntegrationHub organizationId={workspace?.organization?.id} canManage={platformAdmin || permissions?.manage_integrations} onNavigate={navigate} />; break;
    case "reliability": view = <ReliabilityCenter organizationId={workspace?.organization?.id} canRun={platformAdmin || permissions?.run_reliability_checks} onNavigate={navigate} />; break;
    case "developer-platform": view = <IntegrationDeliveryCenter organizationId={workspace?.organization?.id} canManageApi={platformAdmin || permissions?.manage_api_keys} canManageWebhooks={platformAdmin || permissions?.manage_webhooks} canManageDelivery={platformAdmin || permissions?.manage_delivery} />; break;
    case "reports": view = <ReportBuilderV2 organizationId={workspace?.organization?.id} sites={sites} siteFilter={siteFilter} onSiteFilterChange={setSiteFilter} />; break;
    case "billing": view = <BillingProView access={access} organizationId={workspace?.organization?.id} platformAdmin={platformAdmin} onAccessChanged={setAccess} />; break;
    case "team": view = <TeamAccessHub organizationId={workspace?.organization?.id} workspaceRole={session?.role} platformAdmin={platformAdmin} />; break;
    case "settings": view = <AccountSettingsView platformAdmin={platformAdmin} />; break;
    case "admin": view = platformAdmin ? <PlatformAdminView /> : <AccountSettingsView platformAdmin={false} />; break;
    case "driver-profile": view = selectedDriver ? <Driver360V2 organizationId={workspace?.organization?.id} driver={selectedDriver} history={driverHistory} historyLoading={historyLoading} canManage={platformAdmin || permissions?.manage_incidents || permissions?.manage_coaching} onBack={backFromDriver} onOpenCoaching={() => navigate("coaching")} onOpenSimulator={() => navigate("simulator")} onOpenEvidence={() => navigate("evidence")} /> : <DriverDirectoryView drivers={drivers} onOpen={openDriver} query="" />; break;
    default: view = <DashboardView organizationId={workspace?.organization?.id} commandCenter={commandCenter} drivers={drivers} kpis={kpis} history={visibleFleetHistory} onImport={() => navigate("imports")} onOpenDriver={openDriver} onDrivers={() => navigate("drivers")} onPerformance={() => navigate("performance")} onCoaching={() => navigate("coaching")} onConcessions={() => navigate("concessions")} onDataQuality={() => navigate("data-quality")} onNavigate={navigate} />;
  }

  if (authLoading) return <main className="app-loading"><div className="auth-spinner" /><h1>MetrixIQ</h1><p>Loading secure workspace…</p></main>;
  if (loadError) return <main className="app-loading"><h1>Workspace unavailable</h1><p>{loadError}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button><button className="btn ghost" onClick={logout}>Sign out</button></main>;
  if (!session) return null;
  if (!platformAdmin && access?.suspended) return <SuspendedWorkspaceView access={access} onLogout={logout} />;
  if (!platformAdmin && access && !access.onboarding_completed) return <PlanOnboardingView organizationId={workspace?.organization?.id} organizationName={workspace?.organization?.name} onComplete={setAccess} onLogout={logout} />;

  const commandItems = nav.filter(([id, label]) =>
    canAccessNav(id, access, platformAdmin, session?.role, permissions) &&
    (!globalSearch.trim() || label.toLowerCase().includes(globalSearch.trim().toLowerCase()) || id.includes(globalSearch.trim().toLowerCase()))
  );
  const favoriteItems = nav.filter(([id]) => favorites.includes(id) && canAccessNav(id, access, platformAdmin, session?.role, permissions));

  return <div className="app-shell" style={{"--miq-accent":branding?.accent_color||"#66E3CE","--miq-secondary":branding?.secondary_color||"#9B90FF"}}><aside className={(mobile ? "sidebar open" : "sidebar")+(sidebarCompact?" compact":"")}><div className="sidebar-brand"><Brand inverse branding={branding} /><button className="sidebar-collapse" onClick={()=>setSidebarCompact(v=>!v)}>{sidebarCompact?"»":"«"}</button><button className="mobile-close" onClick={() => setMobile(false)}>×</button></div><nav className="app-nav">{favoriteItems.length>0&&<><small className="nav-section">FAVORITES</small>{favoriteItems.map(([id,label])=><div key={"fav-"+id}><button onClick={()=>{navigate(id);setSelectedDriver(null);setMobile(false);}} className={active===id?"active":""}><span>{icon[id]}</span><i>{label}</i><em>★</em></button></div>)}</>}{NAV_GROUPS.map(group=>{const visible=group.items.filter(([id])=>canAccessNav(id,access,platformAdmin,session?.role,permissions));if(!visible.length)return null;const contains=visible.some(([id])=>id===active);const closed=collapsedGroups[group.label]&&!contains;return <section className="nav-group" key={group.label}><button className="nav-group-toggle" onClick={()=>setCollapsedGroups(v=>{if(!v[group.label])return {...Object.fromEntries(NAV_GROUPS.map(g=>[g.label,true])),[group.label]:false};return {...v,[group.label]:false};})}><b>{group.label}</b><span>{closed?"⌄":"⌃"}</span></button>{!closed&&visible.map(([id,label])=><div key={id}><button onClick={()=>{navigate(id);setSelectedDriver(null);setMobile(false);}} className={active===id?"active":""}><span>{icon[id]}</span><i>{label}</i>{id==="intelligence"&&<em>SMART</em>}{id==="mobile-manager"&&<em>MOBILE</em>}</button></div>)}</section>})}</nav></aside>{mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Close navigation" />}<div className="app-body"><header className="topbar topbar-minimal"><button className="menu-btn" onClick={() => setMobile(true)}>☰</button><div className="topbar-controls">{workspaceOptions.length>1?<select aria-label="Switch organisation workspace" value={workspace?.organization?.id||""} disabled={workspaceSwitching} onChange={e=>switchWorkspace(e.target.value)}>{workspaceOptions.map(option=><option key={option.organization_id||option.id} value={option.organization_id||option.id}>{option.organization_name||option.name||"Workspace"}</option>)}</select>:null}<select aria-label="Filter workspace by site" value={siteFilter} onChange={e=>{if(e.target.value==="__add_site__"){setSiteCreateError("");setSiteCreateOpen(true);return;}setSiteFilter(e.target.value);}}><option value="all">All sites</option>{sites.map(site=><option key={site} value={site}>{site}</option>)}<option value="__add_site__">＋ Add new site</option></select></div></header><main className="app-main">{view}</main></div><MobileCommandDock active={routedActive} onNavigate={(id)=>{navigate(id);setSelectedDriver(null);}} />{siteCreateOpen&&<div role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget&&!siteCreateBusy)setSiteCreateOpen(false);}} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(5,10,20,.68)",display:"grid",placeItems:"center",padding:20}}><section className="panel" role="dialog" aria-modal="true" aria-labelledby="create-site-title" style={{width:"min(560px,100%)",maxHeight:"90vh",overflow:"auto"}}><div className="panel-head"><div><span className="page-kicker">SITE MANAGEMENT</span><h2 id="create-site-title">Add new site</h2><p>Create a station in this workspace. Existing DLS2 drivers and historical data are not changed.</p></div><button className="btn ghost compact" disabled={siteCreateBusy} onClick={()=>setSiteCreateOpen(false)}>×</button></div>{siteCreateError&&<div className="mgrv2-notice error">{siteCreateError}</div>}<div style={{display:"grid",gap:14}}><label><span>Site code</span><input autoFocus value={siteDraft.code} onChange={e=>setSiteDraft(x=>({...x,code:e.target.value.toUpperCase()}))} placeholder="DXM3" maxLength={8}/></label><label><span>Display name</span><input value={siteDraft.displayName} onChange={e=>setSiteDraft(x=>({...x,displayName:e.target.value}))} placeholder="DXM3 Operations"/></label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label><span>Region</span><input value={siteDraft.region} onChange={e=>setSiteDraft(x=>({...x,region:e.target.value}))} placeholder="North West"/></label><label><span>Country</span><input value={siteDraft.country} onChange={e=>setSiteDraft(x=>({...x,country:e.target.value}))} placeholder="United Kingdom"/></label></div><div style={{display:"flex",justifyContent:"flex-end",gap:10}}><button className="btn ghost" disabled={siteCreateBusy} onClick={()=>setSiteCreateOpen(false)}>Cancel</button><button className="btn primary" disabled={siteCreateBusy||!siteDraft.code.trim()} onClick={createSiteFromDashboard}>{siteCreateBusy?"Creating…":"Create site"}</button></div></div></section></div>}</div>;
}
