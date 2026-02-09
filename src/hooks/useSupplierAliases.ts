/**
 * Hook para aprendizaje de productos por proveedor
 * Memoriza matches de productos para auto-completar en futuras importaciones
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import type { TaxCategory } from "@/lib/purchase-calculator";

export interface SupplierAlias {
  id: string;
  venue_id: string;
  supplier_name: string;
  normalized_text: string;
  raw_examples: string[];
  product_id: string | null;
  pack_multiplier: number;
  pack_priced: boolean;
  tax_category: TaxCategory;
  confidence: number;
  times_seen: number;
  last_seen: string;
}

export interface MatchResult {
  line_id: string;
  matched_product_id: string | null;
  matched_product_name: string | null;
  pack_multiplier: number;
  pack_priced: boolean;
  tax_category: TaxCategory;
  confidence: number;
  match_source: "memory" | "fuzzy" | "none";
}

/**
 * Normaliza texto de factura para búsqueda
 * Remueve tildes, caracteres especiales, espacios extra
 * Mantiene tokens útiles como 6pcx4, 220cc, 350ml
 */
export function normalizeInvoiceText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^a-z0-9\s]/g, " ") // Solo letras, números, espacios
    .replace(/\s+/g, " ") // Múltiples espacios -> uno
    .trim();
}

