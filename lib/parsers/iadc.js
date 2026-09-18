const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

function indexOfAlias(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  const wanted = aliases.map(normalizeHeader);
  return normalized.findIndex((value) => wanted.includes(value));
}

export function findIadcHeader(matrix, maxRows = 12) {
  if (!Array.isArray(matrix)) return null;

  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, maxRows); rowIndex += 1) {
    const headers = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
    const idIndex = indexOfAlias(headers, ["Transporter ID", "TRID", "TR ID"]);
    const dwcIndex = indexOfAlias(headers, ["DWC %", "DWC", "Delivery Workflow Compliance"]);
    const iadcIndex = indexOfAlias(headers, [
      "IADC %",
      "IADC",
      "In-app Delivery Workflow (IADC)",
      "In App Delivery Workflow Compliance",
    ]);

    if (idIndex >= 0 && (iadcIndex >= 0 || dwcIndex >= 0)) {
      return { rowIndex, idIndex, dwcIndex, iadcIndex };
    }
  }

  return null;
}
