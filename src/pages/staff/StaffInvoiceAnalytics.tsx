import { useMemo, useState } from "react";
import { StaffLayout } from "@/components/layout/StaffLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EChart } from "@/components/analytics/EChart";
import { StatTile } from "@/components/analytics/StatTile";
import {
  AnalyticsDateFilter,
  AnalyticsRange,
  defaultAnalyticsRange,
} from "@/components/analytics/AnalyticsDateFilter";
import { useInvoiceAnalytics } from "@/hooks/useInvoiceAnalytics";
import {
  cashMotionOption,
  pipelineOption,
  compositionOption,
  agingHeatmapOption,
  dumbbellOption,
  lifecycleFunnelOption,
  vendorDensityOption,
  quadrantOption,
  delayHistogramOption,
  flowTrendOption,
  rejectionOption,
} from "@/components/analytics/invoiceChartOptions";
import { compactINR, fullINR, VIZ } from "@/lib/vizPalette";
import { INVOICE_STATUS_META } from "@/lib/invoices";
import { format } from "date-fns";
import { Download, Loader2, TriangleAlert, ArrowUpDown, FileBarChart2 } from "lucide-react";

const pctDelta = (cur: number, prev: number | null): number | null =>
  prev === null || prev <= 0 ? null : ((cur - prev) / prev) * 100;

