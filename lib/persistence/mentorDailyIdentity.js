import { isValidTrid, normalizeTrid } from "../identity.js";
import { normalizeSiteCode } from "../analyzer/core.js";

// A Shift Report row is one trip/session, even if it is mapped to a driver
// who has other eMentor accounts or sessions on the same day.
export function mentorDailySourceIdentityKey(driver, source, resolvedDriverId = "") {
  const mentor = driver?.details?.mentor || {};
  const shiftRowKey = mentor.tripEvidenceSource === "ementor_shift_report"
    ? String(mentor.sourceRowKey || "").trim()
    : "";
  if (shiftRowKey) return `SHIFT:${String(source || "").trim()}:${shiftRowKey}`;

  return String(
    driver?.mentorHash ||
    mentor.identityKey ||
    (isValidTrid(driver?.id) ? normalizeTrid(driver.id) : "") ||
    resolvedDriverId
  ).trim();
}

// Explicit Activity Site from the import wins over Driver Master home site.
export function mentorDailyActivitySite(driver, fallbackSite) {
  return normalizeSiteCode(driver?.site) ||
    normalizeSiteCode(driver?.details?.mentor?.station) ||
    normalizeSiteCode(fallbackSite) ||
    null;
}
