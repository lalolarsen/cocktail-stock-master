import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface ErrorLogData {
  route: string;
  error_message: string;
  stack?: string;
  meta?: Json;
}

interface AuditEventData {
  action: string;
  status: "success" | "fail";
  metadata?: Json;
}

/**
 * Log an error to app_error_logs table
 */
export async function logError(data: ErrorLogData): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    let venueId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user.id)
        .single();
      venueId = profile?.venue_id || null;
    }

    await supabase.from("app_error_logs").insert([{
      venue_id: venueId,
      user_id: user?.id || null,
      route: data.route,
      error_message: data.error_message,
      stack: data.stack || null,
      meta: data.meta || {},
    }]);
  } catch (err) {
    // Fail silently - don't cause more errors while logging
    console.error("Failed to log error:", err);
  }
}

/**
 * Log an audit event to app_audit_events table
 */
export async function logAuditEvent(data: AuditEventData): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    let venueId: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("venue_id")
        .eq("id", user.id)
        .single();
      venueId = profile?.venue_id || null;
    }

    await supabase.from("app_audit_events").insert([{
      venue_id: venueId,
      user_id: user?.id || null,
      action: data.action,
      status: data.status,
      metadata: data.metadata || {},
    }]);
  } catch (err) {
    // Fail silently
    console.error("Failed to log audit event:", err);
  }
}

/**
 * Wrapper to log action with automatic success/fail tracking
 */
export async function withAuditLog<T>(
  action: string,
  fn: () => Promise<T>,
  getMetadata?: (result: T) => Json
): Promise<T> {
  try {
    const result = await fn();
    await logAuditEvent({
      action,
      status: "success",
      metadata: getMetadata ? getMetadata(result) : undefined,
    });
    return result;
  } catch (error) {
    await logAuditEvent({
      action,
      status: "fail",
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
