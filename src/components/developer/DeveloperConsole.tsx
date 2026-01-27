import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Loader2, 
  Shield,
  LogIn,
  AlertCircle,
  RefreshCw,
  LayoutDashboard,
  Flag,
  ClipboardList,
  Wrench,
  PanelLeft,
  Database
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { OverviewTab } from "./OverviewTab";
import { FlagsTab } from "./FlagsTab";
import { AuditTab } from "./AuditTab";
import { ToolsTab } from "./ToolsTab";
import { SidebarConfigTab } from "./SidebarConfigTab";
import { SchemaAuditTab } from "./SchemaAuditTab";

export default function DeveloperConsole() {
  const navigate = useNavigate();
  const { loading: roleLoading, hasRole } = useUserRole();
  
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // Loading auth session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No Supabase session
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
                  Debes iniciar sesión con una cuenta de desarrollador.
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

  // Still checking role
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not a developer
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

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-4 border-b bg-card px-4 md:px-6">
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Salir</span>
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">DiStock Developer Console</h1>
        </div>
      </header>

      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-6 max-w-2xl">
            <TabsTrigger value="overview" className="gap-1.5">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="flags" className="gap-1.5">
              <Flag className="h-4 w-4" />
              <span className="hidden sm:inline">Flags</span>
            </TabsTrigger>
            <TabsTrigger value="sidebar" className="gap-1.5">
              <PanelLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Sidebar</span>
            </TabsTrigger>
            <TabsTrigger value="schema" className="gap-1.5">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Schema</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Audit</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-1.5">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Tools</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab 
              selectedVenueId={selectedVenueId} 
              onSelectVenue={setSelectedVenueId} 
            />
          </TabsContent>
          
          <TabsContent value="flags">
            <FlagsTab 
              selectedVenueId={selectedVenueId} 
              onSelectVenue={setSelectedVenueId} 
            />
          </TabsContent>
          
          <TabsContent value="sidebar">
            <SidebarConfigTab 
              selectedVenueId={selectedVenueId} 
              onSelectVenue={setSelectedVenueId} 
            />
          </TabsContent>
          
          <TabsContent value="schema">
            <SchemaAuditTab />
          </TabsContent>
          
          <TabsContent value="audit">
            <AuditTab selectedVenueId={selectedVenueId} />
          </TabsContent>
          
          <TabsContent value="tools">
            <ToolsTab selectedVenueId={selectedVenueId} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
