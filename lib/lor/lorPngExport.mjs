const clean = value => String(value ?? "").trim();
const normalized = value => clean(value).toUpperCase();
const xml = value => clean(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function lorDriverKey(row) {
  return normalized(row.transporter_id) || `NAME:${normalized(row.driver_name) || "UNKNOWN"}`;
}

export function groupLorDrivers(rows = [], hiddenDriverKeys = []) {
  const hidden = new Set(hiddenDriverKeys);
  const groups = new Map();
  for (const row of rows) {
    const key = lorDriverKey(row);
    if (hidden.has(key)) continue;
    if (!groups.has(key)) {
      groups.set(key, { key, name: clean(row.driver_name) || "Unmatched driver", parcels: [], seen: new Set() });
    }
    const group = groups.get(key);
    const trackingId = normalized(row.tracking_id);
    if (!trackingId || group.seen.has(trackingId)) continue;
    group.seen.add(trackingId);
    group.parcels.push({ trackingId, reason: clean(row.reason), scan: clean(row.last_scan || row.risk_scan_at) });
  }
  return [...groups.values()].map(({ seen, ...group }) => group).filter(group => group.parcels.length);
}

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function scanDate(raw) {
  const parts = clean(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return "Date unavailable";
  return `${parts[3]} ${months[Number(parts[2]) - 1] || ""} ${parts[1]}`;
}
function reasonLabel(raw) {
  const reason = clean(raw).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
  return reason || "Attempt reason unavailable";
}

export function buildLorExportSvg(groups, { site = "DZM1", generatedAt = new Date() } = {}) {
  const width = 1200;
  const firstCardY = 707;
  const gap = 16;
  const heights = groups.map(group => 118 + group.parcels.length * 66);
  const cardsEnd = firstCardY + heights.reduce((a, b) => a + b, 0) + Math.max(0, groups.length - 1) * gap;
  const height = cardsEnd + 135;
  const parcelCount = groups.reduce((sum, group) => sum + group.parcels.length, 0);
  const sitePillWidth = Math.max(129, Math.min(260, 44 + clean(site).length * 18));
  const sitePillX = 1144 - sitePillWidth;
  const formattedDate = generatedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/London" });
  const groupMarkup = [];
  let y = firstCardY;

  for (const [index, group] of groups.entries()) {
    const cardHeight = heights[index];
    const count = group.parcels.length;
    const name = group.name.length > 44 ? group.name.slice(0, 41) + "…" : group.name;
    const nameSize = name.length > 35 ? 29 : name.length > 27 ? 33 : 38;
    const lines = group.parcels.map((parcel, i) => {
      const baseline = y + 122 + i * 66;
      const separator = i < count - 1 ? `<line x1="85" x2="1115" y1="${baseline + 27}" y2="${baseline + 27}" stroke="#e1eaf3" stroke-width="2"/>` : "";
      return `<text x="90" y="${baseline}" font-size="31" font-weight="700" fill="#145fda">${xml(parcel.trackingId)}</text>
        <text x="831" y="${baseline - 3}" font-size="24" fill="#122c45">${xml(reasonLabel(parcel.reason))}</text>
        <text x="831" y="${baseline + 24}" font-size="20" fill="#61788d">${xml(scanDate(parcel.scan))}</text>${separator}`;
    }).join("");
    groupMarkup.push(`<rect x="58" y="${y + 5}" width="1086" height="${cardHeight}" rx="22" fill="#e0ebf6"/>
      <rect x="56" y="${y}" width="1086" height="${cardHeight}" rx="22" fill="#ffffff" stroke="#d4e2f0" stroke-width="2"/>
      <rect x="56" y="${y + 17}" width="7" height="${cardHeight - 34}" rx="3" fill="#145fda"/>
      <text x="86" y="${y + 56}" font-size="${nameSize}" font-weight="700" fill="#122c45">${xml(name)}</text>
      <rect x="962" y="${y + 22}" width="155" height="45" rx="17" fill="#e9f4ff"/>
      <text x="983" y="${y + 53}" font-size="23" font-weight="700" fill="#145fda">${count} ${count === 1 ? "parcel" : "parcels"}</text>
      <line x1="86" x2="1115" y1="${y + 81}" y2="${y + 81}" stroke="#d8e5f1" stroke-width="2"/>
      ${lines}`);
    y += cardHeight + gap;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f2f7fd"/>
    <g font-family="Arial, Helvetica, sans-serif">
      <text x="56" y="109" font-size="57" font-weight="700" fill="#122c45">Metrix<tspan fill="#145fda">IQ</tspan></text>
      <rect x="${sitePillX}" y="59" width="${sitePillWidth}" height="59" rx="23" fill="#e0efff"/>
      <text x="${sitePillX + 25}" y="99" font-size="28" font-weight="700" fill="#122c45">${xml(site)}</text>
      <line x1="56" x2="1144" y1="152" y2="152" stroke="#afd0ed" stroke-width="3"/>
      <text x="56" y="209" font-size="24" font-weight="700" letter-spacing="1" fill="#145fda">CHECK LOR  /  DRIVER REVIEW</text>
      <text x="56" y="278" font-size="55" font-weight="700" fill="#122c45">Drivers with potential LOR</text>
      <text x="56" y="337" font-size="26" fill="#60788e">Amazon risk report  ·  ${xml(formattedDate)}</text>
      <rect x="56" y="367" width="536" height="114" rx="22" fill="#ffffff" stroke="#d4e2f0" stroke-width="2"/>
      <rect x="608" y="367" width="536" height="114" rx="22" fill="#ffffff" stroke="#d4e2f0" stroke-width="2"/>
      <text x="82" y="441" font-size="46" font-weight="700" fill="#145fda">${parcelCount}</text>
      <text x="171" y="433" font-size="28" font-weight="700" fill="#122c45">Parcels at risk</text>
      <text x="634" y="441" font-size="46" font-weight="700" fill="#145fda">${groups.length}</text>
      <text x="722" y="433" font-size="28" font-weight="700" fill="#122c45">Drivers to check</text>
      <rect x="56" y="506" width="1088" height="124" rx="20" fill="#fff5e4" stroke="#efd1a2" stroke-width="2"/>
      <circle cx="100" cy="560" r="22" fill="#ffedc6"/>
      <text x="92" y="573" font-size="34" font-weight="700" fill="#9a5a06">!</text>
      <text x="144" y="552" font-size="27" font-weight="700" fill="#9a5a06">POTENTIAL LOR — NOT A CONFIRMED LOSS</text>
      <text x="144" y="592" font-size="24" fill="#122c45">Please verify parcel status with each driver and the station.</text>
      <text x="66" y="681" font-size="23" font-weight="700" fill="#60788e">DRIVER / PARCELS</text>
      <text x="831" y="681" font-size="23" font-weight="700" fill="#60788e">LAST ATTEMPT</text>
      ${groupMarkup.join("\n")}
      <line x1="56" x2="1144" y1="${height - 107}" y2="${height - 107}" stroke="#b4d2ec" stroke-width="2"/>
      <text x="56" y="${height - 69}" font-size="23" font-weight="700" fill="#122c45">DCSL  ·  Operational status review</text>
      <text x="56" y="${height - 36}" font-size="20" fill="#60788e">Potential LOR cases require confirmation — they are not confirmed losses.</text>
    </g>
  </svg>`;
  return { svg, width, height };
}

export async function createLorPng(groups, options) {
  const { svg, width, height } = buildLorExportSvg(groups, options);
  if (width * height > 16000000) throw new Error("Too many parcels for a single phone image. Hide some drivers and try again.");
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Could not render the LOR image."));
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export is not available on this device.");
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not save the LOR image.")), "image/png"));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
