const METRICS = new Map([
  ['cdf', 'CDF (unit unspecified)'], ['cdf dpmo', 'CDF DPMO'], ['cdf negative', 'CDF negative (unit unspecified)'],
  ['dcr', 'DCR'], ['pod', 'POD'], ['iadc', 'IADC'], ['fico', 'FICO'], ['ementor', 'eMentor'],
  ['concessions', 'Concessions'], ['dnr', 'DNR'], ['lor', 'LOR'], ['delivered', 'Delivered'],
  ['delivered parcels', 'Delivered parcels'], ['negative feedback', 'Negative feedback (unit unspecified)'],
  ['delivery completion rate', 'DCR'], ['photo on delivery', 'POD'], ['photo on delivery compliance', 'POD'],
  ['in app delivery compliance', 'IADC'], ['customer delivery feedback', 'CDF (unit unspecified)'],
  ['customer delivery feedback dpmo', 'CDF DPMO'], ['customer delivery feedback negative', 'CDF negative (unit unspecified)'],
  ['concession count', 'Concessions'], ['delivered not received', 'DNR'],
  ['lost on road', 'LOR'], ['delivered packages', 'Delivered parcels'],
]);
const normalize = v => String(v ?? '').toLowerCase().replace(/[_%()\-]/g, ' ').replace(/\s+/g, ' ').trim();
function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? { value, unit: 'number' } : null;
  const text = String(value ?? '').trim();
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s*%?$/.test(text)) return null;
  const number = Number(text.replace(/[,\s%]/g, ''));
  return Number.isFinite(number) ? { value: number, unit: text.endsWith('%') ? 'percent' : 'number' } : null;
}
export function summarizeMetricMatrix(matrix, headerIndex = 0) {
  if (!Array.isArray(matrix) || !Number.isInteger(headerIndex) || headerIndex < 0 || headerIndex >= matrix.length) throw new Error('Choose a valid header row.');
  const headers = matrix[headerIndex];
  if (!Array.isArray(headers)) throw new Error('Invalid header row.');
  const rows = matrix.slice(headerIndex + 1).filter(row => Array.isArray(row) && row.some(v => String(v ?? '').trim()));
  if (rows.length > 5000) throw new Error('Maximum 5,000 data rows. Split this report first.');
  const metrics = [];
  headers.slice(0, 100).forEach((header, index) => {
    const label = METRICS.get(normalize(header));
    if (!label) return;
    const values = rows.map(row => numeric(row[index])).filter(Boolean);
    const units = new Set(values.map(v => v.unit));
    const summary = { column: index + 1, metric: label, numericRows: values.length, missingOrInvalidRows: rows.length - values.length };
    if (units.size > 1) summary.warning = 'Mixed percent and plain numbers: no aggregate computed.';
    else if (values.length) {
      const numbers = values.map(v => v.value);
      Object.assign(summary, { unit: values[0].unit, min: Math.min(...numbers), max: Math.max(...numbers), unweightedMean: Math.round(numbers.reduce((a,b)=>a+b,0) / numbers.length * 10000) / 10000 });
    }
    metrics.push(summary);
  });
  if (!metrics.length) throw new Error('No supported metric headers found. Choose the correct header row. Supported: CDF, CDF DPMO, DCR, POD, IADC, FICO, eMentor, Concessions, DNR, LOR, Delivered.');
  return { source: 'Manually uploaded spreadsheet; selected sheet only', dataRows: rows.length, metrics: metrics.slice(0, 20), limitations: 'No names, IDs, raw rows or feedback text included. Rows are not verified unique drivers. Remove totals and subtotals before upload. Means are unweighted, not official site scores. Plain numbers are not automatically converted to percentages. No causal or driver-level conclusions are possible.' };
}
