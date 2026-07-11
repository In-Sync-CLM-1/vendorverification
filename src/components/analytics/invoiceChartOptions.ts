import type { EChartsCoreOption } from "echarts/core";
import {
  VIZ,
  PIPELINE_RAMP,
  SEQ_BLUE,
  compactINR,
  fullINR,
  CHART_TEXT,
  AXIS_COMMON,
  TOOLTIP_COMMON,
} from "@/lib/vizPalette";
import { INVOICE_STATUS_META, InvoiceStatus } from "@/lib/invoices";
import { AGING_BUCKETS } from "@/hooks/useInvoiceAnalytics";

const truncate = (s: string, n = 18) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const BAR_STYLE = {
  barMaxWidth: 20,
  itemStyle: { borderRadius: [4, 4, 0, 0] as number[] },
};

/**
 * Cash motion: monthly Invoiced & Settled columns + the running outstanding
 * balance as a line — everything in ₹ on one axis.
 */
export function cashMotionOption(
  months: { label: string }[],
  invoiced: number[],
  settled: number[],
  running: number[],
): EChartsCoreOption {
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemWidth: 16,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: VIZ.inkSecondary, fontSize: 12 },
      data: [
        { name: "Invoiced", icon: "roundRect" },
        { name: "Settled", icon: "roundRect" },
        { name: "Outstanding balance" }, // default icon mirrors the line mark
      ],
    },
    tooltip: {
      ...TOOLTIP_COMMON,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: VIZ.axis, width: 1 } },
      valueFormatter: (v: number) => fullINR(v || 0),
    },
    xAxis: { type: "category", data: months.map((m) => m.label), ...AXIS_COMMON, splitLine: { show: false } },
    yAxis: {
      type: "value",
      ...AXIS_COMMON,
      axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (v: number) => compactINR(v) },
    },
    series: [
      { name: "Invoiced", type: "bar", data: invoiced, color: VIZ.blue, ...BAR_STYLE },
      { name: "Settled", type: "bar", data: settled, color: VIZ.aqua, ...BAR_STYLE },
      {
        name: "Outstanding balance",
        type: "line",
        data: running,
        color: VIZ.violet,
        lineStyle: { width: 2 },
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2 },
        showSymbol: false,
        emphasis: { showSymbol: true },
        endLabel: {
          show: true,
          formatter: (p: { value: number }) => compactINR(p.value),
          color: VIZ.inkSecondary,
          fontSize: 11,
          fontWeight: 600,
          distance: 6,
        },
        z: 3,
      },
    ],
  };
}

/** One horizontal stacked bar: where the period's invoice value sits in the pipeline. */
export function pipelineOption(
  pipeline: { status: InvoiceStatus; amount: number; count: number }[],
  total: number,
): EChartsCoreOption {
  const nonZero = pipeline.filter((p) => p.amount > 0);
  const lastKey = nonZero.length ? nonZero[nonZero.length - 1].status : null;
  return {
    textStyle: CHART_TEXT,
    grid: { left: 0, right: 8, top: 30, bottom: 0, containLabel: false, height: 34 },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 14,
      textStyle: { color: VIZ.inkSecondary, fontSize: 12 },
    },
    tooltip: {
      ...TOOLTIP_COMMON,
      formatter: (p: { seriesName: string; value: number; dataIndex: number }) => {
        const seg = pipeline.find((s) => INVOICE_STATUS_META[s.status].label === p.seriesName);
        const pct = total > 0 ? Math.round(((p.value as number) / total) * 100) : 0;
        return `<b>${fullINR(p.value as number)}</b> · ${pct}%<br/><span style="color:${VIZ.inkMuted}">${p.seriesName} · ${seg?.count ?? 0} invoice${seg?.count === 1 ? "" : "s"}</span>`;
      },
    },
    xAxis: { type: "value", show: false, max: total > 0 ? total : 1 },
    yAxis: { type: "category", data: [""], show: false },
    series: pipeline.map((seg, i) => ({
      name: INVOICE_STATUS_META[seg.status].label,
      type: "bar",
      stack: "pipe",
      data: [seg.amount],
      color: PIPELINE_RAMP[i],
      barMaxWidth: 34,
      itemStyle: {
        borderColor: VIZ.surface,
        borderWidth: 1,
        borderRadius: seg.status === lastKey ? [0, 4, 4, 0] : 0,
      },
      label: {
        show: total > 0 && seg.amount / total > 0.12,
        formatter: () => compactINR(seg.amount),
        color: i >= 3 ? "#ffffff" : VIZ.ink,
        fontSize: 11,
        fontWeight: 600,
      },
    })),
  };
}