export function useSupplierAliases() {
  const { venue } = useAppSession();
  const [isLoading, setIsLoading] = useState(false);
  const [aliases, setAliases] = useState<SupplierAlias[]>([]);

  /**
   * Carga aliases para un proveedor específico
   */
  const loadAliasesForSupplier = useCallback(async (supplierName: string) => {
    if (!venue?.id || !supplierName) return [];
    
    setIsLoading(true);
    try {
      const normalizedSupplier = normalizeInvoiceText(supplierName);
      
      const { data, error } = await supabase
        .from("supplier_product_aliases")
        .select("*")
        .eq("venue_id", venue.id)
        .ilike("supplier_name", `%${normalizedSupplier}%`);
      
      if (error) {
        console.error("Error loading supplier aliases:", error);
        return [];
      }
      
      const mapped = (data || []).map((row): SupplierAlias => ({
        id: row.id,
        venue_id: row.venue_id,
        supplier_name: row.supplier_name,
        normalized_text: row.normalized_text,
        raw_examples: (row.raw_examples as string[]) || [],
        product_id: row.product_id,
        pack_multiplier: row.pack_multiplier || 1,
        pack_priced: row.pack_priced || false,
        tax_category: (row.tax_category as TaxCategory) || "NONE",
        confidence: row.confidence || 0.5,
        times_seen: row.times_seen || 1,
        last_seen: row.last_seen,
      }));
      
      setAliases(mapped);
      return mapped;
    } catch (err) {
      console.error("Error in loadAliasesForSupplier:", err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [venue?.id]);

  /**
   * Busca alias exacto o similar para un texto de producto
   */
  const findMatch = useCallback((
    rawProductName: string,
    loadedAliases: SupplierAlias[],
    products: Array<{ id: string; name: string }>
  ): MatchResult => {
    const normalized = normalizeInvoiceText(rawProductName);
    
    // 1. Buscar coincidencia exacta en memoria
    const exactMatch = loadedAliases.find(a => a.normalized_text === normalized);
    if (exactMatch && exactMatch.product_id) {
      const product = products.find(p => p.id === exactMatch.product_id);
      return {
        line_id: "",
        matched_product_id: exactMatch.product_id,
        matched_product_name: product?.name || null,
        pack_multiplier: exactMatch.pack_multiplier,
        pack_priced: exactMatch.pack_priced,
        tax_category: exactMatch.tax_category,
        confidence: exactMatch.confidence,
        match_source: "memory",
      };
    }
    
    // 2. Buscar coincidencia parcial con alto overlap
    const partialMatches = loadedAliases.filter(a => {
      const aliasTokens = new Set(a.normalized_text.split(" "));
      const inputTokens = new Set(normalized.split(" "));
      const intersection = [...aliasTokens].filter(t => inputTokens.has(t));
      const similarity = intersection.length / Math.max(aliasTokens.size, inputTokens.size);
      return similarity >= 0.7 && a.product_id;
    });
    
    if (partialMatches.length > 0) {
      // Tomar el de mayor confianza
      const best = partialMatches.sort((a, b) => b.confidence - a.confidence)[0];
      const product = products.find(p => p.id === best.product_id);
      return {
        line_id: "",
        matched_product_id: best.product_id,
        matched_product_name: product?.name || null,
        pack_multiplier: best.pack_multiplier,
        pack_priced: best.pack_priced,
        tax_category: best.tax_category,
        confidence: best.confidence * 0.8, // Reducir confianza por ser parcial
        match_source: "memory",
      };
    }
    
    // 3. No hay match en memoria
    return {
      line_id: "",
      matched_product_id: null,
      matched_product_name: null,
      pack_multiplier: 1,
      pack_priced: false,
      tax_category: "NONE",
      confidence: 0,
      match_source: "none",
    };
  }, []);

  /**
   * Guarda/actualiza alias cuando el admin confirma el import
   */
  const learnFromConfirmation = useCallback(async (
    supplierName: string,
    lines: Array<{
      raw_product_name: string;
      product_id: string | null;
      pack_multiplier: number;
      pack_priced: boolean;
      tax_category: TaxCategory;
    }>
  ) => {
    if (!venue?.id || !supplierName) return;
    
    const normalizedSupplier = normalizeInvoiceText(supplierName);
    
    // Solo procesar líneas con producto asignado
    const linesToLearn = lines.filter(l => l.product_id);
    if (linesToLearn.length === 0) return;
    
    try {
      for (const line of linesToLearn) {
        const normalizedText = normalizeInvoiceText(line.raw_product_name);
        
        // Intentar upsert
        const { data: existing } = await supabase
          .from("supplier_product_aliases")
          .select("id, times_seen, confidence, raw_examples")
          .eq("venue_id", venue.id)
          .eq("supplier_name", normalizedSupplier)
          .eq("normalized_text", normalizedText)
          .single();
        
        if (existing) {
          // Update existing - incrementar confianza y times_seen
          const newConfidence = Math.min(1, (existing.confidence || 0.5) + 0.1);
          const rawExamples = (existing.raw_examples as string[]) || [];
          if (!rawExamples.includes(line.raw_product_name)) {
            rawExamples.push(line.raw_product_name);
          }
          
          await supabase
            .from("supplier_product_aliases")
            .update({
              product_id: line.product_id,
              pack_multiplier: line.pack_multiplier,
              pack_priced: line.pack_priced,
              tax_category: line.tax_category,
              confidence: newConfidence,
              times_seen: (existing.times_seen || 0) + 1,
              last_seen: new Date().toISOString(),
              raw_examples: rawExamples,
            })
            .eq("id", existing.id);
        } else {
          // Insert new
          await supabase
            .from("supplier_product_aliases")
            .insert({
              venue_id: venue.id,
              supplier_name: normalizedSupplier,
              normalized_text: normalizedText,
              raw_examples: [line.raw_product_name],
              product_id: line.product_id,
              pack_multiplier: line.pack_multiplier,
              pack_priced: line.pack_priced,
              tax_category: line.tax_category,
              confidence: 0.6,
              times_seen: 1,
              last_seen: new Date().toISOString(),
            });
        }
      }
      
      console.log(`[SupplierAliases] Learned ${linesToLearn.length} aliases for "${supplierName}"`);
    } catch (err) {
      console.error("Error learning from confirmation:", err);
    }
  }, [venue?.id]);

  return {
    isLoading,
    aliases,
    loadAliasesForSupplier,
    findMatch,
    learnFromConfirmation,
    normalizeText: normalizeInvoiceText,
  };
}
