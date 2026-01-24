import { Navigate } from "react-router-dom";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles: AppRole[];
};

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, roles, loading } = useUserRole();

  if (loading) {
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

  return <>{children}</>;
}
