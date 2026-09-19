"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import {
  createApiKey,
  deleteDeliveryConnection,
  deleteWebhookEndpoint,
  fetchIntegrationV9Data,
  queueWebhookTest,
  revokeApiKey,
  saveDeliveryConnection,
  saveWebhookEndpoint,
  testDeliveryConnection,
} from "../../lib/data/integrationV9";

const API_SCOPES=[
  ["drivers:read","Drivers read"],
  ["scorecards:read","Scorecards read"],
  ["workflows:read","Workflows read"],
  ["reports:read","Reports read"],
  ["bi:read","BI export"],
  ["imports:write","Import Gateway write"],
];

const WEBHOOK_EVENTS=[
  "webhook.test","scorecard.updated","workflow.created","workflow.completed",
  "coaching.closed","incident.created","incident.closed","sla.breached","import.completed",
];

const PROVIDERS={
  resend:{label:"Resend Email",channel:"email_digest"},
  whatsapp_cloud:{label:"WhatsApp Cloud",channel:"whatsapp_summary"},
  slack_webhook:{label:"Slack Incoming Webhook",channel:"slack"},
  teams_webhook:{label:"Microsoft Teams Webhook",channel:"teams"},
  generic_webhook:{label:"Generic Delivery Webhook",channel:"webhook"},
};

function dateTime(value){
  if(!value)return"—";
  const d=new Date(value);
  return Number.isFinite(d.getTime())?d.toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):String(value);
}

function bytes(value){
  const n=Number(value||0);
  if(n<1024)return n+" B";
  if(n<1024*1024)return(n/1024).toFixed(1)+" KB";
  return(n/1024/1024).toFixed(1)+" MB";
}

function statusClass(value){
  return ["healthy","active","succeeded","sent"].includes(value)?"good":
    ["warning","retrying","pending","processing","configured"].includes(value)?"warn":
    ["error","dead_letter","failed","revoked"].includes(value)?"bad":"neutral";
}

