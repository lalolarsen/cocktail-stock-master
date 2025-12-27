import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Users, Key, Save } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Worker {
  id: string;
  email: string;
  full_name: string | null;
  point_of_sale: string | null;
  worker_pin: string | null;
  role: string | null;
}

export function WorkersManagement() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPins, setEditingPins] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      // Get profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name, point_of_sale, worker_pin");

      if (profilesError) throw profilesError;

      // Get roles for each profile
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Combine profiles with roles
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

  const savePin = async (workerId: string) => {
    const newPin = editingPins[workerId];
    if (!newPin?.trim()) {
      toast.error("Ingresa un PIN válido");
      return;
    }

    setSavingId(workerId);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ worker_pin: newPin })
        .eq("id", workerId);

      if (error) throw error;

      toast.success("PIN actualizado correctamente");
      setEditingPins((prev) => {
        const updated = { ...prev };
        delete updated[workerId];
        return updated;
      });
      fetchWorkers();
    } catch (error) {
      console.error("Error saving PIN:", error);
      toast.error("Error al guardar PIN");
    } finally {
      setSavingId(null);
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
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5" />
        <h2 className="text-xl font-semibold">Gestión de Trabajadores</h2>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Punto de Venta</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>PIN de Identificación</TableHead>
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
                  <TableCell>{worker.point_of_sale || "-"}</TableCell>
                  <TableCell>{getRoleBadge(worker.role)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={worker.worker_pin ? "••••••" : "Sin PIN"}
                        value={editingPins[worker.id] ?? ""}
                        onChange={(e) => handlePinChange(worker.id, e.target.value)}
                        className="w-32"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => savePin(worker.id)}
                      disabled={!editingPins[worker.id] || savingId === worker.id}
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
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        El PIN de identificación es requerido para que los vendedores accedan al sistema de ventas.
      </p>
    </Card>
  );
}
