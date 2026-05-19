
-- Proyectos
CREATE TABLE public.proyectos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  pais TEXT,
  redes TEXT[] NOT NULL DEFAULT '{}',
  estado_ultima_parrilla TEXT DEFAULT 'pendiente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Parrillas
CREATE TABLE public.parrillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  mes INT NOT NULL,
  anio INT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Publicaciones
CREATE TABLE public.publicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parrilla_id UUID NOT NULL REFERENCES public.parrillas(id) ON DELETE CASCADE,
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  red TEXT NOT NULL,
  tipo TEXT,
  titulo TEXT,
  copy TEXT,
  estado TEXT DEFAULT 'planificado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evaluaciones
CREATE TABLE public.evaluaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parrilla_id UUID NOT NULL REFERENCES public.parrillas(id) ON DELETE CASCADE,
  puntuacion_global NUMERIC NOT NULL DEFAULT 0,
  criterios JSONB NOT NULL DEFAULT '[]'::jsonb,
  sugerencias JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feedback
CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluacion_id UUID NOT NULL REFERENCES public.evaluaciones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Memoria cliente
CREATE TABLE public.memoria_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id UUID NOT NULL REFERENCES public.proyectos(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,
  valor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parrillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memoria_cliente ENABLE ROW LEVEL SECURITY;

-- Proyectos: owner only
CREATE POLICY "proyectos_owner_all" ON public.proyectos FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Parrillas: via proyecto owner
CREATE POLICY "parrillas_owner_all" ON public.parrillas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.user_id = auth.uid()));

-- Publicaciones
CREATE POLICY "publicaciones_owner_all" ON public.publicaciones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.user_id = auth.uid()));

-- Evaluaciones
CREATE POLICY "evaluaciones_owner_all" ON public.evaluaciones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.parrillas pa JOIN public.proyectos p ON p.id = pa.proyecto_id WHERE pa.id = parrilla_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.parrillas pa JOIN public.proyectos p ON p.id = pa.proyecto_id WHERE pa.id = parrilla_id AND p.user_id = auth.uid()));

-- Feedback
CREATE POLICY "feedback_owner_all" ON public.feedback FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Memoria cliente
CREATE POLICY "memoria_owner_all" ON public.memoria_cliente FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = proyecto_id AND p.user_id = auth.uid()));

CREATE INDEX idx_parrillas_proyecto ON public.parrillas(proyecto_id);
CREATE INDEX idx_publicaciones_parrilla ON public.publicaciones(parrilla_id);
CREATE INDEX idx_publicaciones_fecha ON public.publicaciones(fecha);