export default function IntegrationDeliveryCenter({
  organizationId,
  canManageApi=false,
  canManageWebhooks=false,
  canManageDelivery=false,
}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [tab,setTab]=useState("api");
  const [busy,setBusy]=useState("");
  const [revealed,setRevealed]=useState(null);

  const [keyDraft,setKeyDraft]=useState({
    name:"Production API",scopes:["drivers:read","scorecards:read","bi:read"],rateLimit:300,expiryDays:365,
  });
  const [webhookDraft,setWebhookDraft]=useState({
    name:"Operations webhook",url:"",events:["webhook.test","workflow.created","sla.breached"],enabled:true,
  });
  const [connectionDraft,setConnectionDraft]=useState({
    name:"",provider:"slack_webhook",apiKey:"",from:"",recipients:"",webhookUrl:"",
    accessToken:"",phoneNumberId:"",genericUrl:"",genericSecret:"",
  });

  async function load(){
    if(!organizationId)return;
    setLoading(true);setError("");
    try{setData(await fetchIntegrationV9Data(getSupabaseBrowserClient(),organizationId));}
    catch(e){setError(e?.message||"Could not load Integration & Delivery Platform.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[organizationId]);

  const health=data?.health||{};
  const usageTotal=useMemo(()=>(data?.usage||[]).reduce((sum,row)=>sum+Number(row.request_count||0),0),[data?.usage]);
  const usageErrors=useMemo(()=>(data?.usage||[]).reduce((sum,row)=>sum+Number(row.error_count||0),0),[data?.usage]);
  const usageBytes=useMemo(()=>(data?.usage||[]).reduce((sum,row)=>sum+Number(row.bytes_out||0),0),[data?.usage]);
  const usageMax=Math.max(1,...(data?.usage||[]).map((row)=>Number(row.request_count||0)));

  async function run(key,fn,success){
    setBusy(key);setError("");setNotice("");
    try{const result=await fn();if(success)setNotice(success);await load();return result;}
    catch(e){setError(e?.message||"Action failed.");return null;}
    finally{setBusy("");}
  }

  function toggleScope(scope){
    setKeyDraft((current)=>({
      ...current,
      scopes:current.scopes.includes(scope)?current.scopes.filter((x)=>x!==scope):[...current.scopes,scope],
    }));
  }

  async function generateKey(){
    if(!canManageApi||!keyDraft.name.trim()||!keyDraft.scopes.length)return;
    const expiresAt=keyDraft.expiryDays?new Date(Date.now()+Number(keyDraft.expiryDays)*86400000).toISOString():null;
    const result=await run("api-create",()=>createApiKey(getSupabaseBrowserClient(),{
      organizationId,name:keyDraft.name.trim(),scopes:keyDraft.scopes,
      rateLimitPerHour:Number(keyDraft.rateLimit),expiresAt,
    }),"API key created.");
    if(result?.api_key)setRevealed({type:"api",title:"API key",value:result.api_key,detail:"Copy this key now. MetrixIQ stores only its SHA-256 hash."});
  }

  function toggleEvent(event){
    setWebhookDraft((current)=>({
      ...current,
      events:current.events.includes(event)?current.events.filter((x)=>x!==event):[...current.events,event],
    }));
  }

  async function createWebhook(){
    if(!canManageWebhooks||!webhookDraft.name.trim()||!webhookDraft.url||!webhookDraft.events.length)return;
    const result=await run("webhook-create",()=>saveWebhookEndpoint(getSupabaseBrowserClient(),{
      organizationId,name:webhookDraft.name.trim(),url:webhookDraft.url,
      eventTypes:webhookDraft.events,enabled:webhookDraft.enabled,
    }),"Webhook endpoint created.");
    if(result?.signing_secret)setRevealed({type:"secret",title:"Webhook signing secret",value:result.signing_secret,detail:"Use this secret to verify x-metrixiq-signature. It is shown only once."});
    if(result)setWebhookDraft((x)=>({...x,name:"Operations webhook",url:""}));
  }

  function connectionConfig(){
    const d=connectionDraft;
    if(d.provider==="resend")return{api_key:d.apiKey,from:d.from,to:d.recipients.split(",").map((x)=>x.trim()).filter(Boolean)};
    if(d.provider==="whatsapp_cloud")return{access_token:d.accessToken,phone_number_id:d.phoneNumberId,recipients:d.recipients.split(",").map((x)=>x.trim()).filter(Boolean)};
    if(d.provider==="slack_webhook"||d.provider==="teams_webhook")return{webhook_url:d.webhookUrl};
    return{url:d.genericUrl,secret:d.genericSecret||undefined};
  }

  async function createConnection(){
    const provider=PROVIDERS[connectionDraft.provider];
    if(!canManageDelivery||!connectionDraft.name.trim()||!provider)return;
    const result=await run("connection-create",()=>saveDeliveryConnection(getSupabaseBrowserClient(),{
      organizationId,name:connectionDraft.name.trim(),channel:provider.channel,
      provider:connectionDraft.provider,config:connectionConfig(),enabled:true,
    }),"Delivery connection saved.");
    if(result)setConnectionDraft((x)=>({...x,name:"",apiKey:"",from:"",recipients:"",webhookUrl:"",accessToken:"",phoneNumberId:"",genericUrl:"",genericSecret:""}));
  }

  if(loading)return <section className="panel integ9-empty"><div className="auth-spinner"/><b>Loading Integration & Delivery V9…</b></section>;

  return <div className="integ9-root">
    <div className="integ9-heading">
      <div><span className="page-kicker">INTEGRATION & DELIVERY PLATFORM V9</span><h1>API, Webhooks & External Delivery</h1><p>Server-side integrations with scoped API keys, metering, signed webhooks, retry/dead-letter handling and encrypted provider credentials.</p></div>
      <button className="btn ghost" onClick={load}>Refresh</button>
    </div>

    {error&&<div className="mgrv2-notice error">{error}</div>}
    {notice&&<div className="mgrv2-notice good">{notice}</div>}

    <section className="integ9-kpis">
      <article><span>Active API keys</span><strong>{health.active_api_keys||0}</strong><small>{health.api_requests_24h||0} requests / 24h</small></article>
      <article className={Number(health.webhook_dead_letter||0)?"bad":Number(health.webhook_pending||0)?"warn":""}><span>Webhook queue</span><strong>{health.webhook_pending||0}</strong><small>{health.webhook_dead_letter||0} dead-letter</small></article>
      <article><span>Delivery connections</span><strong>{health.active_delivery_connections||0}</strong><small>Encrypted server-side configs</small></article>
      <article className={Number(health.delivery_dead_letter||0)?"bad":Number(health.delivery_pending||0)?"warn":""}><span>Delivery queue</span><strong>{health.delivery_pending||0}</strong><small>{health.delivery_dead_letter||0} dead-letter</small></article>
      <article><span>API volume</span><strong>{usageTotal}</strong><small>{bytes(usageBytes)} · {usageErrors} errors / 7d</small></article>
    </section>

    <div className="integ9-tabs">
      {[["api","API Keys"],["webhooks","Webhooks"],["delivery","Delivery Connections"],["health","Usage & Health"],["docs","API Docs"]].map(([id,label])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
    </div>

    {tab==="api"&&<div className="integ9-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>Developer API Keys</h2><p>Keys are stored only as SHA-256 hashes. Raw credentials are displayed once.</p></div><span className="panel-badge">{data?.apiKeys?.length||0}</span></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Rate limit</th><th>Last used</th><th>Expires</th><th>Status</th><th /></tr></thead><tbody>
          {(data?.apiKeys||[]).map((key)=><tr key={key.id}><td><b>{key.name}</b><small className="history-date">{key.created_by_name||"Team member"} · {dateTime(key.created_at)}</small></td><td><code>{key.key_prefix}…</code></td><td><div className="integ9-tags">{(key.scopes||[]).map((s)=><span key={s}>{s}</span>)}</div></td><td>{key.rate_limit_per_hour}/h</td><td>{dateTime(key.last_used_at)}</td><td>{dateTime(key.expires_at)}</td><td><span className={"integ9-status "+statusClass(key.status)}>{key.status}</span></td><td>{key.status==="active"&&<button className="btn ghost compact" disabled={!canManageApi||!!busy} onClick={()=>run("revoke-"+key.id,()=>revokeApiKey(getSupabaseBrowserClient(),key.id),"API key revoked.")}>Revoke</button>}</td></tr>)}
        </tbody></table></div>
      </section>

      <aside className="panel integ9-editor">
        <div className="panel-head"><div><h2>Create API key</h2><p>Owner/Admin only. Use the smallest scope set required by the integration.</p></div></div>
        <label><span>Name</span><input disabled={!canManageApi} value={keyDraft.name} onChange={(e)=>setKeyDraft((x)=>({...x,name:e.target.value}))}/></label>
        <div className="integ9-scope-list">{API_SCOPES.map(([scope,label])=><label key={scope}><input type="checkbox" disabled={!canManageApi} checked={keyDraft.scopes.includes(scope)} onChange={()=>toggleScope(scope)}/><span><b>{label}</b><small>{scope}</small></span></label>)}</div>
        <div className="integ9-editor-two"><label><span>Rate limit / hour</span><input type="number" min="10" max="5000" disabled={!canManageApi} value={keyDraft.rateLimit} onChange={(e)=>setKeyDraft((x)=>({...x,rateLimit:e.target.value}))}/></label><label><span>Expiry</span><select disabled={!canManageApi} value={keyDraft.expiryDays} onChange={(e)=>setKeyDraft((x)=>({...x,expiryDays:Number(e.target.value)}))}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="0">No expiry</option></select></label></div>
        <button className="btn primary" disabled={!canManageApi||busy==="api-create"||!keyDraft.scopes.length} onClick={generateKey}>Generate API key</button>
      </aside>
    </div>}

    {tab==="webhooks"&&<div className="integ9-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>Signed Outgoing Webhooks</h2><p>Events are HMAC-SHA256 signed, retried with backoff and moved to dead-letter after repeated failure.</p></div><button className="btn ghost compact" disabled={!canManageWebhooks||!!busy} onClick={()=>run("webhook-test",()=>queueWebhookTest(getSupabaseBrowserClient(),organizationId),"Webhook test event queued.")}>Queue test event</button></div>
        <div className="integ9-card-list">{(data?.webhooks||[]).map((item)=><article key={item.id}>
          <div><span className={"integ9-dot "+(item.enabled?"good":"neutral")}/><p><b>{item.name}</b><small>{item.url}</small></p></div>
          <div className="integ9-tags">{(item.event_types||[]).map((e)=><span key={e}>{e}</span>)}</div>
          <footer><span className={"integ9-status "+(item.failure_count?"bad":"good")}>{item.failure_count?item.failure_count+" failures":"healthy"}</span><small>last success {dateTime(item.last_success_at)}</small><button disabled={!canManageWebhooks||!!busy} onClick={()=>run("delete-webhook-"+item.id,()=>deleteWebhookEndpoint(getSupabaseBrowserClient(),item.id),"Webhook deleted.")}>Delete</button></footer>
        </article>)}</div>

        <div className="integ9-subtable">
          <h3>Recent deliveries</h3>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Created</th><th>Endpoint</th><th>Event</th><th>Status</th><th>Attempts</th><th>HTTP</th><th>Error</th></tr></thead><tbody>{(data?.webhookDeliveries||[]).slice(0,100).map((d)=><tr key={d.id}><td>{dateTime(d.created_at)}</td><td>{d.endpoint_name}</td><td>{d.event_type}</td><td><span className={"integ9-status "+statusClass(d.status)}>{d.status}</span></td><td>{d.attempt_count}</td><td>{d.response_status||"—"}</td><td>{d.last_error||"—"}</td></tr>)}</tbody></table></div>
        </div>
      </section>

      <aside className="panel integ9-editor">
        <div className="panel-head"><div><h2>Add webhook</h2><p>Signing secret is generated server-side and shown once.</p></div></div>
        <label><span>Name</span><input disabled={!canManageWebhooks} value={webhookDraft.name} onChange={(e)=>setWebhookDraft((x)=>({...x,name:e.target.value}))}/></label>
        <label><span>HTTPS endpoint</span><input disabled={!canManageWebhooks} value={webhookDraft.url} onChange={(e)=>setWebhookDraft((x)=>({...x,url:e.target.value}))} placeholder="https://example.com/metrixiq"/></label>
        <div className="integ9-event-list">{WEBHOOK_EVENTS.map((event)=><label key={event}><input type="checkbox" disabled={!canManageWebhooks} checked={webhookDraft.events.includes(event)} onChange={()=>toggleEvent(event)}/><span>{event}</span></label>)}</div>
        <button className="btn primary" disabled={!canManageWebhooks||busy==="webhook-create"||!webhookDraft.url||!webhookDraft.events.length} onClick={createWebhook}>Create webhook</button>
      </aside>
    </div>}

    {tab==="delivery"&&<div className="integ9-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>External Delivery Connections</h2><p>Email, Slack, Teams, WhatsApp Cloud and generic delivery webhooks. Secrets remain encrypted at rest.</p></div><span className="panel-badge">{data?.connections?.length||0}</span></div>
        <div className="integ9-card-list">{(data?.connections||[]).map((item)=><article key={item.id}>
          <div><span className={"integ9-dot "+statusClass(item.status)}/><p><b>{item.name}</b><small>{PROVIDERS[item.provider]?.label||item.provider} · {item.channel}</small></p></div>
          <footer><span className={"integ9-status "+statusClass(item.status)}>{item.status}</span><small>tested {dateTime(item.last_tested_at)}</small><button disabled={!canManageDelivery||!!busy} onClick={()=>run("test-"+item.id,()=>testDeliveryConnection(getSupabaseBrowserClient(),organizationId,item.id),"Connection test completed.")}>Test</button><button disabled={!canManageDelivery||!!busy} onClick={()=>run("delete-connection-"+item.id,()=>deleteDeliveryConnection(getSupabaseBrowserClient(),item.id),"Connection deleted.")}>Delete</button></footer>
          {item.last_error&&<em>{item.last_error}</em>}
        </article>)}</div>
      </section>

      <aside className="panel integ9-editor">
        <div className="panel-head"><div><h2>Add delivery connection</h2><p>Credentials are encrypted by the V9 server layer before persistence.</p></div></div>
        <label><span>Name</span><input disabled={!canManageDelivery} value={connectionDraft.name} onChange={(e)=>setConnectionDraft((x)=>({...x,name:e.target.value}))} placeholder="Ops Slack / Manager email…"/></label>
        <label><span>Provider</span><select disabled={!canManageDelivery} value={connectionDraft.provider} onChange={(e)=>setConnectionDraft((x)=>({...x,provider:e.target.value}))}>{Object.entries(PROVIDERS).map(([key,p])=><option key={key} value={key}>{p.label}</option>)}</select></label>

        {connectionDraft.provider==="resend"&&<>
          <label><span>Resend API key</span><input type="password" disabled={!canManageDelivery} value={connectionDraft.apiKey} onChange={(e)=>setConnectionDraft((x)=>({...x,apiKey:e.target.value}))}/></label>
          <label><span>From</span><input disabled={!canManageDelivery} value={connectionDraft.from} onChange={(e)=>setConnectionDraft((x)=>({...x,from:e.target.value}))} placeholder="MetrixIQ <ops@example.com>"/></label>
          <label><span>Recipients</span><input disabled={!canManageDelivery} value={connectionDraft.recipients} onChange={(e)=>setConnectionDraft((x)=>({...x,recipients:e.target.value}))} placeholder="manager@example.com, owner@example.com"/></label>
        </>}

        {(connectionDraft.provider==="slack_webhook"||connectionDraft.provider==="teams_webhook")&&<label><span>Webhook URL</span><input type="password" disabled={!canManageDelivery} value={connectionDraft.webhookUrl} onChange={(e)=>setConnectionDraft((x)=>({...x,webhookUrl:e.target.value}))} placeholder="https://…"/></label>}

        {connectionDraft.provider==="whatsapp_cloud"&&<>
          <label><span>Access token</span><input type="password" disabled={!canManageDelivery} value={connectionDraft.accessToken} onChange={(e)=>setConnectionDraft((x)=>({...x,accessToken:e.target.value}))}/></label>
          <label><span>Phone number ID</span><input disabled={!canManageDelivery} value={connectionDraft.phoneNumberId} onChange={(e)=>setConnectionDraft((x)=>({...x,phoneNumberId:e.target.value}))}/></label>
          <label><span>Recipients</span><input disabled={!canManageDelivery} value={connectionDraft.recipients} onChange={(e)=>setConnectionDraft((x)=>({...x,recipients:e.target.value}))} placeholder="447… , 447…"/></label>
        </>}

        {connectionDraft.provider==="generic_webhook"&&<>
          <label><span>HTTPS URL</span><input disabled={!canManageDelivery} value={connectionDraft.genericUrl} onChange={(e)=>setConnectionDraft((x)=>({...x,genericUrl:e.target.value}))}/></label>
          <label><span>Optional HMAC secret</span><input type="password" disabled={!canManageDelivery} value={connectionDraft.genericSecret} onChange={(e)=>setConnectionDraft((x)=>({...x,genericSecret:e.target.value}))}/></label>
        </>}

        <button className="btn primary" disabled={!canManageDelivery||busy==="connection-create"||!connectionDraft.name.trim()} onClick={createConnection}>Save encrypted connection</button>
      </aside>
    </div>}

    {tab==="health"&&<div className="integ9-health-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>API Usage Metering</h2><p>Hourly requests, errors and response volume for the last seven days.</p></div></div>
        <div className="integ9-usage-chart">{(data?.usage||[]).slice(-72).map((row)=><div key={row.bucket_start} title={dateTime(row.bucket_start)+" · "+row.request_count+" requests"}><span style={{height:Math.max(3,Math.round((Number(row.request_count||0)/usageMax)*100))+"%"}}/><small>{new Date(row.bucket_start).getHours()}</small></div>)}{!data?.usage?.length&&<div className="integ9-empty">No API usage recorded yet.</div>}</div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Integration Health V2</h2><p>Queues and last-success timestamps from the server delivery layer.</p></div></div>
        <div className="integ9-health-grid">
          <div><span>Last API request</span><b>{dateTime(health.last_api_request_at)}</b></div>
          <div><span>Last webhook success</span><b>{dateTime(health.last_webhook_success_at)}</b></div>
          <div><span>Last external delivery</span><b>{dateTime(health.last_delivery_success_at)}</b></div>
          <div><span>Webhook dead-letter</span><b>{health.webhook_dead_letter||0}</b></div>
          <div><span>Delivery dead-letter</span><b>{health.delivery_dead_letter||0}</b></div>
          <div><span>Pending external work</span><b>{Number(health.webhook_pending||0)+Number(health.delivery_pending||0)}</b></div>
        </div>
      </section>
    </div>}

    {tab==="docs"&&<section className="panel integ9-docs">
      <div className="panel-head"><div><h2>MetrixIQ REST API v1</h2><p>Use <code>Authorization: Bearer miq_live_…</code>. Every key is tenant-scoped and rate-limited.</p></div></div>
      <div className="integ9-doc-grid">
        <article><span>GET</span><code>/api/v1/drivers</code><p>Driver directory. Filters: <code>site</code>, <code>status</code>, <code>limit</code>, <code>offset</code>.</p></article>
        <article><span>GET</span><code>/api/v1/scorecards</code><p>Driver scorecards using the exact point-band Total Score formula. Filters: <code>week</code>, <code>site</code>.</p></article>
        <article><span>GET</span><code>/api/v1/workflows</code><p>Workflow/playbook register. Optional <code>status</code>.</p></article>
        <article><span>GET</span><code>/api/v1/reports</code><p>Saved Executive Report snapshots. Optional <code>week</code>, <code>site</code>.</p></article>
        <article><span>GET</span><code>/api/v1/bi?format=csv</code><p>Flat Power BI-friendly driver performance export. JSON is the default.</p></article>
        <article><span>POST</span><code>/api/v1/import</code><p>Multipart Import Gateway for CSV, XLSX and JSON. Scope: <code>imports:write</code>.</p></article>
      </div>
      <div className="integ9-signature"><h3>Webhook verification</h3><p>Compute HMAC-SHA256 over <code>timestamp + "." + rawBody</code> using the one-time signing secret, then compare with <code>x-metrixiq-signature: v1=…</code>.</p></div>
    </section>}

    {revealed&&<div className="gov-modal" onClick={()=>setRevealed(null)}><div className="integ9-secret-modal" onClick={(e)=>e.stopPropagation()}><header><div><span>SHOW ONCE</span><h2>{revealed.title}</h2></div><button onClick={()=>setRevealed(null)}>×</button></header><section><p>{revealed.detail}</p><code>{revealed.value}</code><button className="btn primary" onClick={async()=>{await navigator.clipboard.writeText(revealed.value);setNotice(revealed.title+" copied to clipboard.");}}>Copy to clipboard</button></section></div></div>}
  </div>;
}
