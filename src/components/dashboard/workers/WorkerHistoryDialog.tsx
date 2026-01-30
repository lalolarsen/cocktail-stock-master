import { Worker, LoginRecord, AuditLog } from "./types";
import { Badge } from "@/components/ui/badge";
import { Loader2, History, Clock, LogIn, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface WorkerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  worker: Worker | null;
  loginHistory: LoginRecord[];
  auditLogs: AuditLog[];
  loading: boolean;
  maskRut: (rut: string | null) => string;
}

export function WorkerHistoryDialog({
  open,
  onOpenChange,
  worker,
  loginHistory,
  auditLogs,
  loading,
  maskRut,
}: WorkerHistoryDialogProps) {
  const formatUserAgent = (ua: string | null) => {
    if (!ua) return { icon: "🌐", label: "Desconocido" };
    if (ua.includes("Mobile")) return { icon: "📱", label: "Móvil" };
    if (ua.includes("Windows")) return { icon: "💻", label: "Windows" };
    if (ua.includes("Mac")) return { icon: "🖥️", label: "Mac" };
    if (ua.includes("Linux")) return { icon: "🐧", label: "Linux" };
    return { icon: "🌐", label: "Navegador" };
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      create_worker: { label: "Creación", variant: "default" },
      update_worker: { label: "Actualización", variant: "secondary" },
      reset_pin: { label: "Reset PIN", variant: "outline" },
      activate_worker: { label: "Activación", variant: "default" },
      deactivate_worker: { label: "Desactivación", variant: "destructive" },
      delete_worker: { label: "Eliminación", variant: "destructive" },
    };
    return labels[action] || { label: action, variant: "outline" as const };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <History className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span className="block">Historial de Actividad</span>
              <span className="text-sm font-normal text-muted-foreground">
                {worker?.full_name || maskRut(worker?.rut_code || null)}
              </span>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="logins" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="logins" className="gap-2">
                <LogIn className="h-4 w-4" />
                Sesiones ({loginHistory.length})
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <Settings className="h-4 w-4" />
                Cambios ({auditLogs.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="logins">
              <ScrollArea className="h-[350px] pr-4">
                {loginHistory.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <LogIn className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Sin registros</p>
                    <p className="text-sm">No hay inicios de sesión registrados</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {loginHistory.map((record, index) => {
                      const device = formatUserAgent(record.user_agent);
                      const date = new Date(record.login_at);
                      const isRecent = Date.now() - date.getTime() < 24 * 60 * 60 * 1000;
                      
                      return (
                        <div 
                          key={record.id} 
                          className={`flex items-center gap-4 p-3 rounded-lg border transition-colors ${
                            index === 0 ? "bg-primary/5 border-primary/20" : "hover:bg-muted/50"
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                            index === 0 ? "bg-primary/10" : "bg-muted"
                          }`}>
                            {device.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">
                                {format(date, "dd MMM yyyy", { locale: es })}
                              </p>
                              <span className="text-muted-foreground">•</span>
                              <p className="text-sm text-muted-foreground">
                                {format(date, "HH:mm:ss")}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {device.label}
                            </p>
                          </div>
                          {isRecent && index === 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {formatDistanceToNow(date, { addSuffix: true, locale: es })}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="audit">
              <ScrollArea className="h-[350px] pr-4">
                {auditLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Sin cambios</p>
                    <p className="text-sm">No hay acciones administrativas registradas</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => {
                      const actionInfo = getActionLabel(log.action);
                      return (
                        <div key={log.id} className="p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant={actionInfo.variant}>
                              {actionInfo.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                            </span>
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded font-mono">
                              {Object.entries(log.details).map(([key, value]) => (
                                <div key={key}>
                                  <span className="text-foreground/70">{key}:</span>{" "}
                                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
