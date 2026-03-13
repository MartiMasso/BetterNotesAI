-- ============================================================
-- Add legacy user-files bucket for chat attachments
-- ============================================================
-- Used by workspace attachment uploads (path convention: <user_id>/<random-name>)
-- Bucket is private; frontend requests signed URLs after upload.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-files', 'user-files', false, 52428800)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users insert own user-files'
    ) THEN
        CREATE POLICY "Users insert own user-files" ON storage.objects
        FOR INSERT WITH CHECK (
            bucket_id = 'user-files'
            AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users select own user-files'
    ) THEN
        CREATE POLICY "Users select own user-files" ON storage.objects
        FOR SELECT USING (
            bucket_id = 'user-files'
            AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users update own user-files'
    ) THEN
        CREATE POLICY "Users update own user-files" ON storage.objects
        FOR UPDATE USING (
            bucket_id = 'user-files'
            AND auth.uid()::text = (storage.foldername(name))[1]
        )
        WITH CHECK (
            bucket_id = 'user-files'
            AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users delete own user-files'
    ) THEN
        CREATE POLICY "Users delete own user-files" ON storage.objects
        FOR DELETE USING (
            bucket_id = 'user-files'
            AND auth.uid()::text = (storage.foldername(name))[1]
        );
    END IF;
END $$;
