"use client";

import { useEffect, useMemo, useState } from "react";
import Brand from "../Brand";
import { POLICY_METRICS, resolvePerformancePolicy } from "../../lib/config/performance";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  deleteKpiPolicy,
  fetchEnterpriseWorkspaceData,
  upsertKpiPolicy,
  upsertOrganizationSiteProfile,
  updateOrganizationBranding,
} from "../../lib/data/enterpriseV7";

function fmtTarget(value,unit){
  const n=Number(value);
  if(!Number.isFinite(n))return"—";
  if(unit==="percent")return n.toFixed(n%1?2:0)+"%";
  return String(n);
}

export default function EnterpriseSettings({
  organization,
  sites=[],
  canManageHierarchy=false,
  canManagePolicy=false,
  canManageBranding=false,
  onBrandingChanged,
}){
  const organizationId=organization?.id;
  const [tab,setTab]=useState("hierarchy");
  const [data,setData]=useState({hierarchy:[],policies:[],branding:null});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState("");
  const [siteDrafts,setSiteDrafts]=useState({});
  const [policyDraft,setPolicyDraft]=useState({site:"",metric:"dcr",target:"99.2",direction:"gte",warningMargin:"0.2",unit:"percent"});
  const [branding,setBranding]=useState({
    brandName:"",accentColor:"#66E3CE",secondaryColor:"#9B90FF",logoUrl:"",footerText:"",showMetrixiqBrand:true,
  });

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{
      const next=await fetchEnterpriseWorkspaceData(getSupabaseBrowserClient(),organizationId);
      setData(next);
      const drafts={};
      for(const row of next.hierarchy||[]){
        drafts[row.site]={
          displayName:row.display_name||"",
          region:row.region||"",
          country:row.country||"",
          active:row.active!==false,
        };
      }
      for(const site of sites){
        if(!drafts[site])drafts[site]={displayName:"",region:"",country:"",active:true};
      }
      setSiteDrafts(drafts);
      const b=next.branding||{};
      setBranding({
        brandName:b.brand_name||"",
        accentColor:b.accent_color||"#66E3CE",
        secondaryColor:b.secondary_color||"#9B90FF",
        logoUrl:b.logo_url||"",
        footerText:b.footer_text||"",
        showMetrixiqBrand:b.show_metrixiq_brand!==false,
      });
    }catch(e){setError(e?.message||"Could not load Enterprise Settings.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);

  const hierarchy=useMemo(()=>{
    const map=new Map((data.hierarchy||[]).map((x)=>[x.site,x]));
    for(const site of sites)if(!map.has(site))map.set(site,{site,display_name:null,region:null,country:null,active:true,driver_count:0});
    return [...map.values()].sort((a,b)=>a.site.localeCompare(b.site));
  },[data.hierarchy,sites.join("|")]);

  const policyMap=useMemo(()=>{
    const map=new Map();
    for(const p of data.policies||[]){
      map.set((p.site||"*")+"|"+p.metric,p);
    }
    return map;
  },[data.policies]);

  function updateSiteDraft(site,key,value){
    setSiteDrafts((current)=>({...current,[site]:{...(current[site]||{}),[key]:value}}));
  }

  async function saveSite(site){
    if(!canManageHierarchy)return;
    const draft=siteDrafts[site]||{};
    setBusy("site-"+site);setError("");setNotice("");
    try{
      await upsertOrganizationSiteProfile(getSupabaseBrowserClient(),{
        organizationId,site,
        displayName:draft.displayName,
        region:draft.region,
        country:draft.country,
        active:draft.active,
      });
      setNotice(site+" hierarchy profile saved.");
      await load();
    }catch(e){setError(e?.message||"Could not save site profile.");}
    finally{setBusy("");}
  }

  function chooseMetric(metric){
    const definition=POLICY_METRICS.find((x)=>x.key===metric);
    setPolicyDraft((current)=>({
      ...current,
      metric,
      target:String(definition?.defaultTarget??""),
      direction:definition?.direction||"gte",
      unit:definition?.unit||"percent",
    }));
  }

  async function savePolicy(){
    if(!canManagePolicy||!policyDraft.metric||policyDraft.target==="")return;
    setBusy("policy");setError("");setNotice("");
    try{
      await upsertKpiPolicy(getSupabaseBrowserClient(),{
        organizationId,
        site:policyDraft.site||null,
        metric:policyDraft.metric,
        target:Number(policyDraft.target),
        direction:policyDraft.direction,
        warningMargin:Number(policyDraft.warningMargin||0),
        unit:policyDraft.unit,
        enabled:true,
      });
      setNotice("KPI policy saved. Site-specific policies override organisation defaults.");
      await load();
    }catch(e){setError(e?.message||"Could not save KPI policy.");}
    finally{setBusy("");}
  }

  async function removePolicy(policy){
    if(!canManagePolicy||!window.confirm("Remove this custom KPI policy and fall back to the next applicable default?"))return;
    setBusy("delete-"+policy.id);setError("");
    try{
      await deleteKpiPolicy(getSupabaseBrowserClient(),policy.id);
      setNotice("Custom KPI policy removed.");
      await load();
    }catch(e){setError(e?.message||"Could not remove KPI policy.");}
    finally{setBusy("");}
  }

  async function saveBranding(){
    if(!canManageBranding)return;
    setBusy("branding");setError("");setNotice("");
    try{
      await updateOrganizationBranding(getSupabaseBrowserClient(),{
        organizationId,...branding,
      });
      setNotice("White-label branding saved.");
      await load();
      onBrandingChanged?.();
    }catch(e){setError(e?.message||"Could not save branding.");}
    finally{setBusy("");}
  }

  if(loading)return <section className="panel enterprisev7-empty"><div className="auth-spinner"/><b>Loading Enterprise Settings…</b></section>;

  return <div className="enterprisev7-root">
    <div className="enterprisev7-heading">
      <div><span className="page-kicker">ENTERPRISE SETTINGS V7</span><h1>{organization?.name||"Workspace"} Enterprise Control</h1><p>Organisation hierarchy, KPI policy inheritance and workspace branding with audited changes.</p></div>
      <button className="btn ghost" onClick={load}>Refresh</button>
    </div>
    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <div className="enterprisev7-tabs">
      <button className={tab==="hierarchy"?"active":""} onClick={()=>setTab("hierarchy")}>Organisation Hierarchy</button>
      <button className={tab==="policies"?"active":""} onClick={()=>setTab("policies")}>KPI Policies</button>
      <button className={tab==="branding"?"active":""} onClick={()=>setTab("branding")}>White-label Branding</button>
    </div>

    {tab==="hierarchy"&&<section className="panel enterprisev7-hierarchy">
      <div className="panel-head"><div><h2>Workspace → Region → Site</h2><p>Site profiles enrich Portfolio benchmarking without changing source scorecard records.</p></div><span className="panel-badge">{hierarchy.length} sites</span></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Site</th><th>Display name</th><th>Region</th><th>Country</th><th>Active drivers</th><th>Status</th><th /></tr></thead><tbody>
        {hierarchy.map((row)=>{
          const draft=siteDrafts[row.site]||{};
          return <tr key={row.site}>
            <td><b>{row.site}</b></td>
            <td><input disabled={!canManageHierarchy} value={draft.displayName||""} onChange={(e)=>updateSiteDraft(row.site,"displayName",e.target.value)} placeholder={row.site+" operations"}/></td>
            <td><input disabled={!canManageHierarchy} value={draft.region||""} onChange={(e)=>updateSiteDraft(row.site,"region",e.target.value)} placeholder="Region"/></td>
            <td><input disabled={!canManageHierarchy} value={draft.country||""} onChange={(e)=>updateSiteDraft(row.site,"country",e.target.value)} placeholder="United Kingdom"/></td>
            <td>{row.driver_count||0}</td>
            <td><select disabled={!canManageHierarchy} value={draft.active===false?"inactive":"active"} onChange={(e)=>updateSiteDraft(row.site,"active",e.target.value==="active")}><option value="active">Active</option><option value="inactive">Inactive</option></select></td>
            <td><button className="btn ghost compact" disabled={!canManageHierarchy||busy==="site-"+row.site} onClick={()=>saveSite(row.site)}>Save</button></td>
          </tr>;
        })}
      </tbody></table></div>
    </section>}

    {tab==="policies"&&<div className="enterprisev7-policy-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>Policy inheritance</h2><p>Site override → organisation policy → MetrixIQ default target.</p></div></div>
        <div className="enterprisev7-policy-grid">
          {POLICY_METRICS.map((metric)=>{
            const orgPolicy=policyMap.get("*|"+metric.key);
            const resolved=resolvePerformancePolicy(metric.key,data.policies||[],null);
            return <article key={metric.key}>
              <div><b>{metric.label}</b><small>{metric.key}</small></div>
              <strong>{fmtTarget(resolved?.target,metric.unit)}</strong>
              <span className={orgPolicy?"custom":"default"}>{orgPolicy?"Custom":"Default"}</span>
              <small>{resolved?.direction==="lte"?"Lower is better":"Higher is better"}</small>
            </article>;
          })}
        </div>
      </section>

      <section className="panel enterprisev7-policy-editor">
        <div className="panel-head"><div><h2>Create / update policy</h2><p>Choose All sites for an organisation default or a site for a local override.</p></div></div>
        <label><span>Scope</span><select disabled={!canManagePolicy} value={policyDraft.site} onChange={(e)=>setPolicyDraft((x)=>({...x,site:e.target.value}))}><option value="">All sites</option>{hierarchy.map((x)=><option key={x.site} value={x.site}>{x.site}</option>)}</select></label>
        <label><span>Metric</span><select disabled={!canManagePolicy} value={policyDraft.metric} onChange={(e)=>chooseMetric(e.target.value)}>{POLICY_METRICS.map((x)=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
        <div className="enterprisev7-policy-fields">
          <label><span>Target</span><input type="number" step="0.01" disabled={!canManagePolicy} value={policyDraft.target} onChange={(e)=>setPolicyDraft((x)=>({...x,target:e.target.value}))}/></label>
          <label><span>Direction</span><select disabled={!canManagePolicy} value={policyDraft.direction} onChange={(e)=>setPolicyDraft((x)=>({...x,direction:e.target.value}))}><option value="gte">≥ target</option><option value="lte">≤ target</option></select></label>
          <label><span>Warning margin</span><input type="number" step="0.01" disabled={!canManagePolicy} value={policyDraft.warningMargin} onChange={(e)=>setPolicyDraft((x)=>({...x,warningMargin:e.target.value}))}/></label>
          <label><span>Unit</span><select disabled={!canManagePolicy} value={policyDraft.unit} onChange={(e)=>setPolicyDraft((x)=>({...x,unit:e.target.value}))}><option value="percent">Percent</option><option value="score">Score</option><option value="dpmo">DPMO</option><option value="count">Count</option></select></label>
        </div>
        <button className="btn primary" disabled={!canManagePolicy||busy==="policy"||policyDraft.target===""} onClick={savePolicy}>Save KPI policy</button>
      </section>

      <section className="panel enterprisev7-overrides">
        <div className="panel-head"><div><h2>Active custom policies</h2><p>Explicit organisation and site overrides.</p></div><span className="panel-badge">{data.policies?.length||0}</span></div>
        <div>{(data.policies||[]).map((policy)=><div key={policy.id}><span>{policy.site||"ALL"}</span><p><b>{POLICY_METRICS.find((x)=>x.key===policy.metric)?.label||policy.metric}</b><small>{policy.direction==="lte"?"≤":"≥"} {fmtTarget(policy.target,policy.unit)} · warning {policy.warning_margin}</small></p><button disabled={!canManagePolicy||busy==="delete-"+policy.id} onClick={()=>removePolicy(policy)}>Remove</button></div>)}{!data.policies?.length&&<div className="enterprisev7-empty compact">No custom KPI policies. MetrixIQ defaults are active.</div>}</div>
      </section>
    </div>}

    {tab==="branding"&&<div className="enterprisev7-brand-layout">
      <section className="panel enterprisev7-brand-form">
        <div className="panel-head"><div><h2>Workspace identity</h2><p>Branding applies only inside this organisation workspace.</p></div></div>
        <label><span>Brand / company name</span><input disabled={!canManageBranding} value={branding.brandName} onChange={(e)=>setBranding((x)=>({...x,brandName:e.target.value}))} placeholder={organization?.name||"Company name"}/></label>
        <div><label><span>Accent</span><input type="color" disabled={!canManageBranding} value={branding.accentColor} onChange={(e)=>setBranding((x)=>({...x,accentColor:e.target.value.toUpperCase()}))}/></label><label><span>Secondary</span><input type="color" disabled={!canManageBranding} value={branding.secondaryColor} onChange={(e)=>setBranding((x)=>({...x,secondaryColor:e.target.value.toUpperCase()}))}/></label></div>
        <label><span>Logo URL (HTTPS)</span><input disabled={!canManageBranding} value={branding.logoUrl} onChange={(e)=>setBranding((x)=>({...x,logoUrl:e.target.value}))} placeholder="https://…"/></label>
        <label><span>Footer text</span><input disabled={!canManageBranding} value={branding.footerText} onChange={(e)=>setBranding((x)=>({...x,footerText:e.target.value}))} placeholder="Powered by your operations team"/></label>
        <label className="enterprisev7-checkbox"><input type="checkbox" disabled={!canManageBranding} checked={branding.showMetrixiqBrand} onChange={(e)=>setBranding((x)=>({...x,showMetrixiqBrand:e.target.checked}))}/><span>Show “Powered by MetrixIQ”</span></label>
        <button className="btn primary" disabled={!canManageBranding||busy==="branding"} onClick={saveBranding}>Save branding</button>
      </section>

      <section className="panel enterprisev7-brand-preview" style={{"--brand-accent":branding.accentColor,"--brand-secondary":branding.secondaryColor}}>
        <span className="page-kicker">LIVE PREVIEW</span>
        <div className="enterprisev7-preview-shell">
          <header><Brand inverse branding={{brand_name:branding.brandName,accent_color:branding.accentColor,secondary_color:branding.secondaryColor,logo_url:branding.logoUrl,show_metrixiq_brand:branding.showMetrixiqBrand}}/></header>
          <section><span>ENTERPRISE OPERATIONS</span><h2>{branding.brandName||organization?.name||"Your organisation"}</h2><p>Custom workspace branding while MetrixIQ continues to provide the analytics engine underneath.</p><button>Management Dashboard</button></section>
          <footer>{branding.footerText||"Enterprise operations intelligence"}{branding.showMetrixiqBrand?" · Powered by MetrixIQ":""}</footer>
        </div>
      </section>
    </div>}
  </div>;
}
