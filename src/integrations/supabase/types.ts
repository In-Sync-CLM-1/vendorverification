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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_transactions: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["billing_category"]
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["billing_transaction_type"]
        }
        Insert: {
          amount: number
          category: Database["public"]["Enums"]["billing_category"]
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["billing_transaction_type"]
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["billing_category"]
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["billing_transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "billing_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      breach_notifications: {
        Row: {
          affected_vendor_ids: string[] | null
          contact_info: string
          description: string
          id: string
          impact: string
          remedial_steps: string
          tenant_id: string
          title: string
          triggered_at: string
          triggered_by: string
        }
        Insert: {
          affected_vendor_ids?: string[] | null
          contact_info: string
          description: string
          id?: string
          impact: string
          remedial_steps: string
          tenant_id: string
          title: string
          triggered_at?: string
          triggered_by: string
        }
        Update: {
          affected_vendor_ids?: string[] | null
          contact_info?: string
          description?: string
          id?: string
          impact?: string
          remedial_steps?: string
          tenant_id?: string
          title?: string
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "breach_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      category_documents: {
        Row: {
          category_id: string
          display_order: number | null
          document_type_id: string
          id: string
          is_mandatory: boolean
          tenant_id: string
        }
        Insert: {
          category_id: string
          display_order?: number | null
          document_type_id: string
          id?: string
          is_mandatory?: boolean
          tenant_id: string
        }
        Update: {
          category_id?: string
          display_order?: number | null
          document_type_id?: string
          id?: string
          is_mandatory?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_documents_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          consent_version: string
          consented_at: string
          created_at: string
          id: string
          ip_address: string | null
          purpose: string
          tenant_id: string
          user_agent: string | null
          user_identifier: string
          vendor_id: string | null
          withdrawn_at: string | null
        }
        Insert: {
          consent_version?: string
          consented_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          purpose?: string
          tenant_id: string
          user_agent?: string | null
          user_identifier: string
          vendor_id?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          consent_version?: string
          consented_at?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          purpose?: string
          tenant_id?: string
          user_agent?: string | null
          user_identifier?: string
          vendor_id?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          applied_at: string
          coupon_id: string
          id: string
          razorpay_payment_id: string | null
          tenant_id: string
        }
        Insert: {
          applied_at?: string
          coupon_id: string
          id?: string
          razorpay_payment_id?: string | null
          tenant_id: string
        }
        Update: {
          applied_at?: string
          coupon_id?: string
          id?: string
          razorpay_payment_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_percent: number
          id: string
          is_active: boolean
          max_uses: number | null
          times_used: number
          valid_from: string
          valid_until: string
        }
        Insert: {
          code: string
          created_at?: string
          discount_percent: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
          valid_from?: string
          valid_until: string
        }
        Update: {
          code?: string
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          times_used?: number
          valid_from?: string
          valid_until?: string
        }
        Relationships: []
      }
      data_requests: {
        Row: {
          admin_notes: string | null
          completed_at: string | null
          created_at: string
          due_date: string
          id: string
          request_type: string
          requested_by: string
          status: string
          tenant_id: string
          vendor_id: string
        }
        Insert: {
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          request_type: string
          requested_by: string
          status?: string
          tenant_id: string
          vendor_id: string
        }
        Update: {
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          request_type?: string
          requested_by?: string
          status?: string
          tenant_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      document_analyses: {
        Row: {
          ai_model_version: string | null
          analysis_status: string
          analyzed_at: string | null
          classification_confidence: number | null
          confidence_score: number | null
          created_at: string
          document_id: string
          document_type_detected: string | null
          error_message: string | null
          extracted_data: Json
          id: string
          tampering_indicators: Json
          tampering_score: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ai_model_version?: string | null
          analysis_status?: string
          analyzed_at?: string | null
          classification_confidence?: number | null
          confidence_score?: number | null
          created_at?: string
          document_id: string
          document_type_detected?: string | null
          error_message?: string | null
          extracted_data?: Json
          id?: string
          tampering_indicators?: Json
          tampering_score?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ai_model_version?: string | null
          analysis_status?: string
          analyzed_at?: string | null
          classification_confidence?: number | null
          confidence_score?: number | null
          created_at?: string
          document_id?: string
          document_type_detected?: string | null
          error_message?: string | null
          extracted_data?: Json
          id?: string
          tampering_indicators?: Json
          tampering_score?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_analyses_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "vendor_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_analyses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          accepted_formats: string[] | null
          created_at: string
          description: string | null
          has_expiry: boolean
          id: string
          max_file_size_mb: number | null
          name: string
          sample_url: string | null
          tenant_id: string
        }
        Insert: {
          accepted_formats?: string[] | null
          created_at?: string
          description?: string | null
          has_expiry?: boolean
          id?: string
          max_file_size_mb?: number | null
          name: string
          sample_url?: string | null
          tenant_id: string
        }
        Update: {
          accepted_formats?: string[] | null
          created_at?: string
          description?: string | null
          has_expiry?: boolean
          id?: string
          max_file_size_mb?: number | null
          name?: string
          sample_url?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: Database["public"]["Enums"]["fraud_alert_type"]
          created_at: string
          description: string
          details: Json
          dismiss_reason: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          severity: Database["public"]["Enums"]["fraud_alert_severity"]
          status: Database["public"]["Enums"]["fraud_alert_status"]
          tenant_id: string
          title: string
          vendor_id: string
        }
        Insert: {
          alert_type: Database["public"]["Enums"]["fraud_alert_type"]
          created_at?: string
          description: string
          details?: Json
          dismiss_reason?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["fraud_alert_severity"]
          status?: Database["public"]["Enums"]["fraud_alert_status"]
          tenant_id: string
          title: string
          vendor_id: string
        }
        Update: {
          alert_type?: Database["public"]["Enums"]["fraud_alert_type"]
          created_at?: string
          description?: string
          details?: Json
          dismiss_reason?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["fraud_alert_severity"]
          status?: Database["public"]["Enums"]["fraud_alert_status"]
          tenant_id?: string
          title?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_alerts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string
          read_at: string | null
          recipient_id: string
          related_vendor_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_type?: string
          read_at?: string | null
          recipient_id: string
          related_vendor_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          read_at?: string | null
          recipient_id?: string
          related_vendor_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_vendor_id_fkey"
            columns: ["related_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_vendor_id_fkey"
            columns: ["related_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      org_subscriptions: {
        Row: {
          billing_cycle_end: string | null
          billing_cycle_start: string | null
          created_at: string
          id: string
          monthly_price: number
          plan: Database["public"]["Enums"]["subscription_plan"]
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
          vendor_limit: number
          vendors_used: number
        }
        Insert: {
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          created_at?: string
          id?: string
          monthly_price?: number
          plan?: Database["public"]["Enums"]["subscription_plan"]
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
          vendor_limit?: number
          vendors_used?: number
        }
        Update: {
          billing_cycle_end?: string | null
          billing_cycle_start?: string | null
          created_at?: string
          id?: string
          monthly_price?: number
          plan?: Database["public"]["Enums"]["subscription_plan"]
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          updated_at?: string
          vendor_limit?: number
          vendors_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_used: boolean
          otp_code: string
          phone_number: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean
          otp_code: string
          phone_number: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          otp_code?: string
          phone_number?: string
        }
        Relationships: []
      }
      otp_verifications: {
        Row: {
          attempts: number | null
          created_at: string | null
          expires_at: string
          id: string
          org_id: string | null
          otp_hash: string
          phone: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          expires_at: string
          id?: string
          org_id?: string | null
          otp_hash: string
          phone: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          org_id?: string | null
          otp_hash?: string
          phone?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      pii_access_log: {
        Row: {
          accessed_at: string
          column_name: string
          id: string
          purpose: string
          table_name: string
          tenant_id: string
          user_id: string
          vendor_id: string | null
        }
        Insert: {
          accessed_at?: string
          column_name: string
          id?: string
          purpose?: string
          table_name: string
          tenant_id: string
          user_id: string
          vendor_id?: string | null
        }
        Update: {
          accessed_at?: string
          column_name?: string
          id?: string
          purpose?: string
          table_name?: string
          tenant_id?: string
          user_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pii_access_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          department: string | null
          email: string
          email_encrypted: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          phone_encrypted: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email: string
          email_encrypted?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          phone_encrypted?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string
          email_encrypted?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          phone_encrypted?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      public_otp_verifications: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          identifier: string
          identifier_type: string
          ip_address: unknown
          max_attempts: number
          otp_code: string
          session_id: string
          tenant_id: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          identifier: string
          identifier_type: string
          ip_address?: unknown
          max_attempts?: number
          otp_code: string
          session_id?: string
          tenant_id?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          identifier?: string
          identifier_type?: string
          ip_address?: unknown
          max_attempts?: number
          otp_code?: string
          session_id?: string
          tenant_id?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_otp_verifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_referral_codes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          referral_code: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          referral_code: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          referral_code?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_referral_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          description: string | null
          id: Database["public"]["Enums"]["subscription_plan"]
          is_active: boolean
          monthly_price: number
          name: string
          vendor_limit: number
        }
        Insert: {
          description?: string | null
          id: Database["public"]["Enums"]["subscription_plan"]
          is_active?: boolean
          monthly_price: number
          name: string
          vendor_limit: number
        }
        Update: {
          description?: string | null
          id?: Database["public"]["Enums"]["subscription_plan"]
          is_active?: boolean
          monthly_price?: number
          name?: string
          vendor_limit?: number
        }
        Relationships: []
      }
      tenants: {
        Row: {
          accent_color: string | null
          created_at: string
          dpo_email: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          primary_color: string | null
          privacy_policy_url: string | null
          short_name: string
          slug: string
          support_email: string | null
          support_phone: string | null
          updated_at: string
          vendor_code_prefix: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          dpo_email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string | null
          privacy_policy_url?: string | null
          short_name: string
          slug: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          vendor_code_prefix?: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          dpo_email?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          privacy_policy_url?: string | null
          short_name?: string
          slug?: string
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          vendor_code_prefix?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_documents: {
        Row: {
          created_at: string
          document_type_id: string
          expiry_date: string | null
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          review_comments: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["document_status"]
          tenant_id: string
          updated_at: string
          vendor_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          document_type_id: string
          expiry_date?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          tenant_id: string
          updated_at?: string
          vendor_id: string
          version_number?: number
        }
        Update: {
          created_at?: string
          document_type_id?: string
          expiry_date?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          review_comments?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          tenant_id?: string
          updated_at?: string
          vendor_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_invitations: {
        Row: {
          category_id: string
          company_name: string
          contact_email: string
          contact_phone: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          tenant_id: string
          token: string
          used_at: string | null
          vendor_id: string | null
        }
        Insert: {
          category_id: string
          company_name: string
          contact_email: string
          contact_phone: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          tenant_id: string
          token: string
          used_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          category_id?: string
          company_name?: string
          contact_email?: string
          contact_phone?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          tenant_id?: string
          token?: string
          used_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invitations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invitations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_invoice_payments: {
        Row: {
          advance_adjusted: number
          created_at: string
          gst_amount: number
          id: string
          invoice_id: string
          is_full_settlement: boolean
          payment_date: string
          payout_amount: number
          recorded_by: string | null
          remarks: string | null
          tds_amount: number
          tenant_id: string
          total_settled: number | null
          utr_reference: string | null
          vendor_id: string
        }
        Insert: {
          advance_adjusted?: number
          created_at?: string
          gst_amount?: number
          id?: string
          invoice_id: string
          is_full_settlement?: boolean
          payment_date?: string
          payout_amount?: number
          recorded_by?: string | null
          remarks?: string | null
          tds_amount?: number
          tenant_id: string
          total_settled?: number | null
          utr_reference?: string | null
          vendor_id: string
        }
        Update: {
          advance_adjusted?: number
          created_at?: string
          gst_amount?: number
          id?: string
          invoice_id?: string
          is_full_settlement?: boolean
          payment_date?: string
          payout_amount?: number
          recorded_by?: string | null
          remarks?: string | null
          tds_amount?: number
          tenant_id?: string
          total_settled?: number | null
          utr_reference?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "vendor_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoice_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_invoices: {
        Row: {
          created_at: string
          description: string | null
          gst_amount: number
          id: string
          invoice_amount: number
          invoice_date: string
          invoice_file_key: string
          invoice_number: string
          po_file_key: string | null
          po_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          submitted_by: string | null
          tenant_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          gst_amount?: number
          id?: string
          invoice_amount: number
          invoice_date: string
          invoice_file_key: string
          invoice_number: string
          po_file_key?: string | null
          po_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          submitted_by?: string | null
          tenant_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          gst_amount?: number
          id?: string
          invoice_amount?: number
          invoice_date?: string
          invoice_file_key?: string
          invoice_number?: string
          po_file_key?: string | null
          po_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          submitted_by?: string | null
          tenant_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_primary_contact: boolean
          last_login_at: string | null
          phone_number: string | null
          tenant_id: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary_contact?: boolean
          last_login_at?: string | null
          phone_number?: string | null
          tenant_id: string
          user_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary_contact?: boolean
          last_login_at?: string | null
          phone_number?: string | null
          tenant_id?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_users_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_users_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_verifications: {
        Row: {
          created_at: string
          id: string
          remarks: string | null
          request_data: Json | null
          response_data: Json | null
          status: string
          tenant_id: string
          updated_at: string
          vendor_id: string
          verification_source: string
          verification_type: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          remarks?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
          vendor_id: string
          verification_source?: string
          verification_type: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          remarks?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
          vendor_id?: string
          verification_source?: string
          verification_type?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_verifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_verifications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_verifications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          approved_at: string | null
          bank_account_number: string | null
          bank_account_number_encrypted: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_ifsc_encrypted: string | null
          bank_name: string | null
          category_id: string
          cin_number: string | null
          cin_number_encrypted: string | null
          company_name: string
          constitution_type: string | null
          created_at: string
          current_status: Database["public"]["Enums"]["vendor_status"]
          gst_number: string | null
          gst_number_encrypted: string | null
          id: string
          nominee_contact: string | null
          nominee_contact_encrypted: string | null
          nominee_name: string | null
          operational_address: string | null
          pan_number: string | null
          pan_number_encrypted: string | null
          primary_contact_name: string
          primary_email: string
          primary_email_encrypted: string | null
          primary_mobile: string
          primary_mobile_encrypted: string | null
          referred_by: string | null
          registered_address: string | null
          rejected_at: string | null
          rejection_reason: string | null
          salutation: string | null
          secondary_contact_name: string | null
          secondary_mobile: string | null
          secondary_mobile_encrypted: string | null
          sent_back_reason: string | null
          submitted_at: string | null
          tenant_id: string
          trade_name: string | null
          updated_at: string
          vendor_code: string | null
        }
        Insert: {
          approved_at?: string | null
          bank_account_number?: string | null
          bank_account_number_encrypted?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_ifsc_encrypted?: string | null
          bank_name?: string | null
          category_id: string
          cin_number?: string | null
          cin_number_encrypted?: string | null
          company_name: string
          constitution_type?: string | null
          created_at?: string
          current_status?: Database["public"]["Enums"]["vendor_status"]
          gst_number?: string | null
          gst_number_encrypted?: string | null
          id?: string
          nominee_contact?: string | null
          nominee_contact_encrypted?: string | null
          nominee_name?: string | null
          operational_address?: string | null
          pan_number?: string | null
          pan_number_encrypted?: string | null
          primary_contact_name: string
          primary_email: string
          primary_email_encrypted?: string | null
          primary_mobile: string
          primary_mobile_encrypted?: string | null
          referred_by?: string | null
          registered_address?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          salutation?: string | null
          secondary_contact_name?: string | null
          secondary_mobile?: string | null
          secondary_mobile_encrypted?: string | null
          sent_back_reason?: string | null
          submitted_at?: string | null
          tenant_id: string
          trade_name?: string | null
          updated_at?: string
          vendor_code?: string | null
        }
        Update: {
          approved_at?: string | null
          bank_account_number?: string | null
          bank_account_number_encrypted?: string | null
          bank_branch?: string | null
          bank_ifsc?: string | null
          bank_ifsc_encrypted?: string | null
          bank_name?: string | null
          category_id?: string
          cin_number?: string | null
          cin_number_encrypted?: string | null
          company_name?: string
          constitution_type?: string | null
          created_at?: string
          current_status?: Database["public"]["Enums"]["vendor_status"]
          gst_number?: string | null
          gst_number_encrypted?: string | null
          id?: string
          nominee_contact?: string | null
          nominee_contact_encrypted?: string | null
          nominee_name?: string | null
          operational_address?: string | null
          pan_number?: string | null
          pan_number_encrypted?: string | null
          primary_contact_name?: string
          primary_email?: string
          primary_email_encrypted?: string | null
          primary_mobile?: string
          primary_mobile_encrypted?: string | null
          referred_by?: string | null
          registered_address?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          salutation?: string | null
          secondary_contact_name?: string | null
          secondary_mobile?: string | null
          secondary_mobile_encrypted?: string | null
          sent_back_reason?: string | null
          submitted_at?: string | null
          tenant_id?: string
          trade_name?: string | null
          updated_at?: string
          vendor_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number | null
          created_at: string | null
          endpoint_id: string
          event: string
          id: string
          payload: Json
          response_status: number | null
          status: string | null
          vendor_id: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          endpoint_id: string
          event: string
          id?: string
          payload: Json
          response_status?: number | null
          status?: string | null
          vendor_id?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          endpoint_id?: string
          event?: string
          id?: string
          payload?: Json
          response_status?: number | null
          status?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string | null
          events: string[]
          id: string
          is_active: boolean | null
          name: string
          secret: string
          tenant_id: string
          url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          name: string
          secret: string
          tenant_id: string
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          name?: string
          secret?: string
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          created_at: string
          delivered_at: string | null
          direction: string
          error_message: string | null
          exotel_message_id: string | null
          id: string
          message_content: string | null
          phone_number: string
          read_at: string | null
          sent_at: string | null
          sent_by: string | null
          status: string | null
          template_name: string | null
          template_variables: Json | null
          tenant_id: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          direction: string
          error_message?: string | null
          exotel_message_id?: string | null
          id?: string
          message_content?: string | null
          phone_number: string
          read_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          template_name?: string | null
          template_variables?: Json | null
          tenant_id: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error_message?: string | null
          exotel_message_id?: string | null
          id?: string
          message_content?: string | null
          phone_number?: string
          read_at?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          template_name?: string | null
          template_variables?: Json | null
          tenant_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_settings: {
        Row: {
          created_at: string
          exotel_api_key: string | null
          exotel_api_token: string | null
          exotel_sid: string | null
          exotel_subdomain: string | null
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string
          waba_id: string | null
          whatsapp_source_number: string | null
        }
        Insert: {
          created_at?: string
          exotel_api_key?: string | null
          exotel_api_token?: string | null
          exotel_sid?: string | null
          exotel_subdomain?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_source_number?: string | null
        }
        Update: {
          created_at?: string
          exotel_api_key?: string | null
          exotel_api_token?: string | null
          exotel_sid?: string | null
          exotel_subdomain?: string | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_source_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean | null
          status: string | null
          template_name: string
          tenant_id: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          status?: string | null
          template_name: string
          tenant_id: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          status?: string | null
          template_name?: string
          tenant_id?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_assignments: {
        Row: {
          assigned_at: string
          assigned_to: string
          completed_at: string | null
          due_at: string | null
          id: string
          stage: Database["public"]["Enums"]["vendor_status"]
          tenant_id: string
          vendor_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_to: string
          completed_at?: string | null
          due_at?: string | null
          id?: string
          stage: Database["public"]["Enums"]["vendor_status"]
          tenant_id: string
          vendor_id: string
        }
        Update: {
          assigned_at?: string
          assigned_to?: string
          completed_at?: string | null
          due_at?: string | null
          id?: string
          stage?: Database["public"]["Enums"]["vendor_status"]
          tenant_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_assignments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_assignments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_history: {
        Row: {
          action: Database["public"]["Enums"]["workflow_action"]
          action_by: string
          comments: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["vendor_status"] | null
          id: string
          tenant_id: string
          time_in_stage_minutes: number | null
          to_status: Database["public"]["Enums"]["vendor_status"]
          vendor_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["workflow_action"]
          action_by: string
          comments?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["vendor_status"] | null
          id?: string
          tenant_id: string
          time_in_stage_minutes?: number | null
          to_status: Database["public"]["Enums"]["vendor_status"]
          vendor_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["workflow_action"]
          action_by?: string
          comments?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["vendor_status"] | null
          id?: string
          tenant_id?: string
          time_in_stage_minutes?: number | null
          to_status?: Database["public"]["Enums"]["vendor_status"]
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors_decrypted"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_decrypted: {
        Row: {
          created_at: string | null
          department: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          phone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      vendors_decrypted: {
        Row: {
          approved_at: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_ifsc: string | null
          bank_name: string | null
          category_id: string | null
          cin_number: string | null
          company_name: string | null
          constitution_type: string | null
          created_at: string | null
          current_status: Database["public"]["Enums"]["vendor_status"] | null
          gst_number: string | null
          id: string | null
          nominee_contact: string | null
          nominee_name: string | null
          operational_address: string | null
          pan_number: string | null
          primary_contact_name: string | null
          primary_email: string | null
          primary_mobile: string | null
          referred_by: string | null
          registered_address: string | null
          rejected_at: string | null
          rejection_reason: string | null
          salutation: string | null
          secondary_contact_name: string | null
          secondary_mobile: string | null
          sent_back_reason: string | null
          submitted_at: string | null
          trade_name: string | null
          updated_at: string | null
          vendor_code: string | null
        }
        Insert: {
          approved_at?: string | null
          bank_account_number?: never
          bank_branch?: string | null
          bank_ifsc?: never
          bank_name?: string | null
          category_id?: string | null
          cin_number?: never
          company_name?: string | null
          constitution_type?: string | null
          created_at?: string | null
          current_status?: Database["public"]["Enums"]["vendor_status"] | null
          gst_number?: never
          id?: string | null
          nominee_contact?: never
          nominee_name?: string | null
          operational_address?: string | null
          pan_number?: never
          primary_contact_name?: string | null
          primary_email?: never
          primary_mobile?: never
          referred_by?: string | null
          registered_address?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          salutation?: string | null
          secondary_contact_name?: string | null
          secondary_mobile?: never
          sent_back_reason?: string | null
          submitted_at?: string | null
          trade_name?: string | null
          updated_at?: string | null
          vendor_code?: string | null
        }
        Update: {
          approved_at?: string | null
          bank_account_number?: never
          bank_branch?: string | null
          bank_ifsc?: never
          bank_name?: string | null
          category_id?: string | null
          cin_number?: never
          company_name?: string | null
          constitution_type?: string | null
          created_at?: string | null
          current_status?: Database["public"]["Enums"]["vendor_status"] | null
          gst_number?: never
          id?: string | null
          nominee_contact?: never
          nominee_name?: string | null
          operational_address?: string | null
          pan_number?: never
          primary_contact_name?: string | null
          primary_email?: never
          primary_mobile?: never
          referred_by?: string | null
          registered_address?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          salutation?: string | null
          secondary_contact_name?: string | null
          secondary_mobile?: never
          sent_back_reason?: string | null
          submitted_at?: string | null
          trade_name?: string | null
          updated_at?: string | null
          vendor_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_staff_access_vendor: {
        Args: { _user_id: string; _vendor_id: string }
        Returns: boolean
      }
      check_encryption_key_exists: { Args: never; Returns: boolean }
      decrypt_pii: { Args: { ciphertext: string }; Returns: string }
      delete_organization: { Args: { _tenant_id: string }; Returns: Json }
      encrypt_pii: { Args: { plaintext: string }; Returns: string }
      extend_organization_trial: {
        Args: { _additional_days: number; _tenant_id: string }
        Returns: Json
      }
      find_vendor_by_contact: {
        Args: { p_identifier: string }
        Returns: {
          company_name: string
          current_status: Database["public"]["Enums"]["vendor_status"]
          tenant_id: string
          vendor_code: string
          vendor_id: string
        }[]
      }
      generate_referral_code: { Args: never; Returns: string }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      get_vendor_decrypted: { Args: { p_vendor_id: string }; Returns: Json }
      get_vendor_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_vendor_usage: { Args: { _tenant_id: string }; Returns: number }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_internal_staff: { Args: { _user_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id: string }; Returns: boolean }
      is_vendor_user: { Args: { _user_id: string }; Returns: boolean }
      set_organization_active: {
        Args: { _active: boolean; _tenant_id: string }
        Returns: Json
      }
      upsert_vault_secret: {
        Args: { secret_name: string; secret_value: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "maker" | "checker" | "approver" | "admin" | "platform_admin"
      billing_category:
        | "subscription_payment"
        | "free_trial_credit"
        | "refund"
        | "adjustment"
        | "gst"
        | "api_call"
      billing_transaction_type: "credit" | "debit"
      document_status:
        | "uploaded"
        | "under_review"
        | "approved"
        | "rejected"
        | "expired"
      fraud_alert_severity: "critical" | "high" | "medium" | "low"
      fraud_alert_status: "pending" | "reviewed" | "dismissed" | "confirmed"
      fraud_alert_type:
        | "duplicate_gst"
        | "duplicate_pan"
        | "duplicate_bank"
        | "similar_name"
        | "tampering"
        | "verification_failed"
      invoice_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "partially_paid"
        | "paid"
      subscription_plan:
        | "free_trial"
        | "starter"
        | "professional"
        | "enterprise"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
      vendor_status:
        | "draft"
        | "pending_review"
        | "in_verification"
        | "pending_approval"
        | "sent_back"
        | "approved"
        | "rejected"
        | "consent_withdrawn"
        | "deactivated"
        | "returned_to_maker"
      workflow_action:
        | "submitted"
        | "forwarded"
        | "approved"
        | "rejected"
        | "returned"
        | "assigned"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["maker", "checker", "approver", "admin", "platform_admin"],
      billing_category: [
        "subscription_payment",
        "free_trial_credit",
        "refund",
        "adjustment",
        "gst",
        "api_call",
      ],
      billing_transaction_type: ["credit", "debit"],
      document_status: [
        "uploaded",
        "under_review",
        "approved",
        "rejected",
        "expired",
      ],
      fraud_alert_severity: ["critical", "high", "medium", "low"],
      fraud_alert_status: ["pending", "reviewed", "dismissed", "confirmed"],
      fraud_alert_type: [
        "duplicate_gst",
        "duplicate_pan",
        "duplicate_bank",
        "similar_name",
        "tampering",
        "verification_failed",
      ],
      invoice_status: [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "partially_paid",
        "paid",
      ],
      subscription_plan: [
        "free_trial",
        "starter",
        "professional",
        "enterprise",
      ],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
      vendor_status: [
        "draft",
        "pending_review",
        "in_verification",
        "pending_approval",
        "sent_back",
        "approved",
        "rejected",
        "consent_withdrawn",
        "deactivated",
        "returned_to_maker",
      ],
      workflow_action: [
        "submitted",
        "forwarded",
        "approved",
        "rejected",
        "returned",
        "assigned",
      ],
    },
  },
} as const
