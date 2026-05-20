
CREATE TABLE public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'editor',
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE UNIQUE INDEX idx_invites_unique_pending
  ON public.workspace_invitations (workspace_id, lower(email))
  WHERE status = 'pending';

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Admin/owner del workspace gestiona invitaciones; invitado puede ver las suyas
CREATE POLICY invitations_admin_all ON public.workspace_invitations FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE POLICY invitations_invitee_select ON public.workspace_invitations FOR SELECT TO authenticated
  USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Función para invitar: si el email ya tiene cuenta, lo añade directamente como miembro
CREATE OR REPLACE FUNCTION public.invite_workspace_member(
  _workspace_id uuid,
  _email text,
  _role public.workspace_role
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _existing_user uuid;
  _normalized text := lower(trim(_email));
  _result jsonb;
BEGIN
  IF NOT public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]) THEN
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

-- Trigger: cuando un usuario se registra, convierte sus invitaciones pendientes en membresías
CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  SELECT i.workspace_id, NEW.id, i.role
  FROM public.workspace_invitations i
  WHERE lower(i.email) = lower(NEW.email) AND i.status = 'pending'
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE lower(email) = lower(NEW.email) AND status = 'pending';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_accept_invites ON auth.users;
CREATE TRIGGER on_auth_user_accept_invites
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.accept_pending_invitations();

-- Endurecer permisos
REVOKE EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_pending_invitations() FROM PUBLIC, anon, authenticated;