/** Monthly settlement composition: actual payout vs TDS vs advance adjusted. */
export function compositionOption(
  months: { label: string }[],
  payout: number[],
  advance: number[],
  tds: number[],
): EChartsCoreOption {
  const stackStyle = { borderColor: VIZ.surface, borderWidth: 1 };
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: VIZ.inkSecondary, fontSize: 12 },
    },
    tooltip: {
      ...TOOLTIP_COMMON,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: VIZ.axis, width: 1 } },
      valueFormatter: (v: number) => fullINR(v || 0),
    },
    xAxis: { type: "category", data: months.map((m) => m.label), ...AXIS_COMMON, splitLine: { show: false } },
    yAxis: {
      type: "value",
      ...AXIS_COMMON,
      axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (v: number) => compactINR(v) },
    },
    series: [
      { name: "Paid out", type: "bar", stack: "s", data: payout, color: VIZ.blue, barMaxWidth: 20, itemStyle: stackStyle },
      { name: "Advance adjusted", type: "bar", stack: "s", data: advance, color: VIZ.aqua, barMaxWidth: 20, itemStyle: stackStyle },
      {
        name: "TDS deducted",
        type: "bar",
        stack: "s",
        data: tds,
        color: VIZ.yellow,
        barMaxWidth: 20,
        itemStyle: { ...stackStyle, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

/** Aging heatmap: vendor rows × age buckets, cell = ₹ outstanding (sequential blue). */
export function agingHeatmapOption(
  rows: { name: string; buckets: number[] }[],
): EChartsCoreOption {
  const maxCell = Math.max(1, ...rows.flatMap((r) => r.buckets));
  // biggest debtor on top
  const names = rows.map((r) => r.name).reverse();
  const data: object[] = [];
  rows.forEach((r, ri) => {
    r.buckets.forEach((v, bi) => {
      if (v <= 0) return;
      const dark = v / maxCell > 0.55;
      data.push({
        value: [bi, rows.length - 1 - ri, Math.round(v)],
        label: { color: dark ? "#ffffff" : VIZ.ink },
      });
    });
  });
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 16, top: 8, bottom: 40, containLabel: true },
    tooltip: {
      ...TOOLTIP_COMMON,
      formatter: (p: { value: [number, number, number] }) => {
        const [bi, yi, v] = p.value;
        return `<b>${fullINR(v)}</b><br/><span style="color:${VIZ.inkMuted}">${names[yi]} · ${AGING_BUCKETS[bi].label} old</span>`;
      },
    },
    xAxis: {
      type: "category",
      position: "bottom",
      data: AGING_BUCKETS.map((b) => b.label),
      ...AXIS_COMMON,
      splitLine: { show: false },
      axisLabel: { ...AXIS_COMMON.axisLabel, fontSize: 12 },
    },
    yAxis: {
      type: "category",
      data: names,
      ...AXIS_COMMON,
      splitLine: { show: false },
      axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (s: string) => truncate(s, 22) },
    },
    visualMap: {
      min: 0,
      max: maxCell,
      calculable: false,
      orient: "horizontal",
      right: 8,
      bottom: 0,
      itemWidth: 10,
      itemHeight: 90,
      text: [compactINR(maxCell), "₹0"],
      textStyle: { color: VIZ.inkMuted, fontSize: 10 },
      inRange: { color: [...SEQ_BLUE] },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          formatter: (p: { value: [number, number, number] }) => compactINR(p.value[2]),
          fontSize: 11,
          fontWeight: 600,
        },
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2, borderRadius: 4 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.25)" } },
      },
    ],
  };
}

/* ═════════════════════════ DEEP ANALYSIS CHARTS ═════════════════════════ */

