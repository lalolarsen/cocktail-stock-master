import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCLP } from "@/lib/currency";
import { Plus, Edit, Trash2, Ticket, Wine, Loader2 } from "lucide-react";

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

export function TicketTypesManagement() {
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingType, setEditingType] = useState<TicketType | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [includesCover, setIncludesCover] = useState(false);
  const [coverCocktailId, setCoverCocktailId] = useState<string>("");
  const [coverQuantity, setCoverQuantity] = useState("1");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [typesRes, cocktailsRes] = await Promise.all([
        supabase.from("ticket_types").select("*").order("price"),
        supabase.from("cocktails").select("id, name").order("name")
      ]);

      if (typesRes.error) throw typesRes.error;
      if (cocktailsRes.error) throw cocktailsRes.error;

      setTicketTypes(typesRes.data || []);
      setCocktails(cocktailsRes.data || []);
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
    setCoverCocktailId("");
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
    setCoverCocktailId(type.cover_cocktail_id || "");
    setCoverQuantity(type.cover_quantity.toString());
    setIsActive(type.is_active);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    if (!price || parseInt(price) <= 0) {
      toast.error("Precio debe ser mayor a 0");
      return;
    }
    if (includesCover && !coverCocktailId) {
      toast.error("Selecciona un producto de cover");
      return;
    }

    setSaving(true);

    try {
      // Get venue_id from user profile
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user!.id)
        .single();

      const ticketData = {
        name: name.trim(),
        price: parseInt(price),
        includes_cover: includesCover,
        cover_cocktail_id: includesCover ? coverCocktailId : null,
        cover_quantity: includesCover ? parseInt(coverQuantity) : 1,
        is_active: isActive,
        venue_id: profile?.venue_id
      };

      if (editingType) {
        const { error } = await supabase
          .from("ticket_types")
          .update(ticketData)
          .eq("id", editingType.id);
        
        if (error) throw error;
        toast.success("Tipo de entrada actualizado");
      } else {
        const { error } = await supabase
          .from("ticket_types")
          .insert(ticketData);
        
        if (error) throw error;
        toast.success("Tipo de entrada creado");
      }

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
      const { error } = await supabase
        .from("ticket_types")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Tipo de entrada eliminado");
      fetchData();
    } catch (error: any) {
      console.error("Delete error:", error);
      toast.error("Error al eliminar");
    }
  };

  const toggleActive = async (type: TicketType) => {
    try {
      const { error } = await supabase
        .from("ticket_types")
        .update({ is_active: !type.is_active })
        .eq("id", type.id);

      if (error) throw error;
      fetchData();
    } catch (error) {
      toast.error("Error al actualizar");
    }
  };

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
          {ticketTypes.map(type => (
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
                  <Switch
                    checked={type.is_active}
                    onCheckedChange={() => toggleActive(type)}
                  />
                </div>
                
                {type.includes_cover && (
                  <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                    <Wine className="h-3 w-3" />
                    Incluye {type.cover_quantity}x cover
                  </Badge>
                )}
                
                {!type.is_active && (
                  <Badge variant="outline">Desactivado</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Editar Tipo de Entrada" : "Nueva Tipo de Entrada"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                placeholder="Ej: General, VIP, Promo"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Precio (CLP)</Label>
              <Input
                type="number"
                placeholder="5000"
                value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Incluye Cover (trago)</Label>
              <Switch
                checked={includesCover}
                onCheckedChange={setIncludesCover}
              />
            </div>

            {includesCover && (
              <>
                <div className="space-y-2">
                  <Label>Producto de Cover</Label>
                  <Select value={coverCocktailId} onValueChange={setCoverCocktailId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar producto" />
                    </SelectTrigger>
                    <SelectContent>
                      {cocktails.map(cocktail => (
                        <SelectItem key={cocktail.id} value={cocktail.id}>
                          {cocktail.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Cantidad de Cover</Label>
                  <Input
                    type="number"
                    min="1"
                    value={coverQuantity}
                    onChange={e => setCoverQuantity(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <Label>Activo</Label>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
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
