import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mail, Bell, Check, X, AlertCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface GerenciaWorker {
  id: string;
  full_name: string | null;
  notification_email: string | null;
  is_active: boolean;
  jornada_closed_enabled: boolean;
}

interface NotificationLog {
  id: string;
  event_type: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  email_subject: string | null;
}

export function NotificationsManagement() {
  const [workers, setWorkers] = useState<GerenciaWorker[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [emailValue, setEmailValue] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch gerencia/admin workers with their notification preferences
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select(`
          id,
          full_name,
          notification_email,
          is_active,
          worker_roles!inner(role)
        `)
        .or("worker_roles.role.eq.gerencia,worker_roles.role.eq.admin");

      if (profilesError) throw profilesError;

      // Fetch notification preferences
      const workerIds = profilesData?.map((p) => p.id) || [];
      const { data: prefsData } = await supabase
        .from("notification_preferences")
        .select("*")
        .in("worker_id", workerIds)
        .eq("event_type", "jornada_closed")
        .eq("channel", "email");

      const prefsMap = new Map(prefsData?.map((p) => [p.worker_id, p]) || []);

      const workersWithPrefs: GerenciaWorker[] = (profilesData || []).map((p) => {
        const pref = prefsMap.get(p.id);
        return {
          id: p.id,
          full_name: p.full_name,
          notification_email: p.notification_email,
          is_active: p.is_active ?? true,
          // Default to enabled if no preference exists
          jornada_closed_enabled: pref ? pref.is_enabled : true,
        };
      });

      setWorkers(workersWithPrefs);

      // Fetch recent notification logs
      const { data: logsData, error: logsError } = await supabase
        .from("notification_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setLogs(logsData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSaveEmail = async (workerId: string) => {
    if (emailValue && !validateEmail(emailValue)) {
      toast.error("Email inválido");
      return;
    }

    setSaving(workerId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ notification_email: emailValue || null })
        .eq("id", workerId);

      if (error) throw error;

      setWorkers((prev) =>
        prev.map((w) =>
          w.id === workerId ? { ...w, notification_email: emailValue || null } : w
        )
      );
      setEditingEmail(null);
      toast.success("Email actualizado");
    } catch (error) {
      console.error("Error saving email:", error);
      toast.error("Error al guardar email");
    } finally {
      setSaving(null);
    }
  };

  const handleTogglePreference = async (workerId: string, enabled: boolean) => {
    setSaving(workerId);
    try {
      // Upsert preference
      const { error } = await supabase
        .from("notification_preferences")
        .upsert(
          {
            worker_id: workerId,
            event_type: "jornada_closed",
            channel: "email",
            is_enabled: enabled,
          },
          { onConflict: "worker_id,event_type,channel" }
        );

      if (error) throw error;

      setWorkers((prev) =>
        prev.map((w) =>
          w.id === workerId ? { ...w, jornada_closed_enabled: enabled } : w
        )
      );
      toast.success(enabled ? "Notificaciones activadas" : "Notificaciones desactivadas");
    } catch (error) {
      console.error("Error toggling preference:", error);
      toast.error("Error al cambiar preferencia");
    } finally {
      setSaving(null);
    }
  };

  const handleSendTestNotifications = async () => {
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-jornada-summary");
      
      if (error) throw error;
      
      toast.success(`Procesados: ${data.processed || 0}, Enviados: ${data.sent || 0}`);
      fetchData(); // Refresh logs
    } catch (error: any) {
      console.error("Error sending test:", error);
      toast.error("Error al enviar notificaciones");
    } finally {
      setSendingTest(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-500 hover:bg-green-600"><Check className="w-3 h-3 mr-1" />Enviado</Badge>;
      case "failed":
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" />Fallido</Badge>;
      case "queued":
        return <Badge variant="outline"><Loader2 className="w-3 h-3 mr-1 animate-spin" />En cola</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Recipients Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Destinatarios de Notificaciones
          </CardTitle>
          <CardDescription>
            Configura los emails de gerencia que recibirán el resumen al cerrar cada jornada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workers.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              No hay usuarios con rol gerencia o admin
            </p>
          ) : (
            <div className="space-y-4">
              {workers.map((worker) => (
                <div
                  key={worker.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{worker.full_name || "Sin nombre"}</span>
                      {!worker.is_active && (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </div>
                    
                    {editingEmail === worker.id ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          type="email"
                          placeholder="email@ejemplo.com"
                          value={emailValue}
                          onChange={(e) => setEmailValue(e.target.value)}
                          className="max-w-xs"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSaveEmail(worker.id)}
                          disabled={saving === worker.id}
                        >
                          {saving === worker.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingEmail(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        {worker.notification_email ? (
                          <span className="text-sm text-muted-foreground">
                            {worker.notification_email}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">
                            Sin email configurado
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingEmail(worker.id);
                            setEmailValue(worker.notification_email || "");
                          }}
                        >
                          Editar
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`toggle-${worker.id}`} className="text-sm">
                        Cierre Jornada
                      </Label>
                      <Switch
                        id={`toggle-${worker.id}`}
                        checked={worker.jornada_closed_enabled}
                        onCheckedChange={(checked) =>
                          handleTogglePreference(worker.id, checked)
                        }
                        disabled={saving === worker.id || !worker.notification_email}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notification History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Historial de Notificaciones
            </CardTitle>
            <CardDescription>
              Registro de emails enviados
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={handleSendTestNotifications}
            disabled={sendingTest}
          >
            {sendingTest ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Procesar Cola
          </Button>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">
              No hay notificaciones registradas
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 border rounded-lg text-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      <span className="font-medium">{log.recipient_email}</span>
                    </div>
                    <div className="text-muted-foreground text-xs mt-1">
                      {log.email_subject || log.event_type}
                    </div>
                    {log.error_message && (
                      <div className="flex items-center gap-1 text-destructive text-xs mt-1">
                        <AlertCircle className="w-3 h-3" />
                        {log.error_message}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    <div>{format(new Date(log.created_at), "dd/MM HH:mm", { locale: es })}</div>
                    {log.sent_at && (
                      <div className="text-green-600">
                        Enviado: {format(new Date(log.sent_at), "HH:mm")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
