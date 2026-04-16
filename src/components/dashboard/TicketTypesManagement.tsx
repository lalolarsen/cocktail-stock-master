import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { Plus, Edit, Trash2, Ticket, Wine, Loader2 } from "lucide-react";
import { useActiveVenue } from "@/hooks/useActiveVenue";

interface TicketType {
  id: string;
  name: string;
  price: number;
  includes_cover: boolean;
  cover_cocktail_id: string | null;
  cover_quantity: number;
  is_active: boolean;
  venue_id: string;
}

interface Cocktail {
  id: string;
  name: string;
}

interface CoverOption {
  id: string;
  ticket_type_id: string;
  cocktail_id: string;
  display_order: number;
}

export function TicketTypesManagement() {
  const { venue } = useActiveVenue();
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [coverOptions, setCoverOptions] = useState<CoverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState<TicketType | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [includesCover, setIncludesCover] = useState(false);
  const [selectedCoverIds, setSelectedCoverIds] = useState<string[]>([]);
  const [coverQuantity, setCoverQuantity] = useState("1");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (venue?.id) fetchData();
  }, [venue?.id]);

  const fetchData = async () => {
    if (!venue?.id) return;
    try {
      const [typesRes, cocktailsRes, optionsRes] = await Promise.all([
        supabase.from("ticket_types").select("*").eq("venue_id", venue.id).order("price"),
        supabase.from("cocktails").select("id, name").eq("venue_id", venue.id).order("name"),
        supabase.from("ticket_type_cover_options").select("id, ticket_type_id, cocktail_id, display_order").eq("venue_id", venue.id),
      ]);
      if (typesRes.error) throw typesRes.error;
      if (cocktailsRes.error) throw cocktailsRes.error;
      if (optionsRes.error) throw optionsRes.error;
      setTicketTypes(typesRes.data || []);
      setCocktails(cocktailsRes.data || []);
      setCoverOptions(optionsRes.data || []);
    } catch (error: any) {
      console.error("Error:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setPrice("");
    setIncludesCover(false);
    setSelectedCoverIds([]);
    setCoverQuantity("1");
    setIsActive(true);
    setEditingType(null);
  };

  const openNewDialog = () => {
    resetForm();
    setShowDialog(true);
  };

  const openEditDialog = (type: TicketType) => {
    setEditingType(type);
    setName(type.name);
    setPrice(type.price.toString());
    setIncludesCover(type.includes_cover);
    setCoverQuantity(type.cover_quantity?.toString() || "1");
    setIsActive(type.is_active);
    // Load existing cover options for this ticket type
    const existing = coverOptions.filter(o => o.ticket_type_id === type.id).map(o => o.cocktail_id);
    setSelectedCoverIds(existing);
    setShowDialog(true);
  };

  const toggleCoverOption = (cocktailId: string) => {
    setSelectedCoverIds(prev =>
      prev.includes(cocktailId) ? prev.filter(id => id !== cocktailId) : [...prev, cocktailId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Nombre requerido");
    if (!price || parseInt(price) <= 0) return toast.error("Precio debe ser mayor a 0");
    if (includesCover && selectedCoverIds.length === 0) return toast.error("Selecciona al menos 1 producto de cover");
    if (!venue?.id) return toast.error("Sin venue activo");

    setSaving(true);
    try {
      const ticketData = {
        name: name.trim(),
        price: parseInt(price),
        includes_cover: includesCover,
        // Legacy fallback: first selected cocktail
        cover_cocktail_id: includesCover && selectedCoverIds.length > 0 ? selectedCoverIds[0] : null,
        cover_quantity: includesCover ? parseInt(coverQuantity) : 1,
        is_active: isActive,
        venue_id: venue.id,
      };

      let ticketTypeId: string;
      if (editingType) {
        const { error } = await supabase.from("ticket_types").update(ticketData).eq("id", editingType.id);
        if (error) throw error;
        ticketTypeId = editingType.id;
      } else {
        const { data, error } = await supabase.from("ticket_types").insert(ticketData).select("id").single();
        if (error) throw error;
        ticketTypeId = data!.id;
      }

      // Sync cover options
      if (includesCover) {
        // Remove existing
        await supabase.from("ticket_type_cover_options").delete().eq("ticket_type_id", ticketTypeId);
        // Insert new
        const rows = selectedCoverIds.map((cocktail_id, idx) => ({
          ticket_type_id: ticketTypeId,
          cocktail_id,
          display_order: idx,
          venue_id: venue.id,
        }));
        if (rows.length > 0) {
          const { error } = await supabase.from("ticket_type_cover_options").insert(rows);
          if (error) throw error;
        }
      } else {
        await supabase.from("ticket_type_cover_options").delete().eq("ticket_type_id", ticketTypeId);
      }

      toast.success(editingType ? "Tipo actualizado" : "Tipo creado");
      setShowDialog(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este tipo de entrada?")) return;
    try {
      const { error } = await supabase.from("ticket_types").delete().eq("id", id);
      if (error) throw error;
      toast.success("Eliminado");
      fetchData();
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const toggleActive = async (type: TicketType) => {
    try {
      const { error } = await supabase.from("ticket_types").update({ is_active: !type.is_active }).eq("id", type.id);
      if (error) throw error;
      fetchData();
    } catch {
      toast.error("Error al actualizar");
    }
  };

  const getCoverCountForType = (typeId: string) =>
    coverOptions.filter(o => o.ticket_type_id === typeId).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          <h2 className="text-xl font-bold">Tipos de Entrada</h2>
        </div>
        <Button onClick={openNewDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Entrada
        </Button>
      </div>

      {ticketTypes.length === 0 ? (
        <Card className="p-8 text-center">
          <Ticket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay tipos de entrada configurados</p>
          <Button className="mt-4" onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Crear primero
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ticketTypes.map(type => {
            const optionsCount = getCoverCountForType(type.id);
            return (
              <Card key={type.id} className={!type.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{type.name}</CardTitle>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(type)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(type.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{formatCLP(type.price)}</span>
                    <Switch checked={type.is_active} onCheckedChange={() => toggleActive(type)} />
                  </div>
                  {type.includes_cover && (
                    <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                      <Wine className="h-3 w-3" />
                      {type.cover_quantity}x cover · {optionsCount} opcion{optionsCount === 1 ? "" : "es"}
                    </Badge>
                  )}
                  {!type.is_active && <Badge variant="outline">Desactivado</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingType ? "Editar Tipo de Entrada" : "Nuevo Tipo de Entrada"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input placeholder="Ej: General, VIP, Promo" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Precio (CLP)</Label>
              <Input type="number" placeholder="5000" value={price} onChange={e => setPrice(e.target.value)} />
            </div>

            <div className="flex items-center justify-between">
              <Label>Incluye Cover (trago)</Label>
              <Switch checked={includesCover} onCheckedChange={setIncludesCover} />
            </div>

            {includesCover && (
              <>
                <div className="space-y-2">
                  <Label>Productos de Cover permitidos *</Label>
                  <p className="text-xs text-muted-foreground">
                    Selecciona uno o más cocktails. El cajero elegirá cuál asignar al vender.
                  </p>
                  <div className="border rounded-md">
                    <ScrollArea className="h-48 p-2">
                      {cocktails.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-2">No hay cocktails en el catálogo</p>
                      ) : (
                        <div className="space-y-2">
                          {cocktails.map(c => (
                            <label
                              key={c.id}
                              className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={selectedCoverIds.includes(c.id)}
                                onCheckedChange={() => toggleCoverOption(c.id)}
                              />
                              <span className="text-sm">{c.name}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                  <p className="text-xs text-primary">
                    {selectedCoverIds.length} seleccionado{selectedCoverIds.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Cantidad de Cover por entrada</Label>
                  <Input type="number" min="1" value={coverQuantity} onChange={e => setCoverQuantity(e.target.value)} />
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingType ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
