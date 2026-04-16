import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Clock, DollarSign, TrendingUp, Trophy, Medal, Award, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { formatCLP } from "@/lib/currency";

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
    if (!ua) return { icon: "🌐", label: "Desconocido" };
    if (ua.includes("Mobile")) return { icon: "📱", label: "Móvil" };
    if (ua.includes("Windows")) return { icon: "💻", label: "Windows" };
    if (ua.includes("Mac")) return { icon: "🖥️", label: "Mac" };
    if (ua.includes("Linux")) return { icon: "🐧", label: "Linux" };
    return { icon: "🌐", label: "Navegador" };
  };

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 1: return <Medal className="h-5 w-5 text-gray-400" />;
      case 2: return <Award className="h-5 w-5 text-amber-600" />;
      default: return <span className="w-5 h-5 flex items-center justify-center text-sm text-muted-foreground font-medium">{index + 1}</span>;
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-muted-foreground">Cargando actividad...</span>
        </div>
      </Card>
    );
  }

  // Calculate totals
  const totalSalesAmount = employeeSales.reduce((sum, e) => sum + e.total_amount, 0);
  const totalTransactions = employeeSales.reduce((sum, e) => sum + e.total_sales, 0);
  const totalCancelled = employeeSales.reduce((sum, e) => sum + e.cancelled_sales, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Recent Login Activity */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Actividad Reciente</h3>
              <p className="text-sm text-muted-foreground">Últimos inicios de sesión</p>
            </div>
          </div>
        </div>
        
        {loginActivity.length === 0 ? (
          <div className="text-center py-12 px-6 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin actividad</p>
            <p className="text-sm">No hay registros de inicio de sesión</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="p-4 space-y-2">
              {loginActivity.map((record, index) => {
                const device = formatUserAgent(record.user_agent);
                const loginDate = new Date(record.login_at);
                const isRecent = Date.now() - loginDate.getTime() < 60 * 60 * 1000; // Last hour
                
                return (
                  <div
                    key={record.id}
                    className={`flex items-center gap-4 p-3 rounded-lg transition-colors ${
                      index === 0 ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                      index === 0 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {getInitials(record.user_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {record.user_name || record.user_email}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{device.icon} {device.label}</span>
                        <span>•</span>
                        <span>{format(loginDate, "dd MMM, HH:mm", { locale: es })}</span>
                      </div>
                    </div>
                    {isRecent && index === 0 && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Ahora
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Sales by Employee */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-semibold">Ranking de Ventas</h3>
                <p className="text-sm text-muted-foreground">Por vendedor</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-emerald-500">{formatCLP(totalSalesAmount)}</p>
              <p className="text-xs text-muted-foreground">{totalTransactions} ventas</p>
            </div>
          </div>
        </div>

        {employeeSales.length === 0 ? (
          <div className="text-center py-12 px-6 text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin ventas</p>
            <p className="text-sm">No hay ventas registradas aún</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="p-4 space-y-2">
              {employeeSales.map((employee, index) => {
                const percentage = totalSalesAmount > 0 
                  ? (employee.total_amount / totalSalesAmount) * 100 
                  : 0;
                
                return (
                  <div 
                    key={employee.seller_id} 
                    className={`p-4 rounded-lg border transition-colors ${
                      index === 0 ? "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {getRankIcon(index)}
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                        {getInitials(employee.seller_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {employee.seller_name || "Sin nombre"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {employee.seller_email}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600">
                          {formatCLP(employee.total_amount)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {percentage.toFixed(1)}% del total
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            index === 0 ? "bg-yellow-400" : index === 1 ? "bg-gray-400" : index === 2 ? "bg-amber-500" : "bg-primary/60"
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-muted-foreground">
                          {employee.total_sales} ventas
                        </span>
                        {employee.cancelled_sales > 0 && (
                          <Badge variant="destructive" className="text-xs px-1.5 py-0">
                            {employee.cancelled_sales} anuladas
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
