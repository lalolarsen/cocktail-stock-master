import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export const ExcelUpload = () => {
  const [uploading, setUploading] = useState(false);

  const downloadTemplate = () => {
    const templateData = [
      {
        nombre: "Ron Bacardi 750ml",
        cantidad: 10
      },
      {
        nombre: "Vodka Absolut 750ml",
        cantidad: 5
      },
      {
        nombre: "Gin Bombay 750ml",
        cantidad: 8
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock");

    worksheet["!cols"] = [
      { wch: 30 }, // nombre
      { wch: 10 }  // cantidad
    ];

    XLSX.writeFile(workbook, "plantilla_stock.xlsx");
    
    toast.success("Plantilla descargada", {
      description: "Usa este formato para actualizar el stock"
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
        nombre: string;
        cantidad: number;
      }>;

      let created = 0;
      let updated = 0;

      for (const row of jsonData) {
        if (!row.nombre || !row.cantidad) continue;

        // Buscar producto por nombre
        const { data: existingProduct } = await supabase
          .from("products")
          .select("*")
          .ilike("name", row.nombre)
          .maybeSingle();

        if (existingProduct) {
          // Actualizar stock existente
          await supabase
            .from("products")
            .update({
              current_stock: existingProduct.current_stock + row.cantidad
            })
            .eq("id", existingProduct.id);
          
          updated++;
        } else {
          // Generar código para nuevo producto
          const { data: codeData } = await supabase
            .rpc("generate_product_code");

          // Crear nuevo producto
          await supabase
            .from("products")
            .insert({
              name: row.nombre,
              code: codeData,
              current_stock: row.cantidad,
              category: "con_alcohol",
              unit: "ml",
              minimum_stock: 5
            });
          
          created++;
        }
      }
      
      toast.success("Stock actualizado", {
        description: `${created} productos creados, ${updated} productos actualizados`,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Error al procesar el archivo");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  return (
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
              Sube un archivo Excel con las compras de stock para actualizar
              automáticamente el inventario
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
                      Procesando...
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
            <Button 
              variant="outline" 
              onClick={downloadTemplate}
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar Plantilla Excel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