function exportCSV(rows: Record<string, string | number>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const fmtDate = (iso: string) => format(new Date(iso), "dd MMM yyyy");

function AgeBadge({ days }: { days: number }) {
  if (days > 90)
    return (
      <Badge variant="outline" className="border-transparent bg-red-50 text-[#b02a2a] gap-1">
        <TriangleAlert className="h-3 w-3" /> {days}d
      </Badge>
    );
  if (days > 60)
    return <Badge variant="outline" className="border-transparent bg-orange-50 text-orange-800">{days}d</Badge>;
  if (days > 30)
    return <Badge variant="outline" className="border-transparent bg-amber-50 text-amber-800">{days}d</Badge>;
  return <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">{days}d</Badge>;
}

type VendorSortKey = "invoiced" | "settled" | "outstanding" | "count" | "name";

function MiniKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      <p className="text-lg font-semibold leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export default function StaffInvoiceAnalytics() {
  const [range, setRange] = useState<AnalyticsRange>(defaultAnalyticsRange);
  const [vendorFilter, setVendorFilter] = useState("all");
  const [activeTable, setActiveTable] = useState("vendors");
  const [vendorSort, setVendorSort] = useState<{ key: VendorSortKey; dir: 1 | -1 }>({ key: "invoiced", dir: -1 });

  const a = useInvoiceAnalytics(range, vendorFilter);

  const sortedVendorRows = useMemo(() => {
    const rows = [...a.vendorRows];
    const { key, dir } = vendorSort;
    rows.sort((x, y) =>
      key === "name" ? dir * x.name.localeCompare(y.name) : dir * ((x[key] as number) - (y[key] as number))
    );
    return rows;
  }, [a.vendorRows, vendorSort]);

  const toggleSort = (key: VendorSortKey) =>
    setVendorSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : -1 }));

  const pipelineTotal = a.pipeline.reduce((s, p) => s + p.amount, 0);
  const hasAnyData = a.totalInvoiceCount > 0 || a.overdueRows.length > 0;

  const heatmapHeight = Math.max(160, a.agingRows.length * 38 + 80);
  const dumbbellHeight = Math.max(180, a.dumbbell.length * 42 + 70);

  const SortHead = ({ k, children, className }: { k: VendorSortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <button
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => toggleSort(k)}
      >
        {children}
        <ArrowUpDown className={`h-3 w-3 ${vendorSort.key === k ? "opacity-100" : "opacity-30"}`} />
      </button>
    </TableHead>
  );

  return (
    <StaffLayout title="Invoice Analytics">
      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b bg-card">
          <h1 className="text-xl font-semibold">Invoice Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Billing flow, payment pipeline and vendor exposure — every figure below follows the filters
          </p>
        </div>

        <div className="p-4 space-y-4 max-w-[1400px]">
          {/* ── Filter row (scopes everything below) ── */}
          <div className="flex flex-wrap items-center gap-2">
            <AnalyticsDateFilter value={range} onChange={setRange} />
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="h-9 w-[230px]">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendors</SelectItem>
                {a.vendorOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {a.isLoading ? (
            <div className="py-24 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : !hasAnyData ? (
            <Card>
              <CardContent className="py-16 text-center space-y-2">
                <FileBarChart2 className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="font-medium">No invoice activity in this period</p>
                <p className="text-sm text-muted-foreground">
                  Widen the date range, or wait for vendors to submit invoices.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── KPI row ── */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <StatTile
                  label={`Invoiced · ${range.label.toLowerCase()}`}
                  value={compactINR(a.kpis.invoicedInRange)}
                  deltaPct={pctDelta(a.kpis.invoicedInRange, a.kpis.invoicedPrev)}
                  spark={a.sparkInvoiced}
                />
                <StatTile
                  label={`Settled · ${range.label.toLowerCase()}`}
                  value={compactINR(a.kpis.settledInRange)}
                  deltaPct={pctDelta(a.kpis.settledInRange, a.kpis.settledPrev)}
                  spark={a.sparkSettled}
                />
                <StatTile
                  label="Outstanding today"
                  value={compactINR(a.kpis.outstandingNow)}
                  deltaPct={pctDelta(a.kpis.outstandingNow, a.kpis.outstandingPrevMonth)}
                  deltaLabel="vs a month ago"
                  upIsGood={false}
                  spark={a.sparkOutstanding}
                />
                <StatTile
                  label="Avg days to pay"
                  value={a.kpis.avgDaysToPay === null ? "—" : `${a.kpis.avgDaysToPay}d`}
                  deltaPct={null}
                  sub={
                    a.kpis.paidCount > 0
                      ? `across ${a.kpis.paidCount} invoice${a.kpis.paidCount === 1 ? "" : "s"} fully paid`
                      : "no invoices fully paid in this period"
                  }
                />
              </div>

              {/* ── Cash motion ── */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Cash motion — billed vs settled, with the running balance owed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EChart
                    option={cashMotionOption(a.months, a.invoicedByMonth, a.settledByMonth, a.runningOutstanding)}
                    height={280}
                  />
                </CardContent>
              </Card>

              {/* ── Pipeline ── */}
              <Card>
                <CardHeader className="pb-1 flex-row items-baseline justify-between space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Payment pipeline — how far along the period's {fullINR(pipelineTotal)} is
                  </CardTitle>
                  {a.rejectedCount > 0 && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <TriangleAlert className="h-3 w-3 text-[#d03b3b]" />
                      {a.rejectedCount} rejected · {compactINR(a.rejectedAmount)} (not shown)
                    </span>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {pipelineTotal > 0 ? (
                    <EChart option={pipelineOption(a.pipeline, pipelineTotal)} height={96} />
                  ) : (
                    <p className="text-sm text-muted-foreground py-6 text-center">No invoices in this period</p>
                  )}
                </CardContent>
              </Card>

              {/* ── Aging + exposure ── */}
              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Unpaid money by age — as of today
                    </CardTitle>
                    {a.agingTotals[3] > 0 && (
                      <p className="text-xs !mt-1 inline-flex items-center gap-1 text-[#b02a2a]">
                        <TriangleAlert className="h-3 w-3" />
                        {compactINR(a.agingTotals[3])} is over 90 days old
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    {a.agingRows.length > 0 ? (
                      <EChart option={agingHeatmapOption(a.agingRows)} height={heatmapHeight} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-10 text-center">
                        Nothing outstanding — all invoices settled 🎉
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Biggest vendors this period — billed ↔ settled
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {a.dumbbell.length > 0 ? (
                      <EChart option={dumbbellOption(a.dumbbell)} height={dumbbellHeight} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-10 text-center">No invoices in this period</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ── Settlement composition ── */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    What settlements were made of — payout, advance and TDS
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EChart
                    option={compositionOption(a.months, a.compPayout, a.compAdvance, a.compTds)}
                    height={240}
                  />
                </CardContent>
              </Card>

              {/* ══════════════ Process intelligence (deep analysis) ══════════════ */}
              <div className="pt-2">
                <h2 className="text-base font-semibold">Process intelligence</h2>
                <p className="text-sm text-muted-foreground">
                  How well the invoice-to-payment process itself is running — same filters apply
                </p>
              </div>

              {/* process health strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                <MiniKpi
                  label="Approval rate"
                  value={a.processKpis.approvalRatePct === null ? "—" : `${a.processKpis.approvalRatePct}%`}
                  sub="of decided invoices"
                />
                <MiniKpi
                  label="Rejection rate"
                  value={a.processKpis.rejectionRatePct === null ? "—" : `${a.processKpis.rejectionRatePct}%`}
                  sub={`${a.rejectedCount} rejected · ${compactINR(a.rejectedAmount)}`}
                />
                <MiniKpi
                  label="Avg days to approve"
                  value={a.processKpis.avgApproveDays === null ? "—" : `${a.processKpis.avgApproveDays}d`}
                  sub="invoice date → review"
                />
                <MiniKpi
                  label="Median days to pay"
                  value={a.processKpis.medianPayDays === null ? "—" : `${a.processKpis.medianPayDays}d`}
                  sub="invoice date → fully paid"
                />
                <MiniKpi
                  label="PO coverage"
                  value={a.processKpis.poCoveragePct === null ? "—" : `${a.processKpis.poCoveragePct}%`}
                  sub="invoices backed by a PO"
                />
                <MiniKpi
                  label="GST / TDS in period"
                  value={compactINR(a.processKpis.gstInRange)}
                  sub={`TDS deducted ${compactINR(a.processKpis.tdsInRange)}`}
                />
              </div>

              {/* funnel + flow trend */}
              <div className="grid lg:grid-cols-5 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Invoice lifecycle — where value drops off
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EChart option={lifecycleFunnelOption(a.funnel)} height={230} />
                    <p className="text-xs text-muted-foreground text-center">
                      {a.funnel.inReview > 0 && `${a.funnel.inReview} invoice${a.funnel.inReview === 1 ? "" : "s"} still in review · `}
                      approval and payment rates in the tooltip
                    </p>
                  </CardContent>
                </Card>
                <Card className="lg:col-span-3">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Flow by {a.flowGranularity} — submissions and approvals above, money out below
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EChart
                      option={flowTrendOption(a.flowLabels, a.flowSubmitted, a.flowApproved, a.flowSettled)}
                      height={290}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* vendor density map */}
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Vendor performance map — every column shaded against its own best
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {a.deepVendorRows.length > 0 ? (
                    <EChart
                      option={vendorDensityOption(a.deepVendorRows.slice(0, 12))}
                      height={Math.max(220, Math.min(12, a.deepVendorRows.length) * 36 + 70)}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground py-10 text-center">No invoices in this period</p>
                  )}
                </CardContent>
              </Card>

              {/* quadrant + delay histogram */}
              <div className="grid lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Exposure vs pay speed — top-right is "big and slow"
                    </CardTitle>
                    <p className="text-xs text-muted-foreground !mt-1">
                      Dot size = money outstanding now · lines mark the medians
                    </p>
                  </CardHeader>
                  <CardContent>
                    {a.quadrant.length >= 3 ? (
                      <EChart option={quadrantOption(a.quadrant)} height={300} />
                    ) : (
                      <p className="text-sm text-muted-foreground py-10 text-center">
                        Not enough fully paid invoices yet to compare vendors
                      </p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      How long payment takes — distribution of fully paid invoices
                    </CardTitle>
                    <p className="text-xs text-muted-foreground !mt-1">
                      {a.processKpis.medianPayDays !== null && `Median ${a.processKpis.medianPayDays} days · `}
                      hover a bar for the ₹ value in that band
                    </p>
                  </CardHeader>
                  <CardContent>
                    <EChart option={delayHistogramOption(a.delayHistogram)} height={300} />
                  </CardContent>
                </Card>
              </div>

              {/* rejection analysis */}
              {a.rejectionRows.length > 0 && (
                <Card>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm font-medium text-muted-foreground inline-flex items-center gap-1.5">
                      <TriangleAlert className="h-3.5 w-3.5 text-[#d03b3b]" />
                      Why invoices get rejected — {compactINR(a.rejectedAmount)} blocked in this period
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EChart
                      option={rejectionOption(a.rejectionRows)}
                      height={Math.max(120, Math.min(6, a.rejectionRows.length) * 42 + 40)}
                    />
                  </CardContent>
                </Card>
              )}

              {/* ── Tables ── */}
              <Card>
                <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                  <Tabs value={activeTable} onValueChange={setActiveTable}>
                    <TabsList>
                      <TabsTrigger value="vendors">By vendor</TabsTrigger>
                      <TabsTrigger value="performance">Performance</TabsTrigger>
                      <TabsTrigger value="overdue">
                        Overdue
                        {a.overdueRows.length > 0 && (
                          <span className="ml-1.5 text-xs text-muted-foreground">({a.overdueRows.length})</span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="register">Register</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (activeTable === "vendors" || activeTable === "performance") {
                        // structured multi-section export (executive-summary style)
                        const esc = (v: string | number) => {
                          const s = String(v ?? "");
                          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                        };
                        const lines: string[] = [];
                        lines.push(`Invoice Analytics export`);
                        lines.push(`Period,${range.label},${range.from ? format(range.from, "yyyy-MM-dd") : "all"} to ${range.to ? format(range.to, "yyyy-MM-dd") : "all"}`);
                        lines.push(`Vendor filter,${vendorFilter === "all" ? "All vendors" : a.vendorOptions.find((v) => v.id === vendorFilter)?.name || vendorFilter}`);
                        lines.push("");
                        lines.push("PROCESS HEALTH");
                        lines.push(`Approval rate %,${a.processKpis.approvalRatePct ?? ""}`);
                        lines.push(`Rejection rate %,${a.processKpis.rejectionRatePct ?? ""}`);
                        lines.push(`Avg days to approve,${a.processKpis.avgApproveDays ?? ""}`);
                        lines.push(`Median days to pay,${a.processKpis.medianPayDays ?? ""}`);
                        lines.push(`PO coverage %,${a.processKpis.poCoveragePct ?? ""}`);
                        lines.push(`GST in period (₹),${Math.round(a.processKpis.gstInRange)}`);
                        lines.push(`TDS in period (₹),${Math.round(a.processKpis.tdsInRange)}`);
                        lines.push("");
                        lines.push("BY VENDOR");
                        lines.push("Vendor,Code,Invoices,Invoiced (₹),Avg size (₹),Approval %,Rejection %,Avg days to approve,Avg days to pay,PO %,Settled (₹),Outstanding (₹),TDS (₹)");
                        for (const v of a.deepVendorRows) {
                          const money = a.vendorRows.find((m) => m.vendorId === v.vendorId);
                          lines.push([
                            esc(v.name), v.code, v.invoices, v.invoiced, v.avgSize,
                            v.approvalPct ?? "", v.rejectionPct ?? "", v.avgApproveDays ?? "", v.avgPayDays ?? "",
                            v.poPct, Math.round(money?.settled ?? 0), v.outstanding, v.tds,
                          ].join(","));
                        }
                        lines.push("");
                        lines.push("BY MONTH");
                        lines.push("Month,Invoiced (₹),Settled (₹),Outstanding at month end (₹),Paid out (₹),Advance adjusted (₹),TDS (₹)");
                        for (const m of a.byMonthCsv) {
                          lines.push([esc(m.month), m.invoiced, m.settled, m.outstandingEnd, m.payout, m.advance, m.tds].join(","));
                        }
                        lines.push("");
                        lines.push("REJECTION REASONS");
                        lines.push("Reason,Invoices,Amount (₹)");
                        for (const r of a.rejectionRows) lines.push([esc(r.reason), r.count, Math.round(r.amount)].join(","));
                        const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
                        const el = document.createElement("a");
                        el.href = url;
                        el.download = "invoice-analytics-summary.csv";
                        el.click();
                        URL.revokeObjectURL(url);
                      } else if (activeTable === "overdue")
                        exportCSV(
                          a.overdueRows.map((r) => ({
                            Invoice: r.invoiceNumber, Vendor: r.vendorName, "Invoice date": r.invoiceDate,
                            "Age (days)": r.age, "Amount (₹)": r.amount, "Settled (₹)": Math.round(r.settled),
                            "Outstanding (₹)": Math.round(r.outstanding), Status: INVOICE_STATUS_META[r.status].label,
                          })),
                          "invoice-analytics-overdue.csv"
                        );
                      else
                        exportCSV(
                          a.registerRows.map((r) => ({
                            Invoice: r.invoiceNumber, Vendor: r.vendorName, Date: r.invoiceDate,
                            "Amount (₹)": r.amount, "GST (₹)": r.gst, Status: INVOICE_STATUS_META[r.status].label,
                            "Settled (₹)": Math.round(r.settled), "Outstanding (₹)": Math.round(r.outstanding),
                          })),
                          "invoice-analytics-register.csv"
                        );
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" /> Export CSV
                  </Button>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  {activeTable === "vendors" && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortHead k="name">Vendor</SortHead>
                          <SortHead k="count" className="text-right">Invoices</SortHead>
                          <SortHead k="invoiced" className="text-right">Invoiced</SortHead>
                          <SortHead k="settled" className="text-right">Settled</SortHead>
                          <SortHead k="outstanding" className="text-right">Outstanding</SortHead>
                          <TableHead className="text-right">Oldest unpaid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedVendorRows.map((v) => (
                          <TableRow key={v.vendorId}>
                            <TableCell>
                              <span className="font-medium">{v.name}</span>
                              {v.code && <span className="text-xs text-muted-foreground ml-2 font-mono">{v.code}</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{v.count}</TableCell>
                            <TableCell className="text-right tabular-nums">{fullINR(v.invoiced)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fullINR(v.settled)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {v.outstanding > 0 ? fullINR(v.outstanding) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {v.oldestUnpaidDays !== null ? <AgeBadge days={v.oldestUnpaidDays} /> : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                        {sortedVendorRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                              No invoices in this period
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}

                  {activeTable === "performance" && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead className="text-right">Invoices</TableHead>
                          <TableHead className="text-right">Avg size</TableHead>
                          <TableHead className="text-right">Approval</TableHead>
                          <TableHead className="text-right">Days to approve</TableHead>
                          <TableHead className="text-right">Days to pay</TableHead>
                          <TableHead className="text-right">PO cover</TableHead>
                          <TableHead className="text-right">TDS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {a.deepVendorRows.map((v) => (
                          <TableRow key={v.vendorId}>
                            <TableCell>
                              <span className="font-medium">{v.name}</span>
                              {v.code && <span className="text-xs text-muted-foreground ml-2 font-mono">{v.code}</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{v.invoices}</TableCell>
                            <TableCell className="text-right tabular-nums">{fullINR(v.avgSize)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {v.approvalPct === null ? "—" : (
                                <span className={v.approvalPct < 85 ? "text-[#b02a2a] font-medium" : ""}>{v.approvalPct}%</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{v.avgApproveDays === null ? "—" : `${v.avgApproveDays}d`}</TableCell>
                            <TableCell className="text-right tabular-nums">{v.avgPayDays === null ? "—" : `${v.avgPayDays}d`}</TableCell>
                            <TableCell className="text-right tabular-nums">{v.poPct}%</TableCell>
                            <TableCell className="text-right tabular-nums">{v.tds > 0 ? fullINR(v.tds) : "—"}</TableCell>
                          </TableRow>
                        ))}
                        {a.deepVendorRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                              No invoices in this period
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}

                  {activeTable === "overdue" && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Age</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {a.overdueRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.invoiceNumber}</TableCell>
                            <TableCell>{r.vendorName}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(r.invoiceDate)}</TableCell>
                            <TableCell><AgeBadge days={r.age} /></TableCell>
                            <TableCell className="text-right tabular-nums">{fullINR(r.amount)}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium">{fullINR(r.outstanding)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={INVOICE_STATUS_META[r.status].className}>
                                {INVOICE_STATUS_META[r.status].label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {a.overdueRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                              Nothing outstanding — all settled
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}

                  {activeTable === "register" && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">GST</TableHead>
                          <TableHead className="text-right">Settled</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {a.registerRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.invoiceNumber}</TableCell>
                            <TableCell>{r.vendorName}</TableCell>
                            <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDate(r.invoiceDate)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fullINR(r.amount)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {r.gst > 0 ? fullINR(r.gst) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.settled > 0 ? fullINR(r.settled) : "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={INVOICE_STATUS_META[r.status].className}>
                                {INVOICE_STATUS_META[r.status].label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {a.registerRows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                              No invoices in this period
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </StaffLayout>
  );
}
