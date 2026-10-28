import { POD_EXPORT_PAGE_SIZE } from "./exportReport.mjs";

const IMAGE_WIDTH = 1320;
const PADDING = 44;
const CARD_WIDTH = IMAGE_WIDTH - PADDING * 2;

export function wrapPodImageText(context, value, maxWidth) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    // Transporter names can contain very long unbroken text. Keep it in bounds.
    while (context.measureText(current).width > maxWidth && current.length > 1) {
      let split = current.length - 1;
      while (split > 1 && context.measureText(current.slice(0, split)).width > maxWidth) split--;
      lines.push(current.slice(0, split));
      current = current.slice(split);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function rounded(context, x, y, width, height, radius, color) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

const scoreText = (score) =>
  score == null || !Number.isFinite(Number(score)) ? "—" : `${Number(score).toFixed(2)}%`;

function scoreColors(score) {
  const value = Number(score);
  if (value >= 99.6) return ["#dcf7eb", "#0c744a"];
  if (value >= 99) return ["#fff0d6", "#915d14"];
  return ["#ffe5e8", "#a83a46"];
}

/**
 * Draw directly on a canvas instead of screenshotting an off-screen DOM tree.
 * Safari can hang or fail to download large html-to-image foreignObject PNGs.
 * This creates a native PNG File synchronously, preserving the click gesture
 * needed by navigator.share() on iOS.
 */
export function createPodPageImage({
  drivers,
  week,
  pageNumber,
  pageCount,
  pageSize = POD_EXPORT_PAGE_SIZE,
  totalDrivers,
  podScore,
  rejectedPhotos,
}) {
  const canvas = document.createElement("canvas");
  let context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is not supported by this browser.");

  context.font = "bold 27px Arial, sans-serif";
  const prepared = drivers.map((driver) => {
    const nameLines = wrapPodImageText(context, driver.name, 500);
    context.font = "22px Arial, sans-serif";
    const issueLines = wrapPodImageText(
      context,
      `What went wrong: ${driver.reasons}`,
      CARD_WIDTH - 64
    );
    context.font = "bold 27px Arial, sans-serif";
    const reasonTop = 72 + (nameLines.length - 1) * 31;
    return {
      ...driver,
      nameLines,
      issueLines,
      reasonTop,
      height: Math.max(120, reasonTop + issueLines.length * 29 + 17),
    };
  });

  const firstCardY = 420;
  const imageHeight = firstCardY + prepared.reduce((total, row) => total + row.height + 12, 0) + 80;
  canvas.width = IMAGE_WIDTH;
  canvas.height = imageHeight;
  context = canvas.getContext("2d");
  context.fillStyle = "#f3f7fb";
  context.fillRect(0, 0, IMAGE_WIDTH, imageHeight);
  context.fillStyle = "#258f80";
  context.fillRect(0, 0, IMAGE_WIDTH, 8);

  context.fillStyle = "#258f80";
  context.font = "bold 22px Arial, sans-serif";
  context.fillText("METRIXIQ  /  DELIVERY QUALITY", PADDING, 67);
  context.fillStyle = "#16283e";
  context.font = "bold 52px Arial, sans-serif";
  context.fillText("POD Quality — DZM1", PADDING, 139);
  context.fillStyle = "#697d91";
  context.font = "25px Arial, sans-serif";
  context.fillText(`${week}  ·  DZM1 only  ·  Page ${pageNumber} of ${pageCount}`, PADDING, 186);

  const kpis = [
    ["DRIVERS ON THIS PAGE", String(drivers.length)],
    ["DZM1 POD SCORE", scoreText(podScore)],
    ["DZM1 REJECTED PHOTOS", String(rejectedPhotos)],
  ];
  const kpiGap = 14;
  const kpiWidth = (CARD_WIDTH - kpiGap * 2) / 3;
  kpis.forEach(([title, value], index) => {
    const x = PADDING + index * (kpiWidth + kpiGap);
    rounded(context, x, 217, kpiWidth, 118, 16, "#ffffff");
    context.font = "bold 17px Arial, sans-serif";
    context.fillStyle = "#728398";
    context.fillText(title, x + 19, 253);
    context.font = "bold 35px Arial, sans-serif";
    context.fillStyle = "#172b43";
    context.fillText(value, x + 19, 305);
  });

  context.fillStyle = "#16283e";
  context.font = "bold 29px Arial, sans-serif";
  context.fillText("Driver Scorecards", PADDING, 388);
  context.textBaseline = "alphabetic";

  let y = firstCardY;
  prepared.forEach((driver, index) => {
    rounded(context, PADDING, y, CARD_WIDTH, driver.height, 15, "#ffffff");
    context.fillStyle = "#8492a3";
    context.font = "22px Arial, sans-serif";
    context.fillText(`#${(pageNumber - 1) * pageSize + index + 1}`, PADDING + 22, y + 43);

    context.fillStyle = "#16283e";
    context.font = "bold 27px Arial, sans-serif";
    driver.nameLines.forEach((line, lineIndex) => {
      context.fillText(line, PADDING + 90, y + 44 + lineIndex * 31);
    });

    const [scoreBg, scoreFg] = scoreColors(driver.score);
    rounded(context, 738, y + 16, 164, 48, 12, scoreBg);
    context.fillStyle = scoreFg;
    context.font = "bold 27px Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(scoreText(driver.score), 820, y + 49);

    context.fillStyle = "#16283e";
    context.font = "bold 26px Arial, sans-serif";
    context.fillText(String(driver.opportunities), 1007, y + 35);
    context.fillText(String(driver.rejects), 1173, y + 35);
    context.fillStyle = "#78899a";
    context.font = "17px Arial, sans-serif";
    context.fillText("Opportunities", 1007, y + 55);
    context.fillText("Rejected", 1173, y + 55);
    context.textAlign = "left";

    context.fillStyle = driver.rejects > 0 ? "#ad4050" : "#22835c";
    context.font = "22px Arial, sans-serif";
    driver.issueLines.forEach((line, lineIndex) => {
      context.fillText(line, PADDING + 23, y + driver.reasonTop + lineIndex * 29);
    });
    y += driver.height + 12;
  });

  context.fillStyle = "#6b7e90";
  context.font = "21px Arial, sans-serif";
  context.fillText(
    `DZM1  ·  ${week}  ·  Drivers ${(pageNumber - 1) * pageSize + 1}–${Math.min(pageNumber * pageSize, totalDrivers)} of ${totalDrivers}`,
    PADDING,
    y + 28
  );
  context.textAlign = "right";
  context.fillStyle = "#172b43";
  context.font = "bold 21px Arial, sans-serif";
  context.fillText(`Page ${pageNumber} / ${pageCount}`, IMAGE_WIDTH - PADDING, y + 28);
  context.textAlign = "left";

  const dataUrl = canvas.toDataURL("image/png");
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Could not generate a PNG image on this device.");
  }
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const filename = `MetrixIQ_POD_DZM1_${week}_Page_${pageNumber}_of_${pageCount}.png`;
  return {
    filename,
    dataUrl,
    file: new File([bytes], filename, { type: "image/png" }),
  };
}
