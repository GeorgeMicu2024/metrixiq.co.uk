// AI Lab presentation helpers. Suggested follow-ups are drafts, never sent or
// interpreted as evidence, and use only the user's question category.
export const ASSISTANT_STARTERS = [
  { label: "Today's priorities", prompt: "Act as my DSP operations partner. Help me decide my top three priorities today. If you don't have a current report, give me a practical dispatch checklist and tell me what evidence would make it specific." },
  { label: "Improve scorecard", prompt: "Help me improve my DSP scorecard. Explain which metrics I should investigate first and what report you need before drawing conclusions." },
  { label: "Check Wave Plan", prompt: "Help me review a Route Plan and Wave Plan before dispatch. Show me the critical checks and what cannot be verified without the actual files." },
  { label: "Driver message", prompt: "Draft a short, clear and professional English message for my delivery drivers. Ask what the main issue is if I haven't described it yet." },
];

const GENERAL = [
  { label: "Give me an action plan", prompt: "Turn your last answer into a prioritised three-step action plan with an owner, evidence to check and a practical next step. Use only confirmed information." },
  { label: "What am I missing?", prompt: "Challenge your last answer. What evidence is missing, what assumptions might be wrong and what should I check first?" },
];
const DISPATCH = [
  { label: "Pre-dispatch checklist", prompt: "Turn our last discussion into a short, actionable pre-dispatch checklist. Mark anything requiring manual verification." },
  { label: "Explain the risks", prompt: "From our last discussion, rank the most important route or loading risks and tell me the evidence required for each." },
];
const PERFORMANCE = [
  { label: "Prioritise fixes", prompt: "Based on our last performance discussion, give me three priority fixes and separate proven findings from hypotheses." },
  { label: "Draft driver coaching", prompt: "Draft a short, constructive English driver-coaching message based only on confirmed issues from our conversation. Avoid blaming anyone without evidence." },
];

export function assistantFollowUps(messages) {
  if (!Array.isArray(messages)) return [];
  const lastUser = [...messages].reverse().find(item => item?.role === "user" && typeof item.content === "string");
  const last = messages.at(-1);
  if (!lastUser || last?.role !== "assistant" || !String(last.content || "").trim()) return [];
  const question = lastUser.content.toLowerCase();
  if (/wave|staging|route plan|loading|dispatch|trid/.test(question)) return DISPATCH;
  if (/scorecard|iadc|pod|cdf|dcr|dnr|concession|performance|metric|mentor/.test(question)) return PERFORMANCE;
  return GENERAL;
}
