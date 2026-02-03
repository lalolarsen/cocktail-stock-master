import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Loader2 } from "lucide-react";
import { formatCLP } from "@/lib/currency";
import { GuidedTooltip, TOOLTIPS } from "@/components/GuidedTooltip";

type ProductAddon = {
  id: string;
  name: string;
  description: string | null;
  price_modifier: number;
  is_active: boolean;
  venue_id: string;
  created_at: string;
  updated_at: string;
};

type Cocktail = {
  id: string;
  name: string;
  category: string;
};

type CocktailAddon = {
  cocktail_id: string;
  addon_id: string;
};

interface AddonsManagementProps {
  isReadOnly?: boolean;
}

export function AddonsManagement({ isReadOnly = false }: AddonsManagementProps) {
  const { venue } = useActiveVenue();
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [cocktailAddons, setCocktailAddons] = useState<CocktailAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState<ProductAddon | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price_modifier: 0,
    is_active: true,
  });
  
  // Assignment state
  const [selectedCocktails, setSelectedCocktails] = useState<string[]>([]);

  useEffect(() => {
    if (venue?.id) {
      fetchData();
    }
  }, [venue?.id]);

  const fetchData = async () => {
    if (!venue?.id) return;
    setLoading(true);
    
    try {
      const [addonsRes, cocktailsRes, assignmentsRes] = await Promise.all([
        supabase
          .from("product_addons")
          .select("*")
          .eq("venue_id", venue.id)
          .order("name"),
        supabase
          .from("cocktails")
          .select("id, name, category")
          .eq("venue_id", venue.id)
          .order("category, name"),
        supabase
          .from("cocktail_addons")
          .select("*"),
      ]);

      if (addonsRes.error) throw addonsRes.error;
      if (cocktailsRes.error) throw cocktailsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      setAddons(addonsRes.data || []);
      setCocktails(cocktailsRes.data || []);
      setCocktailAddons(assignmentsRes.data || []);
    } catch (error: any) {
      toast.error("Error al cargar datos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price_modifier: 0,
      is_active: true,
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setShowCreateDialog(true);
  };

  const openEditDialog = (addon: ProductAddon) => {
    setSelectedAddon(addon);
    setFormData({
      name: addon.name,
      description: addon.description || "",
      price_modifier: addon.price_modifier,
      is_active: addon.is_active,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (addon: ProductAddon) => {
    setSelectedAddon(addon);
    setShowDeleteDialog(true);
  };

  const openAssignDialog = (addon: ProductAddon) => {
    setSelectedAddon(addon);
    // Get currently assigned cocktails for this addon
    const assigned = cocktailAddons
      .filter(ca => ca.addon_id === addon.id)
      .map(ca => ca.cocktail_id);
    setSelectedCocktails(assigned);
    setShowAssignDialog(true);
  };

  const handleCreate = async () => {
    if (!venue?.id) return;
    if (!formData.name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("product_addons")
        .insert({
          venue_id: venue.id,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          price_modifier: formData.price_modifier,
          is_active: formData.is_active,
        });

      if (error) throw error;

      toast.success("Add-on creado correctamente");
      setShowCreateDialog(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error("Error al crear add-on: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedAddon) return;
    if (!formData.name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("product_addons")
        .update({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          price_modifier: formData.price_modifier,
          is_active: formData.is_active,
        })
        .eq("id", selectedAddon.id);

      if (error) throw error;

      toast.success("Add-on actualizado correctamente");
      setShowEditDialog(false);
      setSelectedAddon(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast.error("Error al actualizar add-on: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAddon) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("product_addons")
        .delete()
        .eq("id", selectedAddon.id);

      if (error) throw error;

      toast.success("Add-on eliminado correctamente");
      setShowDeleteDialog(false);
      setSelectedAddon(null);
      fetchData();
    } catch (error: any) {
      toast.error("Error al eliminar add-on: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedAddon) return;

    setSaving(true);
    try {
      // Get current assignments for this addon
      const currentAssignments = cocktailAddons
        .filter(ca => ca.addon_id === selectedAddon.id)
        .map(ca => ca.cocktail_id);

      // Determine what to add and remove
      const toAdd = selectedCocktails.filter(id => !currentAssignments.includes(id));
      const toRemove = currentAssignments.filter(id => !selectedCocktails.includes(id));

      // Remove unselected
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("cocktail_addons")
          .delete()
          .eq("addon_id", selectedAddon.id)
          .in("cocktail_id", toRemove);
        if (error) throw error;
      }

      // Add new selections
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("cocktail_addons")
          .insert(toAdd.map(cocktailId => ({
            addon_id: selectedAddon.id,
            cocktail_id: cocktailId,
          })));
        if (error) throw error;
      }

      toast.success("Productos asignados correctamente");
      setShowAssignDialog(false);
      setSelectedAddon(null);
      setSelectedCocktails([]);
      fetchData();
    } catch (error: any) {
      toast.error("Error al asignar productos: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCocktailSelection = (cocktailId: string) => {
    setSelectedCocktails(prev =>
      prev.includes(cocktailId)
        ? prev.filter(id => id !== cocktailId)
        : [...prev, cocktailId]
    );
  };

  const getAssignedCount = (addonId: string) => {
    return cocktailAddons.filter(ca => ca.addon_id === addonId).length;
  };

  // Group cocktails by category for the assignment dialog
  const cocktailsByCategory = cocktails.reduce((acc, cocktail) => {
    if (!acc[cocktail.category]) {
      acc[cocktail.category] = [];
    }
    acc[cocktail.category].push(cocktail);
    return acc;
  }, {} as Record<string, Cocktail[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            <GuidedTooltip content={TOOLTIPS.addon}>
              Add-ons
            </GuidedTooltip>
          </h2>
          <p className="text-muted-foreground">
            Modificadores opcionales que agregan un cargo adicional al producto
          </p>
        </div>
        {!isReadOnly && (
          <Button onClick={openCreateDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Add-on
          </Button>
        )}
      </div>

      {addons.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay add-ons configurados</h3>
            <p className="text-muted-foreground text-center mb-4">
              Los add-ons permiten agregar modificadores como "Michelada" o "Sal Extra" a los productos.
            </p>
            {!isReadOnly && (
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Crear primer add-on
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-center">Productos</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                {!isReadOnly && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {addons.map(addon => (
                <TableRow key={addon.id}>
                  <TableCell className="font-medium">{addon.name}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {addon.description || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {addon.price_modifier === 0 ? (
                      <span className="text-muted-foreground">Gratis</span>
                    ) : (
                      <span className="font-medium text-primary">
                        +{formatCLP(addon.price_modifier)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant="secondary" 
                      className="cursor-pointer hover:bg-secondary/80"
                      onClick={() => !isReadOnly && openAssignDialog(addon)}
                    >
                      {getAssignedCount(addon.id)} productos
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {addon.is_active ? (
                      <Badge variant="default">Activo</Badge>
                    ) : (
                      <Badge variant="outline">Inactivo</Badge>
                    )}
                  </TableCell>
                  {!isReadOnly && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openAssignDialog(addon)}
                          title="Asignar productos"
                        >
                          <Package className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(addon)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(addon)}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setSelectedAddon(null);
          resetForm();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showEditDialog ? "Editar Add-on" : "Nuevo Add-on"}
            </DialogTitle>
            <DialogDescription>
              {showEditDialog
                ? "Modifica los datos del add-on"
                : "Crea un nuevo add-on para tus productos"
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                placeholder="Ej: Michelada, Sal Extra"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                placeholder="Descripción opcional del add-on"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Precio adicional (CLP)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="100"
                placeholder="0"
                value={formData.price_modifier}
                onChange={(e) => setFormData({ ...formData, price_modifier: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">
                Usa 0 para add-ons gratuitos como "Sin hielo"
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="active">Activo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setShowEditDialog(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={showEditDialog ? handleUpdate : handleCreate}
              disabled={saving}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {showEditDialog ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar add-on?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el add-on "{selectedAddon?.name}" y todas sus asignaciones a productos.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Products Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={(open) => {
        if (!open) {
          setShowAssignDialog(false);
          setSelectedAddon(null);
          setSelectedCocktails([]);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar productos a "{selectedAddon?.name}"</DialogTitle>
            <DialogDescription>
              Selecciona los productos del menú que pueden tener este add-on
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {Object.entries(cocktailsByCategory).map(([category, items]) => (
                <div key={category} className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                    {category}
                  </h4>
                  <div className="space-y-1">
                    {items.map(cocktail => (
                      <div
                        key={cocktail.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleCocktailSelection(cocktail.id)}
                      >
                        <Checkbox
                          checked={selectedCocktails.includes(cocktail.id)}
                          onCheckedChange={() => toggleCocktailSelection(cocktail.id)}
                        />
                        <span>{cocktail.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <div className="flex items-center justify-between w-full">
              <span className="text-sm text-muted-foreground">
                {selectedCocktails.length} productos seleccionados
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAssign} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
