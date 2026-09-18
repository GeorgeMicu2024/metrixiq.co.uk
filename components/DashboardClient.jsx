"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "./Brand";
import {BillingProView, PlanOnboardingView, PlatformAdminView, SuspendedWorkspaceView, canAccessNav, TeamManagementView } from "./SaasFoundation";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import { persistAnalysis } from "../lib/persistence";
import { aggregateFleetHistory } from "./HistoricalAnalytics";
import { CdfView, DataQualityView, DriverScorecardsView, SiteScorecardsView } from "./OperationalViews";
import { ProDriversView, ProPerformanceView } from "./ProfessionalViews";
import { DirectConcessionsView, DirectIadcView, DirectMentorView } from "./DirectOperationalViews";
import { NAV_ICONS as icon, NAV_ITEMS as nav, navSection } from "./dashboard/navigation";
import { initials, numberOrNull } from "./dashboard/utils";
import { fetchAllDriverMetricRows } from "../lib/data/driverMetrics";
import { CoachingView, DashboardView, DriverScorecardView, ImportsView, IntelligenceView, ReportsView, SettingsView } from "./dashboard/DashboardViews";

async function resolveWorkspace(supabase, user) {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id,name,plan)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) throw membershipError;

  if (membership?.organizations) {
    return {
      organization: membership.organizations,
      role: membership.role || "manager",
    };
  }

  const name =
    user.user_metadata?.organization_name?.trim() ||
    `${user.user_metadata?.full_name || user.email?.split("@")[0] || "My"} Fleet`;

  const { data: organization, error: createError } = await supabase
    .from("organizations")
    .insert({ name, created_by: user.id })
    .select("id,name,plan")
    .single();

  if (createError) throw createError;

  // The database trigger is the authority for access roles.
  // Never assume "owner" in the browser after creating a workspace.
  const { data: createdMembership, error: createdMembershipError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (createdMembershipError) throw createdMembershipError;

  if (!createdMembership) {
    throw new Error("Workspace membership was not created. Please sign out and try again.");
  }

  return {
    organization,
    role: createdMembership.role || "manager",
  };
}

