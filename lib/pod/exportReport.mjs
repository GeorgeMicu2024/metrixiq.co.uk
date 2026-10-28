export const POD_EXPORT_SITE = "DZM1";
export const POD_EXPORT_PAGE_SIZE = 25;

export function paginatePodRows(rows, pageSize = POD_EXPORT_PAGE_SIZE) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : POD_EXPORT_PAGE_SIZE;
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size)
  );
}

export function podRejectReasons(detail, reasonLabels) {
  const entries = reasonLabels
    .map(([key, label]) => ({ label, count: Number(detail?.reasons?.[key]) || 0 }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);

  if (entries.length) return entries.map(({ label, count }) => `${label} (${count})`).join(" · ");
  if (Number(detail?.rejects) > 0) return "Reason unavailable";
  if (Number(detail?.bypass) > 0) return `Bypass (${Number(detail.bypass)})`;
  return "No issues";
}