/** Lifecycle funnel: submitted → approved → fully paid, ₹-weighted, rates in tooltip. */
export function lifecycleFunnelOption(funnel: {
  submitted: { count: number; amount: number };
  approved: { count: number; amount: number };
  paid: { count: number; amount: number };
}): EChartsCoreOption {
  const stages = [
    { name: "Submitted", ...funnel.submitted, color: PIPELINE_RAMP[0] },
    { name: "Approved", ...funnel.approved, color: PIPELINE_RAMP[2] },
    { name: "Fully paid", ...funnel.paid, color: PIPELINE_RAMP[4] },
  ];
  const base = stages[0].amount || 1;
  return {
    textStyle: CHART_TEXT,
    color: stages.map((st) => st.color),
    tooltip: {
      ...TOOLTIP_COMMON,
      formatter: (p: { name: string }) => {
        const st = stages.find((x) => x.name === p.name)!;
        const ofBase = Math.round((st.amount / base) * 100);
        return `<b>${fullINR(st.amount)}</b> · ${st.count} invoice${st.count === 1 ? "" : "s"}<br/>` +
          `<span style="color:${VIZ.inkMuted}">${p.name} · ${ofBase}% of submitted value</span>`;
      },
    },
    series: [
      {
        type: "funnel",
        left: "38%",
        right: "4%",
        top: 10,
        bottom: 10,
        sort: "none",
        minSize: "16%",
        gap: 4,
        label: {
          show: true,
          position: "left",
          formatter: (p: { name: string }) => {
            const st = stages.find((x) => x.name === p.name)!;
            return `{a|${p.name}}\n{b|${compactINR(st.amount)} · ${st.count} inv}`;
          },
          rich: {
            a: { color: VIZ.ink, fontSize: 12, fontWeight: 600, lineHeight: 18 },
            b: { color: VIZ.inkMuted, fontSize: 11 },
          },
        },
        labelLine: { show: true, length: 16, lineStyle: { color: VIZ.axis } },
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2 },
        data: stages.map((st) => ({ name: st.name, value: st.amount })),
      },
    ],
  };
}

/** Vendor performance density map: every column shaded relative to its own best. */
export interface DensityVendorRow {
  name: string;
  invoices: number; invoiced: number; avgSize: number;
  approvalPct: number | null; avgApproveDays: number | null; avgPayDays: number | null;
  outstanding: number; tds: number; poPct: number;
}
const DENSITY_COLS: { key: keyof DensityVendorRow; label: string; kind: "int" | "inr" | "pct" | "days" }[] = [
  { key: "invoices", label: "Invoices", kind: "int" },
  { key: "invoiced", label: "Invoiced", kind: "inr" },
  { key: "avgSize", label: "Avg size", kind: "inr" },
  { key: "approvalPct", label: "Approval %", kind: "pct" },
  { key: "poPct", label: "PO %", kind: "pct" },
  { key: "avgApproveDays", label: "Days to approve", kind: "days" },
  { key: "avgPayDays", label: "Days to pay", kind: "days" },
  { key: "outstanding", label: "Outstanding", kind: "inr" },
  { key: "tds", label: "TDS", kind: "inr" },
];
const fmtDensity = (v: number | null, kind: string) =>
  v === null ? "—" : kind === "inr" ? compactINR(v) : kind === "pct" ? `${v}%` : kind === "days" ? `${v}d` : String(v);

