
-- Restringir EXECUTE de las funciones SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_workspace() FROM PUBLIC, anon, authenticated;

-- Reemplazar política demasiado permisiva
DROP POLICY IF EXISTS workspaces_authenticated_insert ON public.workspaces;
CREATE POLICY workspaces_authenticated_insert ON public.workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
