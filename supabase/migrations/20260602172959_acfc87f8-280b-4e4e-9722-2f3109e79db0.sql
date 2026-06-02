
CREATE TABLE public.piezas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id uuid NOT NULL,
  url text NOT NULL,
  storage_path text,
  tipo text NOT NULL,
  mime_type text,
  nombre text,
  evaluacion jsonb,
  puntuacion_global numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.piezas TO authenticated;
GRANT ALL ON public.piezas TO service_role;

ALTER TABLE public.piezas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "piezas_workspace_all" ON public.piezas FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM proyectos p WHERE p.id = piezas.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM proyectos p WHERE p.id = piezas.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));
