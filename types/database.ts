// Generated shape — regenerate with `npx supabase gen types typescript` once the project is linked.
// Hand-written to match supabase/schema.sql exactly.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users_profiles: {
        Row: {
          id: string;
          display_name: string | null;
          plan: "free" | "creator" | "pro" | "agency";
          credits_used: number;
          created_at: string | null;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          plan?: "free" | "creator" | "pro" | "agency";
          credits_used?: number;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          plan?: "free" | "creator" | "pro" | "agency";
          credits_used?: number;
          created_at?: string | null;
        };
        Relationships: [];
      };
      clip_jobs: {
        Row: {
          id: string;
          user_id: string;
          source_url: string | null;
          topic: string | null;
          style: string | null;
          platforms: string[] | null;
          status: "pending" | "processing" | "done" | "failed";
          error_message: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_url?: string | null;
          topic?: string | null;
          style?: string | null;
          platforms?: string[] | null;
          status?: "pending" | "processing" | "done" | "failed";
          error_message?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          source_url?: string | null;
          topic?: string | null;
          style?: string | null;
          platforms?: string[] | null;
          status?: "pending" | "processing" | "done" | "failed";
          error_message?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      clips: {
        Row: {
          id: string;
          job_id: string;
          title: string | null;
          hook: string | null;
          description: string | null;
          captions: string[] | null;
          hashtags: string[] | null;
          duration: string | null;
          start_seconds: number | null;
          end_seconds: number | null;
          r2_url: string | null;
          bg_gradient: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          job_id: string;
          title?: string | null;
          hook?: string | null;
          description?: string | null;
          captions?: string[] | null;
          hashtags?: string[] | null;
          duration?: string | null;
          start_seconds?: number | null;
          end_seconds?: number | null;
          r2_url?: string | null;
          bg_gradient?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          job_id?: string;
          title?: string | null;
          hook?: string | null;
          description?: string | null;
          captions?: string[] | null;
          hashtags?: string[] | null;
          duration?: string | null;
          start_seconds?: number | null;
          end_seconds?: number | null;
          r2_url?: string | null;
          bg_gradient?: string | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clips_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "clip_jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      faceless_videos: {
        Row: {
          id: string;
          user_id: string;
          topic: string;
          niche: string | null;
          voice_style: string | null;
          duration: string | null;
          script_json: Json | null;
          r2_url: string | null;
          status: "pending" | "processing" | "done" | "failed";
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          topic: string;
          niche?: string | null;
          voice_style?: string | null;
          duration?: string | null;
          script_json?: Json | null;
          r2_url?: string | null;
          status?: "pending" | "processing" | "done" | "failed";
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          topic?: string;
          niche?: string | null;
          voice_style?: string | null;
          duration?: string | null;
          script_json?: Json | null;
          r2_url?: string | null;
          status?: "pending" | "processing" | "done" | "failed";
          created_at?: string | null;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          user_id: string;
          clip_id: string | null;
          video_id: string | null;
          platforms: string[] | null;
          caption: string | null;
          scheduled_at: string | null;
          posted_at: string | null;
          status: "queued" | "posted" | "failed" | null;
          zernio_response: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          clip_id?: string | null;
          video_id?: string | null;
          platforms?: string[] | null;
          caption?: string | null;
          scheduled_at?: string | null;
          posted_at?: string | null;
          status?: "queued" | "posted" | "failed" | null;
          zernio_response?: Json | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          clip_id?: string | null;
          video_id?: string | null;
          platforms?: string[] | null;
          caption?: string | null;
          scheduled_at?: string | null;
          posted_at?: string | null;
          status?: "queued" | "posted" | "failed" | null;
          zernio_response?: Json | null;
          created_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "posts_clip_id_fkey";
            columns: ["clip_id"];
            isOneToOne: false;
            referencedRelation: "clips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "faceless_videos";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
