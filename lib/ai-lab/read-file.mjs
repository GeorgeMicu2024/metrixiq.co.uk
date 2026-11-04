// All parsing is browser-side. Uploaded documents never leave the AI Lab.
import { gridFromOcrText, cleanMatrix } from "./wave-plan.mjs";

function extOf(file) {
  return String(file?.name || "").split(".").pop().toLowerCase();
}

async function ocrImage(image, onProgress, existingWorker = null) {
  const worker = existingWorker || await (async () => {
    const { createWorker } = await import("tesseract.js");
    return createWorker("eng", 1, {
      logger(message) {
        if (message.status === "recognizing text") onProgress?.(Math.round((message.progress || 0) * 100));
      },
    });
  })();
  try {
    const result = await worker.recognize(image);
    return String(result?.data?.text || "");
  } finally {
    if (!existingWorker) await worker.terminate();
  }
}

async function extractPdf(file, onProgress) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const matrix = [];
  let fullText = "";
  const maxPages = Math.min(document.numPages, 5);
  try {
    for (let pageNo = 1; pageNo <= maxPages; pageNo++) {
      onProgress?.(Math.round((pageNo - 1) / maxPages * 100));
      const page = await document.getPage(pageNo);
      const content = await page.getTextContent();
      const items = (content.items || []).filter(item => typeof item.str === "string" && item.str.trim());
      const byY = new Map();
      for (const item of items) {
        const y = Math.round((item.transform?.[5] || 0) / 5) * 5;
        const row = byY.get(y) || [];
        row.push({ x: item.transform?.[4] || 0, text: item.str.trim() });
        byY.set(y, row);
      }
      const rows = [...byY].sort((a, b) => b[0] - a[0]).map(([, cells]) =>
        cells.sort((a, b) => a.x - b.x).map(cell => cell.text)
      );
      let pageText = rows.map(row => row.join("  ")).join("\n");
      if (pageText.trim().length < 30) {
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas not supported by this browser.");
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        pageText = await ocrImage(canvas, onProgress);
        matrix.push(...gridFromOcrText(pageText));
      } else {
        matrix.push(...rows);
      }
      fullText += (fullText ? "\n" : "") + pageText;
      page.cleanup();
    }
    onProgress?.(100);
    return { matrix: cleanMatrix(matrix), text: fullText.slice(0, 30000), mode: "PDF text / OCR", truncated: document.numPages > maxPages };
  } finally {
    await document.destroy();
  }
}

export async function readAiLabFile(file, onProgress = () => {}, options = {}) {
  if (!file) throw new Error("Choose a file first.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Maximum file size is 15 MB.");
  const extension = extOf(file);
  if (["xlsx", "xls", "csv"].includes(extension)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true, cellDates: false });
    const availableSheets = (workbook.SheetNames || []).slice(0, 20);
    const selectedSheet = options.sheetName || availableSheets[0];
    if (!availableSheets.includes(selectedSheet)) throw new Error("Selected Excel sheet is unavailable.");
    const sheet = workbook.Sheets?.[selectedSheet];
    if (!sheet) throw new Error("This spreadsheet contains no readable sheets.");
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false });
    onProgress(100);
    return { matrix: cleanMatrix(rows), text: "", mode: "Spreadsheet", truncated: rows.length > 1500, availableSheets, selectedSheet };
  }
  if (["png", "jpg", "jpeg", "webp", "bmp"].includes(extension)) {
    const text = await ocrImage(file, onProgress);
    onProgress(100);
    return { matrix: gridFromOcrText(text), text: text.slice(0, 30000), mode: "Image OCR", truncated: false };
  }
  if (extension === "pdf") return extractPdf(file, onProgress);
  throw new Error("Supported formats: XLSX, XLS, CSV, PDF, PNG, JPG, WEBP, BMP.");
}
