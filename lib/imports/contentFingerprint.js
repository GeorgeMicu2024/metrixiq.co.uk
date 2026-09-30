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
  const unreadableFiles = [];
  const seen = new Map();
  const hashes = new Map();

  for (const file of files || []) {
    if (Number(file?.size || 0) === 0) {
      unreadableFiles.push({
        file,
        code: "EMPTY_FILE",
        message: "This file is 0 B or is not available locally. Remove it and select/download it again.",
      });
      continue;
    }

    let hash;
    try {
      hash = await fileContentHash(file);
    } catch (error) {
      unreadableFiles.push({
        file,
        code: "UNREADABLE_FILE",
        message: error?.message || "The browser can no longer read this file. Remove it and select it again.",
      });
      continue;
    }

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

  return { uniqueFiles, duplicates, unreadableFiles, hashes };
}
