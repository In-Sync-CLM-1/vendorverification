import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_PAGE_SIZE = 50;

export interface PagerState {
  total: number;
  page: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
}

/** Slices `items` into pages (default 50). Goes back to page 1 when the list changes size or page size changes. */
export function usePager<T>(items: T[]): { rows: T[]; pager: PagerState } {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const total = items.length;

  useEffect(() => { setPage(1); }, [total, pageSize]);

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, lastPage);
  const rows = items.slice((current - 1) * pageSize, current * pageSize);
  return { rows, pager: { total, page: current, pageSize, setPage, setPageSize } };
}

export function TablePager({ pager }: { pager: PagerState }) {
  const { total, page, pageSize, setPage, setPageSize } = pager;
  if (total <= PAGE_SIZES[0]) return null;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>Showing {from}–{to} of {total}</span>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2">
          Rows per page
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
            <SelectContent>{PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </span>
        <span>Page {page} of {lastPage}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
