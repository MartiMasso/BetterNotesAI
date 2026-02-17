-- ============================================================
-- BetterNotesAI — Phase 2 Database Migration
-- ============================================================
-- Run this ENTIRE file in order in the Supabase SQL Editor.
-- It is idempotent: safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- §1  EXTENSIONS
-- ────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- trigram index for search
CREATE EXTENSION IF NOT EXISTS "unaccent";         -- accent-insensitive search


-- ════════════════════════════════════════════════════════════
-- §2  CORE TABLES
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- §2.1  projects
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title           text NOT NULL DEFAULT 'Untitled Project',
    description     text,
    template_id     text,
    visibility      text NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private', 'public', 'unlisted')),
    is_starred      boolean NOT NULL DEFAULT false,
    cover_image_url text,
    tags            text[] DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id   ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_starred   ON projects(user_id, is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS idx_projects_updated   ON projects(user_id, updated_at DESC);

-- Auto-update updated_at
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_projects_updated_at'
    ) THEN
        CREATE TRIGGER set_projects_updated_at
          BEFORE UPDATE ON projects
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- §2.2  Link chats → projects  (add column to existing table)
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chats' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE chats
            ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chats_project_id ON chats(project_id);


-- ────────────────────────────────────────────────────────────
-- §2.3  project_files  (user uploads within a project)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_files (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES profiles(id),
    parent_folder_id uuid REFERENCES project_files(id) ON DELETE CASCADE,
    is_folder        boolean NOT NULL DEFAULT false,
    name             text NOT NULL,
    storage_path     text,          -- null for folders
    mime_type        text,
    size_bytes       int8,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_files_project  ON project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_parent   ON project_files(parent_folder_id);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_project_files_updated_at'
    ) THEN
        CREATE TRIGGER set_project_files_updated_at
          BEFORE UPDATE ON project_files
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- §2.4  project_output_files  (multi-file LaTeX output)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_output_files (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path       text NOT NULL,     -- e.g. 'main.tex', 'chapters/ch1.tex'
    content         text,              -- LaTeX source (null for binary)
    is_binary       boolean NOT NULL DEFAULT false,
    storage_path    text,              -- for binary files in Storage
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_output_files_project ON project_output_files(project_id);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_output_files_updated_at'
    ) THEN
        CREATE TRIGGER set_output_files_updated_at
          BEFORE UPDATE ON project_output_files
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- §2.5  project_shares
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_shares (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    shared_with     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    permission      text NOT NULL DEFAULT 'view'
                    CHECK (permission IN ('view', 'edit')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id, shared_with)
);

CREATE INDEX IF NOT EXISTS idx_project_shares_shared ON project_shares(shared_with);


