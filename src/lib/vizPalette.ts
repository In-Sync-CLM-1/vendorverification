/**
 * Data-viz palette for the invoice analytics page.
 *
 * Every set below was run through the dataviz palette validator (light surface
 * #fcfcfb): categorical sets pass CVD separation (worst adjacent ΔE ≥ 47),
 * the ordinal pipeline ramp passes monotone-lightness/single-hue checks.
 * Aqua and yellow sit below 3:1 contrast on the light surface — the relief
 * rule is satisfied by the legend + the register table twin on the same page.
 */

export const VIZ = {
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  inkMuted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",

  // categorical slots (fixed identity — color follows the entity)
  blue: "#2a78d6", // slot 1
  aqua: "#1baf7a", // slot 2
  yellow: "#eda100", // slot 3
  violet: "#4a3aa7", // slot 5

  // status (reserved — never used as series identity)
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** Ordinal blue ramp for the payment pipeline (submitted → paid), light→dark. */
export const PIPELINE_RAMP = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"] as const;

/** Sequential blue ramp endpoints for the aging heatmap visual map. */
export const SEQ_BLUE = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"] as const;

export const compactINR = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
};

export const fullINR = (v: number): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

/** Shared quiet chrome for every ECharts option. */
export const CHART_TEXT = {
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  color: VIZ.inkSecondary,
} as const;

export const AXIS_COMMON = {
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: VIZ.inkMuted, fontSize: 11 },
  splitLine: { lineStyle: { color: VIZ.grid, width: 1, type: "solid" as const } },
} as const;

export const TOOLTIP_COMMON = {
  backgroundColor: "#ffffff",
  borderWidth: 0,
  padding: [8, 12],
  textStyle: { color: VIZ.ink, fontSize: 12 },
  extraCssText: "box-shadow: 0 4px 20px rgba(0,0,0,.12); border-radius: 10px;",
} as const;
