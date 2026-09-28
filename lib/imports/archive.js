const MAX_ARCHIVE_FILES = 250;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

function extension(name) {
  return String(name || "").toLowerCase().split(".").pop() || "";
}

function safeArchiveName(name) {
  const normalized = String(name || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../")) return "";
  return normalized.split("/").filter(Boolean).join("/");
}

export async function expandImportFiles(files = []) {
  const expanded = [];
  const archives = [];
  const warnings = [];
  let totalBytes = 0;

  for (const file of files || []) {
    if (extension(file?.name) !== "zip") {
      expanded.push(file);
      totalBytes += Number(file?.size || 0);
      continue;
    }

    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer(), {
      checkCRC32: true,
      createFolders: false,
    });

    let archiveFiles = 0;
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const name = safeArchiveName(entry.name);
      if (!name) {
        warnings.push({ archive: file.name, code: "UNSAFE_ARCHIVE_PATH", message: `Skipped unsafe ZIP entry: ${entry.name}` });
        continue;
      }
      if (extension(name) === "zip") {
        warnings.push({ archive: file.name, code: "NESTED_ARCHIVE", message: `Nested ZIP was not expanded: ${name}` });
        continue;
      }

      archiveFiles += 1;
      if (archiveFiles > MAX_ARCHIVE_FILES || expanded.length >= MAX_ARCHIVE_FILES) {
        throw new Error(`Archive limit exceeded. Smart Import Lab accepts up to ${MAX_ARCHIVE_FILES} extracted files per run.`);
      }

      const bytes = await entry.async("uint8array");
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_ARCHIVE_BYTES) {
        throw new Error("Archive expansion exceeds the 100 MB safety limit.");
      }

      expanded.push(new File([bytes], name, { lastModified: Number(file.lastModified || Date.now()) }));
    }

    archives.push({ name: file.name, extractedFiles: archiveFiles });
  }

  return { files: expanded, archives, warnings, totalBytes };
}
