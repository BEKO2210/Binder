// Generated from Supabase project sbohsxtzitqhyswznhec; updated for Phase 2 schema.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.15' };
  public: {
    Tables: {
      blocks: {
        Row: { blocked_id: string; blocker_id: string; created_at: string };
        Insert: { blocked_id: string; blocker_id: string; created_at?: string };
        Update: { blocked_id?: string; blocker_id?: string; created_at?: string };
        Relationships: [];
      };
      decisions: {
        Row: { actor_id: string; created_at: string; decision: string; id: string; target_id: string };
        Insert: { actor_id: string; created_at?: string; decision: string; id?: string; target_id: string };
        Update: { actor_id?: string; created_at?: string; decision?: string; id?: string; target_id?: string };
        Relationships: [];
      };
      matches: {
        Row: { created_at: string; ended_at: string | null; id: string; status: string; user_high: string; user_low: string };
        Insert: { created_at?: string; ended_at?: string | null; id?: string; status?: string; user_high: string; user_low: string };
        Update: { created_at?: string; ended_at?: string | null; id?: string; status?: string; user_high?: string; user_low?: string };
        Relationships: [];
      };
      profile_media: {
        Row: { byte_size: number; created_at: string; height: number; id: string; mime_type: string; position: number; storage_path: string; user_id: string; width: number };
        Insert: { byte_size: number; created_at?: string; height: number; id?: string; mime_type: string; position: number; storage_path: string; user_id: string; width: number };
        Update: { byte_size?: number; created_at?: string; height?: number; id?: string; mime_type?: string; position?: number; storage_path?: string; user_id?: string; width?: number };
        Relationships: [];
      };
      profiles: {
        Row: { bio: string; created_at: string; first_name: string; gender: string; interests: string[]; onboarding_complete: boolean; updated_at: string; user_id: string };
        Insert: { bio?: string; created_at?: string; first_name: string; gender: string; interests?: string[]; onboarding_complete?: boolean; updated_at?: string; user_id: string };
        Update: { bio?: string; created_at?: string; first_name?: string; gender?: string; interests?: string[]; onboarding_complete?: boolean; updated_at?: string; user_id?: string };
        Relationships: [];
      };
      reports: {
        Row: { created_at: string; details: string; id: string; reason: string; reported_id: string; reporter_id: string };
        Insert: { created_at?: string; details?: string; id?: string; reason: string; reported_id: string; reporter_id: string };
        Update: { created_at?: string; details?: string; id?: string; reason?: string; reported_id?: string; reporter_id?: string };
        Relationships: [];
      };
      user_preferences: {
        Row: { interested_in: string[]; max_age: number; max_distance_km: number; min_age: number; updated_at: string; user_id: string };
        Insert: { interested_in?: string[]; max_age?: number; max_distance_km?: number; min_age?: number; updated_at?: string; user_id: string };
        Update: { interested_in?: string[]; max_age?: number; max_distance_km?: number; min_age?: number; updated_at?: string; user_id?: string };
        Relationships: [];
      };
      user_private: {
        Row: { birth_date: string; created_at: string; location: unknown; location_updated_at: string | null; updated_at: string; user_id: string };
        Insert: { birth_date: string; created_at?: string; location?: unknown; location_updated_at?: string | null; updated_at?: string; user_id: string };
        Update: { birth_date?: string; created_at?: string; location?: unknown; location_updated_at?: string | null; updated_at?: string; user_id?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      complete_my_onboarding: {
        Args: { p_bio: string; p_birth_date: string; p_first_name: string; p_gender: string; p_interested_in: string[]; p_interests: string[]; p_max_age: number; p_max_distance_km: number; p_min_age: number };
        Returns: undefined;
      };
      distance_to_user: { Args: { target_user_id: string }; Returns: number };
      finalize_my_onboarding: { Args: never; Returns: undefined };
      get_discovery_batch: {
        Args: { p_limit?: number };
        Returns: { age: number; bio: string; distance_km: number; first_name: string; interests: string[]; primary_photo_path: string; target_user_id: string }[];
      };
      get_public_profile: {
        Args: { target_user_id: string };
        Returns: { age: number; bio: string; first_name: string; gender: string; interests: string[]; user_id: string }[];
      };
      record_decision: {
        Args: { p_decision: string; p_target_user_id: string };
        Returns: { decision: string; match_created: boolean; match_id: string | null; matched: boolean; target_user_id: string }[];
      };
      set_my_location: { Args: { latitude: number; longitude: number }; Returns: undefined };
      update_my_profile: {
        Args: { p_bio: string; p_first_name: string; p_gender: string; p_interested_in: string[]; p_interests: string[]; p_max_age: number; p_max_distance_km: number; p_min_age: number };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
