import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVenue } from "@/hooks/useActiveVenue";
import {
  StockImportPreviewDialog,
  StockImportRow,
  detectSubcategory,
} from "./StockImportPreviewDialog";

// Category headers that should be treated as section dividers
const CATEGORY_HEADERS = [
  "botellas 1000/750/700",
  "botellines",
  "mixers latas",
  "mixers redbull variedades",
  "jugos",
  "aguas",
  "bebidas 1,5l",
  "bebidas 1.5l",
];

const isHeaderRow = (producto: string): boolean => {
  const lower = producto.toLowerCase().trim();
  return CATEGORY_HEADERS.some((header) => lower.includes(header) || header.includes(lower));
};

export const ExcelUpload = () => {
  const { venue } = useActiveVenue();
  const [uploading, setUploading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<StockImportRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const downloadTemplate = () => {
    const templateData = [
      { Producto: "Botellas 1000/750/700", Formato: "", Cantidad: "" },
      { Producto: "Alto del Carmen 35° L", Formato: 1000, Cantidad: "" },
      { Producto: "Alto del Carmen 35°", Formato: 750, Cantidad: "" },
      { Producto: "Absolut Blue L", Formato: 1000, Cantidad: "" },
      { Producto: "Absolut Blue", Formato: 750, Cantidad: "" },
      { Producto: "Havana Especial L", Formato: 1000, Cantidad: "" },
      { Producto: "Havana Especial", Formato: 750, Cantidad: "" },
      { Producto: "J.W Red L", Formato: 1000, Cantidad: "" },
      { Producto: "J.W Red", Formato: 750, Cantidad: "" },
      { Producto: "Botellines", Formato: "", Cantidad: "" },
      { Producto: "Heineken", Formato: 330, Cantidad: "" },
      { Producto: "Heineken 0", Formato: 330, Cantidad: "" },
      { Producto: "Kunstman VPL", Formato: 330, Cantidad: "" },
      { Producto: "Mixers Latas", Formato: "", Cantidad: "" },
      { Producto: "Coca Cola", Formato: 350, Cantidad: "" },
      { Producto: "Coca Cola Zero", Formato: 350, Cantidad: "" },
      { Producto: "Sprite", Formato: 350, Cantidad: "" },
      { Producto: "Ginger", Formato: 350, Cantidad: "" },
      { Producto: "Mixers Redbull variedades", Formato: "", Cantidad: "" },
      { Producto: "Redbull", Formato: 250, Cantidad: "" },
      { Producto: "Redbull Sin Azucar", Formato: 250, Cantidad: "" },
      { Producto: "Jugos", Formato: "", Cantidad: "" },
      { Producto: "Nectar Naranja", Formato: 1500, Cantidad: "" },
      { Producto: "Nectar Piña", Formato: 1500, Cantidad: "" },
      { Producto: "Aguas", Formato: "", Cantidad: "" },
      { Producto: "Mineral con Gas", Formato: 600, Cantidad: "" },
      { Producto: "Mineral sin Gas", Formato: 600, Cantidad: "" },
      { Producto: "Bebidas 1,5L", Formato: "", Cantidad: "" },
      { Producto: "Coca Cola 1,5", Formato: 1500, Cantidad: "" },
      { Producto: "Sprite 1,5", Formato: 1500, Cantidad: "" },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");

    worksheet["!cols"] = [
      { wch: 30 }, // Producto
      { wch: 12 }, // Formato
      { wch: 12 }, // Cantidad
    ];

    XLSX.writeFile(workbook, "plantilla_inventario.xlsx");

    toast.success("Plantilla descargada", {
      description: "Completa la columna 'Cantidad' con el stock actual de cada producto.",
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{
        Producto?: string;
        producto?: string;
        Formato?: number | string;
        formato?: number | string;
        Cantidad?: number | string;
        cantidad?: number | string;
      }>;

      let currentSubcategory = "botellas_750";
      const parsedData: StockImportRow[] = [];

      jsonData.forEach((row, index) => {
        const producto = (row.Producto || row.producto || "").toString().trim();
        if (!producto) return;

        const formatoRaw = row.Formato || row.formato;
        let formato: number | null = null;
        if (formatoRaw) {
          // Handle formats like "220/350" - take the first value
          const formatStr = formatoRaw.toString();
          if (formatStr.includes("/")) {
            formato = parseInt(formatStr.split("/")[0]);
          } else {
            formato = parseInt(formatStr) || null;
          }
        }

        const cantidadRaw = row.Cantidad || row.cantidad;
        const cantidad = cantidadRaw ? Number(cantidadRaw) || 0 : 0;

        const isHeader = isHeaderRow(producto);

        if (isHeader) {
          // Update current subcategory based on header
          const lower = producto.toLowerCase();
          if (lower.includes("botellas")) currentSubcategory = "botellas_750";
          else if (lower.includes("botellines")) currentSubcategory = "botellines";
          else if (lower.includes("mixers latas")) currentSubcategory = "mixers_latas";
          else if (lower.includes("redbull")) currentSubcategory = "mixers_redbull";
          else if (lower.includes("jugos")) currentSubcategory = "jugos";
          else if (lower.includes("aguas")) currentSubcategory = "aguas";
          else if (lower.includes("bebidas 1,5") || lower.includes("bebidas 1.5")) currentSubcategory = "bebidas_1500";
        }

        const subcategoria = isHeader
          ? currentSubcategory
          : detectSubcategory(producto, formato) || currentSubcategory;

        parsedData.push({
          producto,
          formato,
          cantidad,
          subcategoria,
          isHeader,
          originalIndex: index,
        });
      });

      setPreviewData(parsedData);
      setPreviewOpen(true);
    } catch (error) {
      console.error("Error reading file:", error);
      toast.error("Error al leer el archivo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleConfirmImport = async (rows: StockImportRow[]) => {
    if (!venue?.id) {
      toast.error("Venue no disponible");
      return;
    }

    setIsProcessing(true);
    try {
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        if (row.isHeader || row.cantidad <= 0) continue;

        // Calculate total stock in ml/units based on format
        const totalQuantity = row.formato ? row.cantidad * row.formato : row.cantidad;
        const unit = row.subcategoria.includes("botellas") || row.subcategoria === "bebidas_1500" || row.subcategoria === "jugos" ? "ml" : "unidad";
        const category = unit === "ml" ? "ml" : "unidades";

        // Check if product exists
        const { data: existingProduct } = await supabase
          .from("products")
          .select("*")
          .eq("venue_id", venue.id)
          .ilike("name", row.producto)
          .maybeSingle();

        if (existingProduct) {
          // Update existing product stock and subcategory
          await supabase
            .from("products")
            .update({
              current_stock: existingProduct.current_stock + totalQuantity,
              subcategory: row.subcategoria,
            })
            .eq("id", existingProduct.id);
          updated++;
        } else {
          // Generate code for new product
          const { data: codeData } = await supabase.rpc("generate_product_code");

          // Determine if product is a mixer
          const isMixer = ["mixers_latas", "mixers_redbull", "jugos", "aguas", "bebidas_1500"].includes(row.subcategoria);

          // Create new product
          await supabase.from("products").insert({
            name: row.producto,
            code: codeData,
            current_stock: totalQuantity,
            category: category as "ml" | "gramos" | "unidades",
            unit,
            minimum_stock: 5,
            cost_per_unit: 0, // Will need to be updated manually
            subcategory: row.subcategoria,
            is_mixer: isMixer,
            is_active_in_sales: false, // Requires approval
            venue_id: venue.id,
          });
          created++;
        }
      }

      toast.success("Stock actualizado", {
        description: `${created} productos creados, ${updated} productos actualizados`,
      });

      setPreviewOpen(false);
      setPreviewData([]);
    } catch (error) {
      console.error("Error processing import:", error);
      toast.error("Error al procesar la importación");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Card className="glass-effect shadow-elegant">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Actualizar Stock desde Excel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg hover:border-primary transition-smooth">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Sube un archivo Excel con el inventario actual para actualizar el stock.
                Podrás revisar y editar los datos antes de confirmar.
              </p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
                id="excel-upload"
                disabled={uploading}
              />
              <label htmlFor="excel-upload">
                <Button asChild disabled={uploading} className="primary-gradient">
                  <span>
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Leyendo archivo...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Seleccionar Archivo
                      </>
                    )}
                  </span>
                </Button>
              </label>
            </div>

            <div className="flex items-center justify-center">
              <Button variant="outline" onClick={downloadTemplate} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Descargar Plantilla Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <StockImportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        data={previewData}
        onConfirm={handleConfirmImport}
        isProcessing={isProcessing}
      />
    </>
  );
};
