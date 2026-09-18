import { clean } from "./core";

export function tableMatrix(table) {
  return Array.from(table.querySelectorAll("tr"))
    .map((tr) => Array.from(tr.querySelectorAll(":scope > th, :scope > td")).map((cell) => cell.textContent.replace(/\s+/g, " ").trim()))
    .filter((row) => row.length);
}

export function findHeaderRow(matrix, required = []) {
  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const row = matrix[i] || [];
    const cleaned = row.map(clean);
    if (required.every((aliases) => aliases.some((alias) => cleaned.includes(clean(alias))))) return i;
  }
  return -1;
}
