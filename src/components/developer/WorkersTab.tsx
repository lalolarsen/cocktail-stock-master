import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { VenueSelector } from "./VenueSelector";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  UserPlus, 
  Building2, 
  Loader2, 
  Users,
  Shield,
  Eye,
  ShoppingCart,
  Wine,
  Sparkles,
  Code,
  Search,
  UserX,
  UserCheck,
  Pencil,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw
} from "lucide-react";

interface WorkersTabProps {
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

interface Venue {
  id: string;
  name: string;
  slug: string;
  is_demo: boolean;
}

interface WorkerProfile {
  id: string;
  email: string;
  full_name: string | null;
  rut_code: string | null;
  is_active: boolean;
  internal_email: string | null;
  venue_id: string | null;
  created_at: string | null;
}

interface WorkerRole {
  worker_id: string;
  role: string;
}

interface Worker extends WorkerProfile {
  roles: string[];
  venue_name?: string;
}

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  developer: { label: "Developer", icon: Code, color: "bg-red-500" },
  admin: { label: "Admin", icon: Shield, color: "bg-blue-500" },
  gerencia: { label: "Gerencia", icon: Eye, color: "bg-amber-500" },
  vendedor: { label: "Vendedor", icon: ShoppingCart, color: "bg-emerald-500" },
  bar: { label: "Bartender", icon: Wine, color: "bg-purple-500" },
  ticket_seller: { label: "Ticketero", icon: Sparkles, color: "bg-rose-500" },
};

