import { useEffect, useMemo, useState } from "react";
import { AdminBackButton } from "@/components/AdminBackButton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Shirt,
  Backpack,
  Printer,
  Loader2,
  Minus,
  Plus,
  Lock,
  Banknote,
  CreditCard,
  AlertTriangle,
  Monitor,
} from "lucide-react";
import { printCoatcheckTicket, CoatcheckItemType } from "@/lib/printing/coatcheck-ticket";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { useNavigate } from "react-router-dom";

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");
const POS_KEY = "selectedCoatcheckPosId";

type Ticket = {
  id: string;
  ticket_number: number;
  garment_count: number;
  amount: number;
  payment_method: string;
  status: string;
  item_type: string | null;
  issued_at: string;
  retrieved_at: string | null;
};

type Terminal = { id: string; name: string };

export default function Guardarropia() {
  const {
    activeJornadaId,
    hasActiveJornada,
    jornadaLoading,
    user,
    activeJornadaName,
    activeJornadaNumber,
  } = useAppSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [posId, setPosId] = useState<string | null>(() => localStorage.getItem(POS_KEY));
  const [itemType, setItemType] = useState<CoatcheckItemType>("garment");
  const [qty, setQty] = useState(1);
  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [saving, setSaving] = useState(false);

  const { data: terminals = [], isLoading: loadingTerminals } = useQuery({
    queryKey: ["coatcheck-terminals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pos_terminals")
        .select("id, name")
        .eq("is_active", true)
        .eq("pos_type", "coatcheck")
        .order("name");
      if (error) throw error;
      return (data || []) as Terminal[];
    },
  });

  useEffect(() => {
    if (!posId && terminals.length === 1) {
      setPosId(terminals[0].id);
      localStorage.setItem(POS_KEY, terminals[0].id);
    }
    if (posId && terminals.length > 0 && !terminals.some((t) => t.id === posId)) {
      setPosId(null);
      localStorage.removeItem(POS_KEY);
    }
  }, [terminals, posId]);

  const { data: prices = { backpack: 2000, garment: 1000 } } = useQuery({
    queryKey: ["coatcheck-prices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coatcheck_settings")
        .select("price_backpack, price_garment")
        .eq("venue_id", DEFAULT_VENUE_ID)
        .maybeSingle();
      if (error) throw error;
      return {
        backpack: data?.price_backpack ?? 2000,
        garment: data?.price_garment ?? 1000,
      };
    },
  });

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["coatcheck-tickets", activeJornadaId],
    queryFn: async () => {
      if (!activeJornadaId) return [];
      const { data, error } = await supabase
        .from("coatcheck_tickets")
        .select(
          "id, ticket_number, garment_count, amount, payment_method, status, item_type, issued_at, retrieved_at",
        )
        .eq("jornada_id", activeJornadaId)
        .order("ticket_number", { ascending: false });
      if (error) throw error;
      return (data || []) as Ticket[];
    },
    enabled: !!activeJornadaId,
  });

  const totals = useMemo(() => {
    const issued = tickets.filter((t) => t.status !== "cancelled");
    return {
      total: issued.reduce((s, t) => s + t.amount, 0),
      cash: issued.filter((t) => t.payment_method === "cash").reduce((s, t) => s + t.amount, 0),
      card: issued.filter((t) => t.payment_method !== "cash").reduce((s, t) => s + t.amount, 0),
    };
  }, [tickets]);

  const unitPrice = itemType === "backpack" ? prices.backpack : prices.garment;
  const amount = qty * unitPrice;

  const handleIssue = async () => {
    if (!activeJornadaId || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("issue_coatcheck_ticket_v2", {
        _venue_id: DEFAULT_VENUE_ID,
        _jornada_id: activeJornadaId,
        _item_type: itemType,
        _garment_count: qty,
        _unit_price: unitPrice,
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
        itemType,
        issuedAt: row.issued_at,
        jornadaName: activeJornadaName,
        jornadaNumber: activeJornadaNumber,
      });

      toast.success(`Guarda N° ${row.ticket_number} cobrada`);
      setQty(1);
      queryClient.invalidateQueries({ queryKey: ["coatcheck-tickets", activeJornadaId] });
    } catch (err: any) {
      toast.error(err.message || "No se pudo registrar la guarda");
    } finally {
      setSaving(false);
    }
  };

  if (jornadaLoading || loadingTerminals) {
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

  if (!posId) {
    return (
      <div className="min-h-screen bg-background p-6 flex flex-col items-center justify-center gap-5">
        <div className="text-center space-y-1">
          <Monitor className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Elige la caja</h1>
          <p className="text-muted-foreground text-sm">Selecciona la caja de guardarropía de esta tablet.</p>
        </div>
        {terminals.length === 0 ? (
          <Card className="p-6 max-w-md text-center space-y-2">
            <p className="font-medium">No hay cajas de guardarropía</p>
            <p className="text-sm text-muted-foreground">
              Pide a administración que cree una caja de tipo Guardarropía en Barras y POS.
            </p>
          </Card>
        ) : (
          <div className="w-full max-w-md space-y-3">
            {terminals.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                className="w-full h-20 text-lg justify-start gap-3"
                onClick={() => {
                  setPosId(t.id);
                  localStorage.setItem(POS_KEY, t.id);
                }}
              >
                <Monitor className="w-6 h-6 text-primary" />
                {t.name}
              </Button>
            ))}
          </div>
        )}
        <Button
          variant="ghost"
          className="h-12"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/auth", { replace: true });
          }}
        >
          Cerrar sesión
        </Button>
      </div>
    );
  }

  const terminalName = terminals.find((t) => t.id === posId)?.name ?? "Guardarropía";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shirt className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Guardarropía</h1>
            <p className="text-sm text-muted-foreground">
              {terminalName} · {clp(prices.backpack)} mochila · {clp(prices.garment)} prenda
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <AdminBackButton size="lg" className="h-14 px-5 text-base" />
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

      <div className="grid grid-cols-3 gap-3">
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
      </div>

        <Card className="p-4 sm:p-5 space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">¿Qué está guardando?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setItemType("backpack");
                  setQty(1);
                }}
                className={`h-24 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
                  itemType === "backpack" ? "border-primary bg-primary/10 text-primary" : "bg-card"
                }`}
              >
                <Backpack className="w-7 h-7" />
                <span className="text-base font-semibold">Mochila / bolso</span>
                <span className="text-sm opacity-80">{clp(prices.backpack)}</span>
              </button>
              <button
                onClick={() => {
                  setItemType("garment");
                  setQty(1);
                }}
                className={`h-24 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
                  itemType === "garment" ? "border-primary bg-primary/10 text-primary" : "bg-card"
                }`}
              >
                <Shirt className="w-7 h-7" />
                <span className="text-base font-semibold">Prenda de ropa</span>
                <span className="text-sm opacity-80">{clp(prices.garment)}</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">Cantidad</p>
            <div className="flex items-center gap-4">
              <Button variant="outline" className="h-16 w-16" onClick={() => setQty((g) => Math.max(1, g - 1))}>
                <Minus className="w-6 h-6" />
              </Button>
              <span className="text-4xl font-bold w-16 text-center">{qty}</span>
              <Button variant="outline" className="h-16 w-16" onClick={() => setQty((g) => g + 1)}>
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

          <Button size="lg" className="w-full h-20 text-xl font-bold gap-3" disabled={saving} onClick={handleIssue}>
            {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Printer className="w-6 h-6" />}
            Cobrar e imprimir
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Sale un comprobante de control para el trabajador.
          </p>
        </Card>
    </div>
  );
}
