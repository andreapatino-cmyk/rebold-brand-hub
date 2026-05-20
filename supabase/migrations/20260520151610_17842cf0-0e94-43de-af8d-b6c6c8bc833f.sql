
-- Create triggers on auth.users for workspace creation and invitation acceptance
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

-- Backfill: create personal workspaces for any existing users that don't have one
DO $$
DECLARE
  u RECORD;
  new_ws_id uuid;
BEGIN
  FOR u IN
    SELECT au.id FROM auth.users au
    LEFT JOIN public.workspace_members wm ON wm.user_id = au.id
    WHERE wm.id IS NULL
  LOOP
    INSERT INTO public.workspaces (nombre) VALUES ('Mi workspace') RETURNING id INTO new_ws_id;
    INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (new_ws_id, u.id, 'owner');
  END LOOP;
END $$;
