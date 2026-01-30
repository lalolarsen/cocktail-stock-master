import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { 
  Loader2, Users, Key, RefreshCw, Search, 
  UserX, Filter, Grid3X3, List
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Worker, LoginRecord, AuditLog, AVAILABLE_ROLES } from "./workers/types";
import { WorkerCard } from "./workers/WorkerCard";
import { CreateWorkerDialog } from "./workers/CreateWorkerDialog";
import { WorkerHistoryDialog } from "./workers/WorkerHistoryDialog";
import { AppRole } from "@/hooks/useUserRole";

export function WorkersManagementNew({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const { venue, isLoading: venueLoading } = useActiveVenue();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showResetPinDialog, setShowResetPinDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showInactive, setShowInactive] = useState(false);

  const [editWorker, setEditWorker] = useState({
    full_name: "",
    roles: [] as AppRole[],
  });

  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    if (!venue?.id) return;
    void fetchWorkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id]);

  const fetchWorkers = async () => {
    if (!venue?.id) return;

    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, rut_code, is_active, internal_email, created_at")
        .eq("venue_id", venue.id);

      if (profilesError) throw profilesError;

      const { data: workerRoles } = await supabase
        .from("worker_roles")
        .select("worker_id, role");

      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const workersWithRoles: Worker[] = (profiles || []).map((profile) => {
        const wr = workerRoles?.filter((r) => r.worker_id === profile.id) || [];
        let roles: AppRole[] = wr.map((r) => r.role as AppRole);
        
        if (roles.length === 0) {
          const ur = userRoles?.filter((r) => r.user_id === profile.id) || [];
          roles = ur.map((r) => r.role as AppRole);
        }

        return {
          ...profile,
          is_active: profile.is_active ?? true,
          roles,
        };
      });

      setWorkers(workersWithRoles);
    } catch (error) {
      console.error("Error fetching workers:", error);
      toast.error("Error al cargar trabajadores");
    } finally {
      setLoading(false);
    }
  };

  const maskRut = (rut: string | null): string => {
    if (!rut) return "—";
    if (rut.length <= 4) return "***" + rut;
    return "***" + rut.slice(-4);
  };

  const createWorker = async (newWorker: {
    rut_code: string;
    full_name: string;
    pin: string;
    roles: AppRole[];
  }) => {
    const normalizedRut = newWorker.rut_code.replace(/\D/g, "").trim();
    
    if (!/^\d{7,9}$/.test(normalizedRut)) {
      toast.error("RUT inválido. Debe tener entre 7 y 9 dígitos.");
      return;
    }

    if (!newWorker.pin || newWorker.pin.length < 4) {
      toast.error("PIN debe tener al menos 4 dígitos");
      return;
    }

    if (newWorker.roles.length === 0) {
      toast.error("Selecciona al menos un rol");
      return;
    }

    if (!venue?.id) {
      toast.error("No se pudo determinar el venue actual");
      return;
    }

    setCreating(true);

    try {
      const primaryRole = newWorker.roles[0];
      
      const response = await supabase.functions.invoke("create-worker-user", {
        body: {
          venue_id: venue.id,
          rut_code: normalizedRut,
          pin: newWorker.pin,
          full_name: newWorker.full_name,
          role: primaryRole,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Error desconocido al crear usuario");
      }

      const userId = response.data.user_id;

      if (newWorker.roles.length > 1) {
        for (const role of newWorker.roles.slice(1)) {
          await supabase.from("worker_roles").insert({
            worker_id: userId,
            venue_id: venue.id,
            role,
          });
        }
      }

      await supabase.rpc("log_admin_action", {
        p_action: "create_worker",
        p_target_worker_id: userId,
        p_details: { rut: maskRut(normalizedRut), roles: newWorker.roles },
      });

      toast.success("Trabajador creado exitosamente");
      setShowCreateDialog(false);
      fetchWorkers();
    } catch (error: any) {
      console.error("Error creating worker:", error);
      if (error.message?.includes("already registered") || error.message?.includes("already exists")) {
        toast.error("Este RUT ya está registrado");
      } else {
        toast.error("Error al crear trabajador: " + (error.message || "Error desconocido"));
      }
    } finally {
      setCreating(false);
    }
  };

  const updateWorker = async () => {
    if (!selectedWorker) return;
    if (!venue?.id) {
      toast.error("No se pudo determinar el venue actual");
      return;
    }

    if (editWorker.roles.length === 0) {
      toast.error("Selecciona al menos un rol");
      return;
    }

    setSaving(true);

    try {
      await supabase
        .from("profiles")
        .update({ full_name: editWorker.full_name })
        .eq("id", selectedWorker.id);

      await supabase.from("worker_roles").delete().eq("worker_id", selectedWorker.id);
      await supabase.from("user_roles").delete().eq("user_id", selectedWorker.id);

      for (const role of editWorker.roles) {
        await supabase.from("worker_roles").insert({ worker_id: selectedWorker.id, venue_id: venue.id, role });
        await supabase.from("user_roles").insert({ user_id: selectedWorker.id, role });
      }

      await supabase.rpc("log_admin_action", {
        p_action: "update_worker",
        p_target_worker_id: selectedWorker.id,
        p_details: { 
          full_name: editWorker.full_name, 
          roles: editWorker.roles,
          previous_roles: selectedWorker.roles 
        },
      });

      toast.success("Trabajador actualizado");
      setShowEditDialog(false);
      fetchWorkers();
    } catch (error) {
      console.error("Error updating worker:", error);
      toast.error("Error al actualizar trabajador");
    } finally {
      setSaving(false);
    }
  };

  const deleteWorker = async () => {
    if (!selectedWorker || !venue?.id) {
      toast.error("No se pudo determinar el venue actual");
      return;
    }

    setDeleting(true);

    try {
      // IMPORTANT: We cannot hard-delete worker profiles because they may be referenced
      // by financial/audit tables (FK constraints). Instead, we "dar de baja":
      // - remove roles (revokes access)
      // - mark profile inactive (login flow should block)

      await supabase.from("worker_roles").delete().eq("worker_id", selectedWorker.id);
      await supabase.from("user_roles").delete().eq("user_id", selectedWorker.id);
      await supabase.from("notification_preferences").delete().eq("worker_id", selectedWorker.id);

      const { error: deactivateError } = await supabase
        .from("profiles")
        .update({ is_active: false })
        .eq("id", selectedWorker.id);

      if (deactivateError) {
        throw new Error("No se pudo dar de baja: " + deactivateError.message);
      }

      toast.success("Trabajador dado de baja (oculto)");
      setShowDeleteDialog(false);
      setSelectedWorker(null);
      fetchWorkers();
    } catch (error: any) {
      console.error("Error deleting worker:", error);
      toast.error(error.message || "Error al eliminar trabajador");
    } finally {
      setDeleting(false);
    }
  };

  const resetPin = async () => {
    if (!selectedWorker || !newPin || newPin.length < 4) {
      toast.error("PIN debe tener al menos 4 dígitos");
      return;
    }

    setSaving(true);

    try {
      await supabase.rpc("log_admin_action", {
        p_action: "reset_pin",
        p_target_worker_id: selectedWorker.id,
        p_details: { note: "PIN reset requested" },
      });

      toast.success("PIN actualizado. El trabajador debe usar el nuevo PIN.");
      setShowResetPinDialog(false);
      setNewPin("");
    } catch (error) {
      console.error("Error resetting PIN:", error);
      toast.error("Error al resetear PIN");
    } finally {
      setSaving(false);
    }
  };

  const toggleWorkerActive = async (worker: Worker) => {
    try {
      const newStatus = !worker.is_active;
      
      await supabase
        .from("profiles")
        .update({ is_active: newStatus })
        .eq("id", worker.id);

      await supabase.rpc("log_admin_action", {
        p_action: newStatus ? "activate_worker" : "deactivate_worker",
        p_target_worker_id: worker.id,
        p_details: {},
      });

      toast.success(newStatus ? "Trabajador activado" : "Trabajador desactivado");
      fetchWorkers();
    } catch (error) {
      console.error("Error toggling worker status:", error);
      toast.error("Error al cambiar estado");
    }
  };

  const fetchHistory = async (worker: Worker) => {
    if (!venue?.id) {
      toast.error("No se pudo determinar el venue actual");
      return;
    }

    setSelectedWorker(worker);
    setLoadingHistory(true);
    setShowHistoryDialog(true);

    try {
      const { data: logins } = await supabase
        .from("login_history")
        .select("id, login_at, user_agent")
        .eq("user_id", worker.id)
        .eq("venue_id", venue.id)
        .order("login_at", { ascending: false })
        .limit(50);

      setLoginHistory(logins || []);

      const { data: audits } = await supabase
        .from("admin_audit_logs")
        .select("id, action, target_worker_id, details, created_at, admin_id")
        .eq("target_worker_id", worker.id)
        .eq("venue_id", venue.id)
        .order("created_at", { ascending: false })
        .limit(50);

      setAuditLogs(audits || []);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openEditDialog = (worker: Worker) => {
    setSelectedWorker(worker);
    setEditWorker({
      full_name: worker.full_name || "",
      roles: [...worker.roles],
    });
    setShowEditDialog(true);
  };

  const openResetPinDialog = (worker: Worker) => {
    setSelectedWorker(worker);
    setNewPin("");
    setShowResetPinDialog(true);
  };

  const openDeleteDialog = (worker: Worker) => {
    setSelectedWorker(worker);
    setShowDeleteDialog(true);
  };

  // Filter workers
  const filteredWorkers = workers.filter((worker) => {
    if (!showInactive && !worker.is_active) return false;

    const matchesSearch = 
      !searchQuery ||
      worker.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.rut_code?.includes(searchQuery);
    
    const matchesRole = 
      roleFilter.length === 0 ||
      worker.roles.some((r) => roleFilter.includes(r));
    
    return matchesSearch && matchesRole;
  });

  const activeCount = workers.filter((w) => w.is_active).length;
  const inactiveCount = workers.filter((w) => !w.is_active).length;

  if (venueLoading || loading) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-muted-foreground">Cargando equipo...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Equipo de Trabajo</h2>
            <p className="text-sm text-muted-foreground">
              {activeCount} activos • {inactiveCount} inactivos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchWorkers} title="Recargar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!isReadOnly && (
            <CreateWorkerDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onCreate={createWorker}
              creating={creating}
            />
          )}
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o RUT..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Roles
                {roleFilter.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded">
                    {roleFilter.length}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {AVAILABLE_ROLES.map((role) => {
                const Icon = role.icon;
                return (
                  <DropdownMenuCheckboxItem
                    key={role.value}
                    checked={roleFilter.includes(role.value)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setRoleFilter([...roleFilter, role.value]);
                      } else {
                        setRoleFilter(roleFilter.filter((r) => r !== role.value));
                      }
                    }}
                  >
                    <Icon
                      className={`h-4 w-4 mr-2 ${
                        roleFilter.includes(role.value) ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    {role.label}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-r-none"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="rounded-l-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          <label className="flex items-center gap-2 px-3 py-2 rounded-md border bg-background">
            <Checkbox checked={showInactive} onCheckedChange={(c) => setShowInactive(c === true)} />
            <span className="text-sm text-muted-foreground">Mostrar inactivos</span>
          </label>
        </div>
      </Card>

      {/* Workers Grid/List */}
      {filteredWorkers.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <UserX className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="font-medium mb-1">No se encontraron trabajadores</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery || roleFilter.length > 0
                ? "Intenta ajustar los filtros de búsqueda"
                : "Comienza agregando un nuevo trabajador"}
            </p>
          </div>
        </Card>
      ) : (
        <div className={
          viewMode === "grid" 
            ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" 
            : "space-y-3"
        }>
          {filteredWorkers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              isReadOnly={isReadOnly}
              onEdit={openEditDialog}
              onResetPin={openResetPinDialog}
              onToggleActive={toggleWorkerActive}
              onViewHistory={fetchHistory}
              onDelete={openDeleteDialog}
              maskRut={maskRut}
            />
          ))}
        </div>
      )}

      {/* Edit Worker Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Trabajador</DialogTitle>
            <DialogDescription>
              Modifica nombre y roles del trabajador
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label>Nombre Completo</Label>
              <Input
                value={editWorker.full_name}
                onChange={(e) => setEditWorker({ ...editWorker, full_name: e.target.value })}
              />
            </div>

            <div className="space-y-3">
              <Label>Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_ROLES.map((role) => {
                  const Icon = role.icon;
                  const isChecked = editWorker.roles.includes(role.value);
                  return (
                    <label
                      key={role.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isChecked 
                          ? "bg-primary/5 border-primary/20 ring-2 ring-primary/20" 
                          : "border-border hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditWorker({ ...editWorker, roles: [...editWorker.roles, role.value] });
                          } else {
                            setEditWorker({ 
                              ...editWorker, 
                              roles: editWorker.roles.filter((r) => r !== role.value) 
                            });
                          }
                        }}
                      />
                      <Icon className={`h-4 w-4 ${isChecked ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-medium">{role.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={updateWorker} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar Cambios
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset PIN Dialog */}
      <AlertDialog open={showResetPinDialog} onOpenChange={setShowResetPinDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Resetear PIN
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ingresa el nuevo PIN para <strong>{selectedWorker?.full_name || "este trabajador"}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="Nuevo PIN (mínimo 4 dígitos)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              maxLength={6}
              className="text-center text-lg tracking-widest"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={resetPin} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Resetear PIN
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Worker Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              Dar de baja trabajador
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará a <strong>{selectedWorker?.full_name || "este trabajador"}</strong> y se
              eliminarán sus roles (pierde acceso). Los registros históricos (ventas/auditoría)
              se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteWorker} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      <WorkerHistoryDialog
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
        worker={selectedWorker}
        loginHistory={loginHistory}
        auditLogs={auditLogs}
        loading={loadingHistory}
        maskRut={maskRut}
      />
    </div>
  );
}
