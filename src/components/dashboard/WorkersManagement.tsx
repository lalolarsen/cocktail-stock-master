import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Users, Key, Save, Plus, UserPlus, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface Worker {
  id: string;
  email: string;
  full_name: string | null;
  point_of_sale: string | null;
  worker_pin: string | null;
  role: string | null;
}

interface NewWorker {
  email: string;
  password: string;
  full_name: string;
  point_of_sale: string;
  worker_pin: string;
  role: "admin" | "vendedor";
}

export function WorkersManagement() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPins, setEditingPins] = useState<Record<string, string>>({});
  const [editingPointOfSale, setEditingPointOfSale] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteWorker, setDeleteWorker] = useState<Worker | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  const [newWorker, setNewWorker] = useState<NewWorker>({
    email: "",
    password: "",
    full_name: "",
    point_of_sale: "",
    worker_pin: "",
    role: "vendedor",
  });

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, point_of_sale, worker_pin");

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      const workersWithRoles = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.id);
        return {
          ...profile,
          role: userRole?.role || null,
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

  const handlePinChange = (workerId: string, pin: string) => {
    setEditingPins((prev) => ({
      ...prev,
      [workerId]: pin,
    }));
  };

  const handlePointOfSaleChange = (workerId: string, pos: string) => {
    setEditingPointOfSale((prev) => ({
      ...prev,
      [workerId]: pos,
    }));
  };

  const saveWorkerChanges = async (workerId: string) => {
    const newPin = editingPins[workerId];
    const newPos = editingPointOfSale[workerId];
    
    if (!newPin?.trim() && !newPos?.trim()) {
      toast.error("No hay cambios que guardar");
      return;
    }

    setSavingId(workerId);

    try {
      const updates: { worker_pin?: string; point_of_sale?: string } = {};
      if (newPin?.trim()) updates.worker_pin = newPin;
      if (newPos?.trim()) updates.point_of_sale = newPos;

      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", workerId);

      if (error) throw error;

      toast.success("Cambios guardados correctamente");
      setEditingPins((prev) => {
        const updated = { ...prev };
        delete updated[workerId];
        return updated;
      });
      setEditingPointOfSale((prev) => {
        const updated = { ...prev };
        delete updated[workerId];
        return updated;
      });
      fetchWorkers();
    } catch (error) {
      console.error("Error saving changes:", error);
      toast.error("Error al guardar cambios");
    } finally {
      setSavingId(null);
    }
  };

  const createWorker = async () => {
    if (!newWorker.email || !newWorker.password || !newWorker.worker_pin) {
      toast.error("Email, contraseña y PIN son requeridos");
      return;
    }

    if (newWorker.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setCreating(true);

    try {
      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: newWorker.email,
        password: newWorker.password,
        options: {
          data: {
            full_name: newWorker.full_name,
          },
        },
      });

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error("No se pudo crear el usuario");
      }

      // Update the profile with additional data
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: newWorker.full_name,
          point_of_sale: newWorker.point_of_sale,
          worker_pin: newWorker.worker_pin,
        })
        .eq("id", authData.user.id);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }

      // Assign role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: authData.user.id,
          role: newWorker.role,
        });

      if (roleError) {
        console.error("Role assignment error:", roleError);
      }

      toast.success("Trabajador creado exitosamente");
      setShowCreateDialog(false);
      setNewWorker({
        email: "",
        password: "",
        full_name: "",
        point_of_sale: "",
        worker_pin: "",
        role: "vendedor",
      });
      
      // Refresh workers list
      setTimeout(() => fetchWorkers(), 1000);
    } catch (error: any) {
      console.error("Error creating worker:", error);
      if (error.message?.includes("already registered")) {
        toast.error("Este email ya está registrado");
      } else {
        toast.error("Error al crear trabajador: " + (error.message || "Error desconocido"));
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteWorker = async () => {
    if (!deleteWorker) return;

    setDeleting(true);

    try {
      // Delete user role first
      await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", deleteWorker.id);

      // Note: We can't delete from auth.users directly from client
      // The profile will remain but without role access
      // For full deletion, an edge function with admin privileges would be needed

      toast.success("Rol del trabajador eliminado. El perfil permanece pero sin acceso.");
      setDeleteWorker(null);
      fetchWorkers();
    } catch (error) {
      console.error("Error removing worker:", error);
      toast.error("Error al eliminar trabajador");
    } finally {
      setDeleting(false);
    }
  };

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case "admin":
        return <Badge variant="default">Administrador</Badge>;
      case "vendedor":
        return <Badge variant="secondary">Vendedor</Badge>;
      default:
        return <Badge variant="outline">Sin rol</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2">Cargando trabajadores...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          <h2 className="text-xl font-semibold">Gestión de Trabajadores</h2>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Nuevo Trabajador
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Crear Nuevo Trabajador
              </DialogTitle>
              <DialogDescription>
                Crea una nueva cuenta para un trabajador con su PIN de identificación.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-email">Email *</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="trabajador@ejemplo.com"
                  value={newWorker.email}
                  onChange={(e) => setNewWorker({ ...newWorker, email: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password">Contraseña *</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newWorker.password}
                  onChange={(e) => setNewWorker({ ...newWorker, password: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-name">Nombre Completo</Label>
                <Input
                  id="new-name"
                  type="text"
                  placeholder="Juan Pérez"
                  value={newWorker.full_name}
                  onChange={(e) => setNewWorker({ ...newWorker, full_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pos">Punto de Venta</Label>
                <Input
                  id="new-pos"
                  type="text"
                  placeholder="Barra Principal"
                  value={newWorker.point_of_sale}
                  onChange={(e) => setNewWorker({ ...newWorker, point_of_sale: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pin">PIN de Identificación *</Label>
                <Input
                  id="new-pin"
                  type="text"
                  placeholder="1234"
                  value={newWorker.worker_pin}
                  onChange={(e) => setNewWorker({ ...newWorker, worker_pin: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-role">Rol *</Label>
                <Select
                  value={newWorker.role}
                  onValueChange={(value: "admin" | "vendedor") => 
                    setNewWorker({ ...newWorker, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar rol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setShowCreateDialog(false)}
                  disabled={creating}
                >
                  Cancelar
                </Button>
                <Button onClick={createWorker} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Crear Trabajador
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Punto de Venta</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay trabajadores registrados
                </TableCell>
              </TableRow>
            ) : (
              workers.map((worker) => (
                <TableRow key={worker.id}>
                  <TableCell className="font-medium">{worker.email}</TableCell>
                  <TableCell>{worker.full_name || "-"}</TableCell>
                  <TableCell>
                    <Input
                      type="text"
                      placeholder={worker.point_of_sale || "Sin asignar"}
                      value={editingPointOfSale[worker.id] ?? ""}
                      onChange={(e) => handlePointOfSaleChange(worker.id, e.target.value)}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>{getRoleBadge(worker.role)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={worker.worker_pin ? "••••" : "Sin PIN"}
                        value={editingPins[worker.id] ?? ""}
                        onChange={(e) => handlePinChange(worker.id, e.target.value)}
                        className="w-24"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        onClick={() => saveWorkerChanges(worker.id)}
                        disabled={
                          (!editingPins[worker.id] && !editingPointOfSale[worker.id]) || 
                          savingId === worker.id
                        }
                      >
                        {savingId === worker.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-1" />
                            Guardar
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteWorker(worker)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        El PIN de identificación es requerido para que los trabajadores accedan al sistema.
      </p>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteWorker} onOpenChange={() => setDeleteWorker(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar trabajador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto eliminará el rol de {deleteWorker?.full_name || deleteWorker?.email}. 
              El usuario ya no podrá acceder al sistema con su rol actual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteWorker}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
