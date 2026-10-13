import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { StaffStrip } from "./StaffStrip";
import { celebrate } from "./Celebration";
import { clearStreak, doneToday, recordClear } from "@/lib/gamification";

interface QueueVendor {
  current_status: string;
  updated_at: string;
}

/** The "today" cards on the Approval Queue: what this person has cleared and what still waits on them. */
export function QueueStrip({
  vendors,
  isMaker,
  isApprover,
  isAdmin,
}: {
  vendors: QueueVendor[];
  isMaker: boolean;
  isApprover: boolean;
  isAdmin: boolean;
}) {
  const { user } = useAuth();
  const mine = vendors.filter(
    (v) =>
      ((isMaker || isAdmin) && (v.current_status === "pending_review" || v.current_status === "returned_to_maker")) ||
      ((isApprover || isAdmin) && v.current_status === "pending_approval")
  );
  const waiting = mine.length;
  const oldest = mine.reduce((m, v) => Math.max(m, Math.floor((Date.now() - new Date(v.updated_at).getTime()) / 86400000)), 0);
  const [done] = useState(() => doneToday(user?.id));
  const [clearDays, setClearDays] = useState(() => clearStreak(user?.id));
  const prev = useRef<number | null>(null);

  useEffect(() => {
    if (prev.current !== null && prev.current > 0 && waiting === 0) {
      recordClear(user?.id);
      setClearDays(clearStreak(user?.id));
      celebrate("Inbox clear", "Nothing is waiting on you now.", true);
    }
    prev.current = waiting;
  }, [waiting, user?.id]);

  return (
    <div className="border-b bg-card p-4">
      <StaffStrip done={done} waiting={waiting} noun={isApprover && !isMaker ? "vendors to decide" : "vendors to review"} oldestDays={Math.max(oldest, 0)} clearDays={clearDays} />
    </div>
  );
}
