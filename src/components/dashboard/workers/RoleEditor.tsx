import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AppRole } from "@/contexts/AppSessionContext";
import { getAssignableRoles, DEVELOPER_INHERITS_ALL } from "./types";
import { cn } from "@/lib/utils";

interface RoleEditorProps {
  selectedRoles: AppRole[];
  onChange: (roles: AppRole[]) => void;
  currentUserIsDeveloper?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export function RoleEditor({
  selectedRoles,
  onChange,
  currentUserIsDeveloper = false,
  disabled = false,
  compact = false,
}: RoleEditorProps) {
  const assignableRoles = getAssignableRoles(currentUserIsDeveloper);
  const hasDeveloperRole = selectedRoles.includes("developer");

  const handleToggle = (role: AppRole, checked: boolean) => {
    if (checked) {
      // If selecting developer, it implies all other roles
      if (role === "developer" && DEVELOPER_INHERITS_ALL) {
        onChange(["developer"]);
      } else {
        onChange([...selectedRoles, role]);
      }
    } else {
      onChange(selectedRoles.filter((r) => r !== role));
    }
  };

  // If compact mode, show as inline badges
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {assignableRoles.map((role) => {
          const Icon = role.icon;
          const isChecked = selectedRoles.includes(role.value);
          // Developer role implies all others
          const isImplied = hasDeveloperRole && role.value !== "developer";

          return (
            <button
              key={role.value}
              type="button"
              disabled={disabled || isImplied}
              onClick={() => handleToggle(role.value, !isChecked)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                isChecked || isImplied
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/50 text-muted-foreground border-transparent hover:border-primary/40",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Icon className="h-3 w-3" />
              {role.label}
              {isImplied && <span className="text-[10px] opacity-70">(heredado)</span>}
            </button>
          );
        })}
      </div>
    );
  }

  // Full card mode
  return (
    <div className="space-y-3">
      <Label>Roles</Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {assignableRoles.map((role) => {
          const Icon = role.icon;
          const isChecked = selectedRoles.includes(role.value);
          // Developer role implies all others
          const isImplied = hasDeveloperRole && role.value !== "developer";
          const effectiveChecked = isChecked || isImplied;

          return (
            <label
              key={role.value}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                effectiveChecked
                  ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:bg-muted/30",
                (disabled || isImplied) && "cursor-not-allowed opacity-60"
              )}
            >
              <Checkbox
                checked={effectiveChecked}
                disabled={disabled || isImplied}
                onCheckedChange={(checked) => handleToggle(role.value, checked === true)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      "h-4 w-4 flex-shrink-0",
                      effectiveChecked ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="text-sm font-medium">{role.label}</span>
                  {isImplied && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      heredado
                    </Badge>
                  )}
                </div>
                {role.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {role.description}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>
      
      {hasDeveloperRole && DEVELOPER_INHERITS_ALL && (
        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
          💡 El rol <strong>Desarrollador</strong> tiene acceso a todas las funcionalidades del sistema.
        </p>
      )}
    </div>
  );
}
