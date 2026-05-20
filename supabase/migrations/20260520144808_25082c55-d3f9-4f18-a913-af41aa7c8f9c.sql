
-- 1. Enum de roles
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- 2. Tablas
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_user ON public.workspace_members(user_id);

-- 3. Funciones security definer (evitan recursión en RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = ANY(_roles)
  )
$$;

-- 4. Añadir workspace_id a proyectos
ALTER TABLE public.proyectos ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- 5. Backfill: crear un workspace personal por cada user_id existente
WITH distinct_users AS (
  SELECT DISTINCT user_id FROM public.proyectos
),
created AS (
  INSERT INTO public.workspaces (nombre)
  SELECT 'Mi workspace' FROM distinct_users
  RETURNING id
),
pairs AS (
  SELECT u.user_id, c.id AS workspace_id
  FROM (SELECT user_id, row_number() OVER () AS rn FROM distinct_users) u
  JOIN (SELECT id, row_number() OVER () AS rn FROM created) c USING (rn)
),
inserted_members AS (
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT workspace_id, user_id, 'owner' FROM pairs
  RETURNING workspace_id, user_id
)
UPDATE public.proyectos p
SET workspace_id = pairs.workspace_id
FROM pairs
WHERE p.user_id = pairs.user_id;

ALTER TABLE public.proyectos ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX idx_proyectos_workspace ON public.proyectos(workspace_id);

-- 6. Trigger: crear workspace personal para cada nuevo usuario
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_ws_id uuid;
BEGIN
  INSERT INTO public.workspaces (nombre) VALUES ('Mi workspace') RETURNING id INTO new_ws_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (new_ws_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_workspace();

-- 7. RLS en nuevas tablas
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspaces_member_select ON public.workspaces FOR SELECT TO authenticated
  USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY workspaces_admin_update ON public.workspaces FOR UPDATE TO authenticated
  USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY workspaces_owner_delete ON public.workspaces FOR DELETE TO authenticated
  USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner']::public.workspace_role[]));
CREATE POLICY workspaces_authenticated_insert ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY members_select_own_workspaces ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY members_admin_insert ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
    OR user_id = auth.uid()
  );
CREATE POLICY members_admin_update ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY members_admin_delete ON public.workspace_members FOR DELETE TO authenticated
  USING (
    public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
    OR user_id = auth.uid()
  );

-- 8. Reemplazar políticas en proyectos y tablas hijas para usar workspace membership
DROP POLICY IF EXISTS proyectos_owner_all ON public.proyectos;
CREATE POLICY proyectos_workspace_all ON public.proyectos FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS parrillas_owner_all ON public.parrillas;
CREATE POLICY parrillas_workspace_all ON public.parrillas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = parrillas.proyecto_id AND public.is_workspace_member(p.workspace_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = parrillas.proyecto_id AND public.is_workspace_member(p.workspace_id, auth.uid())));

DROP POLICY IF EXISTS publicaciones_owner_all ON public.publicaciones;
CREATE POLICY publicaciones_workspace_all ON public.publicaciones FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = publicaciones.proyecto_id AND public.is_workspace_member(p.workspace_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = publicaciones.proyecto_id AND public.is_workspace_member(p.workspace_id, auth.uid())));

DROP POLICY IF EXISTS evaluaciones_owner_all ON public.evaluaciones;
CREATE POLICY evaluaciones_workspace_all ON public.evaluaciones FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.parrillas pa JOIN public.proyectos p ON p.id = pa.proyecto_id
    WHERE pa.id = evaluaciones.parrilla_id AND public.is_workspace_member(p.workspace_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.parrillas pa JOIN public.proyectos p ON p.id = pa.proyecto_id
    WHERE pa.id = evaluaciones.parrilla_id AND public.is_workspace_member(p.workspace_id, auth.uid())
  ));

DROP POLICY IF EXISTS memoria_owner_all ON public.memoria_cliente;
CREATE POLICY memoria_workspace_all ON public.memoria_cliente FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = memoria_cliente.proyecto_id AND public.is_workspace_member(p.workspace_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = memoria_cliente.proyecto_id AND public.is_workspace_member(p.workspace_id, auth.uid())));

DROP POLICY IF EXISTS feedback_owner_all ON public.feedback;
CREATE POLICY feedback_workspace_select ON public.feedback FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evaluaciones e
    JOIN public.parrillas pa ON pa.id = e.parrilla_id
    JOIN public.proyectos p ON p.id = pa.proyecto_id
    WHERE e.id = feedback.evaluacion_id AND public.is_workspace_member(p.workspace_id, auth.uid())
  ));
CREATE POLICY feedback_own_write ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.evaluaciones e
      JOIN public.parrillas pa ON pa.id = e.parrilla_id
      JOIN public.proyectos p ON p.id = pa.proyecto_id
      WHERE e.id = feedback.evaluacion_id AND public.is_workspace_member(p.workspace_id, auth.uid())
    )
  );
CREATE POLICY feedback_own_update ON public.feedback FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY feedback_own_delete ON public.feedback FOR DELETE TO authenticated
  USING (user_id = auth.uid());
