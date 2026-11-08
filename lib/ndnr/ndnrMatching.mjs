const clean = value => String(value ?? "").trim();
const compact = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

const scanDigit = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", T: "7", B: "8" };

export function ndnrTracking(value) {
  const token = compact(value);
  if (!token.startsWith("UK")) return "";
  const digits = token.slice(2).split("").map(ch => scanDigit[ch] || ch).join("");
  return /^\d{10}$/.test(digits) ? `UK${digits}` : "";
}

export function ndnrRoute(value) {
  const match = clean(value).toUpperCase().match(/^(CA|SA|CB)[\s_-]*A?[\s_-]*(\d{2,4})$/);
  return match ? `${match[1]}_A${match[2]}` : "";
}

export function parseNdnrReport(input) {
  const lines = String(input || "").split(/\r?\n/);
  const parcels = new Map();
  const expectedByRoute = new Map();
  let activeRoute = "";
  let generatedDate = "";
  let reportTotal = null;
  for (const [index, line] of lines.entries()) {
    if (/^\s*TODAY\s*$/i.test(line) && parcels.size) break;
    const generated = line.match(/GENERATED\s*:*\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (generated) generatedDate = generated[1];
    const total = line.match(/TOTAL\s+NDNR\s+PARCELS\s*:\s*(\d+)/i);
    if (total) reportTotal = Number(total[1]);
    const routeHeader = line.match(/\bROUTE\s*:\s*((?:CA|SA|CB)[\s_-]*A?[\s_-]*\d{2,4})\b/i);
    if (routeHeader) {
      activeRoute = ndnrRoute(routeHeader[1]);
      const count = line.match(/\(\s*(\d+)\s+PARCELS?\s*\)/i);
      if (count && activeRoute) expectedByRoute.set(activeRoute, Number(count[1]));
    }
    const candidates = line.toUpperCase().match(/U\s*K(?:[\s:\-]*[0-9OQDILSZGBT]){10}/g) || [];
    for (const raw of candidates) {
      const id = ndnrTracking(raw);
      if (id && !parcels.has(id)) parcels.set(id, { tracking_id: id, report_route: activeRoute, line: index + 1 });
    }
  }
  const items = [...parcels.values()];
  const warnings = [];
  if (reportTotal !== null && reportTotal !== items.length) warnings.push(`Slack says ${reportTotal} parcels, but ${items.length} UK IDs were read. Review the extracted text.`);
  for (const [route, count] of expectedByRoute) {
    const found = items.filter(item => item.report_route === route).length;
    if (count !== found) warnings.push(`${route}: expected ${count} parcels, extracted ${found}.`);
  }
  if (items.some(item => !item.report_route)) warnings.push("Some UK IDs have no route in the screenshot. Their route will be taken from the CSV if found.");
  return { parcels: items, reportTotal, generatedDate, warnings };
}

const fieldNames = {
  tracking: ["SCANNABLEID", "TRACKINGID", "TRACKINGNUMBER"],
  route: ["ROUTECODE", "ROUTE"],
  status: ["PACKAGESTATUS", "LASTSHIPMENTSTATUS", "ACTUALSTATUSCODE"],
  scan: ["TIMEOFLASTSCAN", "LASTDRIVERSCAN", "LASTSCANTIME"],
  name: ["TRANSPORTERNAME", "DRIVERNAME", "ASSOCIATENAME"],
  trid: ["TRANSPORTERID", "DRIVERID"],
  reason: ["REASONCODE", "LASTDELIVERYATTEMPTREASON"],
};

function getField(row, name) {
  const key = Object.keys(row).find(k => fieldNames[name].includes(compact(k)));
  return key ? clean(row[key]) : "";
}

export function isNdnrReturnScan(status, scan) {
  return /^RETURN(?:ED)?\s+TO\s+STATION$/i.test(clean(status).replace(/_/g, " ")) && Boolean(clean(scan));
}

function scanTime(value) {
  const time = Date.parse(clean(value).replace(" ", "T"));
  return Number.isFinite(time) ? time : 0;
}

export function matchNdnrParcels(report, packageRows, driverNames = new Map()) {
  const byTracking = new Map();
  for (const [index, row] of (packageRows || []).entries()) {
    const trackingId = ndnrTracking(getField(row, "tracking"));
    if (!trackingId) continue;
    const entry = {
      tracking_id: trackingId, route: ndnrRoute(getField(row, "route")), status: getField(row, "status"),
      scan: getField(row, "scan"), name: getField(row, "name"), trid: getField(row, "trid"), reason: getField(row, "reason"), index,
    };
    byTracking.set(trackingId, [...(byTracking.get(trackingId) || []), entry]);
  }
  const rows = (report?.parcels || []).map(item => {
    const matches = byTracking.get(item.tracking_id) || [];
    const latest = [...matches].sort((a, b) => scanTime(b.scan) - scanTime(a.scan) || b.index - a.index)[0];
    const route = item.report_route || latest?.route || "UNKNOWN ROUTE";
    const rawName = latest?.name || driverNames.get(clean(latest?.trid).toUpperCase()) || "";
    const hasReturnStatus = /^RETURN(?:ED)?\s+TO\s+STATION$/i.test(clean(latest?.status).replace(/_/g, " "));
    const state = !latest ? "awaiting" : isNdnrReturnScan(latest.status, latest.scan) ? "returned" : hasReturnStatus ? "review" : "awaiting";
    return {
      tracking_id: item.tracking_id, route_code: route, csv_route: latest?.route || "", transporter_id: latest?.trid || "",
      driver_name: rawName, driver_inferred: false, status: latest?.status || "Not found in CSV", last_scan: latest?.scan || "",
      reason: latest?.reason || "", state, route_mismatch: Boolean(item.report_route && latest?.route && item.report_route !== latest.route),
    };
  });
  // An unassigned parcel may still belong to the only identified driver on that route.
  // Mark this explicitly as inferred; never assert a driver where the route has several.
  for (const item of rows) {
    if (item.driver_name) continue;
    const names = [...new Set(rows.filter(row => row.route_code === item.route_code && row.driver_name).map(row => row.driver_name))];
    item.driver_name = names.length === 1 ? names[0] : "Unassigned driver";
    item.driver_inferred = names.length === 1;
  }
  return rows;
}

export function groupNdnrByRoute(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = `${row.route_code}|${row.driver_name}`;
    if (!map.has(key)) map.set(key, { key, route: row.route_code, driver: row.driver_name, parcels: [], returned: 0, awaiting: 0, review: 0 });
    const group = map.get(key);
    group.parcels.push(row);
    group[row.state] += 1;
  }
  return [...map.values()].sort((a, b) => a.route.localeCompare(b.route) || a.driver.localeCompare(b.driver));
}
