// AI Lab presentation helpers. Suggested follow-ups are drafts, never sent or
// interpreted as evidence, and use only the user's question category.
export const ASSISTANT_STARTERS = [
  { label: "Today's priorities", prompt: "Using the latest authorised MetrixIQ station report, give me the three most urgent evidence-backed priorities. Quote the exact station and Amazon week. If there is no report, say so clearly instead of giving a generic checklist." },
  { label: "Improve scorecard", prompt: "Analyse our latest authorised DSP scorecard. Give the official score, available comparison and the actual weak metrics, with evidence and practical checks. Do not invent missing scores or causes." },
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
