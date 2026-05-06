/**
 * Weekly external count importer (Fase 7).
 *
 * Flow:
 *   1. Upload Excel/CSV (cols: sku_base | cantidad | location_name).
 *   2. Fuzzy match products + locations.
 *   3. Show preview with diff vs system (stock_balances.quantity).
 *   4. Admin chooses:
 *      - "Solo informe" → genera PDF, NO toca stock.
 *      - "Aplicar ajustes" → crea stock_movements tipo 'reconciliation' + actualiza stock_balances + PDF.
 *
 * Per plan v3: el cliente decide qué hacer con las diferencias; el sistema solo informa.
 */
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Upload, FileSpreadsheet, Download, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fuzzyMatchWithLearning, type ProductRef, type LocationRef } from "@/lib/excel-inventory-parser";
import { formatCLP } from "@/lib/currency";

interface ExcelRow {
  rowIndex: number;
  raw_sku: string;
  raw_name: string;
  raw_location: string;
  counted_qty: number;
}

interface ResolvedRow extends ExcelRow {
  product_id: string | null;
  product_name: string | null;
  product_capacity_ml: number | null;
  location_id: string | null;
  location_name: string | null;
  system_qty: number;
  diff: number; // counted - system
  cpp: number; // for $ in admin PDF
  matched: boolean;
}

