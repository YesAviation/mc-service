import { useEffect } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { useNotificationStore } from "@/stores/notifications";

const CLEAR_AFTER_MS = 2800;

export default function TopNotification() {
  const notification = useNotificationStore((state) => state.activeNotification);
  const clearNotification = useNotificationStore((state) => state.clearNotification);

  useEffect(() => {
    if (!notification) {
      return;
    }

    const clearTimer = window.setTimeout(() => {
      clearNotification();
    }, CLEAR_AFTER_MS);

    return () => {
      window.clearTimeout(clearTimer);
    };
  }, [notification, clearNotification]);

  if (!notification) {
    return null;
  }

  const isSuccess = notification.tone === "success";

  return (
    <div
      className={clsx(
        "top-notification-slide pointer-events-none fixed left-1/2 top-3 z-90 w-[min(92vw,36rem)]",
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className={clsx(
          "rounded-xl border px-4 py-3 shadow-[0_20px_42px_-28px_rgba(0,0,0,0.85)] backdrop-blur-sm",
          isSuccess
            ? "border-emerald-300/55 bg-emerald-500/90 text-white"
            : "border-rose-300/55 bg-rose-500/90 text-white",
        )}
      >
        <div className="flex items-center gap-2.5">
          {isSuccess ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <p className="text-sm font-medium truncate">{notification.message}</p>
        </div>
      </div>
    </div>
  );
}
