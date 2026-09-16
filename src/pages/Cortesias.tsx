import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Gift,
  Printer,
  Loader2,
  Minus,
  Plus,
  Search,
  Lock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { printCourtesyCover } from "@/lib/printing/courtesy-cover";
import { DEFAULT_VENUE_ID } from "@/lib/venue";
import { useNavigate } from "react-router-dom";

const MOTIVOS = ["Socio", "Embajador", "Cortesía", "Otros"] as const;

type CourtesyRow = {
  id: string;
  code: string;
  product_name: string;
  qty: number;
  note: string | null;
  expires_at: string;
  created_at: string;
};

export default function Cortesias() {
  const { user, activeJornadaId, hasActiveJornada, jornadaLoading } = useAppSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [motivo, setMotivo] = useState<string>("");
  const [issuing, setIssuing] = useState(false);

  const { data: cocktails = [] } = useQuery({
    queryKey: ["cortesias-cocktails"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cocktails")
        .select("id, name")
        .eq("venue_id", DEFAULT_VENUE_ID)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: issued = [], isLoading } = useQuery({
    queryKey: ["cortesias-tablet-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courtesy_qr")
        .select("id, code, product_name, qty, note, expires_at, created_at")
        .eq("venue_id", DEFAULT_VENUE_ID)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data || []) as CourtesyRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cocktails;
    return cocktails.filter((c) => c.name.toLowerCase().includes(q));
  }, [cocktails, search]);

  const selected = cocktails.find((c) => c.id === productId);

  const reprint = (row: CourtesyRow) =>
    printCourtesyCover({
      productName: row.product_name,
      qty: row.qty,
      code: row.code,
      note: row.note,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    });

  const handleIssue = async () => {
    if (!selected || !user?.id) {
      toast.error("Elige un producto");
      return;
    }
    setIssuing(true);
    try {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("courtesy_qr")
        .insert({
          product_id: selected.id,
          product_name: selected.name,
          qty,
          expires_at: endOfDay.toISOString(),
          max_uses: 1,
          used_count: 1,
          status: "redeemed",
          note: motivo || null,
          created_by: user.id,
          venue_id: DEFAULT_VENUE_ID,
        })
        .select()
        .single();
      if (error) throw error;
      const row = data as unknown as CourtesyRow;

      if (activeJornadaId) {
        await supabase.from("courtesy_redemptions").insert({
          courtesy_id: row.id,
          redeemed_by: user.id,
          jornada_id: activeJornadaId,
          venue_id: DEFAULT_VENUE_ID,
          result: "success",
          pos_id: null,
        });
      }

      reprint(row);
      toast.success("Cortesía emitida e impresa");
      setProductId("");
      setSearch("");
      setQty(1);
      setMotivo("");
      queryClient.invalidateQueries({ queryKey: ["cortesias-tablet-list"] });
    } catch (err: any) {
      toast.error(err.message || "No se pudo emitir la cortesía");
    } finally {
      setIssuing(false);
    }
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
        <p className="text-muted-foreground">Abre la jornada para emitir cortesías.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Gift className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold leading-tight">Cortesías</h1>
            <p className="text-sm text-muted-foreground">Cover físico, sin QR</p>
          </div>
        </div>
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
      </header>

      <Card className="p-4 sm:p-5 space-y-5">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">1. Producto</p>
          {selected ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-primary bg-primary/5">
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0" />
              <span className="flex-1 text-lg font-semibold">{selected.name}</span>
              <Button variant="ghost" size="lg" className="h-12" onClick={() => setProductId("")}>
                Cambiar
              </Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-14 pl-11 text-base"
                  placeholder="Buscar producto"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setProductId(c.id)}
                    className="h-16 px-3 rounded-xl border bg-card text-left text-base font-medium hover:border-primary active:scale-[0.98] transition"
                  >
                    {c.name}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="col-span-full text-center text-muted-foreground py-6">Sin resultados</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">2. Cantidad</p>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              className="h-16 w-16"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              <Minus className="w-6 h-6" />
            </Button>
            <span className="text-4xl font-bold w-16 text-center">{qty}</span>
            <Button variant="outline" className="h-16 w-16" onClick={() => setQty((q) => q + 1)}>
              <Plus className="w-6 h-6" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">3. Motivo (opcional)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MOTIVOS.map((m) => (
              <button
                key={m}
                onClick={() => setMotivo(motivo === m ? "" : m)}
                className={`h-14 rounded-xl border text-base font-medium transition ${
                  motivo === m ? "border-primary bg-primary/10 text-primary" : "bg-card"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-20 text-xl font-bold gap-3"
          disabled={!selected || issuing}
          onClick={handleIssue}
        >
          {issuing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Printer className="w-6 h-6" />}
          Emitir e imprimir
        </Button>
      </Card>

      <section className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Cortesías de la noche</p>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : issued.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center">Aún no hay cortesías emitidas</p>
        ) : (
          <div className="space-y-2">
            {issued.map((row) => (
              <div key={row.id} className="flex items-center gap-3 p-4 rounded-xl border bg-card">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold truncate">
                    {row.product_name} <span className="font-normal text-muted-foreground">× {row.qty}</span>
                  </p>
                  {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
                </div>
                <Button variant="outline" size="lg" className="h-12 gap-2" onClick={() => reprint(row)}>
                  <Printer className="w-4 h-4" />
                  Reimprimir
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
