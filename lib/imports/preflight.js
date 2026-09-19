export const SUPPORTED_IMPORT_EXTENSIONS = Object.freeze([
  "xlsx", "xls", "xlsb", "ods", "csv", "tsv",
  "html", "htm", "pdf", "json", "xml", "txt",
]);

export const IMPORT_ACCEPT = SUPPORTED_IMPORT_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function fileExtension(name) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

export function fileFingerprint(file) {
  return [
    String(file?.name || "").toLowerCase(),
    Number(file?.size || 0),
    Number(file?.lastModified || 0),
  ].join(":");
}

export function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
}

export function classifyImportFile(file) {
  const extension = fileExtension(file?.name);
  const size = Number(file?.size || 0);

  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension)) {
    return {
      status: "blocked",
      label: "Unsupported",
      message: `.${extension || "unknown"} is not a supported import format.`,
    };
  }

  if (size === 0) {
    return {
      status: "blocked",
      label: "Empty file",
      message: "This file contains no data.",
    };
  }

  if (size > 20 * 1024 * 1024) {
    return {
      status: "warning",
      label: "Large file",
      message: "Large files can take longer to parse in the browser.",
    };
  }

  return {
    status: "ready",
    label: "Ready",
    message: "Supported and ready for analysis.",
  };
}

export function prepareImportFiles(currentFiles, incomingFiles) {
  const existing = new Set((currentFiles || []).map(fileFingerprint));
  const accepted = [...(currentFiles || [])];
  let duplicates = 0;

  for (const file of Array.from(incomingFiles || [])) {
    const fingerprint = fileFingerprint(file);
    if (existing.has(fingerprint)) {
      duplicates += 1;
      continue;
    }
    existing.add(fingerprint);
    accepted.push(file);
  }

  return { files: accepted, duplicates };
}

export function summarizePreflight(files) {
  const items = (files || []).map((file) => ({
    file,
    fingerprint: fileFingerprint(file),
    extension: fileExtension(file.name),
    sizeLabel: formatFileSize(file.size),
    assessment: classifyImportFile(file),
  }));

  return {
    items,
    ready: items.filter((item) => item.assessment.status === "ready").length,
    warnings: items.filter((item) => item.assessment.status === "warning").length,
    blocked: items.filter((item) => item.assessment.status === "blocked").length,
    totalBytes: items.reduce((sum, item) => sum + Number(item.file.size || 0), 0),
  };
}
