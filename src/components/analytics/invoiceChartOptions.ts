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