-- ────────────────────────────────────────────────────────────
-- §2.6  support_tickets
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email       text,
    subject     text NOT NULL,
    message     text NOT NULL,
    status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can create tickets
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'st_insert' AND tablename = 'support_tickets') THEN
        CREATE POLICY st_insert ON support_tickets
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- Users can only read their own tickets (by email match)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'st_own_read' AND tablename = 'support_tickets') THEN
        CREATE POLICY st_own_read ON support_tickets
            FOR SELECT USING (
                email = (SELECT email FROM auth.users WHERE id = auth.uid())
            );
    END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- §3  UNIVERSITY TABLES
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- §3.1  universities
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS universities (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    short_name  text,
    city        text,
    country     text NOT NULL DEFAULT 'España',
    logo_url    text,
    created_at  timestamptz NOT NULL DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- §3.2  degree_programs
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS degree_programs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id   uuid NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
    name            text NOT NULL,
    degree_type     text CHECK (degree_type IN ('grado', 'master', 'doctorado')),
    years           int4 DEFAULT 4,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_university ON degree_programs(university_id);


-- ────────────────────────────────────────────────────────────
-- §3.3  subjects
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subjects (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id  uuid NOT NULL REFERENCES degree_programs(id) ON DELETE CASCADE,
    name        text NOT NULL,
    year        int4,
    semester    int4,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subjects_program ON subjects(program_id);


-- ────────────────────────────────────────────────────────────
-- §3.4  published_documents
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS published_documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES profiles(id),
    subject_id      uuid REFERENCES subjects(id) ON DELETE SET NULL,
    category        text CHECK (category IN ('apuntes', 'formularios', 'problemas', 'examenes')),
    title           text NOT NULL,
    description     text,
    tags            text[] DEFAULT '{}',
    pdf_url         text,
    thumbnail_url   text,
    avg_rating      numeric(3,2) DEFAULT 0,
    rating_count    int4 DEFAULT 0,
    view_count      int4 DEFAULT 0,
    visibility      text NOT NULL DEFAULT 'public',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pub_docs_user      ON published_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_pub_docs_subject   ON published_documents(subject_id);
CREATE INDEX IF NOT EXISTS idx_pub_docs_category  ON published_documents(category);

-- GIN index for tag-based search
CREATE INDEX IF NOT EXISTS idx_pub_docs_tags ON published_documents USING gin(tags);

-- Trigram index for title search
CREATE INDEX IF NOT EXISTS idx_pub_docs_title_trgm ON published_documents
    USING gin(title gin_trgm_ops);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_pub_docs_updated_at'
    ) THEN
        CREATE TRIGGER set_pub_docs_updated_at
          BEFORE UPDATE ON published_documents
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- §3.5  document_ratings
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_ratings (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id uuid NOT NULL REFERENCES published_documents(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    rating      int4 NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE(document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_document ON document_ratings(document_id);


-- ════════════════════════════════════════════════════════════
-- §4  ALTER EXISTING TABLES
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- §4.1  profiles — add university + display fields
-- ────────────────────────────────────────────────────────────

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='university_id') THEN
        ALTER TABLE profiles ADD COLUMN university_id uuid REFERENCES universities(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='degree_program_id') THEN
        ALTER TABLE profiles ADD COLUMN degree_program_id uuid REFERENCES degree_programs(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='display_name') THEN
        ALTER TABLE profiles ADD COLUMN display_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar_url') THEN
        ALTER TABLE profiles ADD COLUMN avatar_url text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='theme') THEN
        ALTER TABLE profiles ADD COLUMN theme text DEFAULT 'dark' CHECK (theme IN ('light', 'dark'));
    END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- §5  ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

-- ── projects ─────────────────────────────────────────────────

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_owner_all' AND tablename = 'projects') THEN
        CREATE POLICY projects_owner_all ON projects
            FOR ALL USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_public_read' AND tablename = 'projects') THEN
        CREATE POLICY projects_public_read ON projects
            FOR SELECT USING (visibility = 'public');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'projects_shared_read' AND tablename = 'projects') THEN
        CREATE POLICY projects_shared_read ON projects
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM project_shares
                    WHERE project_shares.project_id = projects.id
                      AND project_shares.shared_with = auth.uid()
                )
            );
    END IF;
END $$;


-- ── project_files ────────────────────────────────────────────

ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pf_owner_all' AND tablename = 'project_files') THEN
        CREATE POLICY pf_owner_all ON project_files
            FOR ALL USING (
                EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid())
            )
            WITH CHECK (
                EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.user_id = auth.uid())
            );
    END IF;
END $$;


-- ── project_output_files ─────────────────────────────────────

ALTER TABLE project_output_files ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pof_owner_all' AND tablename = 'project_output_files') THEN
        CREATE POLICY pof_owner_all ON project_output_files
            FOR ALL USING (
                EXISTS (SELECT 1 FROM projects WHERE projects.id = project_output_files.project_id AND projects.user_id = auth.uid())
            )
            WITH CHECK (
                EXISTS (SELECT 1 FROM projects WHERE projects.id = project_output_files.project_id AND projects.user_id = auth.uid())
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pof_public_read' AND tablename = 'project_output_files') THEN
        CREATE POLICY pof_public_read ON project_output_files
            FOR SELECT USING (
                EXISTS (SELECT 1 FROM projects WHERE projects.id = project_output_files.project_id AND projects.visibility = 'public')
            );
    END IF;
END $$;


-- ── project_shares ───────────────────────────────────────────

ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ps_owner_all' AND tablename = 'project_shares') THEN
        CREATE POLICY ps_owner_all ON project_shares
            FOR ALL USING (
                EXISTS (SELECT 1 FROM projects WHERE projects.id = project_shares.project_id AND projects.user_id = auth.uid())
            )
            WITH CHECK (
                EXISTS (SELECT 1 FROM projects WHERE projects.id = project_shares.project_id AND projects.user_id = auth.uid())
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ps_shared_read' AND tablename = 'project_shares') THEN
        CREATE POLICY ps_shared_read ON project_shares
            FOR SELECT USING (shared_with = auth.uid());
    END IF;
END $$;


-- ── published_documents ──────────────────────────────────────

ALTER TABLE published_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pd_owner_all' AND tablename = 'published_documents') THEN
        CREATE POLICY pd_owner_all ON published_documents
            FOR ALL USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pd_public_read' AND tablename = 'published_documents') THEN
        CREATE POLICY pd_public_read ON published_documents
            FOR SELECT USING (visibility = 'public');
    END IF;
END $$;


-- ── document_ratings ─────────────────────────────────────────

ALTER TABLE document_ratings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dr_owner_all' AND tablename = 'document_ratings') THEN
        CREATE POLICY dr_owner_all ON document_ratings
            FOR ALL USING (user_id = auth.uid())
            WITH CHECK (user_id = auth.uid());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dr_public_read' AND tablename = 'document_ratings') THEN
        CREATE POLICY dr_public_read ON document_ratings
            FOR SELECT USING (true);
    END IF;
END $$;


-- ── universities / degree_programs / subjects (read-only for all) ──

ALTER TABLE universities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'uni_public_read' AND tablename = 'universities') THEN
        CREATE POLICY uni_public_read ON universities FOR SELECT USING (true);
    END IF;
END $$;

ALTER TABLE degree_programs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'dp_public_read' AND tablename = 'degree_programs') THEN
        CREATE POLICY dp_public_read ON degree_programs FOR SELECT USING (true);
    END IF;
