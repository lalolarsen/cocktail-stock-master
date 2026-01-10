import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Bug,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface ErrorLog {
  id: string;
  venue_id: string | null;
  user_id: string | null;
  route: string;
  error_message: string;
  stack: string | null;
  meta: unknown;
  created_at: string;
}

interface AuditEvent {
  id: string;
  venue_id: string | null;
  user_id: string | null;
  action: string;
  status: string;
  metadata: unknown;
  created_at: string;
}

const ITEMS_PER_PAGE = 20;

export default function SystemMonitoring() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"errors" | "events">("errors");
  const [loading, setLoading] = useState(true);

  // Error logs state
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [errorPage, setErrorPage] = useState(0);
  const [errorTotal, setErrorTotal] = useState(0);
  const [errorRouteFilter, setErrorRouteFilter] = useState("");

  // Audit events state
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [eventPage, setEventPage] = useState(0);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventActionFilter, setEventActionFilter] = useState<string>("all");
  const [eventStatusFilter, setEventStatusFilter] = useState<string>("all");

  // Date range
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  // Detail dialogs
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  useEffect(() => {
    if (activeTab === "errors") {
      fetchErrorLogs();
    } else {
      fetchAuditEvents();
    }
  }, [activeTab, errorPage, eventPage, dateFrom, dateTo, errorRouteFilter, eventActionFilter, eventStatusFilter]);

  const fetchErrorLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("app_error_logs")
        .select("*", { count: "exact" })
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(errorPage * ITEMS_PER_PAGE, (errorPage + 1) * ITEMS_PER_PAGE - 1);

      if (errorRouteFilter) {
        query = query.ilike("route", `%${errorRouteFilter}%`);
      }

      const { data, count, error } = await query;

      if (error) throw error;
      setErrorLogs(data || []);
      setErrorTotal(count || 0);
    } catch (error) {
      console.error("Error fetching error logs:", error);
      toast.error("Error al cargar logs de errores");
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditEvents = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("app_audit_events")
        .select("*", { count: "exact" })
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`)
        .order("created_at", { ascending: false })
        .range(eventPage * ITEMS_PER_PAGE, (eventPage + 1) * ITEMS_PER_PAGE - 1);

      if (eventStatusFilter !== "all") {
        query = query.eq("status", eventStatusFilter);
      }

      if (eventActionFilter !== "all") {
        query = query.ilike("action", `%${eventActionFilter}%`);
      }

      const { data, count, error } = await query;

      if (error) throw error;
      setAuditEvents(data || []);
      setEventTotal(count || 0);
    } catch (error) {
      console.error("Error fetching audit events:", error);
      toast.error("Error al cargar eventos de auditoría");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (activeTab === "errors") {
      fetchErrorLogs();
    } else {
      fetchAuditEvents();
    }
  };

  const errorPageCount = Math.ceil(errorTotal / ITEMS_PER_PAGE);
  const eventPageCount = Math.ceil(eventTotal / ITEMS_PER_PAGE);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Monitoreo del Sistema</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </Button>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Date Range Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-40"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "errors" | "events")}>
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="errors" className="gap-2">
              <Bug className="h-4 w-4" />
              Errores ({errorTotal})
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-2">
              <Activity className="h-4 w-4" />
              Eventos
            </TabsTrigger>
          </TabsList>

          {/* Errors Tab */}
          <TabsContent value="errors" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Logs de Errores
                    </CardTitle>
                    <CardDescription>
                      Errores capturados por el ErrorBoundary y logging manual
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Filtrar por ruta..."
                      value={errorRouteFilter}
                      onChange={(e) => setErrorRouteFilter(e.target.value)}
                      className="w-48"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : errorLogs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Bug className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay errores registrados en este período</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Ruta</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead className="w-24">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {errorLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-sm">
                              {format(new Date(log.created_at), "dd/MM HH:mm", { locale: es })}
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {log.route}
                              </code>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm">
                              {log.error_message}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedError(log)}
                              >
                                Ver
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Mostrando {errorPage * ITEMS_PER_PAGE + 1} - {Math.min((errorPage + 1) * ITEMS_PER_PAGE, errorTotal)} de {errorTotal}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={errorPage === 0}
                          onClick={() => setErrorPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={errorPage >= errorPageCount - 1}
                          onClick={() => setErrorPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      Eventos de Auditoría
                    </CardTitle>
                    <CardDescription>
                      Acciones críticas registradas en el sistema
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={eventStatusFilter} onValueChange={setEventStatusFilter}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="success">Éxito</SelectItem>
                        <SelectItem value="fail">Fallo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Filtrar acción..."
                      value={eventActionFilter === "all" ? "" : eventActionFilter}
                      onChange={(e) => setEventActionFilter(e.target.value || "all")}
                      className="w-40"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : auditEvents.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay eventos registrados en este período</p>
                  </div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Acción</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="w-24">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditEvents.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell className="text-sm">
                              {format(new Date(event.created_at), "dd/MM HH:mm", { locale: es })}
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-2 py-1 rounded">
                                {event.action}
                              </code>
                            </TableCell>
                            <TableCell>
                              {event.status === "success" ? (
                                <Badge className="bg-green-500/20 text-green-700 border-green-500/30 gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  Éxito
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Fallo
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedEvent(event)}
                              >
                                Ver
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Mostrando {eventPage * ITEMS_PER_PAGE + 1} - {Math.min((eventPage + 1) * ITEMS_PER_PAGE, eventTotal)} de {eventTotal}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={eventPage === 0}
                          onClick={() => setEventPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={eventPage >= eventPageCount - 1}
                          onClick={() => setEventPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Error Detail Dialog */}
      <Dialog open={!!selectedError} onOpenChange={() => setSelectedError(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              Detalle del Error
            </DialogTitle>
          </DialogHeader>
          {selectedError && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Fecha</Label>
                  <p className="font-medium">
                    {format(new Date(selectedError.created_at), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Ruta</Label>
                  <code className="block bg-muted p-2 rounded text-sm">{selectedError.route}</code>
                </div>
                <div>
                  <Label className="text-muted-foreground">Mensaje</Label>
                  <p className="text-destructive font-medium">{selectedError.error_message}</p>
                </div>
                {selectedError.stack && (
                  <div>
                    <Label className="text-muted-foreground">Stack Trace</Label>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                      {selectedError.stack}
                    </pre>
                  </div>
                )}
                {selectedError.meta && Object.keys(selectedError.meta).length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Metadata</Label>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedError.meta, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Detalle del Evento
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Fecha</Label>
                  <p className="font-medium">
                    {format(new Date(selectedEvent.created_at), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Acción</Label>
                  <code className="block bg-muted p-2 rounded text-sm">{selectedEvent.action}</code>
                </div>
                <div>
                  <Label className="text-muted-foreground">Estado</Label>
                  <div className="mt-1">
                    {selectedEvent.status === "success" ? (
                      <Badge className="bg-green-500/20 text-green-700 border-green-500/30 gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Éxito
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Fallo
                      </Badge>
                    )}
                  </div>
                </div>
                {selectedEvent.user_id && (
                  <div>
                    <Label className="text-muted-foreground">Usuario ID</Label>
                    <code className="block bg-muted p-2 rounded text-xs">{selectedEvent.user_id}</code>
                  </div>
                )}
                {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                  <div>
                    <Label className="text-muted-foreground">Metadata</Label>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(selectedEvent.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
