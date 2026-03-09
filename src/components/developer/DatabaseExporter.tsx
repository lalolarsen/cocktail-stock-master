import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function DatabaseExporter() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState("");

  const handleExport = async () => {
    setIsExporting(true);
    setProgress("Iniciando...");
    try {
      // 1. Get all tables
      const { data: tablesData, error: tablesError } = await supabase.rpc('dev_get_all_tables');
      if (tablesError) throw tablesError;

      const tables: string[] = (tablesData as any[] || []).map((t: any) => t.table_name as string);
      
      let sqlDump = "-- Exportación de base de datos (Datos)\n\n";

      for (const table of tables) {
        setProgress(`Exportando ${table}...`);
        
        let allRows: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: rows, error } = await supabase
            .from(table)
            .select('*')
            .range(from, from + pageSize - 1);
            
          if (error) {
            console.error(`Error fetching ${table}:`, error);
            // Si no podemos leer la tabla, simplemente la saltamos
            hasMore = false;
            continue;
          }

          if (rows && rows.length > 0) {
            allRows = allRows.concat(rows);
            from += pageSize;
            if (rows.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        if (allRows.length > 0) {
          sqlDump += `-- Datos para la tabla: ${table}\n`;
          
          for (const row of allRows) {
            const columns = Object.keys(row).map(c => `"${c}"`).join(', ');
            const values = Object.values(row).map(val => {
              if (val === null) return 'NULL';
              if (typeof val === 'number' || typeof val === 'boolean') return val;
              if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              return `'${String(val).replace(/'/g, "''")}'`;
            }).join(', ');
            
            sqlDump += `INSERT INTO public."${table}" (${columns}) VALUES (${values});\n`;
          }
          sqlDump += "\n";
        }
      }

      setProgress("Generando archivo...");
      
      const blob = new Blob([sqlDump], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_datos_${new Date().toISOString().slice(0,10)}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("Exportación completada exitosamente");
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error(`Error exportando: ${error.message}`);
    } finally {
      setIsExporting(false);
      setProgress("");
    }
  };

  return (
    <div className="p-4 border border-primary/30 rounded-lg space-y-3 bg-primary/5">
      <div>
        <h3 className="font-medium flex items-center gap-2 text-primary">
          <Database className="h-4 w-4" />
          Exportar Base de Datos (SQL)
        </h3>
        <p className="text-sm text-muted-foreground">
          Descarga un archivo SQL con todos los datos (INSERTs) de las tablas públicas. Ideal para respaldos rápidos.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button 
          onClick={handleExport}
          disabled={isExporting}
          className="gap-2"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {isExporting ? "Exportando..." : "Descargar Dump SQL"}
        </Button>
        {isExporting && <span className="text-xs text-muted-foreground font-mono">{progress}</span>}
      </div>
    </div>
  );
}