// Data minimisation for the isolated, per-user AI Lab cloud memory.
export const AI_LAB_STATE_TABLE = "ai_lab_user_state";
const ALLOWED_FIELDS = new Set(["route", "driver", "trid", "wave", "staging", "parking", "holding", "loading"]);

export function normalizeApprovedFormats(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).flatMap(item => {
    if (!item || typeof item.signature !== "string" || typeof item.columns !== "object" || !item.columns || Array.isArray(item.columns)) return [];
    const columns = Object.fromEntries(Object.entries(item.columns).filter(([field, index]) =>
      ALLOWED_FIELDS.has(field) && Number.isInteger(index) && index >= 0 && index < 50
    ));
    if (!item.signature.trim() || Object.keys(columns).length < 2) return [];
    return [{
      id: String(item.id || "").slice(0, 80),
      name: String(item.name || "Approved layout").replace(/[\u0000-\u001f]/g, " ").slice(0, 100),
      signature: item.signature.slice(0, 1400),
      columns,
      ...(item.sourceType === "route" || item.sourceType === "wave" ? { sourceType: item.sourceType } : {}),
      approvedAt: String(item.approvedAt || "").slice(0, 40),
    }];
  });
}

export function normalizeChatHistory(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(-30).flatMap(item => {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") return [];
    const content = item.content.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 6000);
    if (!content) return [];
    return [{
      id: String(item.id || "").slice(0, 80),
      role: item.role,
      content,
    }];
  });
}
