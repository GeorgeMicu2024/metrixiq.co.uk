export default function Brand({ inverse = false, compact = false }) {
  const ink = inverse ? "#ffffff" : "#0b1f33";
  return (
    <div className="brand" aria-label="MetrixIQ">
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" aria-hidden="true" className="brand-mark">
        <rect x="1" y="1" width="36" height="36" rx="10" fill={inverse ? "rgba(255,255,255,.08)" : "#0B1F33"} stroke={inverse ? "rgba(255,255,255,.20)" : "#0B1F33"}/>
        <path d="M9 11.5 14.8 27l4.2-8.6L23.2 27 29 11.5" stroke={inverse ? "#66E3CE" : "#66E3CE"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M11.5 11.5h15" stroke={inverse ? "#9B90FF" : "#9B90FF"} strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      {!compact && <span className="brand-word" style={{ color: ink }}>Metrix<span>IQ</span></span>}
    </div>
  );
}
