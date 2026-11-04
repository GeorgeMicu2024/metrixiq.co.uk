// Pure, side-effect-free Wave Plan recognition helpers for the isolated AI Lab.
export const WAVE_FIELDS = [
  { id: "route", label: "Route", aliases: ["route", "route id", "route number", "route code", "route name"] },
  { id: "driver", label: "Driver", aliases: ["driver", "driver name", "da name", "courier", "associate"] },
  { id: "trid", label: "TRID", aliases: ["trid", "transporter id", "transporter", "driver id"] },
  { id: "wave", label: "Wave", aliases: ["wave", "wave number", "wave no", "wave id"] },
  { id: "staging", label: "Staging lane", aliases: ["staging", "staging lane", "staging area", "lane", "stage"] },
  { id: "parking", label: "Parking", aliases: ["parking", "parking time", "1st floor parking", "first floor parking"] },
  { id: "holding", label: "Holding", aliases: ["holding", "holding time", "holding 0 floor", "holding 0"] },
  { id: "loading", label: "Loading", aliases: ["loading", "loading time", "load time", "load", "dispatch time"] },
];

export function normaliseHeading(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function cleanMatrix(matrix) {
  if (!Array.isArray(matrix)) return [];
  return matrix.slice(0, 1500).filter(Array.isArray).map(row =>
    row.slice(0, 50).map(value => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 250))
  ).filter(row => row.some(Boolean));
}

export function signatureFor(headers) {
  return (headers || []).map(normaliseHeading).join("|").slice(0, 1400);
}

function headingScore(header, field) {
  const normalized = normaliseHeading(header);
  if (!normalized) return 0;
  if (field.aliases.includes(normalized)) return 4;
  if (field.aliases.some(alias => normalized.startsWith(alias + " ") || normalized.endsWith(" " + alias))) return 2;
  return 0;
}

function fromHeaders(headers) {
  const columns = {};
  const used = new Set();
  let score = 0;
  for (const field of WAVE_FIELDS) {
    let candidate = -1;
    let best = 0;
    headers.forEach((header, index) => {
      const weight = !used.has(index) ? headingScore(header, field) : 0;
      if (weight > best) { best = weight; candidate = index; }
    });
    if (candidate >= 0 && best > 0) {
      used.add(candidate);
      columns[field.id] = candidate;
      score += best;
    }
  }
  return { columns, score };
}

function inferFromValues(matrix, start) {
  const columns = {};
  const maxColumns = Math.max(0, ...matrix.slice(start, start + 12).map(row => row.length));
  let routeBest = 0;
  let timeBest = 0;
  for (let col = 0; col < maxColumns; col++) {
    const values = matrix.slice(start, start + 12).map(row => String(row[col] || ""));
    const routes = values.filter(v => /\b(?:CA|SA)_[A-Z]?\d+\b/i.test(v)).length;
    const times = values.filter(v => /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(v)).length;
    if (routes > routeBest) { routeBest = routes; columns.route = col; }
    if (times > timeBest) { timeBest = times; columns.loading = col; }
  }
  if (columns.route === columns.loading) delete columns.loading;
  return columns;
}

function savedMatch(matrix, headerRow, templates) {
  if (headerRow < 0) return null;
  const current = signatureFor(matrix[headerRow] || []);
  if (!current) return null;
  const incoming = current.split("|");
  for (const template of templates || []) {
    if (!template || !template.signature || !template.columns) continue;
    if (template.signature === current) return template;
    const existing = template.signature.split("|");
    const overlap = incoming.filter(cell => cell && existing.includes(cell)).length;
    const similarity = overlap / Math.max(existing.length, incoming.length, 1);
    if (similarity < 0.88 || incoming.filter(Boolean).length < 3) continue;

    // A familiar set of headings can arrive in a different order. Never reuse
    // positional mappings until every approved field has been remapped by name.
    const remapped = {};
    const occupied = new Set();
    let safe = true;
    for (const [field, oldIndex] of Object.entries(template.columns)) {
      const oldHeader = Number.isInteger(oldIndex) ? existing[oldIndex] : "";
      if (!oldHeader) { safe = false; break; }
      const matches = incoming.flatMap((heading, index) => heading === oldHeader ? [index] : []);
      if (matches.length !== 1 || occupied.has(matches[0])) { safe = false; break; }
      occupied.add(matches[0]);
      remapped[field] = matches[0];
    }
    if (safe && Object.keys(remapped).length) return { ...template, columns: remapped };
  }
  return null;
}