function mapScorecard(row) {
  const mentor = numberOrNull(row.mentor_score ?? row.ementor ?? row.fico);
  const name = isUsablePersonName(row.full_name) ? row.full_name : "Unresolved identity";
  return {
    id: row.trid, dbId: row.driver_id, name, initials: initials(name), site: row.site, status: row.status,
    performance: numberOrNull(row.performance), dcr: numberOrNull(row.dcr), pod: numberOrNull(row.pod), iadc: numberOrNull(row.iadc),
    cc: numberOrNull(row.cc), fico: mentor, ementor: mentor, mentor_score: mentor, psb: numberOrNull(row.psb),
    reattempts: numberOrNull(row.reattempts), concessions: numberOrNull(row.concessions), lor: numberOrNull(row.lor),
    delivered: numberOrNull(row.delivered), dnr_dpmo: numberOrNull(row.dnr_dpmo), dsc_dpmo: numberOrNull(row.dsc_dpmo),
    ce_dpmo: numberOrNull(row.ce_dpmo), cdf_dpmo: numberOrNull(row.cdf_dpmo), scorecard_score: numberOrNull(row.scorecard_score),
    tier: row.tier, risk: row.risk || "Low", issue: row.issue || "No active concern",
    dataConfidence: numberOrNull(row.data_confidence), weekLabel: row.week_label, rawData: row.raw_data || {},
  };
}

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
  const [fleetHistory, setFleetHistory] = useState([]);
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
        if (userError || !userData.user) { router.replace("/login"); return; }
        const user = userData.user;
        await supabase.rpc("redeem_my_pending_invites");
        const { data: profile } = await supabase.from("profiles").select("full_name,email").eq("id", user.id).maybeSingle();
        const resolved = await resolveWorkspace(supabase, user);
        const { data: adminFlag, error: adminFlagError } = await supabase.rpc("is_platform_admin");
        if (adminFlagError) throw adminFlagError;
        await supabase.rpc("touch_last_login");
        const { data: accessRows, error: accessError } = await supabase.rpc("get_workspace_access", { p_organization_id: resolved.organization.id });
        if (accessError) throw accessError;
        const accessState = Array.isArray(accessRows) ? (accessRows[0] || null) : accessRows;
        if (!alive) return;
        setPlatformAdmin(Boolean(adminFlag));
        setAccess(accessState);
        setWorkspace(resolved);
        setSession({
          name: profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "MetrixIQ User",
          email: profile?.email || user.email || "",
          organisation: resolved.organization.name,
          role: resolved.role,
        });
        const { data: scorecards, error: scorecardError } = await supabase.from("driver_scorecards").select("*").eq("organization_id", resolved.organization.id).order("full_name");
        if (scorecardError) throw scorecardError;
        const metricRows = await fetchAllDriverMetricRows(supabase, resolved.organization.id);
        if (alive) {
          setDbDrivers((scorecards || []).map(mapScorecard));
          setMetricHistoryRows(metricRows || []);
          setFleetHistory(aggregateFleetHistory(metricRows || []));
        }
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
  const liveKpis = dbDrivers.length ? {
    dcr: avg(drivers, "dcr"), pod: avg(drivers, "pod"), iadc: avg(drivers, "iadc"), cc: avg(drivers, "cc"),
    fico: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), ementor: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), mentor: avg(drivers, "mentor_score") ?? avg(drivers, "ementor") ?? avg(drivers, "fico"), psb: avg(drivers, "psb"), reattempts: avg(drivers, "reattempts"),
    concessions: avg(drivers, "concessions"), lor: avg(drivers, "lor"), data_confidence: avg(drivers, "dataConfidence"),
  } : {};
  const kpis = { ...liveKpis };

  async function imported(result, files) {
    if (!workspace?.organization?.id) throw new Error("Workspace is not ready yet.");
    const supabase = getSupabaseBrowserClient();
    const saved = await persistAnalysis({ organizationId: workspace.organization.id, analysis: result, files });
    await supabase.rpc("sync_driver_directory", { p_organization_id: workspace.organization.id });
    setAnalysis(result);

    const { data: scorecards, error: scorecardError } = await supabase
      .from("driver_scorecards").select("*")
      .eq("organization_id", workspace.organization.id)
      .order("full_name");
    if (scorecardError) throw scorecardError;

    const metricRows = await fetchAllDriverMetricRows(supabase, workspace.organization.id);

    setDbDrivers((scorecards || []).map(mapScorecard));
    setMetricHistoryRows(metricRows || []);
    setFleetHistory(aggregateFleetHistory(metricRows || []));
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
      const { data } = await getSupabaseBrowserClient().from("driver_metrics").select("period_start,period_end,week_label,performance,dcr,pod,iadc,cc,fico,ementor,mentor_score,concessions,cdf_dpmo,risk,issue,raw_data").eq("organization_id", workspace.organization.id).eq("driver_id", driver.dbId).order("period_end", { ascending: true }).limit(12);
      setDriverHistory(data || []);
    } finally { setHistoryLoading(false); }
  }
  function backFromDriver() { setSelectedDriver(null); setDriverHistory([]); setActive(previousActive || "drivers"); }

  let view;
  switch (active) {
    case "site-scorecards": view = <SiteScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} />; break;
    case "driver-scorecards": view = <DriverScorecardsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} />; break;
    case "drivers": view = <ProDriversView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    case "performance": view = <ProPerformanceView kpis={kpis} history={fleetHistory} rows={metricHistoryRows} onOpenDriver={openDriver} />; break;
    case "iadc": view = <DirectIadcView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} onImport={() => setActive("imports")} />; break;
    case "cdf": view = <CdfView organizationId={workspace?.organization?.id} onImport={() => setActive("imports")} />; break;
    case "mentor": view = <DirectMentorView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} />; break;
    case "concessions": view = <DirectConcessionsView organizationId={workspace?.organization?.id} onOpenDriver={openDriver} />; break;
    case "coaching": view = <CoachingView drivers={drivers} onOpen={openDriver} />; break;
    case "intelligence": view = <IntelligenceView drivers={drivers} onCoaching={() => setActive("coaching")} />; break;
    case "imports": view = <ImportsView onImported={imported} analysis={analysis} />; break;
    case "data-quality": view = <DataQualityView organizationId={workspace?.organization?.id} onImport={() => setActive("imports")} />; break;
    case "reports": view = <ReportsView />; break;
    case "billing": view = <BillingProView access={access} organizationId={workspace?.organization?.id} platformAdmin={platformAdmin} onAccessChanged={setAccess} />; break;
    case "team": view = <TeamManagementView organizationId={workspace?.organization?.id} workspaceRole={session?.role} platformAdmin={platformAdmin} />; break;
    case "settings": view = <SettingsView session={session || {}} onLogout={logout} />; break;
    case "admin": view = platformAdmin ? <PlatformAdminView /> : <SettingsView session={session || {}} onLogout={logout} />; break;
    case "driver-profile": view = selectedDriver ? <DriverScorecardView driver={selectedDriver} history={driverHistory} historyLoading={historyLoading} onBack={backFromDriver} /> : <ProDriversView drivers={drivers} onOpen={openDriver} query={globalSearch} />; break;
    default: view = <DashboardView drivers={drivers} kpis={kpis} history={fleetHistory} onImport={() => setActive("imports")} onOpenDriver={openDriver} onDrivers={() => setActive("drivers")} onPerformance={() => setActive("performance")} onCoaching={() => setActive("coaching")} />;
  }

  if (authLoading) return <main className="app-loading"><div className="auth-spinner" /><h1>MetrixIQ</h1><p>Loading secure workspace…</p></main>;
  if (loadError) return <main className="app-loading"><h1>Workspace unavailable</h1><p>{loadError}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button><button className="btn ghost" onClick={logout}>Sign out</button></main>;
  if (!session) return null;
  if (!platformAdmin && access?.suspended) return <SuspendedWorkspaceView access={access} onLogout={logout} />;
  if (!platformAdmin && access && !access.onboarding_completed) return <PlanOnboardingView organizationId={workspace?.organization?.id} organizationName={workspace?.organization?.name} onComplete={setAccess} onLogout={logout} />;

  return <div className="app-shell"><aside className={mobile ? "sidebar open" : "sidebar"}><div className="sidebar-brand"><Brand inverse /><button className="mobile-close" onClick={() => setMobile(false)}>×</button></div><div className="workspace-chip"><span>{initials(session.organisation)}</span><div><b>{session.organisation || "My Fleet"}</b><small>{platformAdmin ? "Platform Owner" : access?.subscription_status === "trialing" ? "Full trial" : `${String(access?.effective_plan || "free").toUpperCase()} plan`}</small></div></div><nav className="app-nav">{nav.filter(([id]) => canAccessNav(id, access, platformAdmin, session?.role)).map(([id, label], i) => <div key={id}>{navSection(i) && <small className="nav-section">{navSection(i)}</small>}<button onClick={() => { setActive(id); setSelectedDriver(null); setMobile(false); }} className={active === id ? "active" : ""}><span>{icon[id]}</span>{label}{id === "intelligence" && <em>AI</em>}</button></div>)}</nav><div className="sidebar-user"><span>{initials(session.name)}</span><div><b>{session.name}</b><small>{session.email}</small></div><button onClick={logout}>↪</button></div></aside>{mobile && <button className="mobile-overlay" onClick={() => setMobile(false)} aria-label="Close navigation" />}<div className="app-body"><header className="topbar"><div className="topbar-left"><button className="menu-btn" onClick={() => setMobile(true)}>☰</button><div className="search-box">⌕ <input aria-label="Search drivers" placeholder="Search drivers by name or TRID…" value={globalSearch} onChange={(e)=>{setGlobalSearch(e.target.value); if(e.target.value) setActive("drivers");}} /><kbd>Ctrl K</kbd></div></div><div className="topbar-right"><select className="site-select" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label="Filter workspace by site"><option value="all">All sites</option>{sites.map((site) => <option key={site} value={site}>{site}</option>)}</select><span className="top-avatar">{initials(session.name)}</span></div></header><main className="app-main">{view}</main></div></div>;
}
