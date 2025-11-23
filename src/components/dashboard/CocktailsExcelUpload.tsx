import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Wine, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const CocktailsExcelUpload = () => {
  const [uploading, setUploading] = useState(false);

  const downloadTemplate = () => {
    // Datos de ejemplo para la plantilla
    const templateData = [
      {
        nombre: "Gin Tonic",
        precio: 6500,
        categoria: "Clásicos",
        descripcion: "Gin premium con tónica y limón"
      },
      {
        nombre: "Mojito",
        precio: 7000,
        categoria: "Refrescantes",
        descripcion: "Ron blanco, menta, lima y azúcar"
      },
      {
        nombre: "Piña Colada",
        precio: 8000,
        categoria: "Tropicales",
        descripcion: "Ron, crema de coco y jugo de piña"
      }
    ];

    // Crear libro de Excel
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cócteles");

    // Configurar ancho de columnas
    worksheet["!cols"] = [
      { wch: 20 }, // nombre
      { wch: 10 }, // precio
      { wch: 15 }, // categoria
      { wch: 40 }  // descripcion
    ];

    // Descargar archivo
    XLSX.writeFile(workbook, "plantilla_cocteles.xlsx");
    
    toast.success("Plantilla descargada", {
      description: "Usa este formato para actualizar la carta de cócteles"
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Simular procesamiento
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      toast.success("Carta de cócteles actualizada", {
        description: "Los cócteles se han actualizado correctamente",
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
          <Wine className="h-5 w-5 text-primary" />
          Actualizar Carta de Cócteles desde Excel
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-lg hover:border-primary transition-smooth">
            <Upload className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Sube un archivo Excel con la carta de cócteles para actualizar
              automáticamente el menú de ventas
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="cocktails-excel-upload"
              disabled={uploading}
            />
            <label htmlFor="cocktails-excel-upload">
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
