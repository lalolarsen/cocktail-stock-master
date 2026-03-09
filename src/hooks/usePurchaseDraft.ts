/**
 * usePurchaseDraft - Draft Persistence Hook (Stabilized)
 * 
 * Provides robust auto-save functionality for purchase import flow:
 * 1. Primary: Saves to DB (purchase_import_drafts table)
 * 2. Fallback: LocalStorage for safety
 * 3. Automatic URL sync with ?draft= parameter
 * 
 * Key Features:
 * - Creates draft BEFORE file upload begins
 * - Debounced auto-save (600ms)
 * - Hydration from DB or localStorage on mount
 * - Conflict resolution (DB takes priority)
 * - Specific error types for debugging
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { purchaseImportDraftsTable } from "@/lib/db-tables";
import { useAppSession } from "@/contexts/AppSessionContext";
import type { ComputedLine, DiscountMode } from "@/lib/purchase-calculator";
import { toast } from "sonner";

// Extended line type with memory info (compatible with draft storage)
interface ComputedLineWithMemory extends ComputedLine {
  match_source?: "memory" | "fuzzy" | "none";
  from_memory?: boolean;
}

// LocalStorage keys
const LS_DRAFT_ID_KEY = "purchase_import_draft_id";
const LS_DRAFT_DATA_PREFIX = "purchase_import_draft:";

// Error types for specific handling
export type DraftErrorType = 
  | "MISSING_DRAFT_ID"
  | "DRAFT_NOT_FOUND"
  | "NO_PERMISSION"
  | "FILE_NOT_FOUND"
  | "VENUE_MISSING"
  | "DB_ERROR"
  | "UNKNOWN";

export interface DraftError {
  type: DraftErrorType;
  message: string;
  canRetry: boolean;
}

export interface DraftData {
  id: string;
  venue_id: string;
  user_id: string;
  purchase_document_id: string | null;
  provider_name: string;
  provider_rut: string;
  document_number: string;
  document_date: string;
  net_amount: number;
  iva_amount: number;
  total_amount_gross: number;
  raw_extraction: Record<string, unknown> | null;
  computed_lines: ComputedLineWithMemory[];
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
  error: DraftError | null;
  
  // Lifecycle methods
  initializeDraft: () => Promise<string | null>;
  loadDraftById: (id: string) => Promise<DraftData | null>;
  autoHydrate: () => Promise<DraftData | null>;
  
  // CRUD methods
  saveDraft: (data: Partial<DraftData>) => void;
  linkDocument: (documentId: string) => Promise<void>;
  markConfirmed: () => Promise<void>;
  abandonDraft: () => Promise<void>;
  
  // Utils
  clearError: () => void;
  clearAll: () => void;
  
  // Current draft data
  currentDraft: DraftData | null;
}

export function usePurchaseDraft(): UsePurchaseDraftReturn {
  const { venue, user } = useAppSession();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [draftId, setDraftId] = useState<string | null>(null);
  const [currentDraft, setCurrentDraft] = useState<DraftData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<DraftError | null>(null);
  
  // Debounce timer ref
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Pending save data ref (for debouncing)
  const pendingSaveRef = useRef<Partial<DraftData> | null>(null);
  
  // =========================================================================
  // LOCAL STORAGE HELPERS
  // =========================================================================
  
  const saveToLocalStorage = useCallback((id: string, data: Partial<DraftData>) => {
    try {
      // Save draft ID for recovery
      localStorage.setItem(LS_DRAFT_ID_KEY, id);
      
      // Save draft data
      const existing = localStorage.getItem(`${LS_DRAFT_DATA_PREFIX}${id}`);
      const merged = existing 
        ? { ...JSON.parse(existing), ...data, updated_at: new Date().toISOString() }
        : { ...data, id, updated_at: new Date().toISOString() };
      localStorage.setItem(`${LS_DRAFT_DATA_PREFIX}${id}`, JSON.stringify(merged));
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
  }, []);
  
  const loadFromLocalStorage = useCallback((id: string): DraftData | null => {
    try {
      const data = localStorage.getItem(`${LS_DRAFT_DATA_PREFIX}${id}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }, []);
  
  const getSavedDraftId = useCallback((): string | null => {
    try {
      return localStorage.getItem(LS_DRAFT_ID_KEY);
    } catch {
      return null;
    }
  }, []);
  
  const clearLocalStorage = useCallback((id?: string) => {
    try {
      const targetId = id || draftId;
      if (targetId) {
        localStorage.removeItem(`${LS_DRAFT_DATA_PREFIX}${targetId}`);
      }
      localStorage.removeItem(LS_DRAFT_ID_KEY);
    } catch (e) {
      console.error("Error clearing localStorage:", e);
    }
  }, [draftId]);
  
  const clearAll = useCallback(() => {
    clearLocalStorage();
    setDraftId(null);
    setCurrentDraft(null);
    setError(null);
    setLastSaved(null);
  }, [clearLocalStorage]);
  
  // =========================================================================
  // ERROR HANDLING
  // =========================================================================
  
  const createError = (type: DraftErrorType, message: string, canRetry = true): DraftError => ({
    type,
    message,
    canRetry,
  });
  
  const clearError = useCallback(() => setError(null), []);
  
  // =========================================================================
  // DRAFT INITIALIZATION (BEFORE UPLOAD)
  // =========================================================================
  
  const initializeDraft = useCallback(async (): Promise<string | null> => {
    if (!venue?.id || !user?.id) {
      setError(createError("VENUE_MISSING", "Venue o usuario no disponible", false));
      return null;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Create new draft immediately
      const { data: newDraft, error: dbError } = await supabase
        .from("purchase_import_drafts")
        .insert({
          venue_id: venue.id,
          user_id: user.id,
          status: "draft",
          computed_lines: [],
        })
        .select("id")
        .single();
      
      if (dbError) {
        console.error("DB error creating draft:", dbError);
        setError(createError("DB_ERROR", `Error al crear borrador: ${dbError.message}`));
        return null;
      }
      
      const newId = newDraft.id;
      
      // Sync to localStorage
      localStorage.setItem(LS_DRAFT_ID_KEY, newId);
      saveToLocalStorage(newId, { id: newId, venue_id: venue.id, user_id: user.id, status: "draft" });
      
      // Update URL
      setSearchParams({ draft: newId });
      
      setDraftId(newId);
      setCurrentDraft({
        id: newId,
        venue_id: venue.id,
        user_id: user.id,
        purchase_document_id: null,
        provider_name: "",
        provider_rut: "",
        document_number: "",
        document_date: "",
        net_amount: 0,
        iva_amount: 0,
        total_amount_gross: 0,
        raw_extraction: null,
        computed_lines: [],
        discount_mode: "APPLY_TO_GROSS",
        status: "draft",
        updated_at: new Date().toISOString(),
      });
      
      return newId;
    } catch (e) {
      console.error("Error initializing draft:", e);
      setError(createError("UNKNOWN", "Error inesperado al crear borrador"));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [venue?.id, user?.id, setSearchParams, saveToLocalStorage]);
  
  // =========================================================================
  // DRAFT LOADING
  // =========================================================================
  
  const loadDraftById = useCallback(async (id: string): Promise<DraftData | null> => {
    if (!id) {
      setError(createError("MISSING_DRAFT_ID", "ID de borrador faltante"));
      return null;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Try DB first
      const { data: dbDraft, error: dbError } = await supabase
        .from("purchase_import_drafts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      
      if (dbError) {
        console.error("Error loading draft from DB:", dbError);
        // Don't fail yet - try localStorage
      }
      
      // If DB has data and is still a draft
      if (dbDraft) {
        if (dbDraft.status !== "draft") {
          setError(createError("DRAFT_NOT_FOUND", "Este borrador ya fue confirmado o abandonado", false));
          clearLocalStorage(id);
          return null;
        }
        
        // Check permission (same venue)
        if (venue?.id && dbDraft.venue_id !== venue.id) {
          setError(createError("NO_PERMISSION", "Sin permisos para este borrador", false));
          clearLocalStorage(id);
          return null;
        }
        
        const draft: DraftData = {
          id: dbDraft.id,
          venue_id: dbDraft.venue_id,
          user_id: dbDraft.user_id,
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
        
        // Sync to localStorage as backup
        saveToLocalStorage(id, draft);
        
        return draft;
      }
      
      // Fallback to localStorage
      const localDraft = loadFromLocalStorage(id);
      if (localDraft) {
        console.log("Restoring from localStorage fallback");
        setDraftId(id);
        setCurrentDraft(localDraft);
        
        // Try to sync back to DB
        if (venue?.id && user?.id) {
          try {
            await purchaseImportDraftsTable()
              .upsert({
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
                computed_lines: JSON.parse(JSON.stringify(localDraft.computed_lines || [])),
                discount_mode: localDraft.discount_mode,
                status: "draft",
              });
          } catch (e) {
            console.warn("Could not sync localStorage draft to DB:", e);
          }
        }
        
        toast.info("Borrador restaurado desde almacenamiento local");
        return localDraft;
      }
      
      // Draft not found anywhere
      setError(createError("DRAFT_NOT_FOUND", "Borrador no encontrado en base de datos"));
      clearLocalStorage(id);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [venue?.id, user?.id, saveToLocalStorage, loadFromLocalStorage, clearLocalStorage]);
  
  // =========================================================================
  // AUTO HYDRATION (on page load)
  // =========================================================================
  
  const autoHydrate = useCallback(async (): Promise<DraftData | null> => {
    // Priority 1: URL param
    const urlDraftId = searchParams.get("draft");
    if (urlDraftId) {
      return loadDraftById(urlDraftId);
    }
    
    // Priority 2: localStorage saved ID
    const savedDraftId = getSavedDraftId();
    if (savedDraftId) {
      // Update URL to match
      setSearchParams({ draft: savedDraftId });
      return loadDraftById(savedDraftId);
    }
    
    // No draft found - will need to create new one
    return null;
  }, [searchParams, setSearchParams, loadDraftById, getSavedDraftId]);
  
  // =========================================================================
  // LINK DOCUMENT TO DRAFT
  // =========================================================================
  
  const linkDocument = useCallback(async (documentId: string) => {
    if (!draftId) return;
    
    try {
      const { error: dbError } = await supabase
        .from("purchase_import_drafts")
        .update({ purchase_document_id: documentId })
        .eq("id", draftId);
      
      if (dbError) {
        console.error("Error linking document:", dbError);
      }
      
      // Update local state
      setCurrentDraft(prev => prev ? { ...prev, purchase_document_id: documentId } : null);
      saveToLocalStorage(draftId, { purchase_document_id: documentId });
    } catch (e) {
      console.error("Error linking document:", e);
    }
  }, [draftId, saveToLocalStorage]);
  
  // =========================================================================
  // DEBOUNCED SAVE
  // =========================================================================
  
  const executeSave = useCallback(async () => {
    const dataToSave = pendingSaveRef.current;
    if (!dataToSave || !draftId) return;
    
    pendingSaveRef.current = null;
    setIsSaving(true);
    
    try {
      // Always save to localStorage first (fast, reliable)
      saveToLocalStorage(draftId, dataToSave);
      
      // Prepare data for DB
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
      
      // Save to DB
      const { error: dbError } = await purchaseImportDraftsTable()
        .update(dbData)
        .eq("id", draftId);
      
      if (dbError) {
        console.error("Error saving to DB:", dbError);
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
  
  const saveDraft = useCallback((data: Partial<DraftData>) => {
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
  
  // =========================================================================
  // FINALIZATION
  // =========================================================================
  
  const markConfirmed = useCallback(async () => {
    if (!draftId) return;
    
    // Cancel any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    try {
      await supabase
        .from("purchase_import_drafts")
        .update({ status: "confirmed" })
        .eq("id", draftId);
    } catch (e) {
      console.error("Error marking draft as confirmed:", e);
    }
    
    clearLocalStorage(draftId);
    setDraftId(null);
    setCurrentDraft(null);
  }, [draftId, clearLocalStorage]);
  
  const abandonDraft = useCallback(async () => {
    if (!draftId) return;
    
    // Cancel any pending saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    try {
      await supabase
        .from("purchase_import_drafts")
        .update({ status: "abandoned" })
        .eq("id", draftId);
    } catch (e) {
      console.error("Error abandoning draft:", e);
    }
    
    clearLocalStorage(draftId);
    setDraftId(null);
    setCurrentDraft(null);
  }, [draftId, clearLocalStorage]);
  
  // =========================================================================
  // CLEANUP
  // =========================================================================
  
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
    error,
    initializeDraft,
    loadDraftById,
    autoHydrate,
    saveDraft,
    linkDocument,
    markConfirmed,
    abandonDraft,
    clearError,
    clearAll,
    currentDraft,
  };
}
