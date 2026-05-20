CREATE SCHEMA IF NOT EXISTS internal;
GRANT USAGE ON SCHEMA internal TO authenticated;

CREATE OR REPLACE FUNCTION internal.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION internal.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION internal.invite_workspace_member_impl(_workspace_id uuid, _email text, _role public.workspace_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_user uuid;
  _normalized text := lower(trim(_email));
  _result jsonb;
BEGIN
  IF NOT internal.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
    RAISE EXCEPTION 'No tienes permisos para invitar en este workspace';
  END IF;

  IF _normalized = '' OR _normalized !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Email no válido';
  END IF;

  SELECT id INTO _existing_user FROM auth.users WHERE lower(email) = _normalized LIMIT 1;

  IF _existing_user IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (_workspace_id, _existing_user, _role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    _result := jsonb_build_object('status', 'added', 'user_id', _existing_user);
  ELSE
    INSERT INTO public.workspace_invitations (workspace_id, email, role, invited_by)
    VALUES (_workspace_id, _normalized, _role, auth.uid())
    ON CONFLICT (workspace_id, lower(email)) WHERE status = 'pending' DO NOTHING;
    _result := jsonb_build_object('status', 'invited', 'email', _normalized);
  END IF;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION internal.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.has_workspace_role(uuid, uuid, public.workspace_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION internal.invite_workspace_member_impl(uuid, text, public.workspace_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role public.workspace_role)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, internal
AS $$
  SELECT internal.invite_workspace_member_impl(_workspace_id, _email, _role)
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role) TO authenticated;

ALTER POLICY proyectos_workspace_all ON public.proyectos
USING (internal.is_workspace_member(workspace_id, auth.uid()))
WITH CHECK (internal.is_workspace_member(workspace_id, auth.uid()));

ALTER POLICY parrillas_workspace_all ON public.parrillas
USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = parrillas.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = parrillas.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

ALTER POLICY publicaciones_workspace_all ON public.publicaciones
USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = publicaciones.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = publicaciones.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

ALTER POLICY memoria_workspace_all ON public.memoria_cliente
USING (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = memoria_cliente.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.proyectos p WHERE p.id = memoria_cliente.proyecto_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

ALTER POLICY evaluaciones_workspace_all ON public.evaluaciones
USING (EXISTS (SELECT 1 FROM public.parrillas pa JOIN public.proyectos p ON p.id = pa.proyecto_id WHERE pa.id = evaluaciones.parrilla_id AND internal.is_workspace_member(p.workspace_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.parrillas pa JOIN public.proyectos p ON p.id = pa.proyecto_id WHERE pa.id = evaluaciones.parrilla_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

ALTER POLICY feedback_workspace_select ON public.feedback
USING (EXISTS (SELECT 1 FROM public.evaluaciones e JOIN public.parrillas pa ON pa.id = e.parrilla_id JOIN public.proyectos p ON p.id = pa.proyecto_id WHERE e.id = feedback.evaluacion_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

ALTER POLICY feedback_own_write ON public.feedback
WITH CHECK ((user_id = auth.uid()) AND EXISTS (SELECT 1 FROM public.evaluaciones e JOIN public.parrillas pa ON pa.id = e.parrilla_id JOIN public.proyectos p ON p.id = pa.proyecto_id WHERE e.id = feedback.evaluacion_id AND internal.is_workspace_member(p.workspace_id, auth.uid())));

ALTER POLICY invitations_admin_all ON public.workspace_invitations
USING (internal.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]))
WITH CHECK (internal.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));

ALTER POLICY members_select_own_workspaces ON public.workspace_members
USING (internal.is_workspace_member(workspace_id, auth.uid()));

ALTER POLICY members_admin_insert ON public.workspace_members
WITH CHECK (internal.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]) OR user_id = auth.uid());

ALTER POLICY members_admin_update ON public.workspace_members
USING (internal.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));

ALTER POLICY members_admin_delete ON public.workspace_members
USING (internal.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]) OR user_id = auth.uid());

ALTER POLICY workspaces_member_select ON public.workspaces
USING (internal.is_workspace_member(id, auth.uid()));

ALTER POLICY workspaces_admin_update ON public.workspaces
USING (internal.has_workspace_role(id, auth.uid(), ARRAY['owner'::public.workspace_role, 'admin'::public.workspace_role]));

ALTER POLICY workspaces_owner_delete ON public.workspaces
USING (internal.has_workspace_role(id, auth.uid(), ARRAY['owner'::public.workspace_role]));