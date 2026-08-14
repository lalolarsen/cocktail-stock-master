import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2",
        compact ? "py-6 px-3" : "py-12 px-6",
        className,
      )}
    >
      {Icon && (
        <Icon
          className={cn("text-muted-foreground/30", compact ? "w-7 h-7" : "w-10 h-10")}
          strokeWidth={1.5}
        />
      )}
      <p className={cn("font-medium text-foreground", compact ? "text-xs" : "text-sm")}>{title}</p>
      {description && (
        <p className={cn("text-muted-foreground max-w-sm", compact ? "text-[11px]" : "text-xs")}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
