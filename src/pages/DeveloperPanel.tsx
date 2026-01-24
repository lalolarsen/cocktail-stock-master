import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Loader2, 
  Flag, 
  Building2, 
  Search,
  Shield,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  LogIn,
  AlertCircle
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { FEATURE_DESCRIPTIONS } from "./FeatureFlagsAdmin";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FeatureKey } from "@/hooks/useFeatureFlags";

interface Venue {
  id: string;
  name: string;
  created_at: string;
}

interface FeatureFlag {
  id: string;
  venue_id: string;
  feature_key: string;
  enabled: boolean;
}

export default function DeveloperPanel() {
  const navigate = useNavigate();
  const { loading: roleLoading, hasRole } = useUserRole();
  
  // Supabase Auth session state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Data state
  const [venues, setVenues] = useState<Venue[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());

  // Check Supabase Auth session on mount
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setAuthLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch data only when session exists and user has developer role
  useEffect(() => {
    if (session && !roleLoading && hasRole("developer")) {
      fetchData();
    }
  }, [session, roleLoading, hasRole]);

  const fetchData = async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      // Fetch all venues
      const { data: venuesData, error: venuesError } = await supabase
        .from("venues")
        .select("id, name, created_at")
        .order("name");

      if (venuesError) throw venuesError;
      setVenues(venuesData || []);

      // Fetch all feature flags
      const { data: flagsData, error: flagsError } = await supabase
        .from("feature_flags")
        .select("*");

      if (flagsError) throw flagsError;
      setFlags(flagsData || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      setDataError(error?.message || "Error al cargar datos");
      toast.error("Error al cargar datos");
    } finally {
      setDataLoading(false);
    }
  };

  const toggleFlag = async (venueId: string, featureKey: string, currentEnabled: boolean) => {
    const flagId = `${venueId}-${featureKey}`;
    setUpdating(flagId);

    try {
      // Check if flag exists
      const existingFlag = flags.find(f => f.venue_id === venueId && f.feature_key === featureKey);

      if (existingFlag) {
        // Update existing flag
        const { error } = await supabase
          .from("feature_flags")
          .update({ enabled: !currentEnabled })
          .eq("id", existingFlag.id);

        if (error) throw error;

        setFlags(prev =>
          prev.map(f =>
            f.id === existingFlag.id ? { ...f, enabled: !currentEnabled } : f
          )
        );
      } else {
        // Create new flag
        const { data, error } = await supabase
          .from("feature_flags")
          .insert({
            venue_id: venueId,
            feature_key: featureKey,
            enabled: true,
          })
          .select()
          .single();

        if (error) throw error;
        setFlags(prev => [...prev, data]);
      }

      toast.success(`${featureKey} ${!currentEnabled ? "activado" : "desactivado"}`);
    } catch (error) {
      console.error("Error toggling flag:", error);
      toast.error("Error al actualizar bandera");
    } finally {
      setUpdating(null);
    }
  };

  const createAllFlagsForVenue = async (venueId: string) => {
    setUpdating(venueId);
    try {
      const existingKeys = flags
        .filter(f => f.venue_id === venueId)
        .map(f => f.feature_key);

      const missingKeys = Object.keys(FEATURE_DESCRIPTIONS).filter(
        key => !existingKeys.includes(key)
      );

      if (missingKeys.length === 0) {
        toast.info("Todas las banderas ya existen");
        setUpdating(null);
        return;
      }

      const newFlags = missingKeys.map(key => ({
        venue_id: venueId,
        feature_key: key,
        enabled: false,
      }));

      const { data, error } = await supabase
        .from("feature_flags")
        .insert(newFlags)
        .select();

      if (error) throw error;

      setFlags(prev => [...prev, ...(data || [])]);
      toast.success(`${missingKeys.length} banderas creadas`);
    } catch (error) {
      console.error("Error creating flags:", error);
      toast.error("Error al crear banderas");
    } finally {
      setUpdating(null);
    }
  };

  const toggleVenueExpanded = (venueId: string) => {
    setExpandedVenues(prev => {
      const newSet = new Set(prev);
      if (newSet.has(venueId)) {
        newSet.delete(venueId);
      } else {
        newSet.add(venueId);
      }
      return newSet;
    });
  };

  const getVenueFlags = (venueId: string) => {
    return flags.filter(f => f.venue_id === venueId);
  };

  const getFlagStatus = (venueId: string, featureKey: string): boolean => {
    const flag = flags.find(f => f.venue_id === venueId && f.feature_key === featureKey);
    return flag?.enabled ?? false;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const filteredVenues = venues.filter(venue =>
    venue.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Loading auth session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No Supabase session - show login required screen
  if (!session) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </header>
        <main className="p-6 max-w-md mx-auto mt-20">
          <Card>
            <CardContent className="py-12 text-center space-y-6">
              <LogIn className="h-16 w-16 mx-auto text-primary" />
              <div>
                <h2 className="text-2xl font-bold mb-2">Developer login required</h2>
                <p className="text-muted-foreground">
                  Debes iniciar sesión con una cuenta de desarrollador para acceder al panel.
                </p>
              </div>
              <Button onClick={() => navigate("/dev-auth")} className="gap-2">
                <LogIn className="h-4 w-4" />
                Ir a /dev-auth
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Session exists but still checking role
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Session exists but user is not developer
  if (!hasRole("developer")) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </header>
        <main className="p-6 max-w-4xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Acceso restringido</h2>
              <p className="text-muted-foreground">
                Solo los desarrolladores pueden acceder a este panel.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Data loading state
  if (dataLoading && venues.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  // Data error state
  if (dataError && venues.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </header>
        <main className="p-6 max-w-md mx-auto mt-20">
          <Card>
            <CardContent className="py-12 text-center space-y-6">
              <AlertCircle className="h-16 w-16 mx-auto text-destructive" />
              <div>
                <h2 className="text-xl font-bold mb-2">Error al cargar datos</h2>
                <p className="text-muted-foreground text-sm font-mono bg-muted p-2 rounded">
                  {dataError}
                </p>
              </div>
              <Button onClick={fetchData} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reintentar
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Salir
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Flag className="h-5 w-5" />
            Panel de Desarrollo
          </h1>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={fetchData} 
          disabled={dataLoading}
          className="gap-2"
        >
          {dataLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar
        </Button>
      </header>

      <main className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar venue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{venues.length}</div>
              <div className="text-sm text-muted-foreground">Venues</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{Object.keys(FEATURE_DESCRIPTIONS).length}</div>
              <div className="text-sm text-muted-foreground">Features</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold">{flags.filter(f => f.enabled).length}</div>
              <div className="text-sm text-muted-foreground">Activos</div>
            </CardContent>
          </Card>
        </div>

        {/* Venues List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Venues ({filteredVenues.length})
            </CardTitle>
            <CardDescription>
              Gestiona las banderas de funcionalidades para cada venue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredVenues.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron venues
              </div>
            ) : (
              filteredVenues.map(venue => {
                const venueFlags = getVenueFlags(venue.id);
                const enabledCount = venueFlags.filter(f => f.enabled).length;
                const isExpanded = expandedVenues.has(venue.id);

                return (
                  <Collapsible key={venue.id} open={isExpanded} onOpenChange={() => toggleVenueExpanded(venue.id)}>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div className="text-left">
                            <h3 className="font-medium">{venue.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {enabledCount}/{Object.keys(FEATURE_DESCRIPTIONS).length} activos
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={enabledCount > 0 ? "default" : "secondary"}>
                            {enabledCount} activos
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t p-4 space-y-3">
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => createAllFlagsForVenue(venue.id)}
                              disabled={updating === venue.id}
                            >
                              {updating === venue.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Crear banderas faltantes
                            </Button>
                          </div>
                          <div className="grid gap-2">
                            {Object.entries(FEATURE_DESCRIPTIONS).map(([key, info]) => {
                              const isEnabled = getFlagStatus(venue.id, key);
                              const flagId = `${venue.id}-${key}`;
                              const isUpdating = updating === flagId;

                              return (
                                <div
                                  key={key}
                                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">{info.name}</span>
                                      <Badge variant={isEnabled ? "default" : "outline"} className="text-xs">
                                        {isEnabled ? "ON" : "OFF"}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{info.description}</p>
                                  </div>
                                  <Switch
                                    checked={isEnabled}
                                    disabled={isUpdating}
                                    onCheckedChange={() => toggleFlag(venue.id, key as FeatureKey, isEnabled)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