export function vendorDensityOption(rows: DensityVendorRow[]): EChartsCoreOption {
  const display = rows.slice().reverse(); // biggest biller on top
  const colMax = DENSITY_COLS.map((c) => Math.max(0, ...rows.map((r) => Number(r[c.key] ?? 0))));
  const data: object[] = [];
  display.forEach((row, y) => {
    DENSITY_COLS.forEach((c, x) => {
      const raw = row[c.key] as number | null;
      if (raw === null || raw === undefined) return;
      const norm = colMax[x] > 0 ? Number(raw) / colMax[x] : 0;
      data.push({
        value: [x, y, norm],
        raw,
        kind: c.kind,
        label: { color: norm > 0.55 ? "#ffffff" : VIZ.ink },
      });
    });
  });
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 12, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP_COMMON,
      formatter: (p: { value: [number, number, number]; data: { raw: number; kind: string } }) => {
        const col = DENSITY_COLS[p.value[0]];
        const vendor = display[p.value[1]].name;
        const shareOfBest = colMax[p.value[0]] > 0 ? Math.round((p.data.raw / colMax[p.value[0]]) * 100) : 0;
        return `<b>${fmtDensity(p.data.raw, p.data.kind)}</b> ${col.label}<br/>` +
          `<span style="color:${VIZ.inkMuted}">${vendor} · ${shareOfBest}% of the highest in this column</span>`;
      },
    },
    xAxis: {
      type: "category",
      position: "top",
      data: DENSITY_COLS.map((c) => c.label),
      ...AXIS_COMMON,
      splitLine: { show: false },
      axisLabel: { color: VIZ.inkSecondary, fontSize: 11, fontWeight: 600, interval: 0 },
    },
    yAxis: {
      type: "category",
      data: display.map((r) => truncate(r.name, 24)),
      ...AXIS_COMMON,
      splitLine: { show: false },
      axisLabel: { ...AXIS_COMMON.axisLabel, fontSize: 11 },
    },
    visualMap: { show: false, min: 0, max: 1, dimension: 2, inRange: { color: ["#eef5fd", ...SEQ_BLUE] } },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: true,
          fontSize: 10.5,
          formatter: (p: { data: { raw: number; kind: string } }) => fmtDensity(p.data.raw, p.data.kind),
        },
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.25)" } },
      },
    ],
  };
}

/** Exposure vs pay-speed quadrant: median crosshairs carve out "big & slow". */
export function quadrantOption(
  pts: { name: string; invoiced: number; payDays: number; outstanding: number }[],
): EChartsCoreOption {
  const median = (xs: number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const medX = median(pts.map((p) => p.invoiced));
  const medY = median(pts.map((p) => p.payDays));
  // label only the notable: top 3 by exposure + top 2 slowest
  const labelled = new Set([
    ...[...pts].sort((a, b) => b.invoiced - a.invoiced).slice(0, 3).map((p) => p.name),
    ...[...pts].sort((a, b) => b.payDays - a.payDays).slice(0, 2).map((p) => p.name),
  ]);
  const maxOut = Math.max(1, ...pts.map((p) => p.outstanding));
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 24, top: 30, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP_COMMON,
      formatter: (p: { dataIndex: number }) => {
        const r = pts[p.dataIndex];
        return `<b>${r.name}</b><br/>Billed ${fullINR(r.invoiced)} · paid in ~${r.payDays} days<br/>` +
          `<span style="color:${VIZ.inkMuted}">Outstanding now ${fullINR(r.outstanding)}</span>`;
      },
    },
    xAxis: {
      type: "value",
      name: "Total billed (exposure)",
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: { fontSize: 11, color: VIZ.inkMuted },
      ...AXIS_COMMON,
      axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (v: number) => compactINR(v) },
    },
    yAxis: {
      type: "value",
      name: "Avg days to pay",
      nameTextStyle: { fontSize: 11, color: VIZ.inkMuted, align: "left" },
      ...AXIS_COMMON,
    },
    series: [
      {
        type: "scatter",
        data: pts.map((p) => ({ name: p.name, value: [p.invoiced, p.payDays] })),
        symbolSize: (v: number[], p: { dataIndex: number }) =>
          10 + Math.sqrt(pts[p.dataIndex].outstanding / maxOut) * 16,
        itemStyle: { color: VIZ.blue, borderColor: VIZ.surface, borderWidth: 2, opacity: 0.9 },
        label: {
          show: true,
          position: "top",
          fontSize: 10.5,
          color: VIZ.inkSecondary,
          formatter: (p: { name: string }) => (labelled.has(p.name) ? truncate(p.name, 20) : ""),
        },
        labelLayout: { hideOverlap: true },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: VIZ.axis, width: 1, type: "solid" },
          label: {
            fontSize: 10,
            color: VIZ.inkMuted,
            formatter: (p: { value: number }) => (p.value === medX ? `median ${compactINR(medX)}` : `median ${Math.round(medY)}d`),
          },
          data: [{ xAxis: medX }, { yAxis: medY }],
        },
      },
    ],
  };
}