export function WorkersTab({ selectedVenueId, onSelectVenue }: WorkersTabProps) {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  
  // Create form state
  const [newWorker, setNewWorker] = useState({
    venue_id: "",
    rut_code: "",
    pin: "",
    full_name: "",
    role: "vendedor" as string,
  });

  // Fetch all venues
  const { data: venues = [] } = useQuery({
    queryKey: ["dev-venues-workers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venues")
        .select("id, name, slug, is_demo")
        .order("name");
      if (error) throw error;
      return data as Venue[];
    },
  });

  // Fetch workers for selected venue (or all if no venue selected)
  const { data: workers = [], isLoading, refetch } = useQuery({
    queryKey: ["dev-workers", selectedVenueId, showInactive],
    queryFn: async () => {
      // Fetch profiles
      let profilesQuery = supabase
        .from("profiles")
        .select("id, email, full_name, rut_code, is_active, internal_email, venue_id, created_at")
        .order("created_at", { ascending: false });
      
      if (selectedVenueId) {
        profilesQuery = profilesQuery.eq("venue_id", selectedVenueId);
      }
      
      if (!showInactive) {
        profilesQuery = profilesQuery.eq("is_active", true);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;

      // Fetch worker roles
      const { data: workerRoles, error: rolesError } = await supabase
        .from("worker_roles")
        .select("worker_id, role");
      if (rolesError) throw rolesError;

      // Also fetch user_roles for developer role
      const { data: userRoles, error: userRolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (userRolesError) throw userRolesError;

      // Build role map
      const roleMap = new Map<string, string[]>();
      workerRoles?.forEach((wr: WorkerRole) => {
        if (!roleMap.has(wr.worker_id)) {
          roleMap.set(wr.worker_id, []);
        }
        roleMap.get(wr.worker_id)!.push(wr.role);
      });
      userRoles?.forEach((ur: { user_id: string; role: string }) => {
        if (!roleMap.has(ur.user_id)) {
          roleMap.set(ur.user_id, []);
        }
        const roles = roleMap.get(ur.user_id)!;
        if (!roles.includes(ur.role)) {
          roles.push(ur.role);
        }
      });

      // Build venue name map
      const venueMap = new Map<string, string>();
      venues.forEach(v => venueMap.set(v.id, v.name));

      // Combine data
      const workersWithRoles: Worker[] = (profiles || []).map((p: WorkerProfile) => ({
        ...p,
        roles: roleMap.get(p.id) || [],
        venue_name: p.venue_id ? venueMap.get(p.venue_id) : undefined,
      }));

      return workersWithRoles;
    },
    enabled: venues.length > 0,
  });

  // Create worker mutation
  const createWorkerMutation = useMutation({
    mutationFn: async (params: typeof newWorker) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session - please login again");

      const response = await supabase.functions.invoke("create-worker-user", {
        body: {
          venue_id: params.venue_id,
          rut_code: params.rut_code,
          pin: params.pin,
          full_name: params.full_name,
          role: params.role,
        },
      });

      if (response.error) {
        console.error("Edge function error:", response.error);
        throw new Error(response.error.message || "Error calling edge function");
      }
      
      if (!response.data?.success) {
        throw new Error(response.data?.error || "Unknown error creating worker");
      }
      
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`Worker creado: ${data.full_name} (${data.rut_code})`);
      setShowCreateDialog(false);
      setNewWorker({ venue_id: "", rut_code: "", pin: "", full_name: "", role: "vendedor" });
      queryClient.invalidateQueries({ queryKey: ["dev-workers"] });
    },
    onError: (error: Error) => {
      console.error("Create worker error:", error);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Toggle active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ workerId, isActive }: { workerId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: isActive })
        .eq("id", workerId);
      if (error) throw error;
      return { workerId, isActive };
    },
    onSuccess: ({ isActive }) => {
      toast.success(isActive ? "Worker activado" : "Worker desactivado");
      queryClient.invalidateQueries({ queryKey: ["dev-workers"] });
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Update worker mutation
  const updateWorkerMutation = useMutation({
    mutationFn: async ({ workerId, updates }: { workerId: string; updates: Partial<WorkerProfile> & { role?: string } }) => {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: updates.full_name,
          rut_code: updates.rut_code,
        })
        .eq("id", workerId);
      if (profileError) throw profileError;

      // Update role if provided
      if (updates.role) {
        // Delete existing roles
        await supabase.from("worker_roles").delete().eq("worker_id", workerId);
        // Insert new role
        const { error: roleError } = await supabase
          .from("worker_roles")
          .insert([{ worker_id: workerId, role: updates.role as "admin" | "bar" | "developer" | "gerencia" | "ticket_seller" | "vendedor" }]);
        if (roleError) throw roleError;
      }

      return { workerId };
    },
    onSuccess: () => {
      toast.success("Worker actualizado");
      setEditingWorker(null);
      queryClient.invalidateQueries({ queryKey: ["dev-workers"] });
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Delete worker mutation (hard delete)
  const deleteWorkerMutation = useMutation({
    mutationFn: async (workerId: string) => {
      // Delete in order to respect foreign keys
      await supabase.from("worker_roles").delete().eq("worker_id", workerId);
      await supabase.from("user_roles").delete().eq("user_id", workerId);
      await supabase.from("login_history").delete().eq("user_id", workerId);
      await supabase.from("notification_logs").delete().eq("recipient_worker_id", workerId);
      await supabase.from("notification_preferences").delete().eq("worker_id", workerId);
      await supabase.from("admin_audit_logs").delete().eq("admin_id", workerId);
      await supabase.from("admin_audit_logs").delete().eq("target_worker_id", workerId);
      
      const { error } = await supabase.from("profiles").delete().eq("id", workerId);
      if (error) throw error;
      return workerId;
    },
    onSuccess: () => {
      toast.success("Worker eliminado permanentemente");
      queryClient.invalidateQueries({ queryKey: ["dev-workers"] });
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Filter workers by search
  const filteredWorkers = workers.filter(w => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      w.full_name?.toLowerCase().includes(q) ||
      w.rut_code?.toLowerCase().includes(q) ||
      w.email?.toLowerCase().includes(q) ||
      w.roles.some(r => r.toLowerCase().includes(q))
    );
  });

  const selectedVenueForNew = venues.find(v => v.id === newWorker.venue_id);

  return (
    <div className="space-y-4">
      {/* Venue Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestión de Workers
          </CardTitle>
          <CardDescription>
            Crear, editar, activar/desactivar trabajadores. Control total para developers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <VenueSelector 
                selectedVenueId={selectedVenueId} 
                onSelectVenue={onSelectVenue}
              />
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Crear Worker
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, RUT, rol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-inactive"
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                />
                <Label htmlFor="show-inactive" className="text-sm cursor-pointer">
                  Mostrar inactivos
                </Label>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refrescar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workers List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {selectedVenueId 
                ? `Workers de ${venues.find(v => v.id === selectedVenueId)?.name || "..."}`
                : "Todos los Workers"
              }
            </CardTitle>
            <Badge variant="secondary">{filteredWorkers.length} workers</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No se encontraron workers</p>
              {!showInactive && <p className="text-sm mt-1">Prueba activando "Mostrar inactivos"</p>}
            </div>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-3">
                {filteredWorkers.map((worker) => (
                  <div 
                    key={worker.id} 
                    className={`flex items-center gap-4 p-4 border rounded-lg transition-colors ${
                      !worker.is_active ? "bg-muted/50 opacity-70" : "hover:bg-muted/30"
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${
                      worker.roles.includes("developer") ? "bg-red-500" :
                      worker.roles.includes("admin") ? "bg-blue-500" :
                      worker.roles.includes("gerencia") ? "bg-amber-500" :
                      "bg-primary"
                    }`}>
                      {worker.full_name?.charAt(0)?.toUpperCase() || "?"}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{worker.full_name || "Sin nombre"}</span>
                        {!worker.is_active && (
                          <Badge variant="secondary" className="text-xs bg-destructive/10 text-destructive">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span className="font-mono">{worker.rut_code || "Sin RUT"}</span>
                        {worker.venue_name && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {worker.venue_name}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Roles */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {worker.roles.map(role => {
                          const config = ROLE_CONFIG[role];
                          const Icon = config?.icon || Shield;
                          return (
                            <Badge 
                              key={role} 
                              variant="outline" 
                              className="text-xs gap-1"
                            >
                              <Icon className="h-3 w-3" />
                              {config?.label || role}
                            </Badge>
                          );
                        })}
                        {worker.roles.length === 0 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Sin roles
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingWorker(worker)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActiveMutation.mutate({ 
                          workerId: worker.id, 
                          isActive: !worker.is_active 
                        })}
                        disabled={toggleActiveMutation.isPending}
                        title={worker.is_active ? "Desactivar" : "Activar"}
                      >
                        {worker.is_active ? (
                          <UserX className="h-4 w-4 text-destructive" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-primary" />
                        )}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Eliminar permanentemente">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-destructive">
                              ¿Eliminar permanentemente?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta acción eliminará a <strong>{worker.full_name}</strong> y todos sus datos asociados.
                              Esta acción NO se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteWorkerMutation.mutate(worker.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deleteWorkerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Create Worker Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Crear Nuevo Worker
            </DialogTitle>
            <DialogDescription>
              Crea un usuario operacional para cualquier venue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Venue *</Label>
              <Select 
                value={newWorker.venue_id} 
                onValueChange={(v) => setNewWorker(prev => ({ ...prev, venue_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar venue..." />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3 w-3" />
                        {venue.name}
                        {venue.is_demo && <Badge variant="secondary" className="text-xs">Demo</Badge>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">RUT *</Label>
                <Input
                  placeholder="12345678-9"
                  value={newWorker.rut_code}
                  onChange={(e) => setNewWorker(prev => ({ ...prev, rut_code: e.target.value }))}
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-sm">PIN * <span className="text-muted-foreground text-xs">(mín. 6 caracteres)</span></Label>
                <Input
                  placeholder="123456"
                  value={newWorker.pin}
                  onChange={(e) => setNewWorker(prev => ({ ...prev, pin: e.target.value }))}
                  className="font-mono"
                  minLength={6}
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Nombre Completo *</Label>
              <Input
                placeholder="Juan Pérez"
                value={newWorker.full_name}
                onChange={(e) => setNewWorker(prev => ({ ...prev, full_name: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-sm">Rol *</Label>
              <Select 
                value={newWorker.role} 
                onValueChange={(v) => setNewWorker(prev => ({ ...prev, role: v }))}
              >
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

            {/* Preview */}
            {newWorker.venue_id && newWorker.rut_code && (
              <div className="p-3 bg-muted rounded-lg text-xs space-y-1">
                <div className="font-medium text-sm mb-2">Preview:</div>
                <div><strong>Venue:</strong> {selectedVenueForNew?.name}</div>
                <div><strong>Email interno:</strong> {newWorker.rut_code.replace(/[.\-]/g, "").toLowerCase()}@distock.local</div>
                <div><strong>Rol:</strong> {ROLE_CONFIG[newWorker.role]?.label || newWorker.role}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createWorkerMutation.mutate(newWorker)}
              disabled={
                createWorkerMutation.isPending || 
                !newWorker.venue_id || 
                !newWorker.rut_code.trim() || 
                newWorker.pin.trim().length < 6 || 
                !newWorker.full_name.trim()
              }
            >
              {createWorkerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Worker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Worker Dialog */}
      <Dialog open={!!editingWorker} onOpenChange={(open) => !open && setEditingWorker(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Worker
            </DialogTitle>
          </DialogHeader>
          {editingWorker && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Nombre Completo</Label>
                <Input
                  value={editingWorker.full_name || ""}
                  onChange={(e) => setEditingWorker(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                />
              </div>
              <div>
                <Label className="text-sm">RUT</Label>
                <Input
                  value={editingWorker.rut_code || ""}
                  onChange={(e) => setEditingWorker(prev => prev ? { ...prev, rut_code: e.target.value } : null)}
                  className="font-mono"
                />
              </div>
              <div>
                <Label className="text-sm">Rol Principal</Label>
                <Select 
                  value={editingWorker.roles[0] || "vendedor"} 
                  onValueChange={(v) => setEditingWorker(prev => prev ? { ...prev, roles: [v] } : null)}
                >
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
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-active"
                  checked={editingWorker.is_active}
                  onCheckedChange={(checked) => setEditingWorker(prev => prev ? { ...prev, is_active: checked } : null)}
                />
                <Label htmlFor="edit-active" className="text-sm cursor-pointer">
                  Activo
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWorker(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editingWorker) {
                  updateWorkerMutation.mutate({
                    workerId: editingWorker.id,
                    updates: {
                      full_name: editingWorker.full_name,
                      rut_code: editingWorker.rut_code,
                      is_active: editingWorker.is_active,
                      role: editingWorker.roles[0],
                    },
                  });
                }
              }}
              disabled={updateWorkerMutation.isPending}
            >
              {updateWorkerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
