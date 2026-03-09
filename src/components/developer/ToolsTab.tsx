import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { VenueResetPanel } from "@/components/dashboard/VenueResetPanel";
import { DatabaseExporter } from "./DatabaseExporter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  RefreshCw, 
  Trash2, 
  Calculator, 
  Clock, 
  Loader2,
  AlertTriangle,
  CheckCircle2,
  UserPlus,
  Building2
} from "lucide-react";

interface ToolsTabProps {
  selectedVenueId: string | null;
}

interface Venue {
  id: string;
  name: string;
  slug: string;
  is_demo: boolean;
}

export function ToolsTab({ selectedVenueId }: ToolsTabProps) {
  const [jornadaIdForRecalc, setJornadaIdForRecalc] = useState("");
  const [workerRut, setWorkerRut] = useState("");
  const [workerPin, setWorkerPin] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerRole, setWorkerRole] = useState<"admin" | "vendedor" | "bar" | "ticket_seller" | "gerencia">("vendedor");
  const [workerVenueId, setWorkerVenueId] = useState<string>("");
  const [cleanVenueId, setCleanVenueId] = useState<string>("");

  // Fetch all venues for selectors
  const { data: venues = [] } = useQuery({
    queryKey: ["dev-venues-tools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("id, name, slug, is_demo")
        .order("name");
      if (error) throw error;
      return data as Venue[];
    },
  });

  // Reset Demo Data
  const resetDemoMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reset_demo_data");
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: () => {
      toast.success("Datos de demo reseteados correctamente");
      console.log("Demo data reset successful");
    },
    onError: (error: Error) => {
      console.error("Reset demo error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Clean Venue Data (general purpose)
  const cleanVenueMutation = useMutation({
    mutationFn: async (venueId: string) => {
      const { data, error } = await supabase.rpc("dev_clean_venue_data", {
        p_venue_id: venueId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; deleted_sales?: number; deleted_jornadas?: number };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: (data) => {
      toast.success(`Venue limpiado: ${data.deleted_sales} ventas, ${data.deleted_jornadas} jornadas eliminadas`);
      console.log("Clean venue successful:", data);
    },
    onError: (error: Error) => {
      console.error("Clean venue error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Recalculate Jornada Summaries
  const recalcMutation = useMutation({
    mutationFn: async (jornadaId: string) => {
      const { data, error } = await supabase.rpc("dev_recalculate_jornada_summaries", {
        p_jornada_id: jornadaId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; jornada_id?: string };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: (data) => {
      toast.success(`Sumarios recalculados para jornada ${data.jornada_id?.slice(0, 8)}...`);
      console.log("Recalculation successful:", data);
      setJornadaIdForRecalc("");
    },
    onError: (error: Error) => {
      console.error("Recalculation error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Expire Old Tokens
  const expireTokensMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dev_expire_old_tokens");
      if (error) throw error;
      const result = data as { success: boolean; error?: string; expired_count?: number };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: (data) => {
      toast.success(`${data.expired_count} tokens marcados como expirados`);
      console.log("Expire tokens successful:", data);
    },
    onError: (error: Error) => {
      console.error("Expire tokens error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Create Worker User
  const createWorkerMutation = useMutation({
    mutationFn: async (params: { venue_id: string; rut_code: string; pin: string; full_name: string; role: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const response = await supabase.functions.invoke("create-worker-user", {
        body: params,
      });

      if (response.error) throw new Error(response.error.message);
      if (!response.data.success) throw new Error(response.data.error || "Unknown error");
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Usuario creado: ${data.full_name} (${data.rut_code})`);
      console.log("Create worker successful:", data);
      // Clear form
      setWorkerRut("");
      setWorkerPin("");
      setWorkerName("");
      setWorkerRole("vendedor");
    },
    onError: (error: Error) => {
      console.error("Create worker error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  const selectedVenueForWorker = venues.find(v => v.id === workerVenueId);
  const selectedVenueForClean = venues.find(v => v.id === cleanVenueId);

  return (
    <div className="space-y-4">
      {/* Berlin Full Reset Panel */}
      <VenueResetPanel />
      
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Developer Tools
          </CardTitle>
          <CardDescription>
            Herramientas de soporte y operaciones. Usar con precaución.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Database Export */}
          <DatabaseExporter />

          {/* Clean Venue Data */}
          <div className="p-4 border border-destructive/50 rounded-lg space-y-3 bg-destructive/5">
            <div>
              <h3 className="font-medium flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Limpiar Datos de Venue
              </h3>
              <p className="text-sm text-muted-foreground">
                Elimina TODOS los datos transaccionales (ventas, jornadas, tokens, etc.) de un venue específico.
                Preserva configuración, productos y trabajadores.
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label className="text-xs">Seleccionar Venue</Label>
                <Select value={cleanVenueId} onValueChange={setCleanVenueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar venue..." />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3" />
                          {venue.name}
                          {venue.is_demo && (
                            <Badge variant="secondary" className="text-xs ml-1">Demo</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    disabled={!cleanVenueId}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Limpiar Venue
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive">
                      ⚠️ ¿Limpiar datos del venue?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <p>Esta acción eliminará <strong>TODOS</strong> los datos transaccionales de:</p>
                        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded text-sm font-medium">
                          {selectedVenueForClean?.name || "Venue seleccionado"}
                        </div>
                        <p className="text-xs">
                          Se eliminarán: ventas, jornadas, tokens, movimientos de stock, cierres de caja.
                          <br />
                          Se preservarán: productos, trabajadores, configuración.
                        </p>
                        <p className="text-destructive font-medium text-sm">
                          Esta acción NO se puede deshacer.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cleanVenueMutation.mutate(cleanVenueId)}
                      disabled={cleanVenueMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {cleanVenueMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Sí, limpiar venue
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Reset Demo Data */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Reset Demo Data
                </h3>
                <p className="text-sm text-muted-foreground">
                  Limpia datos del venue "Demo DiStock" únicamente.
                </p>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Reset Demo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Resetear datos de demo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará ventas, jornadas, tokens y otros datos transaccionales
                    del venue "Demo DiStock". Los usuarios y configuración se preservarán.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => resetDemoMutation.mutate()}
                    disabled={resetDemoMutation.isPending}
                  >
                    {resetDemoMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Recalculate Jornada Summaries */}
          <div className="p-4 border rounded-lg space-y-3">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Recalculate Jornada Summaries
              </h3>
              <p className="text-sm text-muted-foreground">
                Regenera los resúmenes financieros para una jornada específica.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="jornada-id" className="text-xs">Jornada ID (UUID)</Label>
                <Input
                  id="jornada-id"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={jornadaIdForRecalc}
                  onChange={(e) => setJornadaIdForRecalc(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={!jornadaIdForRecalc.trim()}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Recalcular
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Recalcular sumarios?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esto eliminará los sumarios existentes y los regenerará para la jornada:
                      <code className="block mt-2 p-2 bg-muted rounded text-xs break-all">
                        {jornadaIdForRecalc}
                      </code>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => recalcMutation.mutate(jornadaIdForRecalc.trim())}
                      disabled={recalcMutation.isPending}
                    >
                      {recalcMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Expire Old Tokens */}
          <div className="p-4 border rounded-lg space-y-3">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Expire Old Pending Tokens
              </h3>
              <p className="text-sm text-muted-foreground">
                Marca como expirados todos los tokens que pasaron su fecha de vencimiento
                y aún están en estado pending/issued.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Clock className="h-4 w-4" />
                  Expirar Tokens Viejos
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Expirar tokens viejos?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esto marcará como "expired" todos los tokens cuya fecha de expiración
                    ya pasó y que aún están en estado "pending" o "issued".
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => expireTokensMutation.mutate()}
                    disabled={expireTokensMutation.isPending}
                  >
                    {expireTokensMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Create Worker User */}
          <div className="p-4 border rounded-lg space-y-3 border-primary/50 bg-primary/5">
            <div>
              <h3 className="font-medium flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Crear Usuario Worker
              </h3>
              <p className="text-sm text-muted-foreground">
                Crea un usuario operacional para cualquier venue con Supabase Auth.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Venue</Label>
                <Select value={workerVenueId} onValueChange={setWorkerVenueId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar venue..." />
                  </SelectTrigger>
                  <SelectContent>
                    {venues.map((venue) => (
                      <SelectItem key={venue.id} value={venue.id}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3" />
                          {venue.name}
                          {venue.is_demo && (
                            <Badge variant="secondary" className="text-xs ml-1">Demo</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="worker-rut" className="text-xs">RUT</Label>
                <Input
                  id="worker-rut"
                  placeholder="12345678-9"
                  value={workerRut}
                  onChange={(e) => setWorkerRut(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <Label htmlFor="worker-pin" className="text-xs">PIN</Label>
                <Input
                  id="worker-pin"
                  type="text"
                  placeholder="1234"
                  value={workerPin}
                  onChange={(e) => setWorkerPin(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="worker-name" className="text-xs">Nombre Completo</Label>
                <Input
                  id="worker-name"
                  placeholder="Juan Pérez"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="worker-role" className="text-xs">Rol</Label>
                <Select value={workerRole} onValueChange={(v) => setWorkerRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="gerencia">Gerencia</SelectItem>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="bar">Bartender</SelectItem>
                    <SelectItem value="ticket_seller">Ticket Seller</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="default" 
                  size="sm" 
                  disabled={!workerVenueId || !workerRut.trim() || !workerPin.trim() || !workerName.trim()}
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Crear Usuario
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Crear usuario worker?</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2">
                      <p>Se creará un usuario con los siguientes datos:</p>
                      <div className="p-3 bg-muted rounded text-xs font-mono space-y-1">
                        <div><strong>Venue:</strong> {selectedVenueForWorker?.name || "-"}</div>
                        <div><strong>RUT:</strong> {workerRut}</div>
                        <div><strong>PIN:</strong> {workerPin}</div>
                        <div><strong>Nombre:</strong> {workerName}</div>
                        <div><strong>Rol:</strong> {workerRole}</div>
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => createWorkerMutation.mutate({
                      venue_id: workerVenueId,
                      rut_code: workerRut,
                      pin: workerPin,
                      full_name: workerName,
                      role: workerRole,
                    })}
                    disabled={createWorkerMutation.isPending}
                  >
                    {createWorkerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Crear Usuario
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Status indicators */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-sm font-medium mb-3">Estado de operaciones recientes</h4>
          <div className="space-y-2 text-sm">
            {cleanVenueMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Venue limpiado: {(cleanVenueMutation.data as any)?.deleted_sales} ventas, {(cleanVenueMutation.data as any)?.deleted_jornadas} jornadas
              </div>
            )}
            {resetDemoMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Demo reset completado
              </div>
            )}
            {recalcMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Recálculo de sumarios completado
              </div>
            )}
            {expireTokensMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Tokens expirados: {(expireTokensMutation.data as any)?.expired_count || 0}
              </div>
            )}
            {createWorkerMutation.isSuccess && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                Usuario creado: {(createWorkerMutation.data as any)?.full_name}
              </div>
            )}
            {!cleanVenueMutation.isSuccess && !resetDemoMutation.isSuccess && !recalcMutation.isSuccess && !expireTokensMutation.isSuccess && !createWorkerMutation.isSuccess && (
              <div className="text-muted-foreground">
                No hay operaciones recientes
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
