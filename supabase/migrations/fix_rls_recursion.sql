-- ============================================================
-- Fix: Infinite recursion in RLS policies for "projects"
-- ============================================================
-- Problem: projects_shared_read checks project_shares,
-- whose ps_owner_all policy checks back into projects -> infinite loop
--
-- Solution: Replace the recursive policies with non-recursive ones.
-- For project_shares, instead of checking projects ownership via subquery,
-- we check shared_with = auth.uid() for read, and use a SECURITY DEFINER
-- helper function for write (no RLS check on the projects table).
-- ============================================================

-- Step 1: Drop the problematic policies
DROP POLICY IF EXISTS projects_shared_read ON projects;
DROP POLICY IF EXISTS ps_owner_all ON project_shares;
DROP POLICY IF EXISTS ps_shared_read ON project_shares;

-- Step 2: Recreate project_shares policies WITHOUT referencing projects table
-- Owners can manage shares (insert/update/delete) for their own projects
-- We use user_id directly via a SECURITY DEFINER function to avoid recursion
CREATE OR REPLACE FUNCTION is_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM projects
        WHERE id = p_project_id
          AND user_id = auth.uid()
    );
$$;

-- project_shares: owner can do everything
CREATE POLICY ps_owner_all ON project_shares
    FOR ALL USING (
        is_project_owner(project_id)
    )
    WITH CHECK (
        is_project_owner(project_id)
    );

-- project_shares: shared users can read their own shares
CREATE POLICY ps_shared_read ON project_shares
    FOR SELECT USING (shared_with = auth.uid());

-- Step 3: Recreate projects_shared_read using the SECURITY DEFINER function
-- to check project_shares without triggering project_shares RLS -> projects RLS recursion
CREATE OR REPLACE FUNCTION is_shared_with_me(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM project_shares
        WHERE project_id = p_project_id
          AND shared_with = auth.uid()
    );
$$;

CREATE POLICY projects_shared_read ON projects
    FOR SELECT USING (is_shared_with_me(id));

-- Step 4: Also fix project_files and project_output_files policies
-- that reference projects (potential recursion with projects_shared_read)
DROP POLICY IF EXISTS pf_owner_all ON project_files;
CREATE POLICY pf_owner_all ON project_files
    FOR ALL USING (is_project_owner(project_id))
    WITH CHECK (is_project_owner(project_id));

DROP POLICY IF EXISTS pof_owner_all ON project_output_files;
CREATE POLICY pof_owner_all ON project_output_files
    FOR ALL USING (is_project_owner(project_id))
    WITH CHECK (is_project_owner(project_id));

DROP POLICY IF EXISTS pof_public_read ON project_output_files;
CREATE OR REPLACE FUNCTION is_project_public(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM projects
        WHERE id = p_project_id
          AND visibility = 'public'
    );
$$;

CREATE POLICY pof_public_read ON project_output_files
    FOR SELECT USING (is_project_public(project_id));

-- ============================================================
-- Done! The recursion is broken by using SECURITY DEFINER functions
-- which bypass RLS when checking cross-table relationships.
-- ============================================================