/** How long invoices take to get fully paid — count per delay bucket, ₹ in tooltip. */
export function delayHistogramOption(
  buckets: { label: string; count: number; amount: number }[],
): EChartsCoreOption {
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 16, top: 16, bottom: 30, containLabel: true },
    tooltip: {
      ...TOOLTIP_COMMON,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,0,0,0.03)" } },
      formatter: (ps: { dataIndex: number }[]) => {
        const b = buckets[ps[0].dataIndex];
        return `<b>${b.count} invoice${b.count === 1 ? "" : "s"}</b> · ${fullINR(b.amount)}<br/>` +
          `<span style="color:${VIZ.inkMuted}">fully paid within ${b.label} days</span>`;
      },
    },
    xAxis: {
      type: "category",
      data: buckets.map((b) => b.label),
      name: "Days from invoice to full payment",
      nameLocation: "middle",
      nameGap: 32,
      nameTextStyle: { fontSize: 11, color: VIZ.inkMuted },
      ...AXIS_COMMON,
      splitLine: { show: false },
    },
    yAxis: { type: "value", ...AXIS_COMMON, axisLabel: { ...AXIS_COMMON.axisLabel }, minInterval: 1 },
    series: [
      {
        type: "bar",
        data: buckets.map((b) => b.count),
        barMaxWidth: 26,
        itemStyle: { color: VIZ.blue, borderRadius: [4, 4, 0, 0] },
        label: { show: true, position: "top", fontSize: 10.5, color: VIZ.inkMuted, formatter: (p: { value: number }) => (p.value > 0 ? p.value : "") },
      },
    ],
  };
}

/** Linked dual-grid flow: submitted vs approved counts above, ₹ settled below. */
export function flowTrendOption(
  labels: string[],
  submitted: number[],
  approved: number[],
  settled: number[],
): EChartsCoreOption {
  return {
    textStyle: CHART_TEXT,
    legend: {
      top: 0,
      right: 8,
      itemGap: 16,
      textStyle: { color: VIZ.inkSecondary, fontSize: 12 },
      data: [{ name: "Submitted" }, { name: "Approved" }, { name: "₹ settled", icon: "roundRect" }],
    },
    tooltip: {
      ...TOOLTIP_COMMON,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: VIZ.axis, width: 1 } },
      formatter: (ps: { seriesName: string; value: number; axisValueLabel: string }[]) => {
        const rows = ps.map((p) =>
          `<span style="color:${VIZ.inkMuted}">${p.seriesName}</span> <b>${p.seriesName === "₹ settled" ? fullINR(p.value) : p.value}</b>`
        ).join("<br/>");
        return `<div style="margin-bottom:4px;font-weight:600">${ps[0]?.axisValueLabel || ""}</div>${rows}`;
      },
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: [
      { left: 8, right: 16, top: 30, height: "38%", containLabel: true },
      { left: 8, right: 16, bottom: 8, height: "30%", containLabel: true },
    ],
    xAxis: [
      { type: "category", gridIndex: 0, data: labels, ...AXIS_COMMON, splitLine: { show: false }, axisLabel: { show: false } },
      { type: "category", gridIndex: 1, data: labels, ...AXIS_COMMON, splitLine: { show: false } },
    ],
    yAxis: [
      { type: "value", gridIndex: 0, name: "Invoices", nameTextStyle: { fontSize: 10, color: VIZ.inkMuted, align: "left" }, ...AXIS_COMMON, minInterval: 1 },
      {
        type: "value", gridIndex: 1, name: "₹ settled", nameTextStyle: { fontSize: 10, color: VIZ.inkMuted, align: "left" },
        ...AXIS_COMMON, axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (v: number) => compactINR(v) },
      },
    ],
    series: [
      {
        name: "Submitted", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: submitted,
        color: PIPELINE_RAMP[0], lineStyle: { width: 2 }, symbol: "circle", symbolSize: 7,
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2 },
      },
      {
        name: "Approved", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: approved,
        color: PIPELINE_RAMP[3], lineStyle: { width: 2 }, symbol: "circle", symbolSize: 7,
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2 },
      },
      {
        name: "₹ settled", type: "bar", xAxisIndex: 1, yAxisIndex: 1, data: settled,
        color: VIZ.aqua, barMaxWidth: 18, itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

/** Rejection analysis: ₹ blocked per reason. Rejection IS the bad state, so it wears the status color. */
export function rejectionOption(
  rows: { reason: string; count: number; amount: number }[],
): EChartsCoreOption {
  const display = rows.slice(0, 6).reverse();
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...TOOLTIP_COMMON,
      formatter: (p: { dataIndex: number }) => {
        const r = display[p.dataIndex];
        return `<b>${fullINR(r.amount)}</b> across ${r.count} invoice${r.count === 1 ? "" : "s"}<br/>` +
          `<span style="color:${VIZ.inkMuted}">${r.reason}</span>`;
      },
    },
    xAxis: { type: "value", ...AXIS_COMMON, axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (v: number) => compactINR(v) } },
    yAxis: {
      type: "category",
      data: display.map((r) => truncate(r.reason, 34)),
      ...AXIS_COMMON,
      splitLine: { show: false },
      axisLabel: { ...AXIS_COMMON.axisLabel, fontSize: 11, color: VIZ.inkSecondary },
    },
    series: [
      {
        type: "bar",
        data: display.map((r) => r.amount),
        barMaxWidth: 16,
        itemStyle: { color: VIZ.critical, borderRadius: [0, 4, 4, 0], opacity: 0.85 },
        label: {
          show: true,
          position: "right",
          fontSize: 10.5,
          color: VIZ.inkMuted,
          formatter: (p: { dataIndex: number }) => `${display[p.dataIndex].count} inv`,
        },
      },
    ],
  };
}

