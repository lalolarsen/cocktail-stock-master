import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { DEFAULT_VENUE_ID, DEFAULT_VENUE_NAME, DEFAULT_VENUE_SLUG, DEFAULT_VENUE_DISPLAY } from "@/lib/venue";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "vendedor" | "gerencia" | "bar" | "ticket_seller" | "developer";

export interface ActiveVenue {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
}

// Kept for backward compatibility — no longer used dynamically
export type FeatureKey = string;

interface AppSessionContextValue {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  role: AppRole | null;
  roles: AppRole[];
  isReadOnly: boolean;
  canModify: boolean;
  hasRole: (role: AppRole) => boolean;
  venue: ActiveVenue | null;
  venueError: string | null;
  displayName: string | null;
  isDemo: boolean;
  /** @deprecated Always returns true — flags removed */
  isEnabled: (key: string) => boolean;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  /** Active jornada */
  activeJornadaId: string | null;
  hasActiveJornada: boolean;
  jornadaLoading: boolean;
}

const AppSessionContext = createContext<AppSessionContextValue | undefined>(undefined);

interface AppSessionProviderProps {
  children: ReactNode;
}

export function AppSessionProvider({ children }: AppSessionProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [venue, setVenue] = useState<ActiveVenue | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);

  // Active jornada state
  const [activeJornadaId, setActiveJornadaId] = useState<string | null>(null);
  const [jornadaLoading, setJornadaLoading] = useState(true);
  const jornadaChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [workerRolesResult, userRolesResult] = await Promise.all([
        supabase.from("worker_roles").select("role").eq("worker_id", userId),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      let fetchedRoles: AppRole[] = [];
      if (!workerRolesResult.error && workerRolesResult.data && workerRolesResult.data.length > 0) {
        fetchedRoles = workerRolesResult.data.map(r => r.role as AppRole);
      } else if (!userRolesResult.error && userRolesResult.data) {
        fetchedRoles = userRolesResult.data.map(r => r.role as AppRole);
      }

      setRoles(fetchedRoles);
      const priorityOrder: AppRole[] = ["developer", "admin", "gerencia", "vendedor", "bar", "ticket_seller"];
      const primaryRole = priorityOrder.find(r => fetchedRoles.includes(r)) || fetchedRoles[0] || null;
      setRole(primaryRole);

      setVenue({
        id: DEFAULT_VENUE_ID,
        name: DEFAULT_VENUE_NAME,
        slug: DEFAULT_VENUE_SLUG,
        isDemo: false,
      });
      setVenueError(null);
    } catch (error) {
      console.error("Error fetching user data:", error);
      setRole(null);
      setRoles([]);
      setVenueError("Error al cargar datos del usuario");
    }
  }, []);

  const clearState = useCallback(() => {
    setUser(null);
    setSession(null);
    setRole(null);
    setRoles([]);
    setVenue(null);
    setVenueError(null);
    setActiveJornadaId(null);
  }, []);

  const initializeSession = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
    } catch (error) {
      console.error("Error initializing session:", error);
      clearState();
    } finally {
      setIsLoading(false);
    }
  }, [fetchUserData, clearState]);

  const refreshSession = useCallback(async () => {
    if (user?.id) {
      await fetchUserData(user.id);
    }
  }, [user?.id, fetchUserData]);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          setTimeout(() => {
            if (isMounted) fetchUserData(newSession.user.id);
          }, 0);
        } else {
          clearState();
        }
      }
    );

    initializeSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initializeSession, fetchUserData, clearState]);

  const hasRole = useCallback((checkRole: AppRole) => roles.includes(checkRole), [roles]);

  // Stub: always enabled (flags removed)
  const isEnabled = useCallback((_key: string): boolean => true, []);

  // ── Active jornada subscription ──
  const fetchActiveJornada = useCallback(async () => {
    try {
      console.log("[Jornada] Checking active jornada for venue:", DEFAULT_VENUE_ID);

      const { data, error } = await supabase
        .from("jornadas")
        .select("id")
        .eq("venue_id", DEFAULT_VENUE_ID)
        .eq("estado", "activa")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log("[Jornada] Result:", { data, error });

      if (!error) {
        setActiveJornadaId(data?.id || null);
      } else {
        console.error("[Jornada] Error fetching:", error);
      }
    } catch (err) {
      console.error("Error checking active jornada:", err);
    }
    setJornadaLoading(false);
  }, []);

  useEffect(() => {
    fetchActiveJornada();

    // Realtime subscription
    const channel = supabase
      .channel("global-jornada-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jornadas" },
        () => fetchActiveJornada()
      )
      .subscribe();
    jornadaChannelRef.current = channel;

    // Fallback polling every 15s
    const poll = setInterval(fetchActiveJornada, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      jornadaChannelRef.current = null;
    };
  }, [fetchActiveJornada]);

  const value: AppSessionContextValue = {
    user,
    session,
    isAuthenticated: !!session,
    role,
    roles,
    isReadOnly: role === "gerencia",
    canModify: role === "admin",
    hasRole,
    venue,
    venueError,
    displayName: DEFAULT_VENUE_DISPLAY,
    isDemo: false,
    isEnabled,
    isLoading,
    refreshSession,
    activeJornadaId,
    hasActiveJornada: !!activeJornadaId,
    jornadaLoading,
  };

  return (
    <AppSessionContext.Provider value={value}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession() {
  const context = useContext(AppSessionContext);
  if (context === undefined) {
    throw new Error("useAppSession must be used within an AppSessionProvider");
  }
  return context;
}
