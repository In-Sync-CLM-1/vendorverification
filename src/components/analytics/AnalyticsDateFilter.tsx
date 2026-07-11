import { useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
} from "date-fns";
import { Calendar as CalendarIcon, Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface AnalyticsRange {
  from: Date | null; // null = all time
  to: Date | null;
  label: string;
}

/** Indian financial year: 1 April – today. */
function fyStart(now: Date): Date {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(y, 3, 1);
}

export function defaultAnalyticsRange(): AnalyticsRange {
  const now = new Date();
  return { from: subDays(now, 179), to: now, label: "Last 6 months" };
}

interface Props {
  value: AnalyticsRange;
  onChange: (r: AnalyticsRange) => void;
}

export function AnalyticsDateFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();

  const now = () => new Date();
  const presets: { label: string; make: () => AnalyticsRange }[] = [
    { label: "Last 30 days", make: () => ({ from: subDays(now(), 29), to: now(), label: "Last 30 days" }) },
    { label: "Last 90 days", make: () => ({ from: subDays(now(), 89), to: now(), label: "Last 90 days" }) },
    { label: "Last 6 months", make: () => ({ from: subDays(now(), 179), to: now(), label: "Last 6 months" }) },
    { label: "This month", make: () => ({ from: startOfMonth(now()), to: now(), label: "This month" }) },
    {
      label: "Last month",
      make: () => {
        const lm = subMonths(now(), 1);
        return { from: startOfMonth(lm), to: endOfMonth(lm), label: "Last month" };
      },
    },
    { label: "This quarter", make: () => ({ from: startOfQuarter(now()), to: now(), label: "This quarter" }) },
    { label: "This financial year", make: () => ({ from: fyStart(now()), to: now(), label: "This FY" }) },
    { label: "All time", make: () => ({ from: null, to: null, label: "All time" }) },
  ];

  const display =
    value.from && value.to
      ? `${format(value.from, "d MMM yy")} – ${format(value.to, "d MMM yy")}`
      : "All time";

  const applyDraft = () => {
    if (draft?.from) {
      const to = draft.to || draft.from;
      onChange({ from: draft.from, to, label: "Custom" });
      setOpen(false);
      setShowCalendar(false);
      setDraft(undefined);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setShowCalendar(false);
          setDraft(undefined);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 justify-start font-normal min-w-[220px]">
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground mr-1.5">{value.label}:</span>
          <span>{display}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {showCalendar ? (
          <div className="p-3">
            <Button variant="ghost" size="sm" className="mb-1 -ml-2 text-xs" onClick={() => setShowCalendar(false)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Presets
            </Button>
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={setDraft}
              defaultMonth={subMonths(new Date(), 1)}
              disabled={{ after: new Date() }}
              className="pointer-events-auto"
            />
            <div className="flex justify-end gap-2 pt-2 border-t mt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowCalendar(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={applyDraft} disabled={!draft?.from}>
                Apply
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2 min-w-[210px]">
            {presets.map((p) => (
              <Button
                key={p.label}
                variant="ghost"
                size="sm"
                className={cn("justify-start text-sm h-8 font-normal", value.label === p.label && "font-semibold")}
                onClick={() => {
                  onChange(p.make());
                  setOpen(false);
                }}
              >
                <Check className={cn("h-4 w-4 mr-2", value.label === p.label ? "opacity-100" : "opacity-0")} />
                {p.label}
              </Button>
            ))}
            <Separator className="my-1" />
            <Button
              variant="ghost"
              size="sm"
              className="justify-start text-sm h-8 font-normal"
              onClick={() => setShowCalendar(true)}
            >
              <CalendarIcon className="h-3.5 w-3.5 mr-2 ml-0.5" />
              Custom range…
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
