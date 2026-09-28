function hex(buffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function fileContentHash(file) {
  if (!file?.arrayBuffer) throw new Error("File content is not readable.");
  const bytes = await file.arrayBuffer();
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure content hashing is not available in this browser.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return hex(digest);
}

export async function deduplicateFilesByContent(files = []) {
  const uniqueFiles = [];
  const duplicates = [];
  const seen = new Map();
  const hashes = new Map();

  for (const file of files || []) {
    const hash = await fileContentHash(file);
    hashes.set(file, hash);
    const original = seen.get(hash);
    if (original) {
      duplicates.push({
        file,
        duplicateOf: original,
        hash,
      });
      continue;
    }
    seen.set(hash, file);
    uniqueFiles.push(file);
  }

  return { uniqueFiles, duplicates, hashes };
}
