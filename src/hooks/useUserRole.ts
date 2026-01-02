import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "vendedor" | "gerencia" | "bar";

export function useUserRole() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoles(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRoles(session.user.id);
      } else {
        setRole(null);
        setRoles([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRoles = async (userId: string) => {
    try {
      // First try worker_roles table
      const { data: workerRoles, error: workerError } = await supabase
        .from("worker_roles")
        .select("role")
        .eq("worker_id", userId);

      let fetchedRoles: AppRole[] = [];

      if (!workerError && workerRoles && workerRoles.length > 0) {
        fetchedRoles = workerRoles.map(r => r.role as AppRole);
      } else {
        // Fallback to user_roles table
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (!error && data) {
          fetchedRoles = data.map(r => r.role as AppRole);
        }
      }

      setRoles(fetchedRoles);
      // Set primary role (first one, prioritizing admin > gerencia > vendedor > bar)
      const priorityOrder: AppRole[] = ["admin", "gerencia", "vendedor", "bar"];
      const primaryRole = priorityOrder.find(r => fetchedRoles.includes(r)) || fetchedRoles[0] || null;
      setRole(primaryRole);
    } catch (error) {
      console.error("Error fetching user roles:", error);
      setRole(null);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to check if current role is read-only (gerencia)
  const isReadOnly = role === "gerencia";
  
  // Helper to check if user can modify data
  const canModify = role === "admin";

  // Helper to check if user has a specific role
  const hasRole = (checkRole: AppRole) => roles.includes(checkRole);

  return { user, role, roles, loading, isReadOnly, canModify, hasRole };
}
