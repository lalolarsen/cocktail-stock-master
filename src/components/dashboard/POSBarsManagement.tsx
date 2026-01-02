import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Store, Monitor, Trash2, Edit, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface StockLocation {
  id: string;
  name: string;
  type: "warehouse" | "bar";
  is_active: boolean;
  created_at: string;
}

interface POSTerminal {
  id: string;
  name: string;
  location_id: string;
  is_active: boolean;
  created_at: string;
  location?: StockLocation;
}

export function POSBarsManagement() {
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [terminals, setTerminals] = useState<POSTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [showPOSDialog, setShowPOSDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Form states
  const [locationForm, setLocationForm] = useState<{ name: string; type: "bar" | "warehouse" }>({ name: "", type: "bar" });
  const [posForm, setPosForm] = useState({ name: "", locationId: "", createNewBar: false, newBarName: "" });
  const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null);
  const [editingPOS, setEditingPOS] = useState<POSTerminal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "location" | "pos"; item: StockLocation | POSTerminal } | null>(null);
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [locResult, posResult] = await Promise.all([
        supabase.from("stock_locations").select("*").order("type", { ascending: false }).order("name"),
        supabase.from("pos_terminals").select("*, location:stock_locations(*)").order("name")
      ]);
      
      if (locResult.error) throw locResult.error;
      if (posResult.error) throw posResult.error;
      
      setLocations(locResult.data as StockLocation[] || []);
      setTerminals(posResult.data as POSTerminal[] || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const barLocations = locations.filter(l => l.type === "bar");
  const warehouseLocation = locations.find(l => l.type === "warehouse");

  const handleCreateLocation = async () => {
    if (!locationForm.name.trim()) {
      toast.error("Nombre es requerido");
      return;
    }
    
    try {
      if (editingLocation) {
        const { error } = await supabase
          .from("stock_locations")
          .update({ name: locationForm.name })
          .eq("id", editingLocation.id);
        if (error) throw error;
        toast.success("Ubicación actualizada");
      } else {
        const { error } = await supabase
          .from("stock_locations")
          .insert({ name: locationForm.name, type: locationForm.type });
        if (error) throw error;
        toast.success("Ubicación creada");
      }
      
      setShowLocationDialog(false);
      setEditingLocation(null);
      setLocationForm({ name: "", type: "bar" });
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Error al guardar ubicación");
    }
  };

  const handleCreatePOS = async () => {
    if (!posForm.name.trim()) {
      toast.error("Nombre del POS es requerido");
      return;
    }
    
    let locationId = posForm.locationId;
    
    try {
      // If creating new bar, create it first
      if (posForm.createNewBar) {
        if (!posForm.newBarName.trim()) {
          toast.error("Nombre de la barra es requerido");
          return;
        }
        
        const { data: newLoc, error: locError } = await supabase
          .from("stock_locations")
          .insert({ name: posForm.newBarName, type: "bar" })
          .select()
          .single();
        
        if (locError) throw locError;
        locationId = newLoc.id;
      }
      
      if (!locationId) {
        toast.error("Selecciona una barra");
        return;
      }
      
      if (editingPOS) {
        const { error } = await supabase
          .from("pos_terminals")
          .update({ name: posForm.name, location_id: locationId })
          .eq("id", editingPOS.id);
        if (error) throw error;
        toast.success("Terminal actualizado");
      } else {
        const { error } = await supabase
          .from("pos_terminals")
          .insert({ name: posForm.name, location_id: locationId });
        if (error) throw error;
        toast.success("Terminal creado");
      }
      
      setShowPOSDialog(false);
      setEditingPOS(null);
      setPosForm({ name: "", locationId: "", createNewBar: false, newBarName: "" });
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Error al guardar terminal");
    }
  };

  const handleToggleActive = async (type: "location" | "pos", id: string, isActive: boolean) => {
    try {
      const table = type === "location" ? "stock_locations" : "pos_terminals";
      const { error } = await supabase
        .from(table)
        .update({ is_active: isActive })
        .eq("id", id);
      
      if (error) throw error;
      toast.success(isActive ? "Activado" : "Desactivado");
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message || "Error al actualizar estado");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    try {
      const table = deleteTarget.type === "location" ? "stock_locations" : "pos_terminals";
      const { error } = await supabase.from(table).delete().eq("id", deleteTarget.item.id);
      
      if (error) throw error;
      toast.success("Eliminado correctamente");
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      fetchData();
    } catch (error: any) {
      console.error("Error:", error);
      // Likely has related data
      toast.error("No se puede eliminar: tiene datos asociados. Desactívalo en su lugar.");
      setShowDeleteDialog(false);
    }
  };

  const openEditLocation = (loc: StockLocation) => {
    setEditingLocation(loc);
    setLocationForm({ name: loc.name, type: loc.type });
    setShowLocationDialog(true);
  };

  const openEditPOS = (pos: POSTerminal) => {
    setEditingPOS(pos);
    setPosForm({ name: pos.name, locationId: pos.location_id, createNewBar: false, newBarName: "" });
    setShowPOSDialog(true);
  };

  if (loading) {
    return (
      <Card className="glass-effect">
        <CardHeader>
          <CardTitle>Barras y Puntos de Venta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-effect shadow-elegant">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Barras y Puntos de Venta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pos" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="pos" className="flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Terminales POS
              </TabsTrigger>
              <TabsTrigger value="locations" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Ubicaciones
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="pos" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowPOSDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nuevo Terminal
                </Button>
              </div>
              
              {terminals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Monitor className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay terminales POS configurados</p>
                  <p className="text-sm">Crea un terminal para empezar a vender</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {terminals.map((terminal) => (
                    <div
                      key={terminal.id}
                      className="glass-effect p-4 rounded-lg flex items-center justify-between hover-lift"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 primary-gradient rounded-lg">
                          <Monitor className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{terminal.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Store className="w-3 h-3" />
                            <span>{terminal.location?.name || "Sin barra"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={terminal.is_active ? "default" : "secondary"}>
                          {terminal.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                        <Switch
                          checked={terminal.is_active}
                          onCheckedChange={(checked) => handleToggleActive("pos", terminal.id, checked)}
                        />
                        <Button size="icon" variant="outline" onClick={() => openEditPOS(terminal)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => {
                            setDeleteTarget({ type: "pos", item: terminal });
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="locations" className="space-y-4">
              <div className="flex justify-end">
                <Button onClick={() => setShowLocationDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Nueva Ubicación
                </Button>
              </div>
              
              {/* Warehouse */}
              {warehouseLocation && (
                <div className="glass-effect p-4 rounded-lg border-2 border-primary/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
                        <Store className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{warehouseLocation.name}</h3>
                        <Badge variant="outline" className="mt-1">Bodega Principal</Badge>
                      </div>
                    </div>
                    <Badge variant="default">Sistema</Badge>
                  </div>
                </div>
              )}
              
              {/* Bars */}
              <div className="grid gap-4">
                {barLocations.map((location) => {
                  const posCount = terminals.filter(t => t.location_id === location.id).length;
                  return (
                    <div
                      key={location.id}
                      className="glass-effect p-4 rounded-lg flex items-center justify-between hover-lift"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-emerald-500 to-green-500 rounded-lg">
                          <Store className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{location.name}</h3>
                          <p className="text-sm text-muted-foreground">{posCount} terminal(es) vinculado(s)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={location.is_active ? "default" : "secondary"}>
                          {location.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                        <Switch
                          checked={location.is_active}
                          onCheckedChange={(checked) => handleToggleActive("location", location.id, checked)}
                        />
                        <Button size="icon" variant="outline" onClick={() => openEditLocation(location)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => {
                            setDeleteTarget({ type: "location", item: location });
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Location Dialog */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Editar Ubicación" : "Nueva Ubicación"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="loc-name">Nombre</Label>
              <Input
                id="loc-name"
                value={locationForm.name}
                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                placeholder="Ej: Barra Principal"
              />
            </div>
            {!editingLocation && (
              <div className="space-y-2">
                <Label htmlFor="loc-type">Tipo</Label>
                <Select
                  value={locationForm.type}
                  onValueChange={(v) => setLocationForm({ ...locationForm, type: v as "bar" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Barra</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Solo se pueden crear ubicaciones tipo Barra</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLocationDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateLocation}>{editingLocation ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POS Dialog */}
      <Dialog open={showPOSDialog} onOpenChange={setShowPOSDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPOS ? "Editar Terminal" : "Nuevo Terminal POS"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="pos-name">Nombre del Terminal</Label>
              <Input
                id="pos-name"
                value={posForm.name}
                onChange={(e) => setPosForm({ ...posForm, name: e.target.value })}
                placeholder="Ej: POS-1"
              />
            </div>
            
            <div className="space-y-3">
              <Label>Barra Asociada</Label>
              
              {!editingPOS && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={posForm.createNewBar}
                    onCheckedChange={(checked) => setPosForm({ ...posForm, createNewBar: checked })}
                  />
                  <span className="text-sm">Crear nueva barra</span>
                </div>
              )}
              
              {posForm.createNewBar ? (
                <Input
                  value={posForm.newBarName}
                  onChange={(e) => setPosForm({ ...posForm, newBarName: e.target.value })}
                  placeholder="Nombre de la nueva barra"
                />
              ) : (
                <Select
                  value={posForm.locationId || ""}
                  onValueChange={(v) => setPosForm({ ...posForm, locationId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una barra" />
                  </SelectTrigger>
                  <SelectContent>
                    {barLocations.filter(loc => loc?.id).map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPOSDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreatePOS}>{editingPOS ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteTarget?.type === "pos" ? "terminal" : "ubicación"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si tiene datos asociados, la eliminación fallará.
              Considera desactivar en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}