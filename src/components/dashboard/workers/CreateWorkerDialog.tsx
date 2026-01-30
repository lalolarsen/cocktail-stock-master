import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, UserPlus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AVAILABLE_ROLES } from "./types";
import { AppRole } from "@/hooks/useUserRole";

interface CreateWorkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (worker: {
    rut_code: string;
    full_name: string;
    pin: string;
    roles: AppRole[];
  }) => Promise<void>;
  creating: boolean;
}

export function CreateWorkerDialog({
  open,
  onOpenChange,
  onCreate,
  creating,
}: CreateWorkerDialogProps) {
  const [newWorker, setNewWorker] = useState({
    rut_code: "",
    full_name: "",
    pin: "",
    roles: [] as AppRole[],
  });

  const handleCreate = async () => {
    await onCreate(newWorker);
    setNewWorker({ rut_code: "", full_name: "", pin: "", roles: [] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 shadow-sm">
          <UserPlus className="w-4 h-4" />
          Nuevo Trabajador
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-primary" />
            </div>
            Crear Nuevo Trabajador
          </DialogTitle>
          <DialogDescription>
            Crea una cuenta con RUT y PIN para acceso al sistema
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-rut" className="text-sm font-medium">
                RUT (solo dígitos) *
              </Label>
              <Input
                id="new-rut"
                type="text"
                inputMode="numeric"
                placeholder="12345678"
                value={newWorker.rut_code}
                onChange={(e) => 
                  setNewWorker({ ...newWorker, rut_code: e.target.value.replace(/\D/g, "") })
                }
                maxLength={9}
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-pin" className="text-sm font-medium">
                PIN (mín. 4 dígitos) *
              </Label>
              <Input
                id="new-pin"
                type="password"
                inputMode="numeric"
                placeholder="••••"
                value={newWorker.pin}
                onChange={(e) => setNewWorker({ ...newWorker, pin: e.target.value })}
                maxLength={6}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-name" className="text-sm font-medium">
              Nombre Completo
            </Label>
            <Input
              id="new-name"
              type="text"
              placeholder="Juan Pérez"
              value={newWorker.full_name}
              onChange={(e) => setNewWorker({ ...newWorker, full_name: e.target.value })}
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Roles *</Label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_ROLES.map((role) => {
                const Icon = role.icon;
                const isChecked = newWorker.roles.includes(role.value);
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
                          setNewWorker({ ...newWorker, roles: [...newWorker.roles, role.value] });
                        } else {
                          setNewWorker({ 
                            ...newWorker, 
                            roles: newWorker.roles.filter((r) => r !== role.value) 
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
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)} 
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="min-w-[100px]">
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Crear
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
