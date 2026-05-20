-- Allow RLS policies to call workspace helper functions as authenticated users
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(uuid, uuid, public.workspace_role[]) TO authenticated;

-- Ensure the invitation RPC remains callable only by logged-in users
REVOKE EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_workspace_member(uuid, text, public.workspace_role) TO authenticated;

-- Keep trigger-only functions unavailable as direct RPC calls
REVOKE EXECUTE ON FUNCTION public.handle_new_user_workspace() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_pending_invitations() FROM PUBLIC, anon, authenticated;

-- Recreate missing signup triggers idempotently
DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_workspace();

DROP TRIGGER IF EXISTS on_auth_user_accept_invites ON auth.users;
CREATE TRIGGER on_auth_user_accept_invites
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.accept_pending_invitations();