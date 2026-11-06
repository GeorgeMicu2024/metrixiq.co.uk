// Pure local-time gating for a Vercel UTC cron; no data or session access.
export function londonMorningWindow(at = new Date()) {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new Error("A valid instant is required.");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at).filter(item => item.type !== "literal").map(item => [item.type, item.value]));
  const hour = Number(parts.hour), minute = Number(parts.minute);
  // The platform may start a scheduled invocation a few minutes late.
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minute,
    due: hour === 8 && minute >= 53 || hour === 9 && minute <= 5 };
}

export function safeDailyPriorities(items) {
  return (Array.isArray(items) ? items : []).slice(0, 4).map(item => ({
    id: String(item.id || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 45),
    severity: ["high", "review", "info"].includes(item.severity) ? item.severity : "info",
    title: String(item.title || "Review source evidence").slice(0, 130),
    evidence: String(item.evidence || "").slice(0, 240),
    next: String(item.next || "Verify original reports manually.").slice(0, 200),
  }));
}
