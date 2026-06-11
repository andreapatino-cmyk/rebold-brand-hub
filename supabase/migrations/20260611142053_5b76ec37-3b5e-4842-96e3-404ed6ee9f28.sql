
CREATE TABLE public.email_campanas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL,
  asunto TEXT NOT NULL,
  segmento TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_campanas TO authenticated;
GRANT ALL ON public.email_campanas TO service_role;
ALTER TABLE public.email_campanas ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_campanas_workspace_all ON public.email_campanas FOR ALL
USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = email_campanas.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = email_campanas.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

CREATE TABLE public.email_flujos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  trigger TEXT,
  secuencia JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_flujos TO authenticated;
GRANT ALL ON public.email_flujos TO service_role;
ALTER TABLE public.email_flujos ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_flujos_workspace_all ON public.email_flujos FOR ALL
USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = email_flujos.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = email_flujos.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

CREATE INDEX idx_email_campanas_proyecto_fecha ON public.email_campanas(proyecto_id, fecha);
CREATE INDEX idx_email_flujos_proyecto ON public.email_flujos(proyecto_id);
