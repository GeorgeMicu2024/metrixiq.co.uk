import { groupNdnrByRoute } from "./ndnrMatching.mjs";

const esc = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const stateText = { returned: "RTS SCANNED", awaiting: "AWAITING RETURN", review: "CHECK SCAN TIME" };
const stateColor = { returned: ["#def8e9", "#117648"], awaiting: ["#fff0d5", "#a05b05"], review: ["#ffe0e2", "#b72d3e"] };

function shortDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+|T)?(\d{2}:\d{2})?/);
  return match ? `${match[3]}/${match[2]} ${match[4] || ""}`.trim() : "—";
}

export function buildNdnrExportSvg(rows, { site = "DZM1", reportDate = "", generatedAt = new Date() } = {}) {
  const groups = groupNdnrByRoute(rows);
  const width = 1200;
  const cardTop = 500;
  const gap = 18;
  const heights = groups.map(group => 102 + group.parcels.length * 64);
  const contentEnd = cardTop + heights.reduce((sum, height) => sum + height, 0) + Math.max(0, groups.length - 1) * gap;
  const height = contentEnd + 130;
  const returned = rows.filter(row => row.state === "returned").length;
  const awaiting = rows.filter(row => row.state !== "returned").length;
  const date = reportDate || generatedAt.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  let y = cardTop;
  const cards = groups.map((group, index) => {
    const count = group.parcels.length;
    const cardHeight = heights[index];
    const list = group.parcels.map((parcel, rowIndex) => {
      const rowY = y + 120 + rowIndex * 64;
      const [bg, fg] = stateColor[parcel.state] || stateColor.review;
      return `<text x="95" y="${rowY}" font-size="30" font-weight="700" fill="#1b64bc">${esc(parcel.tracking_id)}</text>
        <rect x="740" y="${rowY - 32}" width="268" height="42" rx="15" fill="${bg}"/>
        <text x="758" y="${rowY - 3}" font-size="23" font-weight="700" fill="${fg}">${stateText[parcel.state] || "REVIEW"}</text>
        <text x="1022" y="${rowY - 3}" font-size="23" fill="#546d81">${esc(shortDate(parcel.last_scan))}</text>
        ${rowIndex < count - 1 ? `<line x1="90" y1="${rowY + 19}" x2="1112" y2="${rowY + 19}" stroke="#e4ebf3" stroke-width="2"/>` : ""}`;
    }).join("\n");
    const name = group.driver.length > 33 ? `${group.driver.slice(0, 30)}…` : group.driver;
    const markup = `<rect x="57" y="${y}" width="1086" height="${cardHeight}" rx="22" fill="#ffffff" stroke="#d3e1ee" stroke-width="2"/>
      <rect x="57" y="${y}" width="1086" height="79" rx="22" fill="#e8f1fd"/>
      <rect x="57" y="${y + 56}" width="1086" height="23" fill="#e8f1fd"/>
      <text x="87" y="${y + 53}" font-size="31" font-weight="700" fill="#153650">${esc(group.route)}  ·  ${esc(name)}</text>
      <text x="944" y="${y + 53}" font-size="25" font-weight="700" fill="#236bc4">${count} parcels</text>
      ${list}`;
    y += cardHeight + gap;
    return markup;
  }).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f3f8fe"/>
    <g font-family="Arial, Helvetica, sans-serif">
      <text x="55" y="106" font-size="58" font-weight="700" fill="#153650">Metrix<tspan fill="#156ada">IQ</tspan></text>
      <rect x="974" y="54" width="169" height="58" rx="20" fill="#e2efff"/>
      <text x="995" y="95" font-size="28" font-weight="700" fill="#17446f">${esc(site)}</text>
      <line x1="56" y1="143" x2="1144" y2="143" stroke="#c6d9ec" stroke-width="3"/>
      <text x="56" y="198" font-size="24" font-weight="700" fill="#236bc4" letter-spacing="2">NDNR  /  RETURN STATUS</text>
      <text x="56" y="262" font-size="51" font-weight="700" fill="#153650">Parcels pending station review</text>
      <text x="56" y="312" font-size="27" fill="#617b90">Amazon Slack report  ·  ${esc(date)}</text>
      <rect x="56" y="338" width="350" height="109" rx="19" fill="#fff" stroke="#d3e1ee" stroke-width="2"/>
      <rect x="425" y="338" width="350" height="109" rx="19" fill="#e4faef" stroke="#b3e1c8" stroke-width="2"/>
      <rect x="794" y="338" width="350" height="109" rx="19" fill="#fff2dc" stroke="#eed6b4" stroke-width="2"/>
      <text x="82" y="403" font-size="47" font-weight="700" fill="#1c61b5">${rows.length}</text><text x="166" y="397" font-size="27" font-weight="700" fill="#153650">NDNR parcels</text>
      <text x="449" y="403" font-size="47" font-weight="700" fill="#14824f">${returned}</text><text x="537" y="397" font-size="27" font-weight="700" fill="#153650">RTS scanned</text>
      <text x="819" y="403" font-size="47" font-weight="700" fill="#ae690d">${awaiting}</text><text x="904" y="397" font-size="27" font-weight="700" fill="#153650">Still to check</text>
      ${cards}
      <line x1="56" y1="${height - 95}" x2="1144" y2="${height - 95}" stroke="#c6d9ec" stroke-width="2"/>
      <text x="56" y="${height - 52}" font-size="24" font-weight="700" fill="#153650">DCSL  ·  NDNR operational follow-up</text>
      <text x="56" y="${height - 24}" font-size="19" fill="#617b90">RTS scanned = Amazon CSV Returned to station with a scan timestamp.</text>
    </g></svg>`;
  return { svg, width, height };
}

export async function createNdnrPng(rows, options) {
  const { svg, width, height } = buildNdnrExportSvg(rows, options);
  if (width * height > 16000000) throw new Error("Too many parcels for one image. Filter the list and try again.");
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Unable to render image.")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export is unavailable on this device.");
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Unable to create PNG.")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}