/** Dumbbell: top vendors, billed ↔ settled dots — the visible gap is the money owed. */
export function dumbbellOption(
  rows: { name: string; invoiced: number; settled: number }[],
): EChartsCoreOption {
  const names = rows.map((r) => r.name);
  return {
    textStyle: CHART_TEXT,
    grid: { left: 8, right: 90, top: 34, bottom: 8, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      itemGap: 16,
      itemWidth: 10,
      itemHeight: 10,
      icon: "circle",
      textStyle: { color: VIZ.inkSecondary, fontSize: 12 },
      data: ["Billed", "Settled"],
    },
    tooltip: {
      ...TOOLTIP_COMMON,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "rgba(0,0,0,0.03)" } },
      formatter: (params: { dataIndex: number }[]) => {
        const r = rows[params[0].dataIndex];
        const out = Math.max(0, r.invoiced - r.settled);
        return (
          `<b>${r.name}</b><br/>` +
          `Billed <b>${fullINR(r.invoiced)}</b> · Settled <b>${fullINR(r.settled)}</b><br/>` +
          `<span style="color:${VIZ.inkMuted}">Unpaid ${fullINR(out)}</span>`
        );
      },
    },
    xAxis: {
      type: "value",
      ...AXIS_COMMON,
      axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (v: number) => compactINR(v) },
    },
    yAxis: {
      type: "category",
      data: names,
      inverse: true,
      ...AXIS_COMMON,
      splitLine: { show: false },
      axisLabel: { ...AXIS_COMMON.axisLabel, formatter: (s: string) => truncate(s, 22) },
    },
    series: [
      {
        // connector drawn beneath the dots
        type: "custom",
        silent: true,
        z: 1,
        renderItem: (params: { dataIndex: number }, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
          const i = params.dataIndex;
          const a = api.coord([rows[i].settled, i]);
          const b = api.coord([rows[i].invoiced, i]);
          return {
            type: "line",
            shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] },
            style: { stroke: "#cde2fb", lineWidth: 4, lineCap: "round" },
          };
        },
        data: rows.map((_, i) => i),
      },
      {
        name: "Billed",
        type: "scatter",
        z: 2,
        data: rows.map((r) => r.invoiced),
        symbolSize: 12,
        color: "#86b6ef",
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2 },
        label: {
          show: true,
          position: "right",
          distance: 8,
          formatter: (p: { dataIndex: number }) => {
            const r = rows[p.dataIndex];
            const out = Math.max(0, r.invoiced - r.settled);
            return out > 0 ? `${compactINR(out)} unpaid` : "cleared";
          },
          color: VIZ.inkMuted,
          fontSize: 11,
        },
      },
      {
        name: "Settled",
        type: "scatter",
        z: 3,
        data: rows.map((r) => r.settled),
        symbolSize: 12,
        color: VIZ.blue,
        itemStyle: { borderColor: VIZ.surface, borderWidth: 2 },
      },
    ],
  };
}
