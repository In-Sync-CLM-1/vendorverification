import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

const TYPE_STYLES: Record<string, string> = {
  approval: "border-l-green-500",
  rejection: "border-l-red-500",
  returned_to_maker: "border-l-orange-500",
  in_app: "border-l-primary",
};

interface NotificationBellProps {
  variant?: "light" | "dark";
}

export function NotificationBell({ variant = "light" }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${
          variant === "dark"
            ? "bg-white/20 border border-white/30 hover:bg-white/30"
            : "bg-primary/10 border border-primary/20 hover:bg-primary/15"
        }`}
      >
        <Bell className={`h-4 w-4 ${variant === "dark" ? "text-white" : "text-primary"}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-80 max-h-96 bg-card border border-border rounded-xl shadow-xl z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead.mutate()}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
              >
                <CheckCheck className="h-3 w-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) markAsRead.mutate(n.id);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 last:border-b-0 border-l-[3px] transition-colors ${
                    TYPE_STYLES[n.notification_type || "in_app"] || "border-l-primary"
                  } ${n.is_read ? "bg-card opacity-70" : "bg-primary/5"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${n.is_read ? "font-normal" : "font-semibold"}`}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {n.message}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
