export const STATUS_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  sending: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
};

export function statusLabel(status: string): string {
  switch (status) {
    case "done":
      return "sent";
    case "scheduled":
      return "waiting for its time";
    case "sending":
      return "delivering";
    default:
      return status;
  }
}
