const sourceNA = (value) =>
  typeof value === "string" && ["-", "—", "–", "N/A", "NA"].includes(value.trim().toUpperCase());

const numeric = (value) => {
  if (value == null || String(value).trim() === "" || sourceNA(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const blank = (value) => value == null || String(value).trim() === "";

export function scorecardRatio(value) {
  const number = numeric(value);
  if (number == null) return null;
  return number > 1 ? number / 100 : number;
}

function scorecardValue(row, key) {
  const direct = row?.[key];
  if (sourceNA(direct)) return "-";
  if (!blank(direct)) return direct;

  const raw = row?.raw_data?.[key];
  if (sourceNA(raw)) return "-";
  if (!blank(raw)) return raw;

  // Do not invent a metric from a partial import. N/A handling happens
  // only when the scorecard has enough evidence to be considered complete.
  return "";
}

const ficoPoints = (value) => {
  if (value === "-") return 0;
  const fico = numeric(value);
  if (fico == null) return 0;
  if (fico >= 849) return 17;
  if (fico >= 825) return 15;
  if (fico >= 810) return 10;
  if (fico >= 800) return 8;
  if (fico >= 780) return 5;
  return 0;
};

const dcrPoints = (value) => {
  if (value === "-") return 0;
  const dcr = scorecardRatio(value);
  if (dcr == null) return 0;
  if (dcr >= 0.999) return 17;
  if (dcr >= 0.992) return 15;
  if (dcr >= 0.9885) return 10;
  if (dcr >= 0.986) return 5;
  return 0;
};

const dscPoints = (value) => {
  if (value === "-") return 0;
  const dsc = numeric(value);
  if (dsc == null) return 0;
  if (dsc <= 550) return 17;
  if (dsc <= 740) return 13;
  if (dsc <= 870) return 10;
  if (dsc <= 965) return 6;
  if (dsc <= 1130) return 3;
  return 0;
};

const lorPoints = (value) => {
  if (value === "-") return 0;
  const lor = numeric(value);
  if (lor == null) return 0;
  return lor === 0 ? 6 : 0;
};

const podPoints = (value) => {
  if (value === "-") return 0;
  const pod = scorecardRatio(value);
  if (pod == null) return 0;
  if (pod >= 0.9999) return 8;
  if (pod >= 0.99) return 7;
  if (pod >= 0.985) return 5;
  if (pod >= 0.97) return 3;
  return 0;
};

const ccPoints = (value) => {
  if (value === "-") return 0;
  const cc = scorecardRatio(value);
  if (cc == null) return 0;
  if (cc >= 0.999) return 8;
  if (cc >= 0.99) return 7;
  if (cc >= 0.96) return 5;
  if (cc >= 0.95) return 2;
  return 0;
};

const cePoints = (value) => {
  if (value === "-") return 0;
  const ce = numeric(value);
  if (ce == null) return 0;
  if (ce === 0) return 10;
  // W31-W37 source evidence confirms CE 1 and CE 2 both contribute 6.
  if (ce <= 2) return 6;
  return 0;
};

const cdfPoints = (value) => {
  if (value === "-") return 0;
  const cdf = numeric(value);
  if (cdf == null) return 0;
  if (cdf <= 2500) return 10;
  if (cdf <= 5000) return 7;
  if (cdf <= 7500) return 4;
  if (cdf <= 10000) return 2;
  return 0;
};

const psbPoints = (value) => {
  if (value === "-") return 0;
  const psb = numeric(value);
  if (psb == null) return 0;
  return psb === 0 ? 7 : 0;
};

export const DRIVER_SCORECARD_FORMULA = [
  { key: "fico", label: "FICO", maxPoints: 17 },
  { key: "dcr", label: "DCR", maxPoints: 17 },
  { key: "dsc_dpmo", label: "DSC DPMO", maxPoints: 17 },
  { key: "lor", label: "LoR DPMO", maxPoints: 6 },
  { key: "pod", label: "POD", maxPoints: 8 },
  { key: "cc", label: "CC", maxPoints: 8 },
  { key: "ce_dpmo", label: "CE", maxPoints: 10 },
  { key: "cdf_dpmo", label: "CDF DPMO", maxPoints: 10 },
  { key: "psb", label: "PSB", maxPoints: 7 },
];

export function calculateDriverScorecard(row) {
  const values = {
    fico: scorecardValue({ ...row, fico: row?.mentor_score ?? row?.ementor ?? row?.fico }, "fico"),
    dcr: scorecardValue(row, "dcr"),
    dsc_dpmo: scorecardValue(row, "dsc_dpmo"),
    lor: scorecardValue(row, "lor"),
    pod: scorecardValue(row, "pod"),
    cc: scorecardValue(row, "cc"),
    ce_dpmo: scorecardValue(row, "ce_dpmo"),
    cdf_dpmo: scorecardValue(row, "cdf_dpmo"),
    psb: scorecardValue(row, "psb"),
  };

  const knownMetrics = Object.values(values).filter((value) => numeric(value) != null).length;
  const hasAnyMetric = knownMetrics > 0 || Object.values(values).some((value) => value === "-");
  if (!hasAnyMetric) return { value: null, coverage: 0, components: [] };

  // Imported files often persist source "—" as SQL NULL. On a sufficiently
  // populated row, that is N/A rather than a failed metric. Sparse/partial
  // imports keep their previous conservative zero-point treatment.
  const hasSourceScore = numeric(row?.scorecard_score ?? row?.raw_data?.scorecard_score) != null;
  const completeScorecard = hasSourceScore || knownMetrics >= 6;

  const scorers = {
    fico: ficoPoints,
    dcr: dcrPoints,
    dsc_dpmo: dscPoints,
    lor: lorPoints,
    pod: podPoints,
    cc: ccPoints,
    ce_dpmo: cePoints,
    cdf_dpmo: cdfPoints,
    psb: psbPoints,
  };

  const components = DRIVER_SCORECARD_FORMULA.map((definition) => {
    const value = values[definition.key];
    const missing = numeric(value) == null;
    const sourceNotApplicable = missing && (value === "-" || completeScorecard);
    const naMode = sourceNotApplicable && (definition.key === "fico" || definition.key === "cc")
      ? "excluded"
      : sourceNotApplicable && definition.key === "cdf_dpmo"
        ? "full"
        : null;
    const points = naMode === "full" ? definition.maxPoints : scorers[definition.key](value);
    const eligibleMaxPoints = naMode === "excluded" ? 0 : definition.maxPoints;
    return {
      ...definition,
      value,
      points,
      eligibleMaxPoints,
      naMode,
      contribution: points,
      component: eligibleMaxPoints ? (points / eligibleMaxPoints) * 100 : 0,
      missing,
      inferredDash: value === "-" && blank(row?.[definition.key]) && blank(row?.raw_data?.[definition.key]),
    };
  });

  const awarded = components.reduce((sum, component) => sum + component.points, 0);
  const maximum = components.reduce((sum, component) => sum + component.eligibleMaxPoints, 0);

  return {
    value: maximum ? Math.round((awarded / maximum) * 10000) / 100 : null,
    awarded,
    maximum,
    coverage: components.filter((component) => !component.missing || component.naMode).length,
    components,
  };
}
