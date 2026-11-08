const clean = value => String(value ?? "").trim();

export const normalizeTransporterId = value => clean(value).toUpperCase();

export function buildLorDriverNames(scorecardDrivers = [], masterDrivers = []) {
  const names = new Map();
  // Master records win over scorecards, which may be scoped to another station.
  for (const driver of [...scorecardDrivers, ...masterDrivers]) {
    const trid = normalizeTransporterId(driver.trid || driver.id);
    const name = clean(driver.full_name || driver.name);
    if (trid && name && name !== "Unmatched driver") names.set(trid, name);
  }
  return names;
}

export function collectLorTransporterIds(riskRows, packageRows, getTrid) {
  return [...new Set([...riskRows, ...packageRows]
    .map(row => normalizeTransporterId(getTrid(row)))
    .filter(id => id && id !== "UNASSIGNED"))];
}
