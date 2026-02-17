import { supabase } from "@/supabaseClient";

export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });
}

/**
 * Legacy: Upload file to the old 'user-files' bucket (Phase 1 compat)
 */
export async function uploadFileToStorage(file: File, userId: string): Promise<string | null> {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).slice(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('user-files')
            .upload(filePath, file);

        if (uploadError) {
            console.error('Error uploading file:', uploadError);
            return null;
        }

        const { data } = supabase.storage
            .from('user-files')
            .getPublicUrl(filePath);

        return data.publicUrl;
    } catch (error) {
        console.error('Exception uploading file:', error);
        return null;
    }
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — Project Files (private bucket)
// ═══════════════════════════════════════════════════════════

export interface UploadedProjectFile {
    dbId: string;         // project_files row id
    storagePath: string;  // path in the bucket
    signedUrl: string;    // temporary download URL
}

/**
 * Upload a file to the project-files bucket and create a DB record.
 * Path convention: <projectId>/<name>
 * Returns the DB record id and a signed URL for immediate preview.
 */
export async function uploadProjectFile(
    file: File,
    projectId: string,
    parentFolderId?: string | null
): Promise<UploadedProjectFile | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const storagePath = `${projectId}/${file.name}`;

        // Upload to storage
        const { error: uploadErr } = await supabase.storage
            .from('project-files')
            .upload(storagePath, file, { upsert: true });

        if (uploadErr) {
            console.error('Error uploading project file:', uploadErr);
            return null;
        }

        // Create DB record
        const { data: dbRecord, error: dbErr } = await supabase
            .from('project_files')
            .insert({
                project_id: projectId,
                user_id: user.id,
                parent_folder_id: parentFolderId || null,
                is_folder: false,
                name: file.name,
                storage_path: storagePath,
                mime_type: file.type || null,
                size_bytes: file.size,
            })
            .select('id')
            .single();

        if (dbErr) {
            console.error('Error creating file record:', dbErr);
            // Clean up uploaded file
            await supabase.storage.from('project-files').remove([storagePath]);
            return null;
        }

        // Create temporary signed URL (1 hour)
        const { data: signedData } = await supabase.storage
            .from('project-files')
            .createSignedUrl(storagePath, 3600);

        return {
            dbId: dbRecord.id,
            storagePath,
            signedUrl: signedData?.signedUrl || '',
        };
    } catch (error) {
        console.error('Exception uploading project file:', error);
        return null;
    }
}

/**
 * Get a signed download URL for a project file
 */
export async function getProjectFileUrl(storagePath: string): Promise<string | null> {
    try {
        const { data, error } = await supabase.storage
            .from('project-files')
            .createSignedUrl(storagePath, 3600);

        if (error) return null;
        return data.signedUrl;
    } catch {
        return null;
    }
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — Avatar Upload (public bucket)
// ═══════════════════════════════════════════════════════════

/**
 * Upload or replace a user avatar.
 * Path convention: <userId>/avatar.<ext>
 * Returns the public URL.
 */
export async function uploadAvatar(file: File): Promise<string | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const fileExt = file.name.split('.').pop() || 'png';
        const storagePath = `${user.id}/avatar.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
            .from('user-avatars')
            .upload(storagePath, file, { upsert: true });

        if (uploadErr) {
            console.error('Error uploading avatar:', uploadErr);
            return null;
        }

        const { data } = supabase.storage
            .from('user-avatars')
            .getPublicUrl(storagePath);

        return data.publicUrl;
    } catch (error) {
        console.error('Exception uploading avatar:', error);
        return null;
    }
}
