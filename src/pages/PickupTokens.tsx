import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, RefreshCw, Search, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type PickupToken = {
  id: string;
  token: string;
  status: "issued" | "redeemed" | "expired" | "cancelled";
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  sale_id: string;
  sale?: {
    sale_number: string;
    total_amount: number;
  };
};

export default function PickupTokens() {
  const [tokens, setTokens] = useState<PickupToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  const fetchTokens = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pickup_tokens")
        .select(`
          *,
          sale:sales(sale_number, total_amount)
        `)
        .order("issued_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setTokens((data || []) as PickupToken[]);
    } catch (error: any) {
      toast.error("Error al cargar tokens: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      issued: { variant: "default", label: "Pendiente" },
      redeemed: { variant: "secondary", label: "Canjeado" },
      expired: { variant: "outline", label: "Expirado" },
      cancelled: { variant: "destructive", label: "Cancelado" },
    };
    const config = variants[status] || variants.issued;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const maskToken = (token: string) => {
    if (token.length <= 8) return token;
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success("Token copiado");
  };

  const filteredTokens = tokens.filter((t) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      t.token.toLowerCase().includes(searchLower) ||
      t.sale?.sale_number?.toLowerCase().includes(searchLower) ||
      t.status.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
          <h1 className="text-2xl font-bold">Tokens de Retiro (Debug)</h1>
          <Button variant="outline" size="sm" onClick={fetchTokens} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Últimos 50 Tokens</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar token, venta..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : filteredTokens.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No hay tokens</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-2 font-medium">Token</th>
                        <th className="text-left py-3 px-2 font-medium">Estado</th>
                        <th className="text-left py-3 px-2 font-medium">Venta</th>
                        <th className="text-left py-3 px-2 font-medium">Emitido</th>
                        <th className="text-left py-3 px-2 font-medium">Expira</th>
                        <th className="text-left py-3 px-2 font-medium">Canjeado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTokens.map((token) => (
                        <tr key={token.id} className="border-b hover:bg-muted/50">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                {maskToken(token.token)}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => copyToken(token.token)}
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                          <td className="py-3 px-2">{getStatusBadge(token.status)}</td>
                          <td className="py-3 px-2">
                            <span className="font-medium">{token.sale?.sale_number || "-"}</span>
                          </td>
                          <td className="py-3 px-2 text-muted-foreground">
                            {formatDate(token.issued_at)}
                          </td>
                          <td className="py-3 px-2 text-muted-foreground">
                            {formatDate(token.expires_at)}
                          </td>
                          <td className="py-3 px-2 text-muted-foreground">
                            {token.redeemed_at ? formatDate(token.redeemed_at) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
