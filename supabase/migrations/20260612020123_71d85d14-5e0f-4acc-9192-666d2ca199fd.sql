
-- 1) Fix workspace_members INSERT: remove self-insert escalation
DROP POLICY IF EXISTS members_admin_insert ON public.workspace_members;
CREATE POLICY members_admin_insert ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (internal.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

-- 2) Fix storage policies for 'piezas' bucket: enforce workspace membership
DROP POLICY IF EXISTS piezas_storage_select ON storage.objects;
DROP POLICY IF EXISTS piezas_storage_insert ON storage.objects;
DROP POLICY IF EXISTS piezas_storage_update ON storage.objects;
DROP POLICY IF EXISTS piezas_storage_delete ON storage.objects;

CREATE POLICY piezas_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'piezas'
    AND EXISTS (
      SELECT 1 FROM public.proyectos pr
      WHERE pr.id::text = split_part(storage.objects.name, '/', 1)
        AND internal.is_workspace_member(pr.workspace_id, auth.uid())
    )
  );

CREATE POLICY piezas_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'piezas'
    AND EXISTS (
      SELECT 1 FROM public.proyectos pr
      WHERE pr.id::text = split_part(storage.objects.name, '/', 1)
        AND internal.is_workspace_member(pr.workspace_id, auth.uid())
    )
  );

CREATE POLICY piezas_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'piezas'
    AND EXISTS (
      SELECT 1 FROM public.proyectos pr
      WHERE pr.id::text = split_part(storage.objects.name, '/', 1)
        AND internal.is_workspace_member(pr.workspace_id, auth.uid())
    )
  );

CREATE POLICY piezas_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'piezas'
    AND EXISTS (
      SELECT 1 FROM public.proyectos pr
      WHERE pr.id::text = split_part(storage.objects.name, '/', 1)
        AND internal.is_workspace_member(pr.workspace_id, auth.uid())
    )
  );
