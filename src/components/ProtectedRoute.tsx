import { Navigate } from "react-router-dom";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";

type ProtectedRouteProps = {
  children: React.ReactNode;
  allowedRoles: AppRole[];
};

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useUserRole();

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

  if (role && !allowedRoles.includes(role)) {
    // Redirect based on user's actual role
    if (role === "admin") {
      return <Navigate to="/admin" replace />;
    } else if (role === "vendedor") {
      return <Navigate to="/sales" replace />;
    } else if (role === "gerencia") {
      return <Navigate to="/gerencia" replace />;
    } else if (role === "bar") {
      return <Navigate to="/bar" replace />;
    }
  }

  return <>{children}</>;
}
