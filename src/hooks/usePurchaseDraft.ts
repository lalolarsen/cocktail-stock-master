/**
 * usePurchaseDraft - Draft Persistence Hook
 * 
 * Provides auto-save functionality for purchase import flow:
 * 1. Primary: Saves to DB (purchase_import_drafts table)
 * 2. Fallback: LocalStorage for safety
 * 
 * Key Features:
 * - Debounced auto-save (600ms)
 * - Hydration from DB or localStorage on mount
 * - Conflict resolution (DB takes priority)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSession } from "@/contexts/AppSessionContext";
import type { ComputedLine, DiscountMode } from "@/lib/purchase-calculator";
import { toast } from "sonner";

// LocalStorage key prefix
const LS_PREFIX = "purchase_import_draft:";

export interface DraftData {
  id: string;
  purchase_document_id: string | null;
  provider_name: string;
  provider_rut: string;
  document_number: string;
  document_date: string;
  net_amount: number;
  iva_amount: number;
  total_amount_gross: number;
  raw_extraction: Record<string, unknown> | null;
  computed_lines: ComputedLine[];
  discount_mode: DiscountMode;
  status: "draft" | "confirmed" | "abandoned";
  updated_at: string;
}

interface UsePurchaseDraftReturn {
  // State
  draftId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  
  // Methods
  initDraft: (purchaseDocId: string) => Promise<string>;
  loadDraft: (draftId: string) => Promise<DraftData | null>;
  saveDraft: (data: Partial<DraftData>) => Promise<void>;
  markConfirmed: () => Promise<void>;
  abandonDraft: () => Promise<void>;
  clearLocalStorage: () => void;
  
  // Current draft data
  currentDraft: DraftData | null;
}

export function usePurchaseDraft(): UsePurchaseDraftReturn {
  const { venue, user } = useAppSession();
  const [draftId, setDraftId] = useState<string | null>(null);
  const [currentDraft, setCurrentDraft] = useState<DraftData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Debounce timer ref
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pending save data ref (for debouncing)
  const pendingSaveRef = useRef<Partial<DraftData> | null>(null);
  
  /**
   * Save to localStorage (fallback)
   */
  const saveToLocalStorage = useCallback((id: string, data: Partial<DraftData>) => {
    try {
      const existing = localStorage.getItem(`${LS_PREFIX}${id}`);
      const merged = existing 
        ? { ...JSON.parse(existing), ...data, updated_at: new Date().toISOString() }
        : { ...data, id, updated_at: new Date().toISOString() };
      localStorage.setItem(`${LS_PREFIX}${id}`, JSON.stringify(merged));
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
  }, []);
  
  /**
   * Load from localStorage
   */
  const loadFromLocalStorage = useCallback((id: string): DraftData | null => {
    try {
      const data = localStorage.getItem(`${LS_PREFIX}${id}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }, []);
  
  /**
   * Clear localStorage for current draft
   */
  const clearLocalStorage = useCallback(() => {
    if (draftId) {
      localStorage.removeItem(`${LS_PREFIX}${draftId}`);
    }
  }, [draftId]);
  
  /**
   * Initialize a new draft
   */
  const initDraft = useCallback(async (purchaseDocId: string): Promise<string> => {
    if (!venue?.id || !user?.id) {
      throw new Error("Venue o usuario no disponible");
    }
    
    setIsLoading(true);
    try {
      // Check for existing draft for this document
      const { data: existing } = await supabase
        .from("purchase_import_drafts")
        .select("id")
        .eq("purchase_document_id", purchaseDocId)
        .eq("status", "draft")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      
      if (existing) {
        setDraftId(existing.id);
        return existing.id;
      }
      
      // Create new draft
      const { data: newDraft, error } = await supabase
        .from("purchase_import_drafts")
        .insert({
          venue_id: venue.id,
          user_id: user.id,
          purchase_document_id: purchaseDocId,
          status: "draft",
        })
        .select("id")
        .single();
      
      if (error) throw error;
      
      setDraftId(newDraft.id);
      return newDraft.id;
    } finally {
      setIsLoading(false);
    }
  }, [venue?.id, user?.id]);
  
  /**
   * Load existing draft
   */
  const loadDraft = useCallback(async (id: string): Promise<DraftData | null> => {
    setIsLoading(true);
    try {
      // Try DB first
      const { data: dbDraft, error } = await supabase
        .from("purchase_import_drafts")
        .select("*")
        .eq("id", id)
        .eq("status", "draft")
        .maybeSingle();
      
      if (error) {
        console.error("Error loading draft from DB:", error);
      }
      
      // If DB has data, use it
      if (dbDraft) {
        const draft: DraftData = {
          id: dbDraft.id,
          purchase_document_id: dbDraft.purchase_document_id,
          provider_name: dbDraft.provider_name || "",
          provider_rut: dbDraft.provider_rut || "",
          document_number: dbDraft.document_number || "",
          document_date: dbDraft.document_date || "",
          net_amount: Number(dbDraft.net_amount) || 0,
          iva_amount: Number(dbDraft.iva_amount) || 0,
          total_amount_gross: Number(dbDraft.total_amount_gross) || 0,
          raw_extraction: dbDraft.raw_extraction as Record<string, unknown> | null,
          computed_lines: (dbDraft.computed_lines as unknown as ComputedLine[]) || [],
          discount_mode: (dbDraft.discount_mode as DiscountMode) || "APPLY_TO_GROSS",
          status: dbDraft.status as "draft" | "confirmed" | "abandoned",
          updated_at: dbDraft.updated_at,
        };
        
        setDraftId(id);
        setCurrentDraft(draft);
        
        // Also save to localStorage as backup
        saveToLocalStorage(id, draft);
        
        return draft;
      }
      
      // Fallback to localStorage
      const localDraft = loadFromLocalStorage(id);
      if (localDraft) {
        setDraftId(id);
        setCurrentDraft(localDraft);
        
        // Sync to DB (use insert/update pattern for proper typing)
        if (venue?.id && user?.id) {
          // First try to check if it exists
          const { data: existingDraft } = await supabase
            .from("purchase_import_drafts")
            .select("id")
            .eq("id", localDraft.id)
            .maybeSingle();
          
          if (existingDraft) {
            // Update existing - use type assertion to bypass strict JSON type checking
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from("purchase_import_drafts") as any)
              .update({
                provider_name: localDraft.provider_name,
                provider_rut: localDraft.provider_rut,
                document_number: localDraft.document_number,
                document_date: localDraft.document_date,
                net_amount: localDraft.net_amount,
                iva_amount: localDraft.iva_amount,
                total_amount_gross: localDraft.total_amount_gross,
                raw_extraction: localDraft.raw_extraction,
                computed_lines: JSON.parse(JSON.stringify(localDraft.computed_lines)),
                discount_mode: localDraft.discount_mode,
                status: localDraft.status,
              })
              .eq("id", localDraft.id);
          } else {
            // Insert new - use type assertion to bypass strict JSON type checking
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from("purchase_import_drafts") as any)
              .insert({
                id: localDraft.id,
                venue_id: venue.id,
                user_id: user.id,
                provider_name: localDraft.provider_name,
                provider_rut: localDraft.provider_rut,
                document_number: localDraft.document_number,
                document_date: localDraft.document_date,
                net_amount: localDraft.net_amount,
                iva_amount: localDraft.iva_amount,
                total_amount_gross: localDraft.total_amount_gross,
                raw_extraction: localDraft.raw_extraction,
                computed_lines: JSON.parse(JSON.stringify(localDraft.computed_lines)),
                discount_mode: localDraft.discount_mode,
                status: localDraft.status,
              });
          }
        }
        
        toast.info("Draft restaurado desde almacenamiento local");
        return localDraft;
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [venue?.id, user?.id, saveToLocalStorage, loadFromLocalStorage]);
  
  /**
   * Debounced save to DB
   */
  const executeSave = useCallback(async () => {
    const dataToSave = pendingSaveRef.current;
    if (!dataToSave || !draftId) return;
    
    pendingSaveRef.current = null;
    setIsSaving(true);
    
    try {
      // Always save to localStorage first (fast, reliable)
      saveToLocalStorage(draftId, dataToSave);
      
      // Prepare data for DB (convert computed_lines to JSON-compatible)
      const dbData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      // Copy only known fields with proper type conversion
      if (dataToSave.provider_name !== undefined) dbData.provider_name = dataToSave.provider_name;
      if (dataToSave.provider_rut !== undefined) dbData.provider_rut = dataToSave.provider_rut;
      if (dataToSave.document_number !== undefined) dbData.document_number = dataToSave.document_number;
      if (dataToSave.document_date !== undefined) dbData.document_date = dataToSave.document_date;
      if (dataToSave.net_amount !== undefined) dbData.net_amount = dataToSave.net_amount;
      if (dataToSave.iva_amount !== undefined) dbData.iva_amount = dataToSave.iva_amount;
      if (dataToSave.total_amount_gross !== undefined) dbData.total_amount_gross = dataToSave.total_amount_gross;
      if (dataToSave.raw_extraction !== undefined) dbData.raw_extraction = dataToSave.raw_extraction;
      if (dataToSave.computed_lines !== undefined) {
        dbData.computed_lines = JSON.parse(JSON.stringify(dataToSave.computed_lines));
      }
      if (dataToSave.discount_mode !== undefined) dbData.discount_mode = dataToSave.discount_mode;
      
      // Then save to DB - use type assertion to bypass strict JSON type checking
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("purchase_import_drafts") as any)
        .update(dbData)
        .eq("id", draftId);
      
      if (error) {
        console.error("Error saving to DB:", error);
        // LocalStorage already saved as fallback
      } else {
        setLastSaved(new Date());
      }
      
      // Update local state
      setCurrentDraft(prev => prev ? { ...prev, ...dataToSave } : null);
    } finally {
      setIsSaving(false);
    }
  }, [draftId, saveToLocalStorage]);
  
  /**
   * Save draft (debounced)
   */
  const saveDraft = useCallback(async (data: Partial<DraftData>) => {
    if (!draftId) return;
    
    // Accumulate pending changes
    pendingSaveRef.current = {
      ...(pendingSaveRef.current || {}),
      ...data,
    };
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Schedule debounced save (600ms)
    saveTimeoutRef.current = setTimeout(executeSave, 600);
  }, [draftId, executeSave]);
  
  /**
   * Mark draft as confirmed
   */
  const markConfirmed = useCallback(async () => {
    if (!draftId) return;
    
    // Cancel any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    await supabase
      .from("purchase_import_drafts")
      .update({ status: "confirmed" })
      .eq("id", draftId);
    
    clearLocalStorage();
    setDraftId(null);
    setCurrentDraft(null);
  }, [draftId, clearLocalStorage]);
  
  /**
   * Abandon draft
   */
  const abandonDraft = useCallback(async () => {
    if (!draftId) return;
    
    // Cancel any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    await supabase
      .from("purchase_import_drafts")
      .update({ status: "abandoned" })
      .eq("id", draftId);
    
    clearLocalStorage();
    setDraftId(null);
    setCurrentDraft(null);
  }, [draftId, clearLocalStorage]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    draftId,
    isLoading,
    isSaving,
    lastSaved,
    initDraft,
    loadDraft,
    saveDraft,
    markConfirmed,
    abandonDraft,
    clearLocalStorage,
    currentDraft,
  };
}
