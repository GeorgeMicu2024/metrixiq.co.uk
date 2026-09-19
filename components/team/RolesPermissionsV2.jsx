"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { updateTeamMember } from "../../lib/data/team";
import { fetchPermissionWorkspace, updatePermissionOverrides } from "../../lib/data/governanceV2";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, ROLE_DEFAULTS, effectivePermissions, explicitOverrides, normalizeRole } from "../../lib/governance/permissions";

function scopeText(scope){return (scope||[]).length?(scope||[]).join(", "):"All sites";}

export default function RolesPermissionsV2({ organizationId, workspaceRole, platformAdmin=false }) {
  const [members,setMembers]=useState([]);
  const [selectedId,setSelectedId]=useState("");
  const [draft,setDraft]=useState({});
  const [roleDraft,setRoleDraft]=useState("");
  const [sitesDraft,setSitesDraft]=useState("");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const canEdit=platformAdmin||["owner","admin"].includes(String(workspaceRole||"").toLowerCase());

  async function load(){
    if(!organizationId)return;
    setError("");
    try{
      const data=await fetchPermissionWorkspace(getSupabaseBrowserClient(),organizationId);
      setMembers(data.members);
      setSelectedId((current)=>current&&data.members.some((m)=>m.user_id===current)?current:(data.members[0]?.user_id||""));
    }catch(e){setError(e?.message||"Could not load roles and permissions.");}
  }
  useEffect(()=>{load();},[organizationId]);

  const selected=members.find((m)=>m.user_id===selectedId)||null;
  useEffect(()=>{
    if(!selected)return;
    setDraft(selected.permission_overrides||{});
    setRoleDraft(selected.role);
    setSitesDraft(scopeText(selected.site_scope)==="All sites"?"":scopeText(selected.site_scope));
  },[selectedId,selected?.updated_at,selected?.role]);

  const effective=useMemo(()=>selected?effectivePermissions(roleDraft||selected.role,draft):{},[selected,roleDraft,draft]);
  const explicit=useMemo(()=>selected?explicitOverrides(roleDraft||selected.role,draft):{},[selected,roleDraft,draft]);

  function stateFor(key){
    if(Object.prototype.hasOwnProperty.call(draft,key)) return draft[key]?"allow":"deny";
    return "inherit";
  }
  function setPermission(key,value){
    setDraft((current)=>{
      const next={...current};
      if(value==="inherit")delete next[key]; else next[key]=value==="allow";
      return next;
    });
  }

  async function save(){
    if(!selected||!canEdit)return;
    setBusy("save");setError("");setNotice("");
    try{
      if(!["owner","admin"].includes(selected.role)){
        await updateTeamMember(getSupabaseBrowserClient(),{
          organizationId,userId:selected.user_id,role:roleDraft,
          siteScope:sitesDraft.split(",").map((x)=>x.trim().toUpperCase()).filter(Boolean),
        });
      }
      await updatePermissionOverrides(getSupabaseBrowserClient(),organizationId,selected.user_id,explicit);
      setNotice("Role, site scope and permission overrides saved.");
      await load();
    }catch(e){setError(e?.message||"Could not save permissions.");}finally{setBusy("");}
  }

  return <div className="permv2-root">
    <div className="gov-heading"><div><span className="page-kicker">ROLES & PERMISSIONS V2</span><h1>Workspace Access Control</h1><p>Role defaults, site scope and explicit permission overrides for every team member.</p></div></div>
    {error&&<div className="gov-notice error">{error}</div>}{notice&&<div className="gov-notice">{notice}</div>}
    <section className="permv2-kpis"><article><span>Members</span><strong>{members.length}</strong><small>Workspace users</small></article><article><span>Your role</span><strong>{workspaceRole||"—"}</strong><small>{canEdit?"Permission admin":"Read-only access"}</small></article><article><span>Fine-grained controls</span><strong>{ALL_PERMISSIONS.length}</strong><small>Permission keys</small></article><article><span>Site-scoped members</span><strong>{members.filter((m)=>(m.site_scope||[]).length).length}</strong><small>Restricted by site</small></article></section>
    <div className="permv2-layout">
      <section className="panel permv2-members"><div className="panel-head"><div><h2>Team members</h2><p>Select a member to inspect effective access.</p></div></div><div>
        {members.map((member)=><button key={member.user_id} className={selectedId===member.user_id?"active":""} onClick={()=>setSelectedId(member.user_id)}><span>{String(member.full_name||member.email||"?").split(/\s+/).slice(0,2).map((x)=>x[0]).join("").toUpperCase()}</span><div><b>{member.full_name||"Unnamed user"}</b><small>{member.email||"No email"} · {member.role}</small></div><em>{(member.site_scope||[]).length?`${member.site_scope.length} sites`:"All sites"}</em></button>)}
      </div></section>
      <section className="panel permv2-detail">
        {!selected?<div className="gov-empty">Select a team member.</div>:<>
          <div className="panel-head"><div><h2>{selected.full_name||selected.email}</h2><p>Role defaults + explicit overrides = effective permissions.</p></div><span className="panel-badge">{Object.keys(explicit).length} overrides</span></div>
          <div className="permv2-base">
            <label><span>Role</span><select value={roleDraft} disabled={!canEdit||["owner","admin"].includes(selected.role)} onChange={(e)=>{setRoleDraft(e.target.value);setDraft({});}}>{["manager","dispatcher","viewer"].map((r)=><option key={r} value={r}>{r}</option>)}{["owner","admin"].includes(selected.role)&&<option value={selected.role}>{selected.role}</option>}</select></label>
            <label><span>Site scope</span><input value={sitesDraft} disabled={!canEdit||["owner","admin"].includes(selected.role)} onChange={(e)=>setSitesDraft(e.target.value)} placeholder="Blank = all sites; DLS2, DXM3"/></label>
            <div><span>Effective access</span><b>{Object.values(effective).filter(Boolean).length}/{ALL_PERMISSIONS.length} permissions</b><small>{scopeText(selected.site_scope)}</small></div>
          </div>
          <div className="permv2-groups">
            {PERMISSION_GROUPS.map((group)=><section key={group.label}><h3>{group.label}</h3>{group.permissions.map(([key,label])=><div key={key}><div><b>{label}</b><small>{key}</small></div><span className={effective[key]?"on":"off"}>{effective[key]?"Allowed":"Denied"}</span><select value={stateFor(key)} disabled={!canEdit||["owner","admin"].includes(selected.role)} onChange={(e)=>setPermission(key,e.target.value)}><option value="inherit">Inherit ({ROLE_DEFAULTS[normalizeRole(roleDraft)]?.[key]?"Allow":"Deny"})</option><option value="allow">Explicit allow</option><option value="deny">Explicit deny</option></select></div>)}</section>)}
          </div>
          <div className="permv2-actions"><button className="btn ghost" disabled={!canEdit} onClick={()=>setDraft({})}>Reset overrides</button><button className="btn primary" disabled={!canEdit||busy==="save"} onClick={save}>{busy==="save"?"Saving…":"Save access policy"}</button></div>
        </>}
      </section>
    </div>
  </div>;
}