export function detectWavePlan(rawMatrix, templates = []) {
  const matrix = cleanMatrix(rawMatrix);
  if (!matrix.length) return { matrix, headerRow: -1, columns: {}, confidence: 0, signature: "", matchedTemplate: null };
  let headerRow = -1;
  let best = { columns: {}, score: 0 };
  for (let index = 0; index < Math.min(matrix.length, 24); index++) {
    const trial = fromHeaders(matrix[index]);
    if (trial.score > best.score) { best = trial; headerRow = index; }
  }
  // An approved custom layout might use no standard Amazon header aliases.
  // Search its learned signature before falling back to value inference.
  let template = null;
  for (let index = 0; index < Math.min(matrix.length, 24); index++) {
    const remembered = savedMatch(matrix, index, templates);
    if (remembered) {
      template = remembered;
      headerRow = index;
      best = fromHeaders(matrix[index]);
      break;
    }
  }
  if (!template && Object.keys(best.columns).length < 2) {
    headerRow = -1;
    best = { columns: inferFromValues(matrix, 0), score: 0 };
  }
  template ||= savedMatch(matrix, headerRow, templates);
  const columns = template
    ? { ...best.columns, ...Object.fromEntries(Object.entries(template.columns).filter(([, index]) => Number.isInteger(index) && index >= 0 && index < 50)) }
    : best.columns;
  const header = headerRow >= 0 ? matrix[headerRow] : [];
  const count = Object.keys(columns).length;
  const confidence = template ? 96 : count >= 5 ? 88 : count >= 3 ? 71 : count >= 2 ? 52 : count === 1 ? 30 : 0;
  return { matrix, headerRow, columns, confidence, signature: signatureFor(header), matchedTemplate: template?.name || null };
}

export function normalizedWaveRows(matrix, columns, headerRow = -1) {
  const fields = WAVE_FIELDS.map(field => field.id);
  const start = Math.max(0, headerRow + 1);
  return cleanMatrix(matrix).slice(start).flatMap(row => {
    const item = {};
    for (const field of fields) {
      const index = columns?.[field];
      item[field] = Number.isInteger(index) && index >= 0 ? String(row[index] || "").trim() : "";
    }
    if (!Object.values(item).some(Boolean)) return [];
    if (normaliseHeading(item.route) === "route" || normaliseHeading(item.wave) === "wave") return [];
    return [item];
  }).slice(0, 1000);
}

export function gridFromOcrText(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 500);
  const grid = lines.map(line => line.split(/\t+|\s{2,}|\s*\|\s*/).map(cell => cell.trim()).filter(Boolean));
  const withMultipleCells = grid.filter(row => row.length >= 3).length;
  if (withMultipleCells >= 2) return cleanMatrix(grid);
  const routes = lines.flatMap(line => {
    const match = line.match(/\b(?:CA|SA)_[A-Z]?\d+\b/i);
    if (!match) return [];
    const wave = line.match(/\b(?:wave|w)\s*[:#-]?\s*(\d{1,2})\b/i);
    const time = line.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/);
    const stage = line.match(/\b(?:staging|lane)\s*[:#-]?\s*([A-Z]\d{1,3})\b/i);
    return [[match[0], wave?.[1] || "", time?.[0] || "", stage?.[1] || ""]];
  });
  return routes.length ? [["Route", "Wave", "Load Time", "Staging lane"], ...routes] : cleanMatrix(grid);
}
