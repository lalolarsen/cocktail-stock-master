import { Navigate } from "react-router-dom";
import { useAppSession, AppRole } from "@/contexts/AppSessionContext";
import { Loader2 } from "lucide-react";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles: AppRole[];
};

const JORNADA_EXEMPT_ROLES: AppRole[] = ["admin", "gerencia", "developer"];

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, roles, isLoading, hasActiveJornada, jornadaLoading } = useAppSession();

  if (isLoading || jornadaLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check if user has any of the allowed roles
  const hasAllowedRole = roles.some(role => allowedRoles.includes(role));

  if (!hasAllowedRole) {
    // Redirect based on user's primary role to their appropriate portal
    const primaryRole = roles[0];
    switch (primaryRole) {
      case "developer":
        return <Navigate to="/developer" replace />;
      case "admin":
        return <Navigate to="/admin" replace />;
      case "gerencia":
        return <Navigate to="/gerencia" replace />;
      case "vendedor":
        return <Navigate to="/sales" replace />;
      case "bar":
        return <Navigate to="/bar" replace />;
      case "ticket_seller":
        return <Navigate to="/tickets" replace />;
      default:
        return <Navigate to="/auth" replace />;
    }
  }

  // Jornada guard: non-exempt roles blocked when no active jornada
  const isExempt = roles.some(r => JORNADA_EXEMPT_ROLES.includes(r));
  if (!isExempt && !hasActiveJornada) {
    return <Navigate to="/no-jornada" replace />;
  }

  return <>{children}</>;
}
