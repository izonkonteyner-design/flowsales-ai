-- 0060_fix_social_media_tenant.sql
-- Forward-only corrective migration for tenant integrity, queue-to-post ownership,
-- RLS WITH CHECK role boundaries, and secure worker queue claiming.

-- 1. Safely backfill missing tenant columns without destructively overwriting existing identifiers
UPDATE public.social_posts
SET organization_id = workspace_id
WHERE organization_id IS NULL
  AND workspace_id IS NOT NULL;

UPDATE public.social_posts
SET workspace_id = organization_id
WHERE workspace_id IS NULL
  AND organization_id IS NOT NULL;

-- 2. Trigger to preserve existing tenant relationships and prevent cross-tenant reassignment
CREATE OR REPLACE FUNCTION public.normalize_social_post_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    NEW.organization_id := NEW.workspace_id;
  ELSIF NEW.workspace_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    NEW.workspace_id := NEW.organization_id;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'social_posts requires a valid tenant identifier (organization_id or workspace_id)';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Cross-tenant reassignment of social_posts.organization_id is forbidden';
    END IF;
    IF OLD.workspace_id IS NOT NULL AND NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
      RAISE EXCEPTION 'Cross-tenant reassignment of social_posts.workspace_id is forbidden';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_social_post_tenant ON public.social_posts;
CREATE TRIGGER trg_normalize_social_post_tenant
  BEFORE INSERT OR UPDATE ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_social_post_tenant();

-- 3. Valid PostgreSQL CHECK constraint (no subqueries) and composite uniqueness for relational FK
ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_org_eq_workspace;

ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_tenant_required;

ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_tenant_required
  CHECK (organization_id IS NOT NULL OR workspace_id IS NOT NULL);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_posts_id_org_unique'
      AND conrelid = 'public.social_posts'::regclass
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_id_org_unique UNIQUE (id, organization_id);
  END IF;
END $$;

-- 4. Queue-to-post ownership consistency via trigger + composite foreign key (no subquery CHECK)
ALTER TABLE public.social_publishing_queue
  DROP CONSTRAINT IF EXISTS social_queue_org_matches_post;

UPDATE public.social_publishing_queue q
SET organization_id = COALESCE(p.organization_id, p.workspace_id)
FROM public.social_posts p
WHERE q.post_id = p.id
  AND (q.organization_id IS NULL OR q.organization_id IS DISTINCT FROM COALESCE(p.organization_id, p.workspace_id));

CREATE OR REPLACE FUNCTION public.sync_queue_organization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_post_org_id uuid;
BEGIN
  SELECT COALESCE(sp.organization_id, sp.workspace_id)
    INTO v_post_org_id
    FROM public.social_posts sp
   WHERE sp.id = NEW.post_id;

  IF v_post_org_id IS NULL THEN
    RAISE EXCEPTION 'Referenced social_post (%) does not exist or has no tenant', NEW.post_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_post_org_id;
  ELSIF NEW.organization_id IS DISTINCT FROM v_post_org_id THEN
    RAISE EXCEPTION 'Cross-tenant queue assignment denied: queue organization_id (%) does not match post organization_id (%)',
      NEW.organization_id, v_post_org_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.organization_id IS NOT NULL AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'Cross-tenant reassignment of social_publishing_queue is forbidden';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_queue_organization ON public.social_publishing_queue;
CREATE TRIGGER trg_sync_queue_organization
  BEFORE INSERT OR UPDATE ON public.social_publishing_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_queue_organization();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_queue_post_org_fk'
      AND conrelid = 'public.social_publishing_queue'::regclass
  ) THEN
    ALTER TABLE public.social_publishing_queue
      ADD CONSTRAINT social_queue_post_org_fk
      FOREIGN KEY (post_id, organization_id)
      REFERENCES public.social_posts (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Granular RLS policies on social_posts and social_publishing_queue with WITH CHECK & role boundaries
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_publishing_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage social posts for their workspaces" ON public.social_posts;
DROP POLICY IF EXISTS "Service role full access to social_posts" ON public.social_posts;
DROP POLICY IF EXISTS "social_posts_select_member" ON public.social_posts;
DROP POLICY IF EXISTS "social_posts_insert_writer" ON public.social_posts;
DROP POLICY IF EXISTS "social_posts_update_writer" ON public.social_posts;
DROP POLICY IF EXISTS "social_posts_delete_writer" ON public.social_posts;
DROP POLICY IF EXISTS "social_posts_service_role_all" ON public.social_posts;

CREATE POLICY "social_posts_select_member"
  ON public.social_posts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id)
        AND om.user_id = auth.uid()
    )
    AND (
      public.social_posts.workspace_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organization_members om2
        WHERE om2.organization_id = public.social_posts.workspace_id
          AND om2.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "social_posts_insert_writer"
  ON public.social_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id) IS NOT NULL
    AND COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id) <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id)
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
    AND (
      public.social_posts.workspace_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organization_members om2
        WHERE om2.organization_id = public.social_posts.workspace_id
          AND om2.user_id = auth.uid()
          AND om2.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
      )
    )
  );

