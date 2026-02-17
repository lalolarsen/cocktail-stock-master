export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          target_worker_id: string | null
          venue_id: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_worker_id?: string | null
          venue_id: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_worker_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_target_worker_id_fkey"
            columns: ["target_worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      app_audit_events: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          status: string
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          status: string
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          status?: string
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_audit_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      app_error_logs: {
        Row: {
          created_at: string
          error_message: string
          id: string
          meta: Json | null
          route: string
          stack: string | null
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          id?: string
          meta?: Json | null
          route: string
          stack?: string | null
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          id?: string
          meta?: Json | null
          route?: string
          stack?: string | null
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_error_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closing_cash: number | null
          created_at: string
          difference: number | null
          expected_cash: number | null
          id: string
          jornada_id: string
          opening_cash: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          closing_cash?: number | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          jornada_id: string
          opening_cash?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          closing_cash?: number | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          jornada_id?: string
          opening_cash?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: true
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      cocktail_addons: {
        Row: {
          addon_id: string
          cocktail_id: string
        }
        Insert: {
          addon_id: string
          cocktail_id: string
        }
        Update: {
          addon_id?: string
          cocktail_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cocktail_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "product_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocktail_addons_cocktail_id_fkey"
            columns: ["cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
        ]
      }
      cocktail_ingredients: {
        Row: {
          cocktail_id: string
          created_at: string | null
          id: string
          is_mixer_slot: boolean
          mixer_category: string | null
          product_id: string | null
          quantity: number
          venue_id: string
        }
        Insert: {
          cocktail_id: string
          created_at?: string | null
          id?: string
          is_mixer_slot?: boolean
          mixer_category?: string | null
          product_id?: string | null
          quantity: number
          venue_id: string
        }
        Update: {
          cocktail_id?: string
          created_at?: string | null
          id?: string
          is_mixer_slot?: boolean
          mixer_category?: string | null
          product_id?: string | null
          quantity?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cocktail_ingredients_cocktail_id_fkey"
            columns: ["cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocktail_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cocktail_ingredients_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      cocktails: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          price: number
          venue_id: string
          waste_ml_per_serving: number | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          price?: number
          venue_id: string
          waste_ml_per_serving?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          price?: number
          venue_id?: string
          waste_ml_per_serving?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cocktails_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_event_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json | null
          user_id: string | null
          user_role: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          user_id?: string | null
          user_role?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          user_id?: string | null
          user_role?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_event_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_feature_flags: {
        Row: {
          id: string
          is_enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
          venue_id: string
        }
        Insert: {
          id?: string
          is_enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          venue_id: string
        }
        Update: {
          id?: string
          is_enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_feature_flags_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_flag_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_enabled: boolean | null
          id: string
          key: string
          to_enabled: boolean
          venue_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_enabled?: boolean | null
          id?: string
          key: string
          to_enabled: boolean
          venue_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_enabled?: boolean | null
          id?: string
          key?: string
          to_enabled?: boolean
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_flag_audit_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_reset_audit: {
        Row: {
          deleted_rows: number
          developer_user_id: string
          executed_at: string
          id: number
          table_key: string
          table_name: string
          venue_id: string
        }
        Insert: {
          deleted_rows: number
          developer_user_id: string
          executed_at?: string
          id?: number
          table_key: string
          table_name: string
          venue_id: string
        }
        Update: {
          deleted_rows?: number
          developer_user_id?: string
          executed_at?: string
          id?: number
          table_key?: string
          table_name?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "developer_reset_audit_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_lines: {
        Row: {
          amount_net: number
          created_at: string
          description: string | null
          expense_type: string
          id: string
          purchase_id: string
          vat_amount: number
        }
        Insert: {
          amount_net?: number
          created_at?: string
          description?: string | null
          expense_type?: string
          id?: string
          purchase_id: string
          vat_amount?: number
        }
        Update: {
          amount_net?: number
          created_at?: string
          description?: string | null
          expense_type?: string
          id?: string
          purchase_id?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string
          description: string
          expense_category: string | null
          expense_type: string
          id: string
          jornada_id: string
          notes: string | null
          payment_method: string
          pos_id: string | null
          source_id: string | null
          source_type: string | null
          tax_type: string | null
          venue_id: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by: string
          description: string
          expense_category?: string | null
          expense_type: string
          id?: string
          jornada_id: string
          notes?: string | null
          payment_method?: string
          pos_id?: string | null
          source_id?: string | null
          source_type?: string | null
          tax_type?: string | null
          venue_id?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string
          expense_category?: string | null
          expense_type?: string
          id?: string
          jornada_id?: string
          notes?: string | null
          payment_method?: string
          pos_id?: string | null
          source_id?: string | null
          source_type?: string | null
          tax_type?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_pos_id_fkey"
            columns: ["pos_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags_master: {
        Row: {
          created_at: string
          default_enabled: boolean
          description: string | null
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          key: string
          name: string
        }
        Update: {
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          key?: string
          name?: string
        }
        Relationships: []
      }
      gross_income_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string | null
          id: string
          jornada_id: string | null
          source_id: string | null
          source_type: string
          venue_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          jornada_id?: string | null
          source_id?: string | null
          source_type: string
          venue_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          jornada_id?: string | null
          source_id?: string | null
          source_type?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gross_income_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gross_income_entries_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gross_income_entries_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      invoicing_config: {
        Row: {
          active_provider: string
          config: Json | null
          created_at: string
          id: string
          receipt_mode: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          active_provider?: string
          config?: Json | null
          created_at?: string
          id?: string
          receipt_mode?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          active_provider?: string
          config?: Json | null
          created_at?: string
          id?: string
          receipt_mode?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoicing_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_audit_log: {
        Row: {
          action: string
          actor_source: string
          actor_user_id: string | null
          created_at: string
          id: string
          jornada_id: string
          meta: Json | null
          reason: string | null
          venue_id: string | null
        }
        Insert: {
          action: string
          actor_source: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          jornada_id: string
          meta?: Json | null
          reason?: string | null
          venue_id?: string | null
        }
        Update: {
          action?: string
          actor_source?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          jornada_id?: string
          meta?: Json | null
          reason?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jornada_audit_log_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_audit_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_cash_closings: {
        Row: {
          cash_sales_total: number
          closing_cash_counted: number
          created_at: string
          created_by: string | null
          difference: number
          expected_cash: number
          id: string
          jornada_id: string
          notes: string | null
          opening_cash_amount: number
          pos_id: string
          venue_id: string | null
        }
        Insert: {
          cash_sales_total?: number
          closing_cash_counted?: number
          created_at?: string
          created_by?: string | null
          difference?: number
          expected_cash?: number
          id?: string
          jornada_id: string
          notes?: string | null
          opening_cash_amount?: number
          pos_id: string
          venue_id?: string | null
        }
        Update: {
          cash_sales_total?: number
          closing_cash_counted?: number
          created_at?: string
          created_by?: string | null
          difference?: number
          expected_cash?: number
          id?: string
          jornada_id?: string
          notes?: string | null
          opening_cash_amount?: number
          pos_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jornada_cash_closings_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_cash_closings_pos_id_fkey"
            columns: ["pos_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_cash_closings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_cash_openings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          jornada_id: string
          opening_cash_amount: number
          pos_id: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          jornada_id: string
          opening_cash_amount?: number
          pos_id: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          jornada_id?: string
          opening_cash_amount?: number
          pos_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jornada_cash_openings_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_cash_openings_pos_id_fkey"
            columns: ["pos_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_cash_openings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_cash_pos_defaults: {
        Row: {
          created_at: string
          default_amount: number
          id: string
          pos_id: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          default_amount?: number
          id?: string
          pos_id: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          default_amount?: number
          id?: string
          pos_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jornada_cash_pos_defaults_pos_id_fkey"
            columns: ["pos_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_cash_pos_defaults_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_cash_settings: {
        Row: {
          auto_close_enabled: boolean
          cash_opening_mode: string
          created_at: string
          default_opening_amount: number
          id: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          auto_close_enabled?: boolean
          cash_opening_mode?: string
          created_at?: string
          default_opening_amount?: number
          id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          auto_close_enabled?: boolean
          cash_opening_mode?: string
          created_at?: string
          default_opening_amount?: number
          id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jornada_cash_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_config: {
        Row: {
          activo: boolean
          created_at: string
          dia_semana: number
          hora_apertura: string
          hora_cierre: string
          id: string
          venue_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          dia_semana: number
          hora_apertura: string
          hora_cierre: string
          id?: string
          venue_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          dia_semana?: number
          hora_apertura?: string
          hora_cierre?: string
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornada_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_financial_summary: {
        Row: {
          cancelled_sales_total: number
          cancelled_transactions_count: number
          cash_difference: number | null
          cash_expenses: number | null
          cash_sales: number | null
          closed_at: string
          closed_by: string
          cogs_total: number | null
          cost_data_complete: boolean | null
          counted_cash: number | null
          created_at: string
          expected_cash: number | null
          expenses_by_type: Json
          expenses_total: number
          gross_margin: number | null
          gross_margin_pct: number | null
          gross_sales_total: number
          id: string
          jornada_id: string
          missing_cost_items: Json | null
          net_operational_result: number
          net_sales_total: number
          opening_cash: number | null
          pos_id: string | null
          pos_type: string | null
          sales_by_payment: Json
          tokens_cancelled_count: number | null
          tokens_expired_count: number | null
          tokens_issued_count: number | null
          tokens_pending_count: number | null
          tokens_redeemed_count: number | null
          transactions_count: number
          venue_id: string
        }
        Insert: {
          cancelled_sales_total?: number
          cancelled_transactions_count?: number
          cash_difference?: number | null
          cash_expenses?: number | null
          cash_sales?: number | null
          closed_at?: string
          closed_by: string
          cogs_total?: number | null
          cost_data_complete?: boolean | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          expenses_by_type?: Json
          expenses_total?: number
          gross_margin?: number | null
          gross_margin_pct?: number | null
          gross_sales_total?: number
          id?: string
          jornada_id: string
          missing_cost_items?: Json | null
          net_operational_result?: number
          net_sales_total?: number
          opening_cash?: number | null
          pos_id?: string | null
          pos_type?: string | null
          sales_by_payment?: Json
          tokens_cancelled_count?: number | null
          tokens_expired_count?: number | null
          tokens_issued_count?: number | null
          tokens_pending_count?: number | null
          tokens_redeemed_count?: number | null
          transactions_count?: number
          venue_id: string
        }
        Update: {
          cancelled_sales_total?: number
          cancelled_transactions_count?: number
          cash_difference?: number | null
          cash_expenses?: number | null
          cash_sales?: number | null
          closed_at?: string
          closed_by?: string
          cogs_total?: number | null
          cost_data_complete?: boolean | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          expenses_by_type?: Json
          expenses_total?: number
          gross_margin?: number | null
          gross_margin_pct?: number | null
          gross_sales_total?: number
          id?: string
          jornada_id?: string
          missing_cost_items?: Json | null
          net_operational_result?: number
          net_sales_total?: number
          opening_cash?: number | null
          pos_id?: string | null
          pos_type?: string | null
          sales_by_payment?: Json
          tokens_cancelled_count?: number | null
          tokens_expired_count?: number | null
          tokens_issued_count?: number | null
          tokens_pending_count?: number | null
          tokens_redeemed_count?: number | null
          transactions_count?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornada_financial_summary_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_financial_summary_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_financial_summary_pos_id_fkey"
            columns: ["pos_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_financial_summary_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      jornadas: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          forced_at: string | null
          forced_by_user_id: string | null
          forced_close: boolean
          forced_reason: string | null
          hora_apertura: string | null
          hora_cierre: string | null
          id: string
          nombre: string
          numero_jornada: number
          requires_review: boolean
          semana_inicio: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha: string
          forced_at?: string | null
          forced_by_user_id?: string | null
          forced_close?: boolean
          forced_reason?: string | null
          hora_apertura?: string | null
          hora_cierre?: string | null
          id?: string
          nombre?: string
          numero_jornada: number
          requires_review?: boolean
          semana_inicio: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          forced_at?: string | null
          forced_by_user_id?: string | null
          forced_close?: boolean
          forced_reason?: string | null
          hora_apertura?: string | null
          hora_cierre?: string | null
          id?: string
          nombre?: string
          numero_jornada?: number
          requires_review?: boolean
          semana_inicio?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornadas_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_product_mappings: {
        Row: {
          confidence: number
          created_at: string
          detected_multiplier: number
          id: string
          last_used_at: string
          product_id: string
          raw_text: string
          supplier_rut: string | null
          times_used: number
          venue_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          detected_multiplier?: number
          id?: string
          last_used_at?: string
          product_id: string
          raw_text: string
          supplier_rut?: string | null
          times_used?: number
          venue_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          detected_multiplier?: number
          id?: string
          last_used_at?: string
          product_id?: string
          raw_text?: string
          supplier_rut?: string | null
          times_used?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_product_mappings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip_address: string | null
          rut_code: string
          success: boolean
          user_agent: string | null
          venue_id: string | null
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          rut_code: string
          success?: boolean
          user_agent?: string | null
          venue_id?: string | null
        }
        Update: {
          attempted_at?: string
          id?: string
          ip_address?: string | null
          rut_code?: string
          success?: boolean
          user_agent?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "login_attempts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          id: string
          ip_address: string | null
          jornada_id: string | null
          login_at: string
          user_agent: string | null
          user_id: string
          venue_id: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          jornada_id?: string | null
          login_at?: string
          user_agent?: string | null
          user_id: string
          venue_id: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          jornada_id?: string | null
          login_at?: string
          user_agent?: string | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_history_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_history_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          created_at: string
          email_subject: string | null
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string
          jornada_id: string | null
          recipient_email: string
          recipient_worker_id: string | null
          sent_at: string | null
          status: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          email_subject?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          jornada_id?: string | null
          recipient_email: string
          recipient_worker_id?: string | null
          sent_at?: string | null
          status?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          email_subject?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          jornada_id?: string | null
          recipient_email?: string
          recipient_worker_id?: string | null
          sent_at?: string | null
          status?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_recipient_worker_id_fkey"
            columns: ["recipient_worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          is_enabled: boolean
          venue_id: string | null
          worker_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          is_enabled?: boolean
          venue_id?: string | null
          worker_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          is_enabled?: boolean
          venue_id?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          description: string | null
          expense_date: string
          id: string
          net_amount: number
          specific_tax_amount: number
          supplier_source: string
          tax_notes: string | null
          total_amount: number
          vat_amount: number
          vat_rate: number
          venue_id: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by: string
          description?: string | null
          expense_date: string
          id?: string
          net_amount?: number
          specific_tax_amount?: number
          supplier_source?: string
          tax_notes?: string | null
          total_amount?: number
          vat_amount?: number
          vat_rate?: number
          venue_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string | null
          expense_date?: string
          id?: string
          net_amount?: number
          specific_tax_amount?: number
          supplier_source?: string
          tax_notes?: string | null
          total_amount?: number
          vat_amount?: number
          vat_rate?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_expenses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_redemptions_log: {
        Row: {
          bartender_id: string
          created_at: string
          id: string
          metadata: Json | null
          pickup_token_id: string | null
          pos_id: string | null
          redeemed_at: string
          result: Database["public"]["Enums"]["redemption_result"]
          sale_id: string | null
          venue_id: string
        }
        Insert: {
          bartender_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          pickup_token_id?: string | null
          pos_id?: string | null
          redeemed_at?: string
          result: Database["public"]["Enums"]["redemption_result"]
          sale_id?: string | null
          venue_id: string
        }
        Update: {
          bartender_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          pickup_token_id?: string | null
          pos_id?: string | null
          redeemed_at?: string
          result?: Database["public"]["Enums"]["redemption_result"]
          sale_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_redemptions_log_pickup_token_id_fkey"
            columns: ["pickup_token_id"]
            isOneToOne: false
            referencedRelation: "pickup_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_redemptions_log_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_redemptions_log_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_tokens: {
        Row: {
          bar_location_id: string | null
          cover_cocktail_id: string | null
          cover_quantity: number | null
          created_at: string
          expires_at: string
          id: string
          issued_at: string
          jornada_id: string | null
          metadata: Json | null
          redeemed_at: string | null
          redeemed_by: string | null
          sale_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["pickup_token_status"]
          ticket_sale_id: string | null
          token: string
          venue_id: string | null
        }
        Insert: {
          bar_location_id?: string | null
          cover_cocktail_id?: string | null
          cover_quantity?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          issued_at?: string
          jornada_id?: string | null
          metadata?: Json | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          sale_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["pickup_token_status"]
          ticket_sale_id?: string | null
          token?: string
          venue_id?: string | null
        }
        Update: {
          bar_location_id?: string | null
          cover_cocktail_id?: string | null
          cover_quantity?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          issued_at?: string
          jornada_id?: string | null
          metadata?: Json | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          sale_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["pickup_token_status"]
          ticket_sale_id?: string | null
          token?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pickup_tokens_bar_location_id_fkey"
            columns: ["bar_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_tokens_cover_cocktail_id_fkey"
            columns: ["cover_cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_tokens_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_tokens_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_tokens_ticket_sale_id_fkey"
            columns: ["ticket_sale_id"]
            isOneToOne: false
            referencedRelation: "ticket_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_tokens_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_terminals: {
        Row: {
          business_type: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_cash_register: boolean
          location_id: string | null
          name: string
          pos_kind: string | null
          pos_type: string
          updated_at: string
          venue_id: string | null
          zone: string | null
        }
        Insert: {
          business_type?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_cash_register?: boolean
          location_id?: string | null
          name: string
          pos_kind?: string | null
          pos_type?: string
          updated_at?: string
          venue_id?: string | null
          zone?: string | null
        }
        Update: {
          business_type?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_cash_register?: boolean
          location_id?: string | null
          name?: string
          pos_kind?: string | null
          pos_type?: string
          updated_at?: string
          venue_id?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_terminals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_terminals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      product_addons: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price_modifier: number
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price_modifier?: number
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price_modifier?: number
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_addons_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      product_name_mappings: {
        Row: {
          created_at: string
          id: string
          normalized_name: string
          product_id: string
          raw_name: string
          updated_at: string
          usage_count: number | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_name: string
          product_id: string
          raw_name: string
          updated_at?: string
          usage_count?: number | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          normalized_name?: string
          product_id?: string
          raw_name?: string
          updated_at?: string
          usage_count?: number | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_name_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_name_mappings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          capacity_ml: number | null
          category: Database["public"]["Enums"]["product_category"]
          code: string
          cost_per_unit: number
          created_at: string | null
          current_stock: number
          id: string
          is_active_in_sales: boolean | null
          is_mixer: boolean | null
          minimum_stock: number
          name: string
          subcategory: string | null
          unit: string
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          capacity_ml?: number | null
          category: Database["public"]["Enums"]["product_category"]
          code: string
          cost_per_unit?: number
          created_at?: string | null
          current_stock?: number
          id?: string
          is_active_in_sales?: boolean | null
          is_mixer?: boolean | null
          minimum_stock?: number
          name: string
          subcategory?: string | null
          unit?: string
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          capacity_ml?: number | null
          category?: Database["public"]["Enums"]["product_category"]
          code?: string
          cost_per_unit?: number
          created_at?: string | null
          current_stock?: number
          id?: string
          is_active_in_sales?: boolean | null
          is_mixer?: boolean | null
          minimum_stock?: number
          name?: string
          subcategory?: string | null
          unit?: string
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          internal_email: string | null
          is_active: boolean | null
          notification_email: string | null
          point_of_sale: string | null
          rut_code: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          internal_email?: string | null
          is_active?: boolean | null
          notification_email?: string | null
          point_of_sale?: string | null
          rut_code?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          internal_email?: string | null
          is_active?: boolean | null
          notification_email?: string | null
          point_of_sale?: string | null
          rut_code?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_product_mappings: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          last_used_at: string | null
          product_id: string
          provider_name: string
          raw_product_name: string
          venue_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          product_id: string
          provider_name: string
          raw_product_name: string
          venue_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          product_id?: string
          provider_name?: string
          raw_product_name?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_product_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_product_mappings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_documents: {
        Row: {
          audit_trail: Json | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          document_date: string | null
          document_number: string | null
          extracted_data: Json | null
          file_path: string
          file_type: string
          id: string
          iva_amount: number | null
          net_amount: number | null
          provider_name: string | null
          provider_rut: string | null
          raw_text: string | null
          specific_tax_amount: number | null
          status: string
          total_amount: number | null
          total_amount_gross: number | null
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          audit_trail?: Json | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_date?: string | null
          document_number?: string | null
          extracted_data?: Json | null
          file_path: string
          file_type: string
          id?: string
          iva_amount?: number | null
          net_amount?: number | null
          provider_name?: string | null
          provider_rut?: string | null
          raw_text?: string | null
          specific_tax_amount?: number | null
          status?: string
          total_amount?: number | null
          total_amount_gross?: number | null
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          audit_trail?: Json | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_date?: string | null
          document_number?: string | null
          extracted_data?: Json | null
          file_path?: string
          file_type?: string
          id?: string
          iva_amount?: number | null
          net_amount?: number | null
          provider_name?: string | null
          provider_rut?: string | null
          raw_text?: string | null
          specific_tax_amount?: number | null
          status?: string
          total_amount?: number | null
          total_amount_gross?: number | null
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_documents_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_documents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_import_audit: {
        Row: {
          action: string
          created_at: string
          id: string
          new_state: Json | null
          previous_state: Json | null
          purchase_document_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          purchase_document_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          purchase_document_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_import_audit_purchase_document_id_fkey"
            columns: ["purchase_document_id"]
            isOneToOne: false
            referencedRelation: "purchase_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_import_drafts: {
        Row: {
          computed_lines: Json
          created_at: string
          discount_mode: string | null
          document_date: string | null
          document_number: string | null
          id: string
          iva_amount: number | null
          net_amount: number | null
          provider_name: string | null
          provider_rut: string | null
          purchase_document_id: string | null
          raw_extraction: Json | null
          status: string | null
          total_amount_gross: number | null
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          computed_lines?: Json
          created_at?: string
          discount_mode?: string | null
          document_date?: string | null
          document_number?: string | null
          id?: string
          iva_amount?: number | null
          net_amount?: number | null
          provider_name?: string | null
          provider_rut?: string | null
          purchase_document_id?: string | null
          raw_extraction?: Json | null
          status?: string | null
          total_amount_gross?: number | null
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          computed_lines?: Json
          created_at?: string
          discount_mode?: string | null
          document_date?: string | null
          document_number?: string | null
          id?: string
          iva_amount?: number | null
          net_amount?: number | null
          provider_name?: string | null
          provider_rut?: string | null
          purchase_document_id?: string | null
          raw_extraction?: Json | null
          status?: string | null
          total_amount_gross?: number | null
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_import_drafts_purchase_document_id_fkey"
            columns: ["purchase_document_id"]
            isOneToOne: false
            referencedRelation: "purchase_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_import_drafts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_import_lines: {
        Row: {
          classification: string
          cost_unit_net: number
          created_at: string
          detected_multiplier: number
          discount_pct: number | null
          id: string
          line_index: number
          line_total_net: number | null
          net_line_amount: number
          notes: string | null
          product_id: string | null
          purchase_import_id: string
          qty_invoiced: number | null
          raw_text: string | null
          status: string
          tax_amount: number
          tax_category_id: string | null
          tax_rate: number | null
          unit_price_net: number | null
          units_real: number
        }
        Insert: {
          classification?: string
          cost_unit_net?: number
          created_at?: string
          detected_multiplier?: number
          discount_pct?: number | null
          id?: string
          line_index?: number
          line_total_net?: number | null
          net_line_amount?: number
          notes?: string | null
          product_id?: string | null
          purchase_import_id: string
          qty_invoiced?: number | null
          raw_text?: string | null
          status?: string
          tax_amount?: number
          tax_category_id?: string | null
          tax_rate?: number | null
          unit_price_net?: number | null
          units_real?: number
        }
        Update: {
          classification?: string
          cost_unit_net?: number
          created_at?: string
          detected_multiplier?: number
          discount_pct?: number | null
          id?: string
          line_index?: number
          line_total_net?: number | null
          net_line_amount?: number
          notes?: string | null
          product_id?: string | null
          purchase_import_id?: string
          qty_invoiced?: number | null
          raw_text?: string | null
          status?: string
          tax_amount?: number
          tax_category_id?: string | null
          tax_rate?: number | null
          unit_price_net?: number | null
          units_real?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_import_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_import_lines_purchase_import_id_fkey"
            columns: ["purchase_import_id"]
            isOneToOne: false
            referencedRelation: "purchase_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_import_taxes: {
        Row: {
          created_at: string
          id: string
          purchase_import_id: string
          tax_amount: number
          tax_label: string
          tax_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          purchase_import_id: string
          tax_amount?: number
          tax_label: string
          tax_type: string
        }
        Update: {
          created_at?: string
          id?: string
          purchase_import_id?: string
          tax_amount?: number
          tax_label?: string
          tax_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_import_taxes_purchase_import_id_fkey"
            columns: ["purchase_import_id"]
            isOneToOne: false
            referencedRelation: "purchase_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_imports: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          document_date: string | null
          document_number: string | null
          financial_summary: Json | null
          iaba_10_total: number
          iaba_18_total: number
          id: string
          ila_cerveza_total: number
          ila_destilados_total: number
          ila_vino_total: number
          issues_count: number
          location_id: string
          net_subtotal: number | null
          raw_extraction_json: Json | null
          raw_file_url: string | null
          specific_taxes_total: number
          status: string
          supplier_name: string | null
          supplier_rut: string | null
          total_amount: number | null
          updated_at: string
          vat_amount: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date?: string | null
          document_number?: string | null
          financial_summary?: Json | null
          iaba_10_total?: number
          iaba_18_total?: number
          id?: string
          ila_cerveza_total?: number
          ila_destilados_total?: number
          ila_vino_total?: number
          issues_count?: number
          location_id: string
          net_subtotal?: number | null
          raw_extraction_json?: Json | null
          raw_file_url?: string | null
          specific_taxes_total?: number
          status?: string
          supplier_name?: string | null
          supplier_rut?: string | null
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          document_date?: string | null
          document_number?: string | null
          financial_summary?: Json | null
          iaba_10_total?: number
          iaba_18_total?: number
          id?: string
          ila_cerveza_total?: number
          ila_destilados_total?: number
          ila_vino_total?: number
          issues_count?: number
          location_id?: string
          net_subtotal?: number | null
          raw_extraction_json?: Json | null
          raw_file_url?: string | null
          specific_taxes_total?: number
          status?: string
          supplier_name?: string | null
          supplier_rut?: string | null
          total_amount?: number | null
          updated_at?: string
          vat_amount?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_imports_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_imports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          classification: string | null
          confirmed_quantity: number | null
          confirmed_unit_price: number | null
          conversion_factor: number | null
          created_at: string
          discount_amount: number | null
          discount_percent: number | null
          expense_category: string | null
          extracted_quantity: number | null
          extracted_total: number | null
          extracted_unit_price: number | null
          extracted_uom: string | null
          id: string
          is_confirmed: boolean | null
          item_status: string | null
          match_confidence: number | null
          matched_product_id: string | null
          normalized_quantity: number | null
          normalized_unit_cost: number | null
          purchase_document_id: string
          raw_product_name: string
          subtotal_before_discount: number | null
          tax_category: string | null
          tax_iaba_10: number | null
          tax_iaba_18: number | null
          tax_ila_cer: number | null
          tax_ila_lic: number | null
          tax_ila_vin: number | null
          venue_id: string | null
        }
        Insert: {
          classification?: string | null
          confirmed_quantity?: number | null
          confirmed_unit_price?: number | null
          conversion_factor?: number | null
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          expense_category?: string | null
          extracted_quantity?: number | null
          extracted_total?: number | null
          extracted_unit_price?: number | null
          extracted_uom?: string | null
          id?: string
          is_confirmed?: boolean | null
          item_status?: string | null
          match_confidence?: number | null
          matched_product_id?: string | null
          normalized_quantity?: number | null
          normalized_unit_cost?: number | null
          purchase_document_id: string
          raw_product_name: string
          subtotal_before_discount?: number | null
          tax_category?: string | null
          tax_iaba_10?: number | null
          tax_iaba_18?: number | null
          tax_ila_cer?: number | null
          tax_ila_lic?: number | null
          tax_ila_vin?: number | null
          venue_id?: string | null
        }
        Update: {
          classification?: string | null
          confirmed_quantity?: number | null
          confirmed_unit_price?: number | null
          conversion_factor?: number | null
          created_at?: string
          discount_amount?: number | null
          discount_percent?: number | null
          expense_category?: string | null
          extracted_quantity?: number | null
          extracted_total?: number | null
          extracted_unit_price?: number | null
          extracted_uom?: string | null
          id?: string
          is_confirmed?: boolean | null
          item_status?: string | null
          match_confidence?: number | null
          matched_product_id?: string | null
          normalized_quantity?: number | null
          normalized_unit_cost?: number | null
          purchase_document_id?: string
          raw_product_name?: string
          subtotal_before_discount?: number | null
          tax_category?: string | null
          tax_iaba_10?: number | null
          tax_iaba_18?: number | null
          tax_ila_cer?: number | null
          tax_ila_lic?: number | null
          tax_ila_vin?: number | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_document_id_fkey"
            columns: ["purchase_document_id"]
            isOneToOne: false
            referencedRelation: "purchase_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_lines: {
        Row: {
          cost_unit_net: number
          created_at: string
          id: string
          line_total_net: number
          product_id: string
          purchase_id: string
          units_real: number
        }
        Insert: {
          cost_unit_net: number
          created_at?: string
          id?: string
          line_total_net: number
          product_id: string
          purchase_id: string
          units_real: number
        }
        Update: {
          cost_unit_net?: number
          created_at?: string
          id?: string
          line_total_net?: number
          product_id?: string
          purchase_id?: string
          units_real?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          document_date: string | null
          document_number: string | null
          id: string
          location_id: string
          net_subtotal: number | null
          purchase_import_id: string | null
          supplier_name: string | null
          supplier_rut: string | null
          total_amount: number | null
          vat_credit: number | null
          venue_id: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_date?: string | null
          document_number?: string | null
          id?: string
          location_id: string
          net_subtotal?: number | null
          purchase_import_id?: string | null
          supplier_name?: string | null
          supplier_rut?: string | null
          total_amount?: number | null
          vat_credit?: number | null
          venue_id: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          document_date?: string | null
          document_number?: string | null
          id?: string
          location_id?: string
          net_subtotal?: number | null
          purchase_import_id?: string | null
          supplier_name?: string | null
          supplier_rut?: string | null
          total_amount?: number | null
          vat_credit?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_purchase_import_id_fkey"
            columns: ["purchase_import_id"]
            isOneToOne: true
            referencedRelation: "purchase_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishment_plan_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          replenishment_plan_id: string
          to_location_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          replenishment_plan_id: string
          to_location_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          replenishment_plan_id?: string
          to_location_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_plan_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_plan_items_replenishment_plan_id_fkey"
            columns: ["replenishment_plan_id"]
            isOneToOne: false
            referencedRelation: "replenishment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_plan_items_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_plan_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      replenishment_plans: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string
          id: string
          jornada_id: string | null
          name: string
          plan_date: string
          status: Database["public"]["Enums"]["replenishment_plan_status"]
          updated_at: string
          venue_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          jornada_id?: string | null
          name: string
          plan_date?: string
          status?: Database["public"]["Enums"]["replenishment_plan_status"]
          updated_at?: string
          venue_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          jornada_id?: string | null
          name?: string
          plan_date?: string
          status?: Database["public"]["Enums"]["replenishment_plan_status"]
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replenishment_plans_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replenishment_plans_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      resettable_tables: {
        Row: {
          created_at: string
          danger_level: number
          description: string | null
          is_enabled: boolean
          key: string
          sort_order: number
          table_name: string
        }
        Insert: {
          created_at?: string
          danger_level?: number
          description?: string | null
          is_enabled?: boolean
          key: string
          sort_order?: number
          table_name: string
        }
        Update: {
          created_at?: string
          danger_level?: number
          description?: string | null
          is_enabled?: boolean
          key?: string
          sort_order?: number
          table_name?: string
        }
        Relationships: []
      }
      sale_item_addons: {
        Row: {
          addon_id: string | null
          addon_name: string
          created_at: string | null
          id: string
          price_modifier: number
          sale_item_id: string
        }
        Insert: {
          addon_id?: string | null
          addon_name: string
          created_at?: string | null
          id?: string
          price_modifier?: number
          sale_item_id: string
        }
        Update: {
          addon_id?: string | null
          addon_name?: string
          created_at?: string | null
          id?: string
          price_modifier?: number
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_item_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "product_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_item_addons_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          cocktail_id: string
          created_at: string | null
          id: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
          venue_id: string
        }
        Insert: {
          cocktail_id: string
          created_at?: string | null
          id?: string
          quantity: number
          sale_id: string
          subtotal: number
          unit_price: number
          venue_id: string
        }
        Update: {
          cocktail_id?: string
          created_at?: string | null
          id?: string
          quantity?: number
          sale_id?: string
          subtotal?: number
          unit_price?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_cocktail_id_fkey"
            columns: ["cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          bar_location_id: string | null
          created_at: string | null
          id: string
          is_cancelled: boolean | null
          iva_debit_amount: number | null
          jornada_id: string
          net_amount: number | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: string
          point_of_sale: string
          pos_id: string
          receipt_source: string | null
          sale_category: string
          sale_number: string
          seller_id: string
          total_amount: number
          vat_rate: number | null
          venue_id: string
        }
        Insert: {
          bar_location_id?: string | null
          created_at?: string | null
          id?: string
          is_cancelled?: boolean | null
          iva_debit_amount?: number | null
          jornada_id: string
          net_amount?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: string
          point_of_sale: string
          pos_id: string
          receipt_source?: string | null
          sale_category?: string
          sale_number: string
          seller_id: string
          total_amount?: number
          vat_rate?: number | null
          venue_id: string
        }
        Update: {
          bar_location_id?: string | null
          created_at?: string | null
          id?: string
          is_cancelled?: boolean | null
          iva_debit_amount?: number | null
          jornada_id?: string
          net_amount?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: string
          point_of_sale?: string
          pos_id?: string
          receipt_source?: string | null
          sale_category?: string
          sale_number?: string
          seller_id?: string
          total_amount?: number
          vat_rate?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_bar_location_id_fkey"
            columns: ["bar_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pos_id_fkey"
            columns: ["pos_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_documents: {
        Row: {
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          error_message: string | null
          folio: string | null
          id: string
          idempotency_key: string | null
          issued_at: string | null
          last_attempt_at: string | null
          next_retry_at: string | null
          pdf_url: string | null
          provider: string
          provider_ref: string | null
          retry_count: number
          sale_id: string
          status: Database["public"]["Enums"]["document_status"]
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          error_message?: string | null
          folio?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          last_attempt_at?: string | null
          next_retry_at?: string | null
          pdf_url?: string | null
          provider?: string
          provider_ref?: string | null
          retry_count?: number
          sale_id: string
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          error_message?: string | null
          folio?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          last_attempt_at?: string | null
          next_retry_at?: string | null
          pdf_url?: string | null
          provider?: string
          provider_ref?: string | null
          retry_count?: number
          sale_id?: string
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      sidebar_config: {
        Row: {
          created_at: string
          external_path: string | null
          feature_flag: string | null
          icon_name: string
          id: string
          is_enabled: boolean
          menu_key: string
          menu_label: string
          role: string
          sort_order: number
          updated_at: string
          venue_id: string
          view_type: string
        }
        Insert: {
          created_at?: string
          external_path?: string | null
          feature_flag?: string | null
          icon_name?: string
          id?: string
          is_enabled?: boolean
          menu_key: string
          menu_label: string
          role: string
          sort_order?: number
          updated_at?: string
          venue_id: string
          view_type: string
        }
        Update: {
          created_at?: string
          external_path?: string | null
          feature_flag?: string | null
          icon_name?: string
          id?: string
          is_enabled?: boolean
          menu_key?: string
          menu_label?: string
          role?: string
          sort_order?: number
          updated_at?: string
          venue_id?: string
          view_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sidebar_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      specific_tax_categories: {
        Row: {
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          name: string
          rate_pct: number
          venue_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          name: string
          rate_pct?: number
          venue_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          name?: string
          rate_pct?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "specific_tax_categories_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          id: string
          is_read: boolean | null
          jornada_id: string | null
          message: string
          product_id: string | null
          venue_id: string
        }
        Insert: {
          alert_type?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          jornada_id?: string | null
          message: string
          product_id?: string | null
          venue_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          jornada_id?: string | null
          message?: string
          product_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          created_at: string
          id: string
          location_id: string
          product_id: string
          quantity: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          product_id: string
          quantity?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_intake_batches: {
        Row: {
          created_at: string
          created_by: string
          default_location_id: string | null
          id: string
          items_count: number
          notes: string | null
          total_amount: number
          total_net: number
          total_other_tax: number
          total_specific_tax: number
          total_vat: number
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          default_location_id?: string | null
          id?: string
          items_count?: number
          notes?: string | null
          total_amount?: number
          total_net?: number
          total_other_tax?: number
          total_specific_tax?: number
          total_vat?: number
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_location_id?: string | null
          id?: string
          items_count?: number
          notes?: string | null
          total_amount?: number
          total_net?: number
          total_other_tax?: number
          total_specific_tax?: number
          total_vat?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_intake_batches_default_location_id_fkey"
            columns: ["default_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_intake_batches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_intake_items: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          location_id: string
          net_unit_cost: number
          other_tax_unit: number
          product_id: string
          quantity: number
          specific_tax_unit: number
          tax_category_id: string | null
          total_line: number
          total_unit: number
          vat_unit: number
          venue_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          location_id: string
          net_unit_cost: number
          other_tax_unit?: number
          product_id: string
          quantity: number
          specific_tax_unit?: number
          tax_category_id?: string | null
          total_line?: number
          total_unit?: number
          vat_unit?: number
          venue_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          location_id?: string
          net_unit_cost?: number
          other_tax_unit?: number
          product_id?: string
          quantity?: number
          specific_tax_unit?: number
          tax_category_id?: string | null
          total_line?: number
          total_unit?: number
          vat_unit?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_intake_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_intake_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_intake_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_intake_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_intake_items_tax_category_id_fkey"
            columns: ["tax_category_id"]
            isOneToOne: false
            referencedRelation: "specific_tax_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_intake_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_location_minimums: {
        Row: {
          created_at: string
          id: string
          location_id: string
          minimum_stock: number
          product_id: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id: string
          minimum_stock?: number
          product_id: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string
          minimum_stock?: number
          product_id?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_location_minimums_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_location_minimums_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_location_minimums_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          type: Database["public"]["Enums"]["location_type"]
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lots: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_depleted: boolean
          location_id: string
          product_id: string
          quantity: number
          received_at: string
          source: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_depleted?: boolean
          location_id: string
          product_id: string
          quantity?: number
          received_at?: string
          source?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_depleted?: boolean
          location_id?: string
          product_id?: string
          quantity?: number
          received_at?: string
          source?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_lots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string | null
          from_location_id: string | null
          id: string
          jornada_id: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          pickup_token_id: string | null
          product_id: string | null
          quantity: number
          source_type: string | null
          specific_tax_amount: number | null
          stock_lot_id: string | null
          to_location_id: string | null
          total_cost_snapshot: number | null
          transfer_id: string | null
          unit_cost: number | null
          unit_cost_snapshot: number | null
          vat_amount: number | null
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          from_location_id?: string | null
          id?: string
          jornada_id?: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          pickup_token_id?: string | null
          product_id?: string | null
          quantity: number
          source_type?: string | null
          specific_tax_amount?: number | null
          stock_lot_id?: string | null
          to_location_id?: string | null
          total_cost_snapshot?: number | null
          transfer_id?: string | null
          unit_cost?: number | null
          unit_cost_snapshot?: number | null
          vat_amount?: number | null
          venue_id: string
        }
        Update: {
          created_at?: string | null
          from_location_id?: string | null
          id?: string
          jornada_id?: string | null
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          pickup_token_id?: string | null
          product_id?: string | null
          quantity?: number
          source_type?: string | null
          specific_tax_amount?: number | null
          stock_lot_id?: string | null
          to_location_id?: string | null
          total_cost_snapshot?: number | null
          transfer_id?: string | null
          unit_cost?: number | null
          unit_cost_snapshot?: number | null
          vat_amount?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_pickup_token_id_fkey"
            columns: ["pickup_token_id"]
            isOneToOne: false
            referencedRelation: "pickup_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_stock_lot_id_fkey"
            columns: ["stock_lot_id"]
            isOneToOne: false
            referencedRelation: "stock_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_predictions: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          predicted_consumption: number
          prediction_period: string
          product_id: string | null
          venue_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          predicted_consumption: number
          prediction_period: string
          product_id?: string | null
          venue_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          predicted_consumption?: number
          prediction_period?: string
          product_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_predictions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_predictions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          transfer_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          transfer_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          transfer_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          from_location_id: string
          id: string
          jornada_id: string | null
          notes: string | null
          to_location_id: string
          transferred_by: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          from_location_id: string
          id?: string
          jornada_id?: string | null
          notes?: string | null
          to_location_id: string
          transferred_by: string
          venue_id: string
        }
        Update: {
          created_at?: string
          from_location_id?: string
          id?: string
          jornada_id?: string | null
          notes?: string | null
          to_location_id?: string
          transferred_by?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_product_aliases: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          last_seen: string | null
          normalized_text: string
          pack_multiplier: number | null
          pack_priced: boolean | null
          product_id: string | null
          raw_examples: Json | null
          supplier_name: string
          tax_category: string | null
          times_seen: number | null
          updated_at: string | null
          venue_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          last_seen?: string | null
          normalized_text: string
          pack_multiplier?: number | null
          pack_priced?: boolean | null
          product_id?: string | null
          raw_examples?: Json | null
          supplier_name: string
          tax_category?: string | null
          times_seen?: number | null
          updated_at?: string | null
          venue_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          last_seen?: string | null
          normalized_text?: string
          pack_multiplier?: number | null
          pack_priced?: boolean | null
          product_id?: string | null
          raw_examples?: Json | null
          supplier_name?: string
          tax_category?: string | null
          times_seen?: number | null
          updated_at?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_product_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_product_aliases_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sale_items: {
        Row: {
          created_at: string | null
          id: string
          line_total: number
          quantity: number
          ticket_sale_id: string
          ticket_type_id: string
          unit_price: number
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_total: number
          quantity: number
          ticket_sale_id: string
          ticket_type_id: string
          unit_price: number
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          line_total?: number
          quantity?: number
          ticket_sale_id?: string
          ticket_type_id?: string
          unit_price?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sale_items_ticket_sale_id_fkey"
            columns: ["ticket_sale_id"]
            isOneToOne: false
            referencedRelation: "ticket_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sale_items_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sale_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sales: {
        Row: {
          created_at: string | null
          id: string
          jornada_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: string
          pos_id: string | null
          sold_by_worker_id: string
          ticket_number: string
          total: number
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          jornada_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: string
          pos_id?: string | null
          sold_by_worker_id: string
          ticket_number: string
          total: number
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          jornada_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: string
          pos_id?: string | null
          sold_by_worker_id?: string
          ticket_number?: string
          total?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sales_jornada_id_fkey"
            columns: ["jornada_id"]
            isOneToOne: false
            referencedRelation: "jornadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sales_pos_id_fkey"
            columns: ["pos_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sales_sold_by_worker_id_fkey"
            columns: ["sold_by_worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_sales_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          cover_cocktail_id: string | null
          cover_quantity: number | null
          created_at: string | null
          id: string
          includes_cover: boolean | null
          is_active: boolean | null
          name: string
          price: number
          venue_id: string
        }
        Insert: {
          cover_cocktail_id?: string | null
          cover_quantity?: number | null
          created_at?: string | null
          id?: string
          includes_cover?: boolean | null
          is_active?: boolean | null
          name: string
          price: number
          venue_id: string
        }
        Update: {
          cover_cocktail_id?: string | null
          cover_quantity?: number | null
          created_at?: string | null
          id?: string
          includes_cover?: boolean | null
          is_active?: boolean | null
          name?: string
          price?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_cover_cocktail_id_fkey"
            columns: ["cover_cocktail_id"]
            isOneToOne: false
            referencedRelation: "cocktails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_types_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_venue_roles: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_venue_roles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_feature_flags: {
        Row: {
          enabled: boolean
          flag_key: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          enabled: boolean
          flag_key: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          enabled?: boolean
          flag_key?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_feature_flags_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags_master"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "venue_feature_flags_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_demo: boolean
          max_bars: number
          max_pos: number
          name: string
          onboarding_completed: boolean
          onboarding_step: number
          plan_type: string
          settings: Json | null
          slug: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          max_bars?: number
          max_pos?: number
          name: string
          onboarding_completed?: boolean
          onboarding_step?: number
          plan_type?: string
          settings?: Json | null
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          max_bars?: number
          max_pos?: number
          name?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          plan_type?: string
          settings?: Json | null
          slug?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      worker_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          venue_id: string | null
          worker_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          venue_id?: string | null
          worker_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          venue_id?: string | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_roles_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_roles_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_stock_lot: {
        Args: {
          p_expires_at: string
          p_location_id: string
          p_product_id: string
          p_quantity: number
          p_source?: string
          p_venue_id: string
        }
        Returns: Json
      }
      apply_replenishment_plan: { Args: { p_plan_id: string }; Returns: Json }
      check_jornada_cost_completeness: {
        Args: { p_jornada_id: string }
        Returns: {
          is_complete: boolean
          missing_items: Json
          total_cogs: number
        }[]
      }
      check_token_mixer_requirements: {
        Args: { p_token: string }
        Returns: Json
      }
      check_venue_limits: { Args: { p_venue_id: string }; Returns: Json }
      clean_berlin_demo_data: { Args: never; Returns: Json }
      close_jornada_manual: {
        Args: { p_cash_closings: Json; p_jornada_id: string }
        Returns: Json
      }
      close_jornada_with_summary: {
        Args: { p_jornada_id: string }
        Returns: Json
      }
      confirm_purchase_intake: {
        Args: { p_items: Json; p_purchase_document_id: string }
        Returns: Json
      }
      consume_stock_fefo: {
        Args: {
          p_allow_expired?: boolean
          p_jornada_id?: string
          p_location_id: string
          p_notes?: string
          p_pickup_token_id?: string
          p_product_id: string
          p_quantity: number
          p_source_type?: string
        }
        Returns: Json
      }
      create_ticket_sale_with_covers: {
        Args: {
          p_items: Json
          p_jornada_id?: string
          p_payment_method?: string
          p_pos_id?: string
          p_venue_id?: string
        }
        Returns: Json
      }
      dev_clean_venue_data: { Args: { p_venue_id: string }; Returns: Json }
      dev_expire_old_tokens: { Args: never; Returns: Json }
      dev_recalculate_jornada_summaries: {
        Args: { p_jornada_id: string }
        Returns: Json
      }
      dev_reset_flags_to_stable: { Args: { p_venue_id: string }; Returns: Json }
      dev_save_sidebar_config: {
        Args: { p_items: Json; p_role: string; p_venue_id: string }
        Returns: Json
      }
      dev_set_feature_flag: {
        Args: { p_is_enabled: boolean; p_key: string; p_venue_id: string }
        Returns: Json
      }
      developer_get_table_counts: {
        Args: { p_venue_id: string }
        Returns: Json
      }
      developer_reset_table: {
        Args: { p_table_key: string; p_venue_id: string }
        Returns: number
      }
      developer_reset_venue_operational: {
        Args: { p_venue_id: string }
        Returns: Json
      }
      enqueue_jornada_closed_notifications: {
        Args: { p_jornada_id: string }
        Returns: Json
      }
      factory_reset_non_demo: { Args: never; Returns: Json }
      force_close_jornada: {
        Args: { p_jornada_id: string; p_reason: string }
        Returns: Json
      }
      generate_jornada_financial_summaries: {
        Args: { p_closed_by: string; p_jornada_id: string }
        Returns: undefined
      }
      generate_pickup_token: { Args: { p_sale_id: string }; Returns: Json }
      generate_product_code: { Args: never; Returns: string }
      generate_qr_token: { Args: never; Returns: string }
      generate_sale_number: { Args: { p_pos_prefix?: string }; Returns: string }
      generate_ticket_number: { Args: never; Returns: string }
      get_active_jornada: { Args: never; Returns: string }
      get_active_jornada_for_venue: {
        Args: { p_venue_id: string }
        Returns: string
      }
      get_berlin_venue_id: { Args: never; Returns: string }
      get_cost_of_sales_by_date_range: {
        Args: { p_from_date: string; p_to_date: string }
        Returns: {
          items_count: number
          products_count: number
          total_cost: number
        }[]
      }
      get_cost_of_sales_by_jornada: {
        Args: { p_jornada_id: string }
        Returns: {
          items_count: number
          products_count: number
          total_cost: number
        }[]
      }
      get_cost_of_sales_by_product: {
        Args: {
          p_from_date?: string
          p_jornada_id?: string
          p_to_date?: string
        }
        Returns: {
          avg_unit_cost: number
          product_id: string
          product_name: string
          total_cost: number
          total_quantity: number
        }[]
      }
      get_effective_flags: {
        Args: { p_venue_id: string }
        Returns: {
          description: string
          enabled: boolean
          flag_key: string
          flag_name: string
          is_overridden: boolean
        }[]
      }
      get_expiring_lots: {
        Args: { p_days_ahead?: number; p_venue_id: string }
        Returns: {
          days_until_expiry: number
          expires_at: string
          location_id: string
          location_name: string
          lot_id: string
          product_id: string
          product_name: string
          quantity: number
        }[]
      }
      get_open_jornada: { Args: never; Returns: Json }
      get_sidebar_config: {
        Args: { p_role: string; p_venue_id: string }
        Returns: Json
      }
      get_user_venue_id: { Args: never; Returns: string }
      get_venue_flags: {
        Args: { p_venue_id: string }
        Returns: {
          description: string
          enabled: boolean
          flag_key: string
          flag_name: string
        }[]
      }
      get_worker_by_rut: {
        Args: { p_rut_code: string; p_venue_id?: string }
        Returns: {
          email: string
          full_name: string
          id: string
          internal_email: string
          is_active: boolean
          roles: Database["public"]["Enums"]["app_role"][]
          rut_code: string
          venue_id: string
        }[]
      }
      get_worker_roles: {
        Args: { p_worker_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      initialize_warehouse_stock: { Args: never; Returns: undefined }
      inspect_jornada_payment_methods: {
        Args: { p_jornada_id: string }
        Returns: Json
      }
      is_account_locked: {
        Args: { p_rut_code: string; p_venue_id: string }
        Returns: boolean
      }
      is_feature_enabled: { Args: { flag_key: string }; Returns: boolean }
      is_product_sellable: { Args: { p_product_id: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_target_worker_id?: string
        }
        Returns: string
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_status: string
          p_user_id?: string
          p_venue_id?: string
        }
        Returns: string
      }
      log_purchase_audit: {
        Args: {
          p_action: string
          p_document_id: string
          p_new_state?: Json
          p_previous_state?: Json
        }
        Returns: string
      }
      migrate_stock_to_lots: { Args: never; Returns: Json }
      normalize_invoice_text: { Args: { input_text: string }; Returns: string }
      open_jornada_manual:
        | { Args: { p_cash_amounts?: Json }; Returns: Json }
        | { Args: { p_cash_amounts: Json; p_nombre?: string }; Returns: Json }
      record_login_attempt: {
        Args: {
          p_ip_address?: string
          p_rut_code: string
          p_success: boolean
          p_user_agent?: string
          p_venue_id: string
        }
        Returns: undefined
      }
      redeem_pickup_token:
        | {
            Args: { p_bartender_bar_id?: string; p_token: string }
            Returns: Json
          }
        | {
            Args: {
              p_bartender_bar_id?: string
              p_mixer_overrides?: Json
              p_token: string
            }
            Returns: Json
          }
      reset_demo_data: { Args: never; Returns: Json }
      reset_venue_data: {
        Args: { p_keep_user_ids?: string[]; p_venue_id: string }
        Returns: Json
      }
      reset_venue_flags: { Args: { p_venue_id: string }; Returns: undefined }
      seed_demo_data: { Args: never; Returns: Json }
      set_venue_flag: {
        Args: { p_enabled: boolean; p_flag_key: string; p_venue_id: string }
        Returns: undefined
      }
      start_jornada_with_cash: {
        Args: { p_cash_amounts?: Json; p_jornada_id: string }
        Returns: Json
      }
      transfer_stock: {
        Args: {
          p_from_location_id: string
          p_items: Json
          p_jornada_id?: string
          p_notes?: string
          p_to_location_id: string
        }
        Returns: Json
      }
      transfer_stock_fefo: {
        Args: {
          p_from_location_id: string
          p_jornada_id?: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_to_location_id: string
          p_transferred_by: string
        }
        Returns: Json
      }
      update_purchase_item_status: {
        Args: {
          p_classification?: string
          p_item_id: string
          p_product_id?: string
          p_status: string
        }
        Returns: undefined
      }
      validate_cocktail_cost: {
        Args: { p_cocktail_id: string }
        Returns: {
          is_valid: boolean
          missing_ingredients: string[]
          total_cost: number
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "vendedor"
        | "gerencia"
        | "bar"
        | "ticket_seller"
        | "developer"
      document_status: "pending" | "issued" | "failed" | "cancelled"
      document_type: "boleta" | "factura"
      location_type: "warehouse" | "bar"
      movement_type:
        | "entrada"
        | "salida"
        | "ajuste"
        | "compra"
        | "transfer_out"
        | "transfer_in"
      payment_method: "cash" | "debit" | "credit" | "transfer" | "card"
      pickup_token_status:
        | "issued"
        | "redeemed"
        | "expired"
        | "cancelled"
        | "pending"
      product_category: "ml" | "gramos" | "unidades"
      redemption_result:
        | "success"
        | "already_redeemed"
        | "expired"
        | "invalid"
        | "unpaid"
        | "cancelled"
        | "not_found"
        | "stock_error"
        | "timeout"
      replenishment_plan_status: "draft" | "applied" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "vendedor",
        "gerencia",
        "bar",
        "ticket_seller",
        "developer",
      ],
      document_status: ["pending", "issued", "failed", "cancelled"],
      document_type: ["boleta", "factura"],
      location_type: ["warehouse", "bar"],
      movement_type: [
        "entrada",
        "salida",
        "ajuste",
        "compra",
        "transfer_out",
        "transfer_in",
      ],
      payment_method: ["cash", "debit", "credit", "transfer", "card"],
      pickup_token_status: [
        "issued",
        "redeemed",
        "expired",
        "cancelled",
        "pending",
      ],
      product_category: ["ml", "gramos", "unidades"],
      redemption_result: [
        "success",
        "already_redeemed",
        "expired",
        "invalid",
        "unpaid",
        "cancelled",
        "not_found",
        "stock_error",
        "timeout",
      ],
      replenishment_plan_status: ["draft", "applied", "cancelled"],
    },
  },
} as const
