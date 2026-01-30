import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "vendedor" | "gerencia" | "bar" | "ticket_seller" | "developer";

export interface ActiveVenue {
  id: string;
  name: string;
  slug: string;
  isDemo: boolean;
}

export type FeatureKey = 
  | 'ventas_alcohol'
  | 'ventas_tickets'
  | 'qr_cover'
  | 'inventario'
  | 'reposicion'
  | 'importacion_excel'
  | 'jornadas'
  | 'arqueo'
  | 'reportes'
  | 'contabilidad_basica'
  | 'contabilidad_avanzada'
  | 'lector_facturas'
  | 'tickets_module'
  | 'invoice_reader'
  | 'invoice_to_expense'
  | 'advanced_inventory'
  | 'advanced_reporting'
  | 'erp_accounting';

interface SidebarConfigItem {
  menu_key: string;
  menu_label: string;
  icon_name: string;
  view_type: string;
  feature_flag: string | null;
  external_path: string | null;
  is_enabled: boolean;
}

interface AppSessionContextValue {
  // Auth state
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  
  // Role state
  role: AppRole | null;
  roles: AppRole[];
  isReadOnly: boolean;
  canModify: boolean;
  hasRole: (role: AppRole) => boolean;
  
  // Venue state
  venue: ActiveVenue | null;
  venueError: string | null;
  displayName: string | null;
  isDemo: boolean;
  
  // Feature flags
  featureFlags: Record<string, boolean>;
  isEnabled: (key: FeatureKey) => boolean;
  
  // Sidebar config (pre-loaded)
  sidebarConfig: SidebarConfigItem[] | null;
  
  // Loading state - TRUE until everything is loaded
  isLoading: boolean;
  
  // Refresh functions
  refreshSession: () => Promise<void>;
}

const AppSessionContext = createContext<AppSessionContextValue | undefined>(undefined);

// Map legacy feature keys
const KEY_MAPPING: Record<string, string> = {
  'tickets_module': 'ventas_tickets',
  'invoice_reader': 'lector_facturas',
  'invoice_to_expense': 'contabilidad_basica',
  'advanced_inventory': 'inventario',
  'advanced_reporting': 'reportes',
  'erp_accounting': 'contabilidad_avanzada',
};

// Format venue name helper
function formatVenueName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const venueName = parts[0];
    const location = parts.slice(1).join(" ");
    return `${venueName} – ${location}`;
  }
  return name;
}

interface AppSessionProviderProps {
  children: ReactNode;
}

export function AppSessionProvider({ children }: AppSessionProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  
  // Role state
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  
  // Venue state
  const [venue, setVenue] = useState<ActiveVenue | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  
  // Feature flags
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});
  
  // Sidebar config
  const [sidebarConfig, setSidebarConfig] = useState<SidebarConfigItem[] | null>(null);

  // Fetch all user data in parallel
  const fetchUserData = useCallback(async (userId: string) => {
    try {
      // Start all fetches in parallel
      const [profileResult, workerRolesResult, userRolesResult] = await Promise.all([
        supabase.from("profiles").select("venue_id").eq("id", userId).single(),
        supabase.from("worker_roles").select("role").eq("worker_id", userId),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      // Determine roles
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

      // Check venue
      if (profileResult.error || !profileResult.data?.venue_id) {
        setVenueError("No se encontró venue asignado al usuario");
        setVenue(null);
        return;
      }

      const venueId = profileResult.data.venue_id;

      // Fetch venue details, feature flags, and sidebar config in parallel
      const [venueResult, flagsResult, sidebarResult] = await Promise.all([
        supabase.from("venues").select("id, name, slug, is_demo").eq("id", venueId).single(),
        supabase.rpc("get_venue_flags", { p_venue_id: venueId }),
        primaryRole ? supabase.rpc("get_sidebar_config", { p_venue_id: venueId, p_role: primaryRole }) : Promise.resolve({ data: null, error: null }),
      ]);

      // Set venue
      if (venueResult.error || !venueResult.data) {
        setVenueError("No se pudo cargar la información del venue");
        setVenue(null);
      } else {
        setVenue({
          id: venueResult.data.id,
          name: venueResult.data.name,
          slug: venueResult.data.slug,
          isDemo: venueResult.data.is_demo || venueResult.data.slug === 'demo-distock',
        });
        setVenueError(null);
      }

      // Set feature flags
      if (!flagsResult.error && flagsResult.data) {
        const flagsMap: Record<string, boolean> = {};
        flagsResult.data.forEach((flag: { flag_key: string; enabled: boolean }) => {
          flagsMap[flag.flag_key] = flag.enabled;
        });
        setFeatureFlags(flagsMap);
      }

      // Set sidebar config
      if (!sidebarResult.error && sidebarResult.data) {
        setSidebarConfig(sidebarResult.data as SidebarConfigItem[]);
      } else {
        setSidebarConfig(null);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setRole(null);
      setRoles([]);
      setVenueError("Error al cargar datos del usuario");
    }
  }, []);

  // Clear all state
  const clearState = useCallback(() => {
    setUser(null);
    setSession(null);
    setRole(null);
    setRoles([]);
    setVenue(null);
    setVenueError(null);
    setFeatureFlags({});
    setSidebarConfig(null);
  }, []);

  // Initial load - fetch session and all data before setting loading to false
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

  // Refresh session function for external use
  const refreshSession = useCallback(async () => {
    if (user?.id) {
      await fetchUserData(user.id);
    }
  }, [user?.id, fetchUserData]);

  useEffect(() => {
    let isMounted = true;

    // Set up auth listener FIRST (does not control loading)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!isMounted) return;
        
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Defer data fetch to avoid deadlock
          setTimeout(() => {
            if (isMounted) {
              fetchUserData(newSession.user.id);
            }
          }, 0);
        } else {
          clearState();
        }
      }
    );

    // THEN initialize (controls loading)
    initializeSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initializeSession, fetchUserData, clearState]);

  // Helper for feature flags
  const isEnabled = useCallback((key: FeatureKey): boolean => {
    const mappedKey = KEY_MAPPING[key] || key;
    if (!(mappedKey in featureFlags)) {
      return true; // Default to true for backwards compatibility
    }
    return featureFlags[mappedKey] === true;
  }, [featureFlags]);

  // Helper to check role
  const hasRole = useCallback((checkRole: AppRole) => roles.includes(checkRole), [roles]);

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
    displayName: venue ? formatVenueName(venue.name) : null,
    isDemo: venue?.isDemo || venue?.slug === 'demo-distock' || false,
    featureFlags,
    isEnabled,
    sidebarConfig,
    isLoading,
    refreshSession,
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
