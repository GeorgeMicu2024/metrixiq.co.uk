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
  return Array.isArray(files) && files.some((file) => /score\s*card/i.test(String(file || "")));
}

function scorecardValue(row, key) {
  const direct = row?.[key];
  if (direct === "-") return "-";
  if (!blank(direct)) return direct;

  const raw = row?.raw_data?.[key];
  if (raw === "-") return "-";
  if (!blank(raw)) return raw;

  // In the 2026 DA Scorecard, source N/A/blank metrics contribute their
  // full metric weight. Only infer that semantic for rows proven to come
  // from a scorecard; ordinary missing data must not be inflated.
  return sourceHasScorecard(row) ? "-" : "";
}

const ficoPoints = (value) => {
  if (value === "-") return 17;
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
  if (value === "-") return 17;
  const dcr = scorecardRatio(value);
  if (dcr == null) return 0;
  if (dcr >= 0.999) return 17;
  if (dcr >= 0.992) return 15;
  if (dcr >= 0.9885) return 10;
  if (dcr >= 0.986) return 5;
  return 0;
};

const dscPoints = (value) => {
  if (value === "-") return 17;
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
  if (value === "-") return 6;
  const lor = numeric(value);
  if (lor == null) return 0;
  return lor === 0 ? 6 : 0;
};

const podPoints = (value) => {
  if (value === "-") return 8;
  const pod = scorecardRatio(value);
  if (pod == null) return 0;
  if (pod >= 0.9999) return 8;
  if (pod >= 0.99) return 7;
  if (pod >= 0.985) return 5;
  if (pod >= 0.97) return 3;
  return 0;
};

const ccPoints = (value) => {
  if (value === "-") return 8;
  const cc = scorecardRatio(value);
  if (cc == null) return 0;
  if (cc >= 0.999) return 8;
  if (cc >= 0.99) return 7;
  if (cc >= 0.96) return 5;
  if (cc >= 0.95) return 2;
  return 0;
};

const cePoints = (value) => {
  if (value === "-") return 10;
  const ce = numeric(value);
  if (ce == null) return 0;
  if (ce === 0) return 10;
  // W31-W37 source evidence confirms CE 1 and CE 2 both contribute 6.
  if (ce <= 2) return 6;
  return 0;
};

const cdfPoints = (value) => {
  if (value === "-") return 10;
  const cdf = numeric(value);
  if (cdf == null) return 0;
  if (cdf <= 2500) return 10;
  if (cdf <= 5000) return 7;
  if (cdf <= 7500) return 4;
  if (cdf <= 10000) return 2;
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

  const hasAnyMetric = Object.values(values).some((value) => value === "-" || numeric(value) != null);
  if (!hasAnyMetric) return { value: null, coverage: 0, components: [] };

  const scorers = { fico: ficoPoints, dcr: dcrPoints, dsc_dpmo: dscPoints, lor: lorPoints, pod: podPoints, cc: ccPoints, ce_dpmo: cePoints, cdf_dpmo: cdfPoints, psb: psbPoints };

  const components = DRIVER_SCORECARD_FORMULA.map((definition) => {
    const value = values[definition.key];
    const points = scorers[definition.key](value);
    const inferredDash = value === "-" && blank(row?.[definition.key]) && blank(row?.raw_data?.[definition.key]);
    return {
      ...definition,
      value,
      points,
      contribution: points,
      component: definition.maxPoints ? (points / definition.maxPoints) * 100 : 0,
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