END $$;

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subj_public_read' AND tablename = 'subjects') THEN
        CREATE POLICY subj_public_read ON subjects FOR SELECT USING (true);
    END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- §6  DATABASE FUNCTIONS
-- ════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────
-- §6.1  Recalculate average rating for a published document
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION recalc_document_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE published_documents
    SET avg_rating   = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM document_ratings WHERE document_id = COALESCE(NEW.document_id, OLD.document_id)), 0),
        rating_count = (SELECT COUNT(*) FROM document_ratings WHERE document_id = COALESCE(NEW.document_id, OLD.document_id))
    WHERE id = COALESCE(NEW.document_id, OLD.document_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_rating_insert ON document_ratings;
CREATE TRIGGER trg_recalc_rating_insert
    AFTER INSERT ON document_ratings
    FOR EACH ROW EXECUTE FUNCTION recalc_document_rating();

DROP TRIGGER IF EXISTS trg_recalc_rating_update ON document_ratings;
CREATE TRIGGER trg_recalc_rating_update
    AFTER UPDATE ON document_ratings
    FOR EACH ROW EXECUTE FUNCTION recalc_document_rating();

DROP TRIGGER IF EXISTS trg_recalc_rating_delete ON document_ratings;
CREATE TRIGGER trg_recalc_rating_delete
    AFTER DELETE ON document_ratings
    FOR EACH ROW EXECUTE FUNCTION recalc_document_rating();


-- ────────────────────────────────────────────────────────────
-- §6.2  Increment view_count on published documents
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_view_count(p_doc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE published_documents
    SET view_count = view_count + 1
    WHERE id = p_doc_id;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- §6.3  Search helper — unaccented, case-insensitive
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_published_documents(
    p_query text,
    p_limit int DEFAULT 20,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    category text,
    tags text[],
    pdf_url text,
    thumbnail_url text,
    avg_rating numeric,
    rating_count int4,
    view_count int4,
    created_at timestamptz,
    user_display_name text,
    user_avatar_url text,
    university_name text,
    subject_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    normalized text;
BEGIN
    normalized := '%' || lower(unaccent(p_query)) || '%';
    RETURN QUERY
    SELECT
        pd.id, pd.title, pd.description, pd.category, pd.tags,
        pd.pdf_url, pd.thumbnail_url, pd.avg_rating, pd.rating_count,
        pd.view_count, pd.created_at,
        p.display_name    AS user_display_name,
        p.avatar_url      AS user_avatar_url,
        u.name            AS university_name,
        s.name            AS subject_name
    FROM published_documents pd
    LEFT JOIN profiles p    ON p.id = pd.user_id
    LEFT JOIN subjects s    ON s.id = pd.subject_id
    LEFT JOIN degree_programs dp ON dp.id = s.program_id
    LEFT JOIN universities u ON u.id = dp.university_id
    WHERE pd.visibility = 'public'
      AND (
          lower(unaccent(pd.title)) LIKE normalized
          OR lower(unaccent(COALESCE(pd.description, ''))) LIKE normalized
          OR lower(unaccent(COALESCE(s.name, ''))) LIKE normalized
          OR lower(unaccent(COALESCE(u.name, ''))) LIKE normalized
          OR EXISTS (
              SELECT 1 FROM unnest(pd.tags) t WHERE lower(unaccent(t)) LIKE normalized
          )
      )
    ORDER BY pd.avg_rating DESC, pd.view_count DESC, pd.created_at DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- §7  LEGACY MIGRATION — wrap existing chats into projects
-- ════════════════════════════════════════════════════════════
-- This is optional: only run if you want to migrate existing chats.
-- Each orphan chat (project_id IS NULL) gets a new project.

DO $$
DECLARE
    r RECORD;
    new_project_id uuid;
BEGIN
    FOR r IN
        SELECT id, user_id, title, template_id, created_at
        FROM chats
        WHERE project_id IS NULL
    LOOP
        INSERT INTO projects (user_id, title, template_id, created_at, updated_at)
        VALUES (r.user_id, COALESCE(r.title, 'Untitled Project'), r.template_id, r.created_at, r.created_at)
        RETURNING id INTO new_project_id;

        UPDATE chats SET project_id = new_project_id WHERE id = r.id;
    END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════
-- §8  SEED DATA — Spanish Universities
-- ════════════════════════════════════════════════════════════

-- Only insert if table is empty (avoid duplicates on re-run)
INSERT INTO universities (name, short_name, city, country)
SELECT * FROM (VALUES
    ('Universitat Politècnica de Catalunya',       'UPC',  'Barcelona',   'España'),
    ('Universitat de Barcelona',                   'UB',   'Barcelona',   'España'),
    ('Universitat Autònoma de Barcelona',           'UAB',  'Barcelona',   'España'),
    ('Universitat Pompeu Fabra',                   'UPF',  'Barcelona',   'España'),
    ('Universitat Rovira i Virgili',               'URV',  'Tarragona',   'España'),
    ('Universidad Autónoma de Madrid',             'UAM',  'Madrid',      'España'),
    ('Universidad Complutense de Madrid',          'UCM',  'Madrid',      'España'),
    ('Universidad Politécnica de Madrid',          'UPM',  'Madrid',      'España'),
    ('Universidad de Sevilla',                     'US',   'Sevilla',     'España'),
    ('Universitat de València',                    'UV',   'Valencia',    'España')
) AS v(name, short_name, city, country)
WHERE NOT EXISTS (SELECT 1 FROM universities LIMIT 1);


-- ──────────────────────────────────────────────────────────
-- §8.1  Seed degree programs for UPC (example)
-- ──────────────────────────────────────────────────────────

DO $$
DECLARE
    upc_id uuid;
BEGIN
    SELECT id INTO upc_id FROM universities WHERE short_name = 'UPC' LIMIT 1;
    IF upc_id IS NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM degree_programs WHERE university_id = upc_id LIMIT 1) THEN RETURN; END IF;

    INSERT INTO degree_programs (university_id, name, degree_type, years) VALUES
        (upc_id, 'Grado en Ingeniería Física',                   'grado', 4),
        (upc_id, 'Grado en Ingeniería Informática',              'grado', 4),
        (upc_id, 'Grado en Ingeniería de Telecomunicaciones',    'grado', 4),
        (upc_id, 'Grado en Ingeniería Industrial',               'grado', 4),
        (upc_id, 'Grado en Ingeniería Aeroespacial',             'grado', 4),
        (upc_id, 'Grado en Matemáticas',                         'grado', 4),
        (upc_id, 'Grado en Arquitectura',                        'grado', 5);
END $$;


-- ──────────────────────────────────────────────────────────
-- §8.2  Seed subjects for "Grado en Ingeniería Física" (UPC)
-- ──────────────────────────────────────────────────────────

DO $$
DECLARE
    prog_id uuid;
BEGIN
    SELECT dp.id INTO prog_id
    FROM degree_programs dp
    JOIN universities u ON u.id = dp.university_id
    WHERE u.short_name = 'UPC'
      AND dp.name = 'Grado en Ingeniería Física'
    LIMIT 1;

    IF prog_id IS NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM subjects WHERE program_id = prog_id LIMIT 1) THEN RETURN; END IF;

    INSERT INTO subjects (program_id, name, year, semester) VALUES
        -- 1er Curso
        (prog_id, 'Cálculo I',                   1, 1),
        (prog_id, 'Álgebra Lineal',               1, 1),
        (prog_id, 'Física I: Mecánica',            1, 1),
        (prog_id, 'Informática',                  1, 1),
        (prog_id, 'Química',                      1, 1),
        (prog_id, 'Cálculo II',                   1, 2),
        (prog_id, 'Ecuaciones Diferenciales',     1, 2),
        (prog_id, 'Física II: Electromagnetismo',  1, 2),
        (prog_id, 'Estadística',                  1, 2),
        -- 2º Curso
        (prog_id, 'Métodos Matemáticos I',        2, 1),
        (prog_id, 'Mecánica Clásica',             2, 1),
        (prog_id, 'Termodinámica',                2, 1),
        (prog_id, 'Óptica',                       2, 1),
        (prog_id, 'Métodos Matemáticos II',       2, 2),
        (prog_id, 'Electrodinámica',              2, 2),
        (prog_id, 'Mecánica de Fluidos',          2, 2),
        (prog_id, 'Laboratorio de Física I',      2, 2),
        -- 3er Curso
        (prog_id, 'Mecánica Cuántica I',          3, 1),
        (prog_id, 'Física Estadística',           3, 1),
        (prog_id, 'Física del Estado Sólido',     3, 1),
        (prog_id, 'Electrónica',                  3, 1),
        (prog_id, 'Mecánica Cuántica II',         3, 2),
        (prog_id, 'Física Nuclear y de Partículas', 3, 2),
        (prog_id, 'Laboratorio de Física II',     3, 2),
        -- 4º Curso
        (prog_id, 'Astrofísica',                  4, 1),
        (prog_id, 'Relatividad General',          4, 1),
        (prog_id, 'Simulación Numérica',          4, 1),
        (prog_id, 'Trabajo de Fin de Grado',      4, 2);
END $$;


-- ════════════════════════════════════════════════════════════
-- §9  SUPABASE STORAGE BUCKETS
-- ════════════════════════════════════════════════════════════
-- Create buckets via SQL. ON CONFLICT prevents errors on re-run.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-files', 'project-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-avatars', 'user-avatars', true, 2097152)
ON CONFLICT (id) DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- §10  STORAGE RLS POLICIES
-- ════════════════════════════════════════════════════════════
-- CRITICAL: Without these, users cannot upload files even if the bucket exists.
-- Supabase stores files in the internal `storage.objects` table.

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ── project-files bucket ─────────────────────────────────────
-- Users can manage files ONLY inside their own project folders.
-- Path convention: <project_id>/...
-- Verification: the first folder segment must be a project_id owned by the user.

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage project-files' AND tablename = 'objects') THEN
        CREATE POLICY "Users can manage project-files" ON storage.objects
        FOR ALL USING (
            bucket_id = 'project-files'
            AND EXISTS (
                SELECT 1 FROM projects
                WHERE projects.id::text = (storage.foldername(name))[1]
                  AND projects.user_id = auth.uid()
            )
        ) WITH CHECK (
            bucket_id = 'project-files'
            AND EXISTS (
                SELECT 1 FROM projects
                WHERE projects.id::text = (storage.foldername(name))[1]
                  AND projects.user_id = auth.uid()
            )
        );
    END IF;
END $$;

-- ── user-avatars bucket ──────────────────────────────────────
-- Public read for all avatars (they're used in document cards, profiles, etc.)
-- Write/update restricted to the user's own folder: <user_id>/avatar.*

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public avatars view' AND tablename = 'objects') THEN
        CREATE POLICY "Public avatars view" ON storage.objects
        FOR SELECT USING (bucket_id = 'user-avatars');
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users manage own avatar' AND tablename = 'objects') THEN
        CREATE POLICY "Users manage own avatar" ON storage.objects
        FOR INSERT WITH CHECK (
            bucket_id = 'user-avatars'
            AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users update own avatar' AND tablename = 'objects') THEN
        CREATE POLICY "Users update own avatar" ON storage.objects
        FOR UPDATE USING (
            bucket_id = 'user-avatars'
            AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users delete own avatar' AND tablename = 'objects') THEN
        CREATE POLICY "Users delete own avatar" ON storage.objects
        FOR DELETE USING (
            bucket_id = 'user-avatars'
            AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- §11  DONE
-- ════════════════════════════════════════════════════════════
-- Migration complete. Verify by running:
--   SELECT count(*) FROM projects;
--   SELECT count(*) FROM universities;
--   SELECT count(*) FROM subjects;
--   SELECT count(*) FROM storage.buckets WHERE id IN ('project-files','user-avatars');
--
-- ⚠️ KNOWN LIMITATION (Orphaned Storage Files):
-- SQL CASCADE deletes DB rows but NOT physical files in Supabase Storage.
-- Future fix: Edge Function to clean up storage on project_files row deletion.
-- For MVP this is acceptable — revisit at scale.
