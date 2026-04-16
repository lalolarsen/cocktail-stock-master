import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Loader2, Users, Key, RefreshCw, Search,
  UserX, Filter, Edit2, History, Power, PowerOff, UserPlus,
  Shield, ShoppingCart, Wine, Sparkles, Eye, Download
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
import { CreateWorkerDialog } from "./workers/CreateWorkerDialog";
import { WorkerHistoryDialog } from "./workers/WorkerHistoryDialog";
import { WorkerCard } from "./workers/WorkerCard";
import { AppRole } from "@/hooks/useUserRole";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface WorkersManagementProps {
  isReadOnly?: boolean;
  viewerRole?: AppRole;
}

export function WorkersManagementNew({ isReadOnly = false, viewerRole }: WorkersManagementProps) {
  const { venue } = useActiveVenue();
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
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole[]>([]);

  const [editWorker, setEditWorker] = useState({
    full_name: "",
    roles: [] as AppRole[],
  });

  const [newPin, setNewPin] = useState("");

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, rut_code, is_active, internal_email, created_at");

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

  // Conditional RUT masking: Admin sees full RUT, Gerencia sees masked
  const maskRut = (rut: string | null): string => {
    if (!rut) return "—";
    if (viewerRole === "admin") return rut;
    if (rut.length <= 4) return "***" + rut;
    return "***" + rut.slice(-4);
  };

  // Role-based filtering: Admin sees staff+admin, Gerencia sees gerencia+admin
  const filterByViewerRole = (workerList: Worker[]): Worker[] => {
    if (viewerRole === "gerencia") {
      return workerList.filter((w) =>
        w.roles.some((r) => r === "gerencia" || r === "admin")
      );
    }
    if (viewerRole === "admin") {
      return workerList.filter((w) =>
        w.roles.some((r) => ["admin", "vendedor", "bar", "ticket_seller"].includes(r))
      );
    }
    return workerList;
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

      if (response.error) throw new Error(response.error.message);
      if (!response.data?.success) throw new Error(response.data?.error || "Error desconocido");

      const userId = response.data.user_id;
      if (newWorker.roles.length > 1) {
        for (const role of newWorker.roles.slice(1)) {
          await supabase.from("worker_roles").insert({ worker_id: userId, role });
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
    if (editWorker.roles.length === 0) {
      toast.error("Selecciona al menos un rol");
      return;
    }

    setSaving(true);
    try {
      await supabase.from("profiles").update({ full_name: editWorker.full_name }).eq("id", selectedWorker.id);
      await supabase.from("worker_roles").delete().eq("worker_id", selectedWorker.id);
      await supabase.from("user_roles").delete().eq("user_id", selectedWorker.id);

      for (const role of editWorker.roles) {
        await supabase.from("worker_roles").insert({ worker_id: selectedWorker.id, role });
        await supabase.from("user_roles").insert({ user_id: selectedWorker.id, role });
      }

      await supabase.rpc("log_admin_action", {
        p_action: "update_worker",
        p_target_worker_id: selectedWorker.id,
        p_details: { full_name: editWorker.full_name, roles: editWorker.roles, previous_roles: selectedWorker.roles },
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

  const toggleWorkerActive = async () => {
    if (!selectedWorker) return;
    const newStatus = !selectedWorker.is_active;

    if (!newStatus) {
      const { data: openJornadas } = await supabase
        .from("login_history")
        .select("jornada_id")
        .eq("user_id", selectedWorker.id)
        .not("jornada_id", "is", null)
        .limit(1);

      if (openJornadas && openJornadas.length > 0) {
        const { data: activeJ } = await supabase
          .from("jornadas")
          .select("id")
          .eq("estado", "abierta")
          .limit(1);

        if (activeJ && activeJ.length > 0) {
          const { data: activeLogin } = await supabase
            .from("login_history")
            .select("id")
            .eq("user_id", selectedWorker.id)
            .eq("jornada_id", activeJ[0].id)
            .limit(1);

          if (activeLogin && activeLogin.length > 0) {
            toast.error("No se puede desactivar: tiene jornada abierta activa");
            setShowDeactivateDialog(false);
            return;
          }
        }
      }
    }

    setTogglingId(selectedWorker.id);
    try {
      await supabase.from("profiles").update({ is_active: newStatus }).eq("id", selectedWorker.id);

      await supabase.rpc("log_admin_action", {
        p_action: newStatus ? "activate_worker" : "deactivate_worker",
        p_target_worker_id: selectedWorker.id,
        p_details: {},
      });

      toast.success(newStatus ? "Trabajador reactivado" : "Trabajador desactivado");
      setShowDeactivateDialog(false);
      setSelectedWorker(null);
      fetchWorkers();
    } catch (error) {
      console.error("Error toggling worker status:", error);
      toast.error("Error al cambiar estado");
    } finally {
      setTogglingId(null);
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
      toast.success("PIN actualizado.");
      setShowResetPinDialog(false);
      setNewPin("");
    } catch (error) {
      console.error("Error resetting PIN:", error);
      toast.error("Error al resetear PIN");
    } finally {
      setSaving(false);
    }
  };

  const deleteWorker = async () => {
    if (!selectedWorker) return;
    setSaving(true);
    try {
      await supabase.from("worker_roles").delete().eq("worker_id", selectedWorker.id);
      await supabase.from("user_roles").delete().eq("user_id", selectedWorker.id);
      await supabase.from("profiles").update({ is_active: false }).eq("id", selectedWorker.id);

      await supabase.rpc("log_admin_action", {
        p_action: "delete_worker",
        p_target_worker_id: selectedWorker.id,
        p_details: { full_name: selectedWorker.full_name },
      });

      toast.success("Trabajador eliminado");
      setShowDeleteDialog(false);
      setSelectedWorker(null);
      fetchWorkers();
    } catch (error) {
      console.error("Error deleting worker:", error);
      toast.error("Error al eliminar trabajador");
    } finally {
      setSaving(false);
    }
  };

  const fetchHistoryFor = async (worker: Worker) => {
    setSelectedWorker(worker);
    setLoadingHistory(true);
    setShowHistoryDialog(true);
    try {
      const { data: logins } = await supabase
        .from("login_history")
        .select("id, login_at, user_agent")
        .eq("user_id", worker.id)
        .order("login_at", { ascending: false })
        .limit(50);
      setLoginHistory(logins || []);

      const { data: audits } = await supabase
        .from("admin_audit_logs")
        .select("id, action, target_worker_id, details, created_at, admin_id")
        .eq("target_worker_id", worker.id)
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
    setEditWorker({ full_name: worker.full_name || "", roles: [...worker.roles] });
    setShowEditDialog(true);
  };

  const openResetPinDialog = (worker: Worker) => {
    setSelectedWorker(worker);
    setNewPin("");
    setShowResetPinDialog(true);
  };

  const openDeactivateDialog = (worker: Worker) => {
    setSelectedWorker(worker);
    setShowDeactivateDialog(true);
  };

  const openDeleteDialog = (worker: Worker) => {
    setSelectedWorker(worker);
    setShowDeleteDialog(true);
  };

  // Apply viewer role filter first, then search/role filters
  const roleFilteredWorkers = filterByViewerRole(workers);

  const filteredWorkers = roleFilteredWorkers.filter((worker) => {
    const matchesSearch =
      !searchQuery ||
      worker.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.rut_code?.includes(searchQuery);
    const matchesRole =
      roleFilter.length === 0 || worker.roles.some((r) => roleFilter.includes(r));
    return matchesSearch && matchesRole;
  });

  const activeWorkers = filteredWorkers.filter((w) => w.is_active);
  const inactiveWorkers = filteredWorkers.filter((w) => !w.is_active);

  // Stats by role
  const roleCounts = AVAILABLE_ROLES.map((r) => ({
    ...r,
    count: roleFilteredWorkers.filter((w) => w.is_active && w.roles.includes(r.value)).length,
  }));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Cargando equipo...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Equipo de Trabajo</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeWorkers.length} activos · {inactiveWorkers.length} inactivos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchWorkers} title="Recargar" className="h-9 px-3">
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

      {/* Role stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {roleCounts
          .filter((r) => r.count > 0 || viewerRole === "admin")
          .map((r) => {
            const Icon = r.icon;
            const isActive = roleFilter.includes(r.value);
            return (
              <button
                key={r.value}
                onClick={() => {
                  if (isActive) {
                    setRoleFilter(roleFilter.filter((f) => f !== r.value));
                  } else {
                    setRoleFilter([r.value]);
                  }
                }}
                className={`flex items-center gap-2.5 p-3 rounded-lg border transition-all text-left ${
                  isActive
                    ? "bg-primary/10 border-primary/30 ring-1 ring-primary/20"
                    : "bg-card border-border hover:border-primary/30"
                }`}
              >
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                  <Icon className={`h-4 w-4 ${r.color}`} />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground leading-none">{r.count}</p>
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                </div>
              </button>
            );
          })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o RUT..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {/* Workers grid */}
      {activeWorkers.length === 0 && inactiveWorkers.length === 0 ? (
        <div className="text-center py-16">
          <UserX className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground">No se encontraron trabajadores</p>
        </div>
      ) : (
        <div className="space-y-6">
          {activeWorkers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Activos ({activeWorkers.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {activeWorkers.map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    isReadOnly={isReadOnly}
                    onEdit={openEditDialog}
                    onResetPin={openResetPinDialog}
                    onToggleActive={openDeactivateDialog}
                    onViewHistory={fetchHistoryFor}
                    onDelete={openDeleteDialog}
                    maskRut={maskRut}
                  />
                ))}
              </div>
            </div>
          )}

          {inactiveWorkers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Inactivos ({inactiveWorkers.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {inactiveWorkers.map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    isReadOnly={isReadOnly}
                    onEdit={openEditDialog}
                    onResetPin={openResetPinDialog}
                    onToggleActive={openDeactivateDialog}
                    onViewHistory={fetchHistoryFor}
                    onDelete={openDeleteDialog}
                    maskRut={maskRut}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Worker Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Trabajador</DialogTitle>
            <DialogDescription>Modifica nombre y roles</DialogDescription>
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
                          ? `${role.bgColor} border-transparent ring-2 ring-primary/20`
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
                              roles: editWorker.roles.filter((r) => r !== role.value),
                            });
                          }
                        }}
                      />
                      <Icon className={`h-4 w-4 ${role.color}`} />
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

      {/* Deactivate / Reactivate Dialog */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {selectedWorker?.is_active ? (
                <>
                  <PowerOff className="h-5 w-5 text-amber-500" />
                  Desactivar trabajador
                </>
              ) : (
                <>
                  <Power className="h-5 w-5 text-emerald-500" />
                  Reactivar trabajador
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedWorker?.is_active ? (
                <>
                  El trabajador <strong>{selectedWorker?.full_name}</strong> no podrá iniciar jornada ni operar POS.
                  <br />
                  Su historial permanecerá intacto.
                </>
              ) : (
                <>
                  El trabajador <strong>{selectedWorker?.full_name}</strong> podrá volver a iniciar sesión y operar.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!togglingId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={toggleWorkerActive}
              disabled={!!togglingId}
              className={
                selectedWorker?.is_active
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-emerald-500 text-white hover:bg-emerald-600"
              }
            >
              {togglingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {selectedWorker?.is_active ? "Confirmar desactivación" : "Confirmar reactivación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Worker Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              ¿Eliminar trabajador?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se desactivará y removerán los roles de <strong>{selectedWorker?.full_name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteWorker}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eliminar
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
