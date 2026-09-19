"use client";

const ITEMS=[
  ["mobile-manager","Today","▥"],
  ["drivers","Drivers","◎"],
  ["coaching","Coach","✓"],
  ["notifications","Alerts","♢"],
  ["reports","Reports","▤"],
];

export default function MobileCommandDock({active,onNavigate}){
  return <nav className="mobilev6-dock" aria-label="Mobile manager shortcuts">
    {ITEMS.map(([id,label,icon])=><button key={id} className={active===id?"active":""} onClick={()=>onNavigate?.(id)}><span>{icon}</span><b>{label}</b></button>)}
  </nav>;
}
