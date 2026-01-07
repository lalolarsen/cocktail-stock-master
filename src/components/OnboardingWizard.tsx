import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Building2, 
  Wine, 
  Store, 
  Package, 
  Users, 
  FileText,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  Plus,
  Trash2,
  Upload
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip?: () => void;
}

type Step = {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
};

const STEPS: Step[] = [
  { id: 1, title: "Tu Negocio", description: "Información básica", icon: <Building2 className="w-5 h-5" /> },
  { id: 2, title: "Barras", description: "Puntos de despacho", icon: <Wine className="w-5 h-5" /> },
  { id: 3, title: "Cajas POS", description: "Terminales de venta", icon: <Store className="w-5 h-5" /> },
  { id: 4, title: "Productos", description: "Inventario inicial", icon: <Package className="w-5 h-5" /> },
  { id: 5, title: "Equipo", description: "Usuarios y roles", icon: <Users className="w-5 h-5" /> },
  { id: 6, title: "Facturación", description: "Proveedor de documentos", icon: <FileText className="w-5 h-5" /> },
];

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Venue info
  const [venueName, setVenueName] = useState("");
  const [venueId, setVenueId] = useState<string | null>(null);
  
  // Step 2: Bars
  const [bars, setBars] = useState<{ name: string; id?: string }[]>([{ name: "Barra Principal" }]);
  const [warehouseCreated, setWarehouseCreated] = useState(false);
  
  // Step 3: POS
  const [posTerminals, setPosTerminals] = useState<{ name: string; barIndex: number; id?: string }[]>([
    { name: "Caja 1", barIndex: 0 }
  ]);
  
  // Step 5: Users
  const [users, setUsers] = useState<{ email: string; name: string; role: string; pin: string }[]>([
    { email: "", name: "", role: "vendedor", pin: "" }
  ]);
  
  // Step 6: Invoicing
  const [invoicingProvider, setInvoicingProvider] = useState("mock");

  const progress = (currentStep / STEPS.length) * 100;

  const handleNext = async () => {
    setLoading(true);
    try {
      switch (currentStep) {
        case 1:
          await saveVenueInfo();
          break;
        case 2:
          await saveBars();
          break;
        case 3:
          await savePosTerminals();
          break;
        case 4:
          // Products step - skip for now, user can import later
          break;
        case 5:
          await saveUsers();
          break;
        case 6:
          await saveInvoicingConfig();
          await markOnboardingComplete();
          onComplete();
          return;
      }
      setCurrentStep(prev => prev + 1);
    } catch (error: any) {
      toast.error(error.message || "Error al guardar");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const saveVenueInfo = async () => {
    if (!venueName.trim()) throw new Error("Ingresa el nombre de tu negocio");
    
    const slug = venueName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    
    const { data, error } = await supabase
      .from("venues")
      .insert({
        name: venueName,
        slug,
        plan_type: "trial",
        onboarding_step: 1
      })
      .select()
      .single();
    
    if (error) throw error;
    setVenueId(data.id);
    
    // Create warehouse
    const { error: warehouseError } = await supabase
      .from("stock_locations")
      .insert({
        name: "Bodega Principal",
        type: "warehouse",
        venue_id: data.id
      });
    
    if (warehouseError) throw warehouseError;
    setWarehouseCreated(true);
  };

  const saveBars = async () => {
    if (!venueId) throw new Error("Venue no encontrado");
    if (bars.filter(b => b.name.trim()).length === 0) throw new Error("Agrega al menos una barra");
    
    const barsToCreate = bars.filter(b => b.name.trim() && !b.id);
    
    if (barsToCreate.length > 0) {
      const { data, error } = await supabase
        .from("stock_locations")
        .insert(barsToCreate.map(b => ({
          name: b.name,
          type: "bar" as const,
          venue_id: venueId
        })))
        .select();
      
      if (error) throw error;
      
      // Update bars with IDs
      setBars(prev => {
        const updated = [...prev];
        let dataIndex = 0;
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].name.trim() && !updated[i].id && data[dataIndex]) {
            updated[i].id = data[dataIndex].id;
            dataIndex++;
          }
        }
        return updated;
      });
    }
    
    // Update venue step
    await supabase.from("venues").update({ onboarding_step: 2 }).eq("id", venueId);
  };

  const savePosTerminals = async () => {
    if (!venueId) throw new Error("Venue no encontrado");
    if (posTerminals.filter(p => p.name.trim()).length === 0) throw new Error("Agrega al menos una caja");
    
    const posToCreate = posTerminals.filter(p => p.name.trim() && !p.id);
    
    if (posToCreate.length > 0) {
      const { error } = await supabase
        .from("pos_terminals")
        .insert(posToCreate.map(p => ({
          name: p.name,
          location_id: bars[p.barIndex]?.id,
          venue_id: venueId
        })));
      
      if (error) throw error;
    }
    
    await supabase.from("venues").update({ onboarding_step: 3 }).eq("id", venueId);
  };

  const saveUsers = async () => {
    // Users are created through Supabase Auth - we'll just update the venue step
    // The actual user creation will be done through the workers management
    if (venueId) {
      await supabase.from("venues").update({ onboarding_step: 5 }).eq("id", venueId);
    }
  };

  const saveInvoicingConfig = async () => {
    const { error } = await supabase
      .from("invoicing_config")
      .upsert({
        id: "00000000-0000-0000-0000-000000000001",
        active_provider: invoicingProvider,
        config: {}
      });
    
    if (error && error.code !== "23505") throw error;
  };

  const markOnboardingComplete = async () => {
    if (venueId) {
      await supabase.from("venues").update({ 
        onboarding_completed: true,
        onboarding_step: 6 
      }).eq("id", venueId);
    }
  };

  const addBar = () => {
    setBars(prev => [...prev, { name: `Barra ${prev.length + 1}` }]);
  };

  const removeBar = (index: number) => {
    if (bars.length > 1) {
      setBars(prev => prev.filter((_, i) => i !== index));
      // Update POS assignments
      setPosTerminals(prev => prev.map(p => ({
        ...p,
        barIndex: p.barIndex >= index ? Math.max(0, p.barIndex - 1) : p.barIndex
      })));
    }
  };

  const addPOS = () => {
    setPosTerminals(prev => [...prev, { name: `Caja ${prev.length + 1}`, barIndex: 0 }]);
  };

  const removePOS = (index: number) => {
    if (posTerminals.length > 1) {
      setPosTerminals(prev => prev.filter((_, i) => i !== index));
    }
  };

  const addUser = () => {
    setUsers(prev => [...prev, { email: "", name: "", role: "vendedor", pin: "" }]);
  };

  const removeUser = (index: number) => {
    setUsers(prev => prev.filter((_, i) => i !== index));
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="venueName">Nombre de tu negocio</Label>
              <Input
                id="venueName"
                placeholder="Ej: Bar El Rincón"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Este nombre aparecerá en tus boletas y facturas.
            </p>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Las barras son los puntos donde se preparan y entregan los tragos. 
              Cada barra tiene su propio inventario.
            </p>
            
            <div className="space-y-3">
              {bars.map((bar, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Nombre de la barra"
                    value={bar.name}
                    onChange={(e) => {
                      const updated = [...bars];
                      updated[index].name = e.target.value;
                      setBars(updated);
                    }}
                  />
                  {bars.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeBar(index)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            <Button variant="outline" onClick={addBar} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Agregar otra barra
            </Button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Las cajas POS son los terminales donde se realizan las ventas.
              Cada caja está asociada a una barra para el despacho.
            </p>
            
            <div className="space-y-3">
              {posTerminals.map((pos, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Nombre de la caja"
                    value={pos.name}
                    onChange={(e) => {
                      const updated = [...posTerminals];
                      updated[index].name = e.target.value;
                      setPosTerminals(updated);
                    }}
                    className="flex-1"
                  />
                  <Select
                    value={pos.barIndex.toString()}
                    onValueChange={(value) => {
                      const updated = [...posTerminals];
                      updated[index].barIndex = parseInt(value);
                      setPosTerminals(updated);
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Barra" />
                    </SelectTrigger>
                    <SelectContent>
                      {bars.map((bar, i) => (
                        <SelectItem key={i} value={i.toString()}>
                          {bar.name || `Barra ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {posTerminals.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removePOS(index)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            <Button variant="outline" onClick={addPOS} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Agregar otra caja
            </Button>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Puedes importar tus productos desde un archivo Excel o agregarlos manualmente después.
            </p>
            
            <Card className="p-6 border-dashed border-2 text-center">
              <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-2">
                Arrastra un archivo Excel aquí o haz clic para seleccionar
              </p>
              <Button variant="outline" size="sm">
                Seleccionar archivo
              </Button>
            </Card>
            
            <p className="text-xs text-muted-foreground text-center">
              También puedes importar productos desde el panel de administración después.
            </p>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Crea cuentas para tu equipo. Puedes agregar más usuarios después desde el panel.
            </p>
            
            <div className="space-y-4">
              {users.map((user, index) => (
                <Card key={index} className="p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      placeholder="Email"
                      type="email"
                      value={user.email}
                      onChange={(e) => {
                        const updated = [...users];
                        updated[index].email = e.target.value;
                        setUsers(updated);
                      }}
                    />
                    <Input
                      placeholder="Nombre"
                      value={user.name}
                      onChange={(e) => {
                        const updated = [...users];
                        updated[index].name = e.target.value;
                        setUsers(updated);
                      }}
                    />
                    <Select
                      value={user.role}
                      onValueChange={(value) => {
                        const updated = [...users];
                        updated[index].role = value;
                        setUsers(updated);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Rol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vendedor">Vendedor</SelectItem>
                        <SelectItem value="bar">Barman</SelectItem>
                        <SelectItem value="gerencia">Gerencia</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        placeholder="PIN"
                        type="password"
                        maxLength={6}
                        value={user.pin}
                        onChange={(e) => {
                          const updated = [...users];
                          updated[index].pin = e.target.value;
                          setUsers(updated);
                        }}
                      />
                      {users.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeUser(index)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            
            <Button variant="outline" onClick={addUser} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Agregar usuario
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              Los usuarios recibirán un email para configurar su contraseña.
            </p>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              Selecciona cómo emitirás boletas y facturas electrónicas.
            </p>
            
            <div className="space-y-3">
              <Card 
                className={`p-4 cursor-pointer transition-colors ${invoicingProvider === "mock" ? "border-primary bg-primary/5" : ""}`}
                onClick={() => setInvoicingProvider("mock")}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 ${invoicingProvider === "mock" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                  <div>
                    <p className="font-medium">Modo de prueba</p>
                    <p className="text-sm text-muted-foreground">Simula la emisión de documentos sin conectar a un proveedor real</p>
                  </div>
                </div>
              </Card>
              
              <Card 
                className={`p-4 cursor-pointer transition-colors ${invoicingProvider === "sii" ? "border-primary bg-primary/5" : ""}`}
                onClick={() => setInvoicingProvider("sii")}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 ${invoicingProvider === "sii" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                  <div>
                    <p className="font-medium">SII Chile</p>
                    <p className="text-sm text-muted-foreground">Emisión directa al Servicio de Impuestos Internos</p>
                  </div>
                </div>
              </Card>
            </div>
            
            <p className="text-xs text-muted-foreground text-center mt-4">
              Puedes cambiar esto después en la configuración.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Configurar tu negocio</CardTitle>
          <CardDescription>
            Completa estos pasos para empezar a vender en menos de 30 minutos
          </CardDescription>
          <Progress value={progress} className="mt-4" />
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Step indicators */}
          <div className="flex justify-between mb-6">
            {STEPS.map((step) => (
              <div 
                key={step.id}
                className={`flex flex-col items-center gap-1 ${
                  step.id === currentStep 
                    ? "text-primary" 
                    : step.id < currentStep 
                      ? "text-primary/60" 
                      : "text-muted-foreground"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  step.id === currentStep 
                    ? "border-primary bg-primary/10" 
                    : step.id < currentStep 
                      ? "border-primary/60 bg-primary/20" 
                      : "border-muted"
                }`}>
                  {step.id < currentStep ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span className="text-xs hidden sm:block">{step.title}</span>
              </div>
            ))}
          </div>

          {/* Current step content */}
          <div className="min-h-[300px]">
            <h3 className="text-lg font-semibold mb-2">
              {STEPS[currentStep - 1].title}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {STEPS[currentStep - 1].description}
            </p>
            
            {renderStepContent()}
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between pt-4 border-t">
            <div>
              {currentStep > 1 && (
                <Button variant="ghost" onClick={handleBack} disabled={loading}>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Atrás
                </Button>
              )}
            </div>
            
            <div className="flex gap-2">
              {onSkip && currentStep < STEPS.length && (
                <Button variant="ghost" onClick={onSkip}>
                  Omitir por ahora
                </Button>
              )}
              
              <Button onClick={handleNext} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : currentStep === STEPS.length ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Finalizar
                  </>
                ) : (
                  <>
                    Siguiente
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}