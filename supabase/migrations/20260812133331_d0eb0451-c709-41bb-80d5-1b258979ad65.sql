CREATE OR REPLACE FUNCTION public.invite_workspace_member(_workspace_id uuid, _email text, _role workspace_role)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SET search_path TO 'public', 'internal'
AS $function$
  SELECT internal.invite_workspace_member_impl(_workspace_id, _email, _role)
$function$;

ALTER TABLE public.memoria_cliente ADD COLUMN IF NOT EXISTS fuente text;
ALTER TABLE public.memoria_cliente ADD COLUMN IF NOT EXISTS community_manager text;