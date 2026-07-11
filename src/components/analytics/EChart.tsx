import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, HeatmapChart, CustomChart, ScatterChart, FunnelChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

echarts.use([
  BarChart,
  LineChart,
  HeatmapChart,
  CustomChart,
  ScatterChart,
  FunnelChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

interface EChartProps {
  option: EChartsCoreOption;
  height: number;
  className?: string;
}

/** Thin ECharts wrapper: init once, replace option on change, resize with container. */
export function EChart({ option, height, className }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ height, width: "100%" }} />;
}