CREATE POLICY "social_posts_update_writer"
  ON public.social_posts
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id) <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id)
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
  )
  WITH CHECK (
    COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id) IS NOT NULL
    AND COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id) <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id)
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
    AND (
      public.social_posts.workspace_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organization_members om2
        WHERE om2.organization_id = public.social_posts.workspace_id
          AND om2.user_id = auth.uid()
          AND om2.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
      )
    )
  );

CREATE POLICY "social_posts_delete_writer"
  ON public.social_posts
  FOR DELETE
  TO authenticated
  USING (
    COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id) <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = COALESCE(public.social_posts.organization_id, public.social_posts.workspace_id)
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
  );

CREATE POLICY "social_posts_service_role_all"
  ON public.social_posts
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can manage social publishing queue for their workspaces" ON public.social_publishing_queue;
DROP POLICY IF EXISTS "Service role full access to social_publishing_queue" ON public.social_publishing_queue;
DROP POLICY IF EXISTS "social_queue_select_member" ON public.social_publishing_queue;
DROP POLICY IF EXISTS "social_queue_insert_writer" ON public.social_publishing_queue;
DROP POLICY IF EXISTS "social_queue_update_writer" ON public.social_publishing_queue;
DROP POLICY IF EXISTS "social_queue_delete_writer" ON public.social_publishing_queue;
DROP POLICY IF EXISTS "social_queue_service_role_all" ON public.social_publishing_queue;

CREATE POLICY "social_queue_select_member"
  ON public.social_publishing_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = public.social_publishing_queue.organization_id
        AND om.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.social_posts sp
      WHERE sp.id = public.social_publishing_queue.post_id
        AND COALESCE(sp.organization_id, sp.workspace_id) = public.social_publishing_queue.organization_id
    )
  );

CREATE POLICY "social_queue_insert_writer"
  ON public.social_publishing_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.social_publishing_queue.organization_id IS NOT NULL
    AND public.social_publishing_queue.organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = public.social_publishing_queue.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
    AND EXISTS (
      SELECT 1 FROM public.social_posts sp
      WHERE sp.id = public.social_publishing_queue.post_id
        AND COALESCE(sp.organization_id, sp.workspace_id) = public.social_publishing_queue.organization_id
    )
  );

CREATE POLICY "social_queue_update_writer"
  ON public.social_publishing_queue
  FOR UPDATE
  TO authenticated
  USING (
    public.social_publishing_queue.organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = public.social_publishing_queue.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
  )
  WITH CHECK (
    public.social_publishing_queue.organization_id IS NOT NULL
    AND public.social_publishing_queue.organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = public.social_publishing_queue.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
    AND EXISTS (
      SELECT 1 FROM public.social_posts sp
      WHERE sp.id = public.social_publishing_queue.post_id
        AND COALESCE(sp.organization_id, sp.workspace_id) = public.social_publishing_queue.organization_id
    )
  );

CREATE POLICY "social_queue_delete_writer"
  ON public.social_publishing_queue
  FOR DELETE
  TO authenticated
  USING (
    public.social_publishing_queue.organization_id <> 'd3e00000-0000-0000-0000-000000000000'::uuid
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = public.social_publishing_queue.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'manager', 'sales_rep', 'sales')
    )
  );

CREATE POLICY "social_queue_service_role_all"
  ON public.social_publishing_queue
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_posts TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_publishing_queue TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.social_posts TO service_role;
    GRANT ALL ON public.social_publishing_queue TO service_role;
  END IF;
END $$;

-- 6. Atomic queue-claiming RPC for scheduled publishing worker (restricted to service_role)
CREATE OR REPLACE FUNCTION public.claim_due_social_posts(batch_size integer DEFAULT 10)
RETURNS SETOF public.social_publishing_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  rec public.social_publishing_queue%ROWTYPE;
BEGIN
  FOR rec IN
    SELECT *
    FROM public.social_publishing_queue
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT GREATEST(1, LEAST(COALESCE(batch_size, 10), 100))
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.social_publishing_queue
    SET status = 'processing',
        attempts = attempts + 1,
        updated_at = now()
    WHERE id = rec.id
    RETURNING * INTO rec;
    RETURN NEXT rec;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_social_posts(integer) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.claim_due_social_posts(integer) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.claim_due_social_posts(integer) FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_due_social_posts(integer) TO service_role;
  END IF;
END $$;

-- 7. Record migration in deployment_migrations
INSERT INTO public.deployment_migrations (version, name)
VALUES ('0060', 'fix_social_media_tenant')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
