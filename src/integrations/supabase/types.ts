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
  public: {
    Tables: {
      evaluaciones: {
        Row: {
          created_at: string
          criterios: Json
          id: string
          parrilla_id: string
          puntuacion_global: number
          sugerencias: Json
        }
        Insert: {
          created_at?: string
          criterios?: Json
          id?: string
          parrilla_id: string
          puntuacion_global?: number
          sugerencias?: Json
        }
        Update: {
          created_at?: string
          criterios?: Json
          id?: string
          parrilla_id?: string
          puntuacion_global?: number
          sugerencias?: Json
        }
        Relationships: [
          {
            foreignKeyName: "evaluaciones_parrilla_id_fkey"
            columns: ["parrilla_id"]
            isOneToOne: false
            referencedRelation: "parrillas"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          contenido: string
          created_at: string
          evaluacion_id: string
          id: string
          user_id: string
        }
        Insert: {
          contenido: string
          created_at?: string
          evaluacion_id: string
          id?: string
          user_id: string
        }
        Update: {
          contenido?: string
          created_at?: string
          evaluacion_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_evaluacion_id_fkey"
            columns: ["evaluacion_id"]
            isOneToOne: false
            referencedRelation: "evaluaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      memoria_cliente: {
        Row: {
          clave: string
          created_at: string
          id: string
          proyecto_id: string
          valor: string | null
        }
        Insert: {
          clave: string
          created_at?: string
          id?: string
          proyecto_id: string
          valor?: string | null
        }
        Update: {
          clave?: string
          created_at?: string
          id?: string
          proyecto_id?: string
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memoria_cliente_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      parrillas: {
        Row: {
          anio: number
          created_at: string
          estado: string
          id: string
          mes: number
          proyecto_id: string
        }
        Insert: {
          anio: number
          created_at?: string
          estado?: string
          id?: string
          mes: number
          proyecto_id: string
        }
        Update: {
          anio?: number
          created_at?: string
          estado?: string
          id?: string
          mes?: number
          proyecto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parrillas_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos: {
        Row: {
          created_at: string
          estado_ultima_parrilla: string | null
          id: string
          nombre: string
          pais: string | null
          redes: string[]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          estado_ultima_parrilla?: string | null
          id?: string
          nombre: string
          pais?: string | null
          redes?: string[]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          estado_ultima_parrilla?: string | null
          id?: string
          nombre?: string
          pais?: string | null
          redes?: string[]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proyectos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      publicaciones: {
        Row: {
          copy: string | null
          created_at: string
          estado: string | null
          fecha: string
          id: string
          parrilla_id: string
          proyecto_id: string
          red: string
          tipo: string | null
          titulo: string | null
        }
        Insert: {
          copy?: string | null
          created_at?: string
          estado?: string | null
          fecha: string
          id?: string
          parrilla_id: string
          proyecto_id: string
          red: string
          tipo?: string | null
          titulo?: string | null
        }
        Update: {
          copy?: string | null
          created_at?: string
          estado?: string | null
          fecha?: string
          id?: string
          parrilla_id?: string
          proyecto_id?: string
          red?: string
          tipo?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "publicaciones_parrilla_id_fkey"
            columns: ["parrilla_id"]
            isOneToOne: false
            referencedRelation: "parrillas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publicaciones_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_workspace_role: {
        Args: {
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      invite_workspace_member: {
        Args: {
          _email: string
          _role: Database["public"]["Enums"]["workspace_role"]
          _workspace_id: string
        }
        Returns: Json
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      workspace_role: "owner" | "admin" | "editor" | "viewer"
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
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const
