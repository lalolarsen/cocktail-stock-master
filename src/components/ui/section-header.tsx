import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-3 flex-wrap", className)}>
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground truncate">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
