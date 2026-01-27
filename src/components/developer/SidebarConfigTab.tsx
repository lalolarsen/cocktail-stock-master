import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Loader2, 
  Save, 
  Plus, 
  Trash2, 
  GripVertical,
  Wine,
  Package,
  Users,
  Calendar,
  FileText,
  Receipt,
  Warehouse,
  ArrowRightLeft,
  Bell,
  Ticket,
  Martini,
  RotateCcw
} from "lucide-react";
import { VenueSelector } from "./VenueSelector";

interface SidebarConfigTabProps {
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string | null) => void;
}

interface SidebarItem {
  menu_key: string;
  menu_label: string;
  icon_name: string;
  view_type: string;
  feature_flag: string | null;
  external_path: string | null;
  sort_order: number;
  is_enabled: boolean;
}

const AVAILABLE_ICONS = [
  { name: "Wine", icon: Wine },
  { name: "Package", icon: Package },
  { name: "Users", icon: Users },
  { name: "Calendar", icon: Calendar },
  { name: "FileText", icon: FileText },
  { name: "Receipt", icon: Receipt },
  { name: "Warehouse", icon: Warehouse },
  { name: "ArrowRightLeft", icon: ArrowRightLeft },
  { name: "Bell", icon: Bell },
  { name: "Ticket", icon: Ticket },
  { name: "Martini", icon: Martini },
];

const VIEW_TYPES = [
  "overview", "products", "menu", "workers", "jornadas", 
  "expenses", "reports", "documents", "pos", "inventory", 
  "replenishment", "notifications", "tickets"
];

const FEATURE_FLAGS = [
  "", "ventas_alcohol", "ventas_tickets", "qr_cover", "inventario", 
  "reposicion", "importacion_excel", "jornadas", "arqueo", "reportes",
  "contabilidad_basica", "contabilidad_avanzada", "lector_facturas"
];

const ROLES = ["admin", "gerencia", "vendedor", "bar", "ticket_seller"];

// Default configs for quick reset
const DEFAULT_ADMIN_CONFIG: SidebarItem[] = [
  { menu_key: "overview", menu_label: "Panel General", icon_name: "Wine", view_type: "overview", feature_flag: null, external_path: null, sort_order: 0, is_enabled: true },
  { menu_key: "jornadas", menu_label: "Jornadas", icon_name: "Calendar", view_type: "jornadas", feature_flag: "jornadas", external_path: null, sort_order: 1, is_enabled: true },
  { menu_key: "pos", menu_label: "Puntos de Venta", icon_name: "Receipt", view_type: "pos", feature_flag: null, external_path: null, sort_order: 2, is_enabled: true },
  { menu_key: "inventory", menu_label: "Inventario", icon_name: "Warehouse", view_type: "inventory", feature_flag: "inventario", external_path: null, sort_order: 3, is_enabled: true },
  { menu_key: "replenishment", menu_label: "Reposición", icon_name: "ArrowRightLeft", view_type: "replenishment", feature_flag: "reposicion", external_path: null, sort_order: 4, is_enabled: true },
  { menu_key: "menu", menu_label: "Carta", icon_name: "Martini", view_type: "menu", feature_flag: "ventas_alcohol", external_path: null, sort_order: 5, is_enabled: true },
  { menu_key: "workers", menu_label: "Trabajadores", icon_name: "Users", view_type: "workers", feature_flag: null, external_path: null, sort_order: 6, is_enabled: true },
  { menu_key: "reports", menu_label: "Reportes", icon_name: "FileText", view_type: "reports", feature_flag: "reportes", external_path: null, sort_order: 7, is_enabled: true },
];

const DEFAULT_GERENCIA_CONFIG: SidebarItem[] = [
  { menu_key: "overview", menu_label: "Panel General", icon_name: "Wine", view_type: "overview", feature_flag: null, external_path: null, sort_order: 0, is_enabled: true },
  { menu_key: "reports", menu_label: "Reportes", icon_name: "FileText", view_type: "reports", feature_flag: "reportes", external_path: null, sort_order: 1, is_enabled: true },
  { menu_key: "notifications", menu_label: "Notificaciones", icon_name: "Bell", view_type: "notifications", feature_flag: null, external_path: null, sort_order: 2, is_enabled: true },
  { menu_key: "estado-resultados", menu_label: "Estado de Resultados", icon_name: "FileText", view_type: "overview", feature_flag: null, external_path: "/admin/reports/estado-resultados", sort_order: 3, is_enabled: true },
  { menu_key: "auditoria-retiros", menu_label: "Auditoría Retiros", icon_name: "Receipt", view_type: "overview", feature_flag: null, external_path: "/admin/pickups", sort_order: 4, is_enabled: true },
];

const getDefaultConfig = (role: string): SidebarItem[] => {
  switch (role) {
    case "admin": return [...DEFAULT_ADMIN_CONFIG];
    case "gerencia": return [...DEFAULT_GERENCIA_CONFIG];
    default: return [];
  }
};

const getIconComponent = (name: string) => {
  const found = AVAILABLE_ICONS.find(i => i.name === name);
  return found ? found.icon : Wine;
};

