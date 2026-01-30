// Re-export from centralized context for backwards compatibility
import { useAppSession } from "@/contexts/AppSessionContext";
import type { AppRole } from "@/contexts/AppSessionContext";

export type { AppRole };

export function useUserRole() {
  const { user, role, roles, isLoading, isReadOnly, canModify, hasRole } = useAppSession();
  
  return {
    user,
    role,
    roles,
    loading: isLoading,
    isReadOnly,
    canModify,
    hasRole,
  };
}