const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export function WeeklyCountImporter() {
  const { venue } = useAppSession();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [resolved, setResolved] = useState<ResolvedRow[]>([]);
  const [fileName, setFileName] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !venue?.id) return;

    setLoading(true);
    setFileName(file.name);
    try {
      // 1. Parse file
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

      if (rawRows.length === 0) {
        toast.error("La planilla está vacía");
        return;
      }

      // Flexible column detection
      const detectKey = (row: Record<string, any>, candidates: string[]) => {
        const keys = Object.keys(row);
        for (const cand in row) {
          const n = norm(cand);
          if (candidates.some((c) => n === norm(c) || n.includes(norm(c)))) return cand;
        }
        for (const k of keys) {
          const n = norm(k);
          if (candidates.some((c) => n.includes(norm(c)))) return k;
        }
        return null;
      };

      const first = rawRows[0];
      const skuKey = detectKey(first, ["sku_base", "sku", "codigo"]);
      const nameKey = detectKey(first, ["nombre", "producto", "product_name"]);
      const qtyKey = detectKey(first, ["cantidad", "qty", "stock_contado", "contado"]);
      const locKey = detectKey(first, ["location_name", "ubicacion", "barra", "bodega", "location"]);

      if (!qtyKey || (!skuKey && !nameKey)) {
        toast.error("La planilla debe incluir 'cantidad' y 'sku_base' o 'nombre'");
        return;
      }

      const excelRows: ExcelRow[] = rawRows
        .map((r, i) => ({
          rowIndex: i + 2,
          raw_sku: skuKey ? String(r[skuKey] || "").trim() : "",
          raw_name: nameKey ? String(r[nameKey] || "").trim() : "",
          raw_location: locKey ? String(r[locKey] || "").trim() : "",
          counted_qty: (() => {
            const raw = r[qtyKey];
            if (typeof raw === "number") return raw;
            let s = String(raw ?? "").trim().replace(/\s/g, "");
            if (!s) return 0;
            // If both "," and "." appear, assume "." is thousand-sep and "," is decimal (es-CL)
            if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
            else s = s.replace(",", ".");
            const n = parseFloat(s);
            return isNaN(n) ? 0 : n;
          })(),
        }))
        .filter((r) => r.raw_sku || r.raw_name);

      // 2. Load catalog + locations + balances
      const [
        { data: products },
        { data: locations },
        { data: balances },
      ] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, code, sku_base, capacity_ml, weighted_avg_cost")
          .eq("venue_id", venue.id),
        supabase
          .from("stock_locations")
          .select("id, name")
          .eq("venue_id", venue.id),
        supabase
          .from("stock_balances")
          .select("product_id, location_id, quantity")
          .eq("venue_id", venue.id),
      ]);

      const productRefs: ProductRef[] = (products || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.sku_base || p.code,
        capacity_ml: p.capacity_ml,
        cost_per_unit: Number(p.weighted_avg_cost) || 0,
        current_stock: 0,
      }));
      const cppMap = new Map<string, number>(
        (products || []).map((p: any) => [p.id, Number(p.weighted_avg_cost) || 0])
      );
      const capMap = new Map<string, number | null>(
        (products || []).map((p: any) => [p.id, p.capacity_ml ?? null])
      );

      const balanceMap = new Map<string, number>();
      (balances || []).forEach((b: any) => {
        balanceMap.set(`${b.product_id}__${b.location_id}`, Number(b.quantity) || 0);
      });

      // Accent-insensitive scoring fallback
      const tokens = (s: string) => norm(s).split(/[\s\-_./]+/).filter((t) => t.length >= 2);
      const scoreAccentInsensitive = (a: string, b: string) => {
        const na = norm(a);
        const nb = norm(b);
        if (!na || !nb) return 0;
        if (na === nb) return 1;
        if (na.includes(nb) || nb.includes(na)) return 0.92;
        const ta = new Set(tokens(a));
        const tb = new Set(tokens(b));
        if (ta.size === 0 || tb.size === 0) return 0;
        let inter = 0;
        for (const t of ta) if (tb.has(t)) inter++;
        return (2 * inter) / (ta.size + tb.size);
      };

      // 3. Resolve each row
      const out: ResolvedRow[] = excelRows.map((r) => {
        // Match product: SKU exact first, else fuzzy by name
        let prod: ProductRef | null = null;
        if (r.raw_sku) {
          const skuNorm = norm(r.raw_sku);
          prod =
            productRefs.find((p) => norm(p.code || "") === skuNorm) ||
            productRefs.find((p) => norm(p.name) === skuNorm) ||
            null;
        }
        if (!prod && r.raw_name) {
          const m = fuzzyMatchWithLearning(r.raw_name, productRefs);
          prod = m.product;
        }
        // Accent-insensitive fallback (catches "Nóbel" vs "Nobel", "35°" diffs)
        if (!prod && r.raw_name) {
          let best: ProductRef | null = null;
          let bestScore = 0;
          for (const p of productRefs) {
            const s = Math.max(
              scoreAccentInsensitive(r.raw_name, p.name),
              p.code ? scoreAccentInsensitive(r.raw_name, p.code) : 0
            );
            if (s > bestScore) { bestScore = s; best = p; }
          }
          if (bestScore >= 0.45) prod = best;
        }

        // Match location (accent-insensitive, partial)
        const locNorm = norm(r.raw_location);
        let loc: any = null;
        if (locNorm) {
          loc =
            (locations || []).find((l: any) => norm(l.name) === locNorm) ||
            (locations || []).find(
              (l: any) => norm(l.name).includes(locNorm) || locNorm.includes(norm(l.name))
            ) ||
            (locations || []).find((l: any) => {
              const ta = new Set(tokens(l.name));
              const tb = new Set(tokens(r.raw_location));
              for (const t of tb) if (ta.has(t)) return true;
              return false;
            });
        }
        // If a single location exists, default to it
        if (!loc && (locations || []).length === 1) loc = (locations as any)[0];

        const sysQty = prod && loc ? balanceMap.get(`${prod.id}__${loc.id}`) || 0 : 0;

        return {
          ...r,
          product_id: prod?.id || null,
          product_name: prod?.name || null,
          product_capacity_ml: prod ? capMap.get(prod.id) ?? null : null,
          location_id: loc?.id || null,
          location_name: loc?.name || null,
          system_qty: sysQty,
          diff: r.counted_qty - sysQty,
          cpp: prod ? cppMap.get(prod.id) || 0 : 0,
          matched: !!(prod && loc),
        };
      });

      setResolved(out);
      const matched = out.filter((r) => r.matched).length;
      toast.success(`${matched}/${out.length} líneas reconciliadas`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al procesar planilla");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const stats = useMemo(() => {
    const matched = resolved.filter((r) => r.matched);
    const unmatched = resolved.filter((r) => !r.matched);
    const withDiff = matched.filter((r) => Math.abs(r.diff) > 0.001);
    const totalDiffValue = withDiff.reduce((s, r) => s + Math.abs(r.diff) * r.cpp, 0);
    return {
      total: resolved.length,
      matched: matched.length,
      unmatched: unmatched.length,
      withDiff: withDiff.length,
      totalDiffValue: Math.round(totalDiffValue),
    };
  }, [resolved]);

  const generatePDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 70, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("INFORME CONTEO SEMANAL", margin, 32);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Planilla: ${fileName}`, margin, 52);
    doc.text(
      `Generado: ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}`,
      pageW - margin,
      52,
      { align: "right" }
    );
    y = 90;

    // KPI Cards
    doc.setTextColor(0, 0, 0);
    const kpis = [
      { label: "Líneas leídas", value: String(stats.total), color: [59, 130, 246] },
      { label: "Reconciliadas", value: String(stats.matched), color: [34, 197, 94] },
      { label: "Sin match", value: String(stats.unmatched), color: [234, 179, 8] },
      { label: "Con diferencia", value: String(stats.withDiff), color: [239, 68, 68] },
    ];
    const cardW = (pageW - margin * 2 - 30) / 4;
    kpis.forEach((k, i) => {
      const x = margin + i * (cardW + 10);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, cardW, 56, 6, 6, "FD");
      doc.setFillColor(k.color[0], k.color[1], k.color[2]);
      doc.rect(x, y, 4, 56, "F");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(k.label, x + 12, y + 18);
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(k.value, x + 12, y + 44);
      doc.setFont("helvetica", "normal");
    });
    y += 76;

    // Total impact (CLP — admin only)
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Impacto estimado de diferencias (a CPP): ${formatCLP(stats.totalDiffValue)}`,
      margin,
      y
    );
    y += 20;

    const section = (title: string) => {
      if (y > 720) {
        doc.addPage();
        y = margin;
      }
      doc.setFillColor(15, 23, 42);
      doc.rect(margin, y, pageW - margin * 2, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(title, margin + 10, y + 15);
      y += 28;
    };

    const fmtUnit = (capMl: number | null, n: number) =>
      capMl && capMl > 0 ? `${Math.round(n)} ml` : `${Number(n).toFixed(2)} u`;

    // Differences detail
    const diffRows = resolved
      .filter((r) => r.matched && Math.abs(r.diff) > 0.001)
      .sort((a, b) => Math.abs(b.diff * b.cpp) - Math.abs(a.diff * a.cpp));

    if (diffRows.length > 0) {
      section("DIFERENCIAS DETECTADAS");
      autoTable(doc, {
        startY: y,
        head: [["Producto", "Ubicación", "Sistema", "Contado", "Diferencia", "Impacto $"]],
        body: diffRows.map((r) => [
          r.product_name || "?",
          r.location_name || "?",
          fmtUnit(r.product_capacity_ml, r.system_qty),
          fmtUnit(r.product_capacity_ml, r.counted_qty),
          (r.diff > 0 ? "+" : "") + fmtUnit(r.product_capacity_ml, r.diff),
          formatCLP(Math.round(Math.abs(r.diff) * r.cpp)),
        ]),
        headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 5 },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 4) {
            const v = String(data.cell.raw);
            data.cell.styles.textColor = v.startsWith("+") ? [34, 197, 94] : [239, 68, 68];
            data.cell.styles.fontStyle = "bold";
          }
        },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 20;
    }

    // Unmatched
    const unmatched = resolved.filter((r) => !r.matched);
    if (unmatched.length > 0) {
      section("LÍNEAS SIN RECONCILIAR");
      autoTable(doc, {
        startY: y,
        head: [["Fila", "SKU", "Nombre", "Ubicación", "Cantidad", "Motivo"]],
        body: unmatched.map((r) => [
          String(r.rowIndex),
          r.raw_sku || "—",
          r.raw_name || "—",
          r.raw_location || "—",
          String(r.counted_qty),
          !r.product_id ? "Producto no encontrado" : "Ubicación no encontrada",
        ]),
        headStyles: { fillColor: [234, 179, 8], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 9, cellPadding: 5 },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 20;
    }

    // OK rows summary
    const okRows = resolved.filter((r) => r.matched && Math.abs(r.diff) <= 0.001);
    if (okRows.length > 0) {
      section(`SIN DIFERENCIAS (${okRows.length} productos)`);
      autoTable(doc, {
        startY: y,
        head: [["Producto", "Ubicación", "Cantidad"]],
        body: okRows.slice(0, 50).map((r) => [
          r.product_name || "?",
          r.location_name || "?",
          fmtUnit(r.product_capacity_ml, r.counted_qty),
        ]),
        headStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 4 },
        margin: { left: margin, right: margin },
      });
      if (okRows.length > 50) {
        y = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(`... y ${okRows.length - 50} productos más sin diferencia.`, margin, y);
      }
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Página ${i} de ${pageCount}`,
        pageW - margin,
        doc.internal.pageSize.getHeight() - 20,
        { align: "right" }
      );
      doc.text(
        `Stockia • Conteo semanal • Informativo`,
        margin,
        doc.internal.pageSize.getHeight() - 20
      );
    }

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
    doc.save(`conteo_semanal_${today}.pdf`);
    toast.success("Informe PDF descargado");
  };

  const applyAdjustments = async () => {
    if (!venue?.id) return;
    const diffRows = resolved.filter((r) => r.matched && Math.abs(r.diff) > 0.001);
    if (diffRows.length === 0) {
      toast.info("No hay diferencias para ajustar");
      return;
    }

    const confirmed = window.confirm(
      `Se generarán ${diffRows.length} ajuste(s) de inventario tipo CONTEO. Esta acción modifica el stock real. ¿Continuar?`
    );
    if (!confirmed) return;

    setApplying(true);
    try {
      // Conteo semanal externo: ajuste al stock_balance del bar.
      // Usamos movement_type 'reconciliation' (enum válido) con quantity firmada (diff puede ser negativo).
      // from_location_id se usa como locación afectada (convención del proyecto para ajustes en una sola ubicación).
      const movs = diffRows.map((r) => ({
        venue_id: venue.id,
        product_id: r.product_id!,
        from_location_id: r.location_id!,
        movement_type: "reconciliation" as const,
        quantity: r.diff,
        notes: `Conteo semanal externo: sistema=${r.system_qty}, contado=${r.counted_qty}, diff=${r.diff}`,
        source_type: "weekly_count",
      }));

      const { error: movErr } = await supabase.from("stock_movements").insert(movs as any);
      if (movErr) throw movErr;

      // Ajustar stock_balances (fuente de verdad) en una sola pasada por fila.
      for (const r of diffRows) {
        const { data: bal } = await supabase
          .from("stock_balances")
          .select("id, quantity")
          .eq("product_id", r.product_id!)
          .eq("location_id", r.location_id!)
          .maybeSingle();
        if (bal) {
          await supabase
            .from("stock_balances")
            .update({ quantity: Number(bal.quantity) + r.diff, updated_at: new Date().toISOString() })
            .eq("id", bal.id);
        } else if (r.diff > 0) {
          await supabase
            .from("stock_balances")
            .insert({
              venue_id: venue.id,
              product_id: r.product_id!,
              location_id: r.location_id!,
              quantity: r.diff,
            } as any);
        }
      }
      toast.success(`${movs.length} ajuste(s) aplicados`);
      setResolved([]);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al aplicar ajustes");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="glass-effect shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Conteo semanal externo
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Sube la planilla del encargado de conteo. El sistema concilia automáticamente vs. el stock actual y genera un
          informe descargable. Los ajustes son <strong>opcionales</strong>.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-primary/30 bg-primary/5">
          <FileText className="h-4 w-4 text-primary" />
          <AlertDescription className="text-xs">
            Formato esperado: columnas <code className="text-primary">sku_base</code> (o{" "}
            <code className="text-primary">nombre</code>),{" "}
            <code className="text-primary">cantidad</code> y{" "}
            <code className="text-primary">location_name</code>. Acepta .xlsx, .xls, .csv.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-3">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            disabled={loading}
            className="max-w-sm"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          {fileName && !loading && (
            <span className="text-xs text-muted-foreground truncate">📎 {fileName}</span>
          )}
        </div>

        {resolved.length > 0 && (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Total</div>
                <div className="text-xl font-bold tabular-nums">{stats.total}</div>
              </div>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Reconciliadas</div>
                <div className="text-xl font-bold tabular-nums text-primary">{stats.matched}</div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Sin match</div>
                <div className="text-xl font-bold tabular-nums text-amber-500">{stats.unmatched}</div>
              </div>
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Con diferencia</div>
                <div className="text-xl font-bold tabular-nums text-destructive">{stats.withDiff}</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={generatePDF} variant="default" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                Descargar informe PDF
              </Button>
              <Button
                onClick={applyAdjustments}
                variant="outline"
                size="sm"
                disabled={applying || stats.withDiff === 0}
              >
                {applying ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Aplicar {stats.withDiff} ajuste(s) (opcional)
              </Button>
              <Button onClick={() => setResolved([])} variant="ghost" size="sm">
                Limpiar
              </Button>
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right">Sistema</TableHead>
                    <TableHead className="text-right">Contado</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolved.slice(0, 100).map((r) => {
                    const cap = r.product_capacity_ml || 0;
                    const fmt = (n: number) =>
                      cap > 0 ? `${Math.round(n)} ml` : `${Number(n).toFixed(2)} u`;
                    const negative = r.diff < 0;
                    return (
                      <TableRow key={r.rowIndex}>
                        <TableCell className="font-medium text-sm">
                          {r.product_name || (
                            <span className="text-muted-foreground italic">
                              {r.raw_name || r.raw_sku || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {r.location_name || (
                            <span className="text-muted-foreground italic">
                              {r.raw_location || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {r.matched ? fmt(r.system_qty) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {fmt(r.counted_qty)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {r.matched && Math.abs(r.diff) > 0.001 ? (
                            <Badge variant={negative ? "destructive" : "secondary"}>
                              {r.diff > 0 ? "+" : ""}
                              {fmt(r.diff)}
                            </Badge>
                          ) : r.matched ? (
                            <span className="text-primary text-xs">OK</span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {!r.matched ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Sin match
                            </Badge>
                          ) : Math.abs(r.diff) <= 0.001 ? (
                            <Badge variant="outline" className="border-primary/40 text-primary">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive/40 text-destructive">
                              Diferencia
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {resolved.length > 100 && (
                <div className="p-3 text-xs text-center text-muted-foreground bg-muted/20">
                  Mostrando primeras 100 líneas. El PDF incluye todas.
                </div>
              )}
            </div>
          </>
        )}

        {resolved.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            <Upload className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sube una planilla para iniciar la conciliación.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
