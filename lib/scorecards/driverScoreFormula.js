const numeric = (value) => {
  if (value == null || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const blank = (value) => value == null || String(value).trim() === "";

export function scorecardRatio(value) {
  const number = numeric(value);
  if (number == null) return null;
  return number > 1 ? number / 100 : number;
}

function sourceHasScorecard(row) {
  const files = row?.raw_data?.source_files;
  return Array.isArray(files) && files.some((file) => /scorecard/i.test(String(file || "")));
}

function dashValue(row, key) {
  const direct = row?.[key];
  if (direct === "-") return "-";
  if (!blank(direct)) return direct;

  const raw = row?.raw_data?.[key];
  if (raw === "-") return "-";
  if (!blank(raw)) return raw;

  // Amazon DSP Scorecard PDFs use "-" for N/A CDF/PSB values. The numeric
  // persistence layer stores those cells as null, so restore the source
  // semantics only when this row is known to come from a scorecard.
  if (sourceHasScorecard(row) && (key === "cdf_dpmo" || key === "psb")) return "-";
  return "";
}

const ficoPoints = (value) => {
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
  const dcr = scorecardRatio(value);
  if (dcr == null) return 0;
  if (dcr >= 0.999) return 17;
  if (dcr >= 0.992) return 15;
  if (dcr >= 0.9885) return 10;
  if (dcr >= 0.986) return 5;
  return 0;
};

const dscPoints = (value) => {
  const dsc = numeric(value);
  if (dsc == null) return 0;
  if (dsc < 0.01) return 17;
  if (dsc <= 550) return 15;
  if (dsc <= 650) return 10;
  if (dsc <= 965) return 5;
  return 0;
};

const lorPoints = (value) => {
  const lor = numeric(value);
  if (lor == null) return 0;
  return lor === 0 ? 6 : 0;
};

const podPoints = (value) => {
  const pod = scorecardRatio(value);
  if (pod == null) return 0;
  if (pod >= 0.9999) return 8;
  if (pod >= 0.99) return 7;
  if (pod >= 0.985) return 5;
  if (pod >= 0.97) return 3;
  return 0;
};

const ccPoints = (value) => {
  const cc = scorecardRatio(value);
  if (cc == null) return 0;
  if (cc >= 0.999) return 8;
  if (cc >= 0.99) return 7;
  if (cc >= 0.96) return 5;
  if (cc >= 0.95) return 1;
  return 0;
};

const cePoints = (value) => {
  const ce = numeric(value);
  if (ce == null) return 0;
  return ce <= 0 ? 10 : 0;
};

const cdfPoints = (value) => {
  if (value === "-") return 10;
  const cdf = numeric(value);
  if (cdf == null) return 0;
  if (cdf <= 4420) return 10;
  if (cdf <= 5420) return 5;
  if (cdf <= 6420) return 3;
  return 0;
};

const psbPoints = (value) => {
  if (value === "-") return 7;
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
    fico: row?.mentor_score ?? row?.ementor ?? row?.fico,
    dcr: row?.dcr,
    dsc_dpmo: row?.dsc_dpmo,
    lor: row?.lor,
    pod: row?.pod,
    cc: row?.cc,
    ce_dpmo: row?.ce_dpmo,
    cdf_dpmo: dashValue(row, "cdf_dpmo"),
    psb: dashValue(row, "psb"),
  };

  const hasAnyMetric = Object.values(values).some(
    (value) => value === "-" || numeric(value) != null
  );

  if (!hasAnyMetric) {
    return {
      value: null,
      coverage: 0,
      components: [],
    };
  }

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
    const points = scorers[definition.key](value);
    const inferredDash =
      value === "-" &&
      blank(row?.[definition.key]) &&
      blank(row?.raw_data?.[definition.key]);

    return {
      ...definition,
      value,
      points,
      contribution: points,
      component: definition.maxPoints
        ? (points / definition.maxPoints) * 100
        : 0,
      missing: value !== "-" && numeric(value) == null,
      inferredDash,
    };
  });

  return {
    value: components.reduce((sum, component) => sum + component.points, 0),
    coverage: components.filter((component) => !component.missing).length,
    components,
  };
}
