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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          actor_id: string
          created_at: string
          decision: string
          id: string
          target_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          decision: string
          id?: string
          target_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          decision?: string
          id?: string
          target_id?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          privacy_version: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          privacy_version?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      match_read_state: {
        Row: {
          last_read_at: string
          match_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          match_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_read_state_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          status: string
          user_high: string
          user_low: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          status?: string
          user_high: string
          user_low: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          status?: string
          user_high?: string
          user_low?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          client_message_id: string
          created_at: string
          id: string
          match_id: string
          sender_id: string
        }
        Insert: {
          body: string
          client_message_id: string
          created_at?: string
          id?: string
          match_id: string
          sender_id: string
        }
        Update: {
          body?: string
          client_message_id?: string
          created_at?: string
          id?: string
          match_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_media: {
        Row: {
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          moderated_at: string | null
          moderation_reason: string | null
          moderation_status: string
          position: number
          storage_path: string
          user_id: string
          width: number
        }
        Insert: {
          byte_size: number
          created_at?: string
          height: number
          id?: string
          mime_type: string
          moderated_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          position: number
          storage_path: string
          user_id: string
          width: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          height?: number
          id?: string
          mime_type?: string
          moderated_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          position?: number
          storage_path?: string
          user_id?: string
          width?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string
          created_at: string
          first_name: string
          gender: string
          interests: string[]
          onboarding_complete: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string
          created_at?: string
          first_name: string
          gender: string
          interests?: string[]
          onboarding_complete?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string
          created_at?: string
          first_name?: string
          gender?: string
          interests?: string[]
          onboarding_complete?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string
          id: string
          reason: string
          reported_id: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          details?: string
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          interested_in: string[]
          max_age: number
          max_distance_km: number
          min_age: number
          updated_at: string
          user_id: string
        }
        Insert: {
          interested_in?: string[]
          max_age?: number
          max_distance_km?: number
          min_age?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          interested_in?: string[]
          max_age?: number
          max_distance_km?: number
          min_age?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_private: {
        Row: {
          birth_date: string
          created_at: string
          location: unknown
          location_updated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date: string
          created_at?: string
          location?: unknown
          location_updated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string
          created_at?: string
          location?: unknown
          location_updated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_legal_terms: {
        Args: { p_privacy_version: string; p_terms_version: string }
        Returns: undefined
      }
      complete_my_onboarding: {
        Args: {
          p_bio: string
          p_birth_date: string
          p_first_name: string
          p_gender: string
          p_interested_in: string[]
          p_interests: string[]
          p_max_age: number
          p_max_distance_km: number
          p_min_age: number
        }
        Returns: undefined
      }
      distance_to_user: { Args: { target_user_id: string }; Returns: number }
      finalize_my_onboarding: { Args: never; Returns: undefined }
      get_beta_settings: {
        Args: never
        Returns: {
          client_retention_days: number
          diagnostics_enabled: boolean
          rank_variant: string
          ranking_retention_days: number
        }[]
      }
      get_discovery_batch: {
        Args: { p_limit?: number }
        Returns: {
          age: number
          bio: string
          distance_km: number
          first_name: string
          interests: string[]
          primary_photo_path: string
          target_user_id: string
        }[]
      }
      get_legal_gate: {
        Args: never
        Returns: {
          accepted: boolean
          privacy_version: string
          terms_version: string
        }[]
      }
      get_my_matches: {
        Args: never
        Returns: {
          age: number
          bio: string
          first_name: string
          last_message_at: string
          last_message_body: string
          match_id: string
          matched_at: string
          other_user_id: string
          primary_photo_path: string
          unread_count: number
        }[]
      }
      get_my_primary_media_state: {
        Args: never
        Returns: {
          moderation_reason: string
          moderation_status: string
          storage_path: string
        }[]
      }
      get_public_profile: {
        Args: { target_user_id: string }
        Returns: {
          age: number
          bio: string
          first_name: string
          gender: string
          interests: string[]
          user_id: string
        }[]
      }
      mark_match_read: { Args: { p_match_id: string }; Returns: undefined }
      prepare_account_deletion: { Args: never; Returns: boolean }
      record_beta_client_event: {
        Args: {
          p_app_version: string
          p_duration_ms: number
          p_event_id: string
          p_event_name: string
          p_outcome: string
          p_platform: string
          p_session_id: string
          p_surface: string
          p_value: number
        }
        Returns: boolean
      }
      record_decision: {
        Args: { p_decision: string; p_target_user_id: string }
        Returns: {
          decision: string
          match_created: boolean
          match_id: string
          matched: boolean
          target_user_id: string
        }[]
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      report_user: {
        Args: {
          p_block?: boolean
          p_details?: string
          p_match_id?: string
          p_message_id?: string
          p_reason: string
          p_reported_id: string
        }
        Returns: string
      }
      send_message: {
        Args: {
          p_body: string
          p_client_message_id: string
          p_match_id: string
        }
        Returns: {
          body: string
          created_at: string
          id: string
          match_id: string
          sender_id: string
        }[]
      }
      set_beta_diagnostics: { Args: { p_enabled: boolean }; Returns: boolean }
      set_my_location: {
        Args: { latitude: number; longitude: number }
        Returns: undefined
      }
      submit_beta_feedback: {
        Args: { p_category: string; p_details?: string; p_rating: number }
        Returns: string
      }
      unmatch: { Args: { p_match_id: string }; Returns: boolean }
      unregister_push_token: { Args: { p_token: string }; Returns: undefined }
      update_my_profile: {
        Args: {
          p_bio: string
          p_first_name: string
          p_gender: string
          p_interested_in: string[]
          p_interests: string[]
          p_max_age: number
          p_max_distance_km: number
          p_min_age: number
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
