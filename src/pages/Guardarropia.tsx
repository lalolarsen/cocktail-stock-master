import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shirt,
  Printer,
  Loader2,
  Minus,
  Plus,
  Search,
  Lock,
  Banknote,
  CreditCard,
  AlertTriangle,
  Settings,
  Check,
} from "lucide-react";
import { printCoatcheckTicket } from "@/lib/printing/coatcheck-ticket";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { useNavigate } from "react-router-dom";

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

type Ticket = {
  id: string;
  ticket_number: number;
  garment_count: number;
  amount: number;
  payment_method: string;
  status: string;
  issued_at: string;
  retrieved_at: string | null;
};

export default function Guardarropia() {
  const { activeJornadaId, hasActiveJornada, jornadaLoading, hasRole, user } = useAppSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = hasRole("admin");

  const [tab, setTab] = useState<"guardar" | "retirar">("guardar");
  const [garments, setGarments] = useState(1);
  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");

  const { data: price = 0 } = useQuery({
    queryKey: ["coatcheck-price"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coatcheck_settings")
        .select("price_per_garment")
        .eq("venue_id", DEFAULT_VENUE_ID)
        .maybeSingle();
      if (error) throw error;
      return data?.price_per_garment ?? 0;
    },
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["coatcheck-tickets", activeJornadaId],
    queryFn: async () => {
      if (!activeJornadaId) return [];
      const { data, error } = await supabase
        .from("coatcheck_tickets")
        .select("id, ticket_number, garment_count, amount, payment_method, status, issued_at, retrieved_at")
        .eq("jornada_id", activeJornadaId)
        .order("ticket_number", { ascending: false });
      if (error) throw error;
      return (data || []) as Ticket[];
    },
    enabled: !!activeJornadaId,
  });

  const active = useMemo(() => tickets.filter((t) => t.status === "issued"), [tickets]);
  const filteredActive = useMemo(() => {
    const q = search.trim();
    if (!q) return active;
    return active.filter((t) => String(t.ticket_number).includes(q));
  }, [active, search]);

  const totals = useMemo(() => {
    const issued = tickets.filter((t) => t.status !== "cancelled");
    return {
      total: issued.reduce((s, t) => s + t.amount, 0),
      cash: issued.filter((t) => t.payment_method === "cash").reduce((s, t) => s + t.amount, 0),
      card: issued.filter((t) => t.payment_method !== "cash").reduce((s, t) => s + t.amount, 0),
      pending: active.length,
    };
  }, [tickets, active]);

  const amount = garments * price;

  const handleIssue = async () => {
    if (!activeJornadaId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("issue_coatcheck_ticket", {
        _venue_id: DEFAULT_VENUE_ID,
        _jornada_id: activeJornadaId,
        _garment_count: garments,
        _unit_price: price,
        _payment_method: payment,
        _note: null,
      });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Ticket;

      printCoatcheckTicket({
        ticketNumber: row.ticket_number,
        garmentCount: row.garment_count,
        amount: row.amount,
        paymentMethod: row.payment_method,
        issuedAt: row.issued_at,
      });

      toast.success(`Guarda N° ${row.ticket_number} cobrada`);
      setGarments(1);
      queryClient.invalidateQueries({ queryKey: ["coatcheck-tickets", activeJornadaId] });
    } catch (err: any) {
      toast.error(err.message || "No se pudo registrar la guarda");
    } finally {
      setSaving(false);
    }
  };

  const handleRetrieve = async (t: Ticket) => {
    const { error } = await supabase
      .from("coatcheck_tickets")
      .update({
        status: "retrieved",
        retrieved_at: new Date().toISOString(),
        retrieved_by: user?.id ?? null,
      })
      .eq("id", t.id);
    if (error) {
      toast.error("No se pudo marcar como entregada");
      return;
    }
    toast.success(`Guarda N° ${t.ticket_number} entregada`);
    queryClient.invalidateQueries({ queryKey: ["coatcheck-tickets", activeJornadaId] });
  };

  const savePrice = async () => {
    const value = Math.round(Number(priceDraft));
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Precio inválido");
      return;
    }
    const { error } = await supabase
      .from("coatcheck_settings")
      .upsert({ venue_id: DEFAULT_VENUE_ID, price_per_garment: value, updated_at: new Date().toISOString() });
    if (error) {
      toast.error("No se pudo guardar el precio");
      return;
    }
    setEditingPrice(false);
    queryClient.invalidateQueries({ queryKey: ["coatcheck-price"] });
    toast.success("Precio actualizado");
  };

  if (jornadaLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasActiveJornada) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <AlertTriangle className="w-14 h-14 text-muted-foreground/40" />
        <h1 className="text-2xl font-bold">No hay jornada abierta</h1>
        <p className="text-muted-foreground">Abre la jornada para cobrar el guardarropía.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shirt className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Guardarropía</h1>
            <p className="text-sm text-muted-foreground">{clp(price)} por prenda</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="lg"
              className="h-14 px-4"
              onClick={() => {
                setPriceDraft(String(price));
                setEditingPrice((v) => !v);
              }}
            >
              <Settings className="w-5 h-5" />
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            className="h-14 px-5 text-base gap-2"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/auth", { replace: true });
            }}
          >
            <Lock className="w-5 h-5" />
            Bloquear
          </Button>
        </div>
      </header>

      {editingPrice && (
        <Card className="p-4 flex items-center gap-3">
          <span className="text-sm font-semibold text-muted-foreground">Precio por prenda</span>
          <Input
            type="number"
            inputMode="numeric"
            className="h-14 text-lg max-w-40"
            value={priceDraft}
            onChange={(e) => setPriceDraft(e.target.value)}
          />
          <Button size="lg" className="h-14 gap-2" onClick={savePrice}>
            <Check className="w-5 h-5" />
            Guardar
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Recaudado</p>
          <p className="text-xl font-bold">{clp(totals.total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Efectivo</p>
          <p className="text-xl font-bold">{clp(totals.cash)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Tarjeta</p>
          <p className="text-xl font-bold">{clp(totals.card)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Sin retirar</p>
          <p className="text-xl font-bold">{totals.pending}</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["guardar", "retirar"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-16 rounded-xl border text-lg font-semibold transition ${
              tab === t ? "border-primary bg-primary/10 text-primary" : "bg-card"
            }`}
          >
            {t === "guardar" ? "Guardar prenda" : `Entregar (${active.length})`}
          </button>
        ))}
      </div>

      {tab === "guardar" ? (
        <Card className="p-4 sm:p-5 space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">Cantidad de prendas</p>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                className="h-16 w-16"
                onClick={() => setGarments((g) => Math.max(1, g - 1))}
              >
                <Minus className="w-6 h-6" />
              </Button>
              <span className="text-4xl font-bold w-16 text-center">{garments}</span>
              <Button variant="outline" className="h-16 w-16" onClick={() => setGarments((g) => g + 1)}>
                <Plus className="w-6 h-6" />
              </Button>
              <div className="ml-auto text-right">
                <p className="text-xs text-muted-foreground">Total a cobrar</p>
                <p className="text-3xl font-bold text-primary">{clp(amount)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">Pago</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPayment("cash")}
                className={`h-20 rounded-xl border text-lg font-semibold flex items-center justify-center gap-2 transition ${
                  payment === "cash" ? "border-primary bg-primary/10 text-primary" : "bg-card"
                }`}
              >
                <Banknote className="w-6 h-6" /> Efectivo
              </button>
              <button
                onClick={() => setPayment("card")}
                className={`h-20 rounded-xl border text-lg font-semibold flex items-center justify-center gap-2 transition ${
                  payment === "card" ? "border-primary bg-primary/10 text-primary" : "bg-card"
                }`}
              >
                <CreditCard className="w-6 h-6" /> Tarjeta
              </button>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full h-20 text-xl font-bold gap-3"
            disabled={saving}
            onClick={handleIssue}
          >
            {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Printer className="w-6 h-6" />}
            Cobrar e imprimir
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Salen dos tickets con el mismo número: uno para el cliente y otro para pinchar en la prenda.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-14 pl-11 text-lg"
              inputMode="numeric"
              placeholder="Buscar por número"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredActive.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">Sin prendas por entregar</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredActive.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-4 rounded-xl border bg-card">
                  <span className="text-3xl font-black w-16 text-center">{t.ticket_number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold">{t.garment_count} prenda(s)</p>
                    <Badge variant="outline" className="text-xs">
                      {t.payment_method === "cash" ? "Efectivo" : "Tarjeta"} · {clp(t.amount)}
                    </Badge>
                  </div>
                  <Button size="lg" className="h-14 px-5" onClick={() => handleRetrieve(t)}>
                    Entregar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
