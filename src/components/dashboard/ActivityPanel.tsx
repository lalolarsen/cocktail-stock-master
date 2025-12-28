import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Clock, DollarSign, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface LoginActivity {
  id: string;
  user_id: string;
  login_at: string;
  user_agent: string | null;
  user_name: string | null;
  user_email: string;
}

interface EmployeeSales {
  seller_id: string;
  seller_name: string | null;
  seller_email: string;
  total_sales: number;
  total_amount: number;
  cancelled_sales: number;
}

export function ActivityPanel() {
  const [loginActivity, setLoginActivity] = useState<LoginActivity[]>([]);
  const [employeeSales, setEmployeeSales] = useState<EmployeeSales[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivityData();
  }, []);

  const fetchActivityData = async () => {
    try {
      // Fetch recent login activity with user info
      const { data: logins, error: loginsError } = await supabase
        .from("login_history")
        .select("id, user_id, login_at, user_agent")
        .order("login_at", { ascending: false })
        .limit(20);

      if (loginsError) throw loginsError;

      // Fetch profiles to get user names
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email");

      if (profilesError) throw profilesError;

      // Combine login data with user names
      const loginActivityData: LoginActivity[] = (logins || []).map((login) => {
        const profile = profiles?.find((p) => p.id === login.user_id);
        return {
          ...login,
          user_name: profile?.full_name || null,
          user_email: profile?.email || "Usuario desconocido",
        };
      });

      setLoginActivity(loginActivityData);

      // Fetch sales data grouped by seller
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("id, seller_id, total_amount, is_cancelled");

      if (salesError) throw salesError;

      // Calculate sales per employee
      const salesByEmployee: Record<string, { 
        total_sales: number; 
        total_amount: number; 
        cancelled_sales: number;
      }> = {};

      (sales || []).forEach((sale) => {
        if (!salesByEmployee[sale.seller_id]) {
          salesByEmployee[sale.seller_id] = {
            total_sales: 0,
            total_amount: 0,
            cancelled_sales: 0,
          };
        }
        salesByEmployee[sale.seller_id].total_sales += 1;
        if (sale.is_cancelled) {
          salesByEmployee[sale.seller_id].cancelled_sales += 1;
        } else {
          salesByEmployee[sale.seller_id].total_amount += Number(sale.total_amount);
        }
      });

      // Map to employee sales array with names
      const employeeSalesData: EmployeeSales[] = Object.entries(salesByEmployee).map(
        ([sellerId, stats]) => {
          const profile = profiles?.find((p) => p.id === sellerId);
          return {
            seller_id: sellerId,
            seller_name: profile?.full_name || null,
            seller_email: profile?.email || "Desconocido",
            ...stats,
          };
        }
      ).sort((a, b) => b.total_amount - a.total_amount);

      setEmployeeSales(employeeSalesData);
    } catch (error) {
      console.error("Error fetching activity data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatUserAgent = (ua: string | null) => {
    if (!ua) return "Desconocido";
    if (ua.includes("Mobile")) return "📱 Móvil";
    if (ua.includes("Windows")) return "💻 Windows";
    if (ua.includes("Mac")) return "🖥️ Mac";
    if (ua.includes("Linux")) return "🐧 Linux";
    return "🌐 Navegador";
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="ml-2">Cargando actividad...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Recent Login Activity */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Actividad de Inicios de Sesión</h3>
        </div>
        
        {loginActivity.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay registros de actividad</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <div className="space-y-2">
              {loginActivity.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {record.user_name || record.user_email}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(record.login_at), "dd MMM yyyy, HH:mm:ss", { locale: es })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {formatUserAgent(record.user_agent)}
                  </Badge>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Sales by Employee */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Ventas por Empleado</h3>
        </div>

        {employeeSales.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay ventas registradas</p>
          </div>
        ) : (
          <ScrollArea className="h-[350px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead className="text-center">Ventas</TableHead>
                  <TableHead className="text-center">Canceladas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeSales.map((employee, index) => (
                  <TableRow key={employee.seller_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <Badge variant="default" className="text-xs">🏆</Badge>
                        )}
                        <div>
                          <p className="font-medium text-sm">
                            {employee.seller_name || "Sin nombre"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {employee.seller_email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {employee.total_sales}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {employee.cancelled_sales > 0 ? (
                        <Badge variant="destructive">
                          {employee.cancelled_sales}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${employee.total_amount.toLocaleString("es-MX", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
