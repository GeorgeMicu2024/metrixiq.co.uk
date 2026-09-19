"use client";

const PLAN_LABELS = {
  free: "Free",
  pro: "Starter",
  business: "Professional",
  full: "Business",
  suspended: "Suspended",
};

export function rowFromRpc(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

export function planLabel(plan) {
  return PLAN_LABELS[String(plan || "free").toLowerCase()] || "Free";
}

export function dateLabel(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTimeLabel(value) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysLeft(value) {
  if (!value) return 0;
  const end = new Date(value).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

export function SaasStyles() {
  return (
    <style jsx global>{`
      .saas-fullscreen{
        min-height:100vh;
        display:grid;
        place-items:center;
        padding:28px;
        background:
          radial-gradient(circle at 10% 10%,rgba(44,151,126,.13),transparent 34%),
          radial-gradient(circle at 90% 10%,rgba(55,102,160,.10),transparent 34%),
          #f4f7f8;
        color:#223548;
      }
      .saas-onboarding,.saas-suspended{
        width:min(980px,100%);
        padding:30px;
        border:1px solid #dce5e9;
        border-radius:20px;
        background:#fff;
        box-shadow:0 18px 55px rgba(29,48,66,.10);
      }
      .saas-suspended{max-width:580px;text-align:center}
      .saas-suspended h1{margin:7px 0 10px;font-size:30px}
      .saas-suspended p{color:#71808e;line-height:1.6}
      .saas-onboarding-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:24px;
        margin-bottom:24px;
      }
      .saas-kicker{
        display:block;
        color:#4b9384;
        font-size:9px;
        font-weight:950;
        letter-spacing:.12em;
      }
      .saas-onboarding h1{margin:7px 0 6px;font-size:31px;letter-spacing:-.025em}
      .saas-onboarding-head p{max-width:650px;margin:0;color:#758391;line-height:1.55;font-size:12px}
      .saas-link{border:0;background:transparent;color:#667887;font-size:10px;font-weight:800;cursor:pointer}
      .saas-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .saas-choice{
        position:relative;
        padding:22px;
        border:1px solid #dfe7eb;
        border-radius:15px;
        background:#fff;
      }
      .saas-choice.featured{
        border-color:#9dcec1;
        background:linear-gradient(180deg,#f8fcfb 0%,#fff 100%);
        box-shadow:0 9px 30px rgba(53,124,105,.08);
      }
      .saas-plan-badge,.saas-recommended{
        display:inline-flex;
        padding:5px 8px;
        border-radius:999px;
        background:#eef2f4;
        color:#62727f;
        font-size:7px;
        font-weight:950;
        letter-spacing:.08em;
      }
      .saas-plan-badge.premium,.saas-recommended{background:#dff2ec;color:#347765}
      .saas-choice h2{margin:11px 0 5px;font-size:19px}
      .saas-choice>strong{display:block;font-size:29px;letter-spacing:-.02em}
      .saas-choice>small{display:block;margin-top:2px;color:#8c99a4;font-size:9px}
      .saas-choice ul,.saas-billing-grid ul{list-style:none;margin:18px 0;padding:0}
      .saas-choice li,.saas-billing-grid li{margin:8px 0;color:#536575;font-size:10px}
      .saas-primary,.saas-secondary{
        min-height:39px;
        padding:0 14px;
        border-radius:9px;
        font-size:9px;
        font-weight:900;
        cursor:pointer;
      }
      .saas-primary{border:1px solid #2f806d;background:#347f6d;color:#fff}
      .saas-secondary{border:1px solid #d7e1e6;background:#fff;color:#34495b}
      .saas-primary:disabled,.saas-secondary:disabled{cursor:not-allowed;opacity:.55}
      .wide{width:100%}
      .saas-fine{margin:10px 0 0;color:#929da6;font-size:8px;line-height:1.5}
      .saas-trust{text-align:center;margin:19px 0 0;color:#98a3ad;font-size:8px}
      .saas-error,.saas-success{margin:12px 0;padding:10px 12px;border-radius:8px;font-size:9px}
      .saas-error{border:1px solid #efc8cd;background:#fff3f4;color:#a7414c}
      .saas-success{border:1px solid #c9e5dc;background:#f2faf7;color:#347562}
      .saas-current-plan{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:20px;
        margin-bottom:12px;
        padding:18px;
        border:1px solid #dce6e9;
        border-radius:13px;
        background:linear-gradient(135deg,#fff 0%,#f5faf8 100%);
      }
      .saas-current-plan>div>span{font-size:8px;font-weight:950;letter-spacing:.1em;color:#4b9384}
      .saas-current-plan h2{margin:4px 0;font-size:22px}
      .saas-current-plan p{margin:0;color:#82909c;font-size:9px}
      .saas-trial-counter{text-align:right}
      .saas-trial-counter strong{display:block;font-size:28px;color:#347f6d}
      .saas-trial-counter span,.saas-trial-counter small{display:block;color:#8a98a3;font-size:8px}
      .saas-cycle-switch{display:flex;width:max-content;margin:0 0 12px;padding:3px;border:1px solid #dce5e9;border-radius:10px;background:#fff}
      .saas-cycle-switch button{border:0;border-radius:7px;background:transparent;padding:7px 13px;color:#71808d;font-size:8px;font-weight:900;cursor:pointer}
      .saas-cycle-switch button.active{background:#183044;color:#fff}
      .saas-billing-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .saas-billing-grid article{
        position:relative;
        padding:17px;
        border:1px solid #dfe6ea;
        border-radius:12px;
        background:#fff;
      }
      .saas-billing-grid article.recommended{border-color:#9dcec1}
      .saas-recommended{position:absolute;right:12px;top:12px}
      .saas-billing-grid h3{margin:0 0 10px;font-size:16px}
      .saas-billing-grid article>strong{font-size:25px}
      .saas-billing-grid article>strong small{font-size:8px;color:#8b98a3}
      .saas-billing-grid article>p{min-height:32px;color:#7a8995;font-size:8px;line-height:1.45}
      .saas-billing-note{
        margin-top:12px;
        padding:13px 15px;
        border:1px solid #d9e8e3;
        border-radius:10px;
        background:#f5faf8;
      }
      .saas-billing-note b{display:block;color:#30584e;font-size:9px}
      .saas-billing-note p{margin:4px 0 8px;color:#70837e;font-size:8px;line-height:1.55}
      .saas-owner-chip{
        display:inline-flex;
        align-items:center;
        height:36px;
        padding:0 11px;
        border-radius:8px;
        background:#162b3f;
        color:#9fe1cf;
        font-size:8px;
        font-weight:950;
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      .saas-admin-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:11px}
      .saas-admin-summary article{padding:14px;border:1px solid #dfe6ea;border-radius:11px;background:#fff}
      .saas-admin-summary span{display:block;font-size:7px;font-weight:950;letter-spacing:.09em;color:#8996a2}
      .saas-admin-summary strong{display:block;margin-top:5px;font-size:24px;color:#21364a}
      .saas-admin-summary small{display:block;margin-top:3px;color:#98a3ad;font-size:8px}
      .saas-admin-panel{padding:0;overflow:hidden}
      .saas-admin-toolbar{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:18px;
        padding:14px 15px;
        border-bottom:1px solid #e5ebee;
      }
      .saas-admin-toolbar>div:first-child>span{font-size:7px;font-weight:950;letter-spacing:.1em;color:#4b9384}
      .saas-admin-toolbar h2{margin:3px 0 0;font-size:15px}
      .saas-admin-filters{display:flex;gap:7px}
      .saas-admin-filters input,.saas-admin-filters select,.saas-admin-actions select{
        height:34px;
        border:1px solid #dbe4e8;
        border-radius:8px;
        background:#fff;
        padding:0 9px;
        color:#34495c;
        font-size:8px;
      }
      .saas-admin-filters input{min-width:240px}
      .saas-admin-table{min-width:1180px}
      .saas-admin-table th,.saas-admin-table td{font-size:8px}
      .saas-admin-user{display:flex;align-items:center;gap:8px}
      .saas-admin-user>span{display:grid;place-items:center;width:29px;height:29px;border-radius:8px;background:#e8f3ef;color:#347766;font-size:8px;font-weight:900}
      .saas-admin-user b{display:block}
      .saas-admin-user small,.saas-cell-small{display:block;margin-top:2px;color:#8d9aa4;font-size:7px}
      .saas-status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:7px;font-weight:900;text-transform:uppercase}
      .saas-status.active{background:#e4f4ee;color:#317562}
      .saas-status.suspended{background:#f8e8ea;color:#a23f4b}
      .saas-admin-actions{display:flex;gap:5px;align-items:center}
      .saas-admin-actions button{
        height:30px;
        padding:0 8px;
        border-radius:7px;
        font-size:7px;
        font-weight:900;
        cursor:pointer;
      }
      .saas-admin-actions button.suspend{border:1px solid #efc7cc;background:#fff4f5;color:#a4434e}
      .saas-admin-actions button.restore{border:1px solid #c9e5dc;background:#f2faf7;color:#347562}
      .team-invite-panel,.team-list-panel,.team-pending-panel{margin-bottom:11px}
      .team-invite-grid{display:grid;grid-template-columns:1.4fr .7fr 1fr auto;gap:9px;align-items:end}
      .team-invite-grid label>span{display:block;margin-bottom:5px;color:#7a8995;font-size:8px;font-weight:900}
      .team-invite-grid input,.team-invite-grid select,.team-table input,.team-table select{
        width:100%;
        height:36px;
        border:1px solid #dbe4e8;
        border-radius:8px;
        background:#fff;
        padding:0 9px;
        color:#34495c;
        font-size:8px;
      }
      .team-table{min-width:900px}
      .team-actions{display:flex;gap:5px}
      .team-actions button,.team-pending-list button{height:30px;padding:0 9px;border-radius:7px;font-size:7px;font-weight:900;cursor:pointer}
      .team-save{border:1px solid #c9e5dc;background:#f2faf7;color:#347562}
      .team-remove,.team-pending-list button{border:1px solid #efc7cc;background:#fff4f5;color:#a4434e}
      .team-pending-list>div{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:10px 0;border-bottom:1px solid #edf1f3}
      .team-pending-list>div:last-child{border-bottom:0}
      .team-pending-list b{display:block;font-size:9px}
      .team-pending-list small{display:block;margin-top:3px;color:#8a98a3;font-size:8px}
      .team-empty{margin:0;color:#8b98a2;font-size:9px}
      @media(max-width:1050px){
        .saas-billing-grid{grid-template-columns:repeat(2,1fr)}
        .saas-admin-summary{grid-template-columns:repeat(2,1fr)}
        .team-invite-grid{grid-template-columns:1fr 1fr}
      }
      @media(max-width:700px){
        .saas-fullscreen{padding:14px}
        .saas-onboarding{padding:20px}
        .saas-onboarding-head{flex-direction:column}
        .saas-choice-grid,.saas-billing-grid{grid-template-columns:1fr}
        .saas-current-plan{align-items:flex-start;flex-direction:column}
        .saas-trial-counter{text-align:left}
        .saas-admin-filters{width:100%;flex-direction:column}
        .saas-admin-filters input,.saas-admin-filters select{width:100%;min-width:0}
        .saas-admin-toolbar{align-items:flex-start;flex-direction:column}
        .team-invite-grid{grid-template-columns:1fr}
      }
    `}</style>
  );
}