export function SidebarConfigTab({ selectedVenueId, onSelectVenue }: SidebarConfigTabProps) {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [items, setItems] = useState<SidebarItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Fetch current config
  const { data: currentConfig, isLoading, refetch } = useQuery({
    queryKey: ["sidebar-config", selectedVenueId, selectedRole],
    queryFn: async () => {
      if (!selectedVenueId) return [];
      const { data, error } = await supabase.rpc("get_sidebar_config", {
        p_venue_id: selectedVenueId,
        p_role: selectedRole,
      });
      if (error) throw error;
      return (data as unknown as SidebarItem[]) || [];
    },
    enabled: !!selectedVenueId,
  });

  // Initialize items from config or defaults
  useEffect(() => {
    if (currentConfig && currentConfig.length > 0) {
      setItems(currentConfig);
    } else if (selectedVenueId) {
      setItems(getDefaultConfig(selectedRole));
    }
    setHasChanges(false);
  }, [currentConfig, selectedVenueId, selectedRole]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVenueId) throw new Error("No venue selected");
      const { data, error } = await supabase.rpc("dev_save_sidebar_config", {
        p_venue_id: selectedVenueId,
        p_role: selectedRole,
        p_items: JSON.parse(JSON.stringify(items)),
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || "Unknown error");
      return result;
    },
    onSuccess: () => {
      toast.success("Configuración guardada");
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["sidebar-config"] });
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const updateItem = (index: number, field: keyof SidebarItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
    setHasChanges(true);
  };

  const addItem = () => {
    const newItem: SidebarItem = {
      menu_key: `new-item-${Date.now()}`,
      menu_label: "Nuevo Item",
      icon_name: "Wine",
      view_type: "overview",
      feature_flag: null,
      external_path: null,
      sort_order: items.length,
      is_enabled: true,
    };
    setItems([...items, newItem]);
    setHasChanges(true);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === items.length - 1)
    ) return;
    
    const newItems = [...items];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    newItems.forEach((item, i) => item.sort_order = i);
    setItems(newItems);
    setHasChanges(true);
  };

  const resetToDefaults = () => {
    setItems(getDefaultConfig(selectedRole));
    setHasChanges(true);
  };

  if (!selectedVenueId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuración del Sidebar</CardTitle>
          <CardDescription>
            Selecciona un venue para editar su configuración de navegación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VenueSelector selectedVenueId={selectedVenueId} onSelectVenue={onSelectVenue} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Configuración del Sidebar</span>
            {hasChanges && (
              <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">
                Sin guardar
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Edita los items del menú lateral para cada rol en este venue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label className="text-xs">Venue</Label>
              <VenueSelector selectedVenueId={selectedVenueId} onSelectVenue={onSelectVenue} />
            </div>
            <div className="w-48">
              <Label className="text-xs">Rol</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role} value={role}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addItem}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Agregar Item
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={resetToDefaults}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset a Defaults
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
              className="gap-2 ml-auto"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Cargando configuración...</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No hay items configurados para este rol.</p>
                <Button variant="link" onClick={resetToDefaults}>
                  Cargar configuración por defecto
                </Button>
              </div>
            ) : (
              items.map((item, index) => {
                const IconComponent = getIconComponent(item.icon_name);
                return (
                  <div 
                    key={item.menu_key} 
                    className={`p-3 border rounded-lg space-y-3 ${
                      item.is_enabled ? "bg-card" : "bg-muted/50 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-5 w-5"
                          onClick={() => moveItem(index, "up")}
                          disabled={index === 0}
                        >
                          ▲
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-5 w-5"
                          onClick={() => moveItem(index, "down")}
                          disabled={index === items.length - 1}
                        >
                          ▼
                        </Button>
                      </div>
                      
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                        <IconComponent className="h-5 w-5" />
                      </div>
                      
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Label</Label>
                          <Input 
                            value={item.menu_label}
                            onChange={(e) => updateItem(index, "menu_label", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">View</Label>
                          <Select 
                            value={item.view_type} 
                            onValueChange={(v) => updateItem(index, "view_type", v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VIEW_TYPES.map(v => (
                                <SelectItem key={v} value={v}>{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Icono</Label>
                          <Select 
                            value={item.icon_name} 
                            onValueChange={(v) => updateItem(index, "icon_name", v)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AVAILABLE_ICONS.map(({ name, icon: Icon }) => (
                                <SelectItem key={name} value={name}>
                                  <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4" />
                                    {name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Feature Flag</Label>
                          <Select 
                            value={item.feature_flag || ""} 
                            onValueChange={(v) => updateItem(index, "feature_flag", v || null)}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Ninguno" />
                            </SelectTrigger>
                            <SelectContent>
                              {FEATURE_FLAGS.map(f => (
                                <SelectItem key={f || "none"} value={f}>
                                  {f || "(ninguno)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Switch 
                            checked={item.is_enabled}
                            onCheckedChange={(v) => updateItem(index, "is_enabled", v)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {item.is_enabled ? "On" : "Off"}
                          </span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* External path (optional) */}
                    <div className="pl-16">
                      <Label className="text-xs text-muted-foreground">Path externo (opcional)</Label>
                      <Input 
                        value={item.external_path || ""}
                        onChange={(e) => updateItem(index, "external_path", e.target.value || null)}
                        placeholder="/admin/reports/..."
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
