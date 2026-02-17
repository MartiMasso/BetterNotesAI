// lib/api.ts - API helpers for freemium flow
import { supabase } from "@/supabaseClient";

export interface UsageStatus {
    message_count: number;
    free_limit: number;
    remaining: number;
    is_paid: boolean;
    can_send: boolean;
    resets_at: string;
}

export interface IncrementResult {
    new_count: number;
    remaining: number;
    limit_reached: boolean;
    is_paid: boolean;
}

/**
 * Get the current user's usage status
 */
export async function getUsageStatus(): Promise<UsageStatus | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .rpc('get_usage_status', { p_user_id: user.id })
            .single();

        if (error) {
            console.warn("Failed to get usage status:", error.message);
            return null;
        }

        return data as UsageStatus;
    } catch (e) {
        console.warn("getUsageStatus error:", e);
        return null;
    }
}

/**
 * Increment message count and check if limit reached
 */
export async function incrementMessageCount(): Promise<IncrementResult | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .rpc('increment_message_count', { p_user_id: user.id })
            .single();

        if (error) {
            console.warn("Failed to increment message count:", error.message);
            return null;
        }

        return data as IncrementResult;
    } catch (e) {
        console.warn("incrementMessageCount error:", e);
        return null;
    }
}

/**
 * Save chat to database
 */
export async function saveChat(chatData: {
    title?: string;
    template_id?: string;
    latex_content?: string;
    messages: Array<{ role: string; content: string }>;
}): Promise<string | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('chats')
            .insert({
                user_id: user.id,
                title: chatData.title || 'Untitled',
                template_id: chatData.template_id,
                latex_content: chatData.latex_content,
                messages: chatData.messages,
            })
            .select('id')
            .single();

        if (error) {
            console.warn("Failed to save chat:", error.message);
            return null;
        }

        return data.id;
    } catch (e) {
        console.warn("saveChat error:", e);
        return null;
    }
}

/**
 * Update existing chat
 */
export async function updateChat(chatId: string, chatData: {
    title?: string;
    latex_content?: string;
    messages?: Array<{ role: string; content: string }>;
}): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('chats')
            .update({
                ...chatData,
                updated_at: new Date().toISOString(),
            })
            .eq('id', chatId);

        if (error) {
            console.warn("Failed to update chat:", error.message);
            return false;
        }

        return true;
    } catch (e) {
        console.warn("updateChat error:", e);
        return false;
    }
}

/**
 * Load user's chats
 */
export async function loadChats(): Promise<Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
}>> {
    try {
        const { data, error } = await supabase
            .from('chats')
            .select('id, title, created_at, updated_at')
            .order('updated_at', { ascending: false });

        if (error) {
            console.warn("Failed to load chats:", error.message);
            return [];
        }

        return data || [];
    } catch (e) {
        console.warn("loadChats error:", e);
        return [];
    }
}

/**
 * Load a specific chat
 */
export async function loadChat(chatId: string): Promise<{
    id: string;
    title: string;
    template_id: string | null;
    latex_content: string | null;
    messages: Array<{ role: string; content: string }>;
} | null> {
    try {
        const { data, error } = await supabase
            .from('chats')
            .select('*')
            .eq('id', chatId)
            .single();

        if (error) {
            console.warn("Failed to load chat:", error.message);
            return null;
        }

        return data;
    } catch (e) {
        console.warn("loadChat error:", e);
        return null;
    }
}

/**
 * Delete a chat
 */
export async function deleteChat(chatId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('chats')
            .delete()
            .eq('id', chatId);

        if (error) {
            console.warn("Failed to delete chat:", error.message);
            return false;
        }

        return true;
    } catch (e) {
        console.warn("deleteChat error:", e);
        return false;
    }
}

/**
 * Rename a chat
 */
export async function renameChat(chatId: string, newTitle: string): Promise<boolean> {
    return updateChat(chatId, { title: newTitle });
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — Project CRUD
// ═══════════════════════════════════════════════════════════

export interface Project {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    template_id: string | null;
    visibility: 'private' | 'public' | 'unlisted';
    is_starred: boolean;
    is_playground: boolean;
    cover_image_url: string | null;
    tags: string[];
    created_at: string;
    updated_at: string;
}

/**
 * Create a new project
 */
export async function createProject(data: {
    title?: string;
    description?: string;
    template_id?: string;
    visibility?: 'private' | 'public' | 'unlisted';
    is_playground?: boolean;
}): Promise<Project | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: project, error } = await supabase
            .from('projects')
            .insert({
                user_id: user.id,
                title: data.title || 'Untitled Project',
                description: data.description,
                template_id: data.template_id,
                visibility: data.visibility || 'private',
                is_playground: data.is_playground ?? false,
            })
            .select('*')
            .single();

        if (error) {
            console.warn("Failed to create project:", error.message);
            return null;
        }

        return project as Project;
    } catch (e) {
        console.warn("createProject error:", e);
        return null;
    }
}

/**
 * Update an existing project
 */
export async function updateProject(projectId: string, data: {
    title?: string;
    description?: string;
    visibility?: 'private' | 'public' | 'unlisted';
    is_starred?: boolean;
    cover_image_url?: string;
    tags?: string[];
}): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('projects')
            .update(data)
            .eq('id', projectId);

        if (error) {
            console.warn("Failed to update project:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("updateProject error:", e);
        return false;
    }
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);

        if (error) {
            console.warn("Failed to delete project:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("deleteProject error:", e);
        return false;
    }
}

/**
 * List user's projects with optional filter
 */
export async function listProjects(filter?: {
    starred?: boolean;
    is_playground?: boolean;
    search?: string;
    limit?: number;
}): Promise<Project[]> {
    try {
        let query = supabase
            .from('projects')
            .select('*')
            .order('updated_at', { ascending: false });

        // Default: exclude playground entries from normal project list
        query = query.eq('is_playground', filter?.is_playground ?? false);

        if (filter?.starred) {
            query = query.eq('is_starred', true);
        }
        if (filter?.search) {
            query = query.ilike('title', `%${filter.search}%`);
        }
        if (filter?.limit) {
            query = query.limit(filter.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.warn("Failed to list projects:", error.message);
            return [];
        }
        return (data || []) as Project[];
    } catch (e) {
        console.warn("listProjects error:", e);
        return [];
    }
}

/**
 * Toggle star on a project
 */
export async function starProject(projectId: string, starred: boolean): Promise<boolean> {
    return updateProject(projectId, { is_starred: starred });
}

/**
 * Promote a local playground session to cloud.
 * Creates a project with is_playground=true and bulk-saves all files.
 */
export async function promotePlayground(
    sessionName: string,
    files: { path: string; content: string }[]
): Promise<Project | null> {
    const project = await createProject({
        title: sessionName || 'Playground Session',
        is_playground: true,
    });
    if (!project) return null;

    // Bulk save all files to output_files
    for (const f of files) {
        await saveOutputFile(project.id, f.path, f.content);
    }
    return project;
}

/**
 * Duplicate a project (creates a new one with the same title + " (Copy)")
 */
export async function duplicateProject(projectId: string): Promise<Project | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        // Load original
        const { data: original, error: fetchErr } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

        if (fetchErr || !original) return null;

        // Create copy
        const { data: copy, error: insertErr } = await supabase
            .from('projects')
            .insert({
                user_id: user.id,
                title: `${original.title} (Copy)`,
                description: original.description,
                template_id: original.template_id,
                visibility: 'private',
                tags: original.tags,
            })
            .select('*')
            .single();

        if (insertErr) {
            console.warn("Failed to duplicate project:", insertErr.message);
            return null;
        }

        // Copy output files
        const { data: outputFiles } = await supabase
            .from('project_output_files')
            .select('file_path, content, is_binary, storage_path')
            .eq('project_id', projectId);

        if (outputFiles && outputFiles.length > 0 && copy) {
            const copies = outputFiles.map((f: any) => ({
                project_id: copy.id,
                file_path: f.file_path,
                content: f.content,
                is_binary: f.is_binary,
                storage_path: f.storage_path,
            }));
            await supabase.from('project_output_files').insert(copies);
        }

        return copy as Project;
    } catch (e) {
        console.warn("duplicateProject error:", e);
        return null;
    }
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — Project Output Files
// ═══════════════════════════════════════════════════════════

export interface OutputFile {
    id: string;
    project_id: string;
    file_path: string;
    content: string | null;
    is_binary: boolean;
    storage_path: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * List output files for a project
 */
export async function listOutputFiles(projectId: string): Promise<OutputFile[]> {
    try {
        const { data, error } = await supabase
            .from('project_output_files')
            .select('*')
            .eq('project_id', projectId)
            .order('file_path');

        if (error) {
            console.warn("Failed to list output files:", error.message);
            return [];
        }
        return (data || []) as OutputFile[];
    } catch (e) {
        console.warn("listOutputFiles error:", e);
        return [];
    }
}

/**
 * Save or update an output file (upsert by project_id + file_path)
 */
export async function saveOutputFile(projectId: string, filePath: string, content: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('project_output_files')
            .upsert(
                {
                    project_id: projectId,
                    file_path: filePath,
                    content,
                    is_binary: false,
                },
                { onConflict: 'project_id,file_path' }
            );

        if (error) {
            console.warn("Failed to save output file:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("saveOutputFile error:", e);
        return false;
    }
}

/**
 * Get a specific output file's content
 */
export async function getOutputFile(projectId: string, filePath: string): Promise<OutputFile | null> {
    try {
        const { data, error } = await supabase
            .from('project_output_files')
            .select('*')
            .eq('project_id', projectId)
            .eq('file_path', filePath)
            .single();

        if (error) return null;
        return data as OutputFile;
    } catch (e) {
        console.warn("getOutputFile error:", e);
        return null;
    }
}

/**
 * Delete an output file
 */
export async function deleteOutputFile(projectId: string, filePath: string): Promise<boolean> {
    try {
        const { error } = await supabase
            .from('project_output_files')
            .delete()
            .eq('project_id', projectId)
            .eq('file_path', filePath);

        if (error) {
            console.warn("Failed to delete output file:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("deleteOutputFile error:", e);
        return false;
    }
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — Project Files (user uploads)
// ═══════════════════════════════════════════════════════════

export interface ProjectFileRecord {
    id: string;
    project_id: string;
    user_id: string;
    parent_folder_id: string | null;
    is_folder: boolean;
    name: string;
    storage_path: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
    updated_at: string;
}

/**
 * List files in a project (or within a specific folder)
 */
export async function listProjectFiles(
    projectId: string,
    parentFolderId?: string | null
): Promise<ProjectFileRecord[]> {
    try {
        let query = supabase
            .from('project_files')
            .select('*')
            .eq('project_id', projectId)
            .order('is_folder', { ascending: false })
            .order('name');

        // Only filter by parent when explicitly provided
        // undefined = return ALL files (for tree view)
        // null = return root-level files only
        // string = return children of that folder
        if (parentFolderId === null) {
            query = query.is('parent_folder_id', null);
        } else if (parentFolderId) {
            query = query.eq('parent_folder_id', parentFolderId);
        }
        // else: undefined → no filter, return all

        const { data, error } = await query;
        if (error) {
            console.warn("Failed to list project files:", error.message);
            return [];
        }
        return (data || []) as ProjectFileRecord[];
    } catch (e) {
        console.warn("listProjectFiles error:", e);
        return [];
    }
}

/**
 * Create a folder in a project
 */
export async function createProjectFolder(
    projectId: string,
    name: string,
    parentFolderId?: string | null
): Promise<ProjectFileRecord | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('project_files')
            .insert({
                project_id: projectId,
                user_id: user.id,
                parent_folder_id: parentFolderId || null,
                is_folder: true,
                name,
            })
            .select('*')
            .single();

        if (error) {
            console.warn("Failed to create folder:", error.message);
            return null;
        }
        return data as ProjectFileRecord;
    } catch (e) {
        console.warn("createProjectFolder error:", e);
        return null;
    }
}

/**
 * Delete a project file or folder
 */
export async function deleteProjectFile(fileId: string): Promise<boolean> {
    try {
        // Get the file record first to find storage path
        const { data: file } = await supabase
            .from('project_files')
            .select('storage_path')
            .eq('id', fileId)
            .single();

        // Delete the storage file if it exists
        if (file?.storage_path) {
            await supabase.storage.from('project-files').remove([file.storage_path]);
        }

        // Delete the database record
        const { error } = await supabase
            .from('project_files')
            .delete()
            .eq('id', fileId);

        if (error) {
            console.warn("Failed to delete project file:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("deleteProjectFile error:", e);
        return false;
    }
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — University & Search Queries
// ═══════════════════════════════════════════════════════════

export interface University {
    id: string;
    name: string;
    short_name: string | null;
    city: string | null;
    country: string;
    logo_url: string | null;
}

export interface DegreeProgram {
    id: string;
    university_id: string;
    name: string;
    degree_type: 'grado' | 'master' | 'doctorado' | null;
    years: number;
}

export interface Subject {
    id: string;
    program_id: string;
    name: string;
    year: number | null;
    semester: number | null;
}

export interface PublishedDocument {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    tags: string[];
    pdf_url: string | null;
    thumbnail_url: string | null;
    avg_rating: number;
    rating_count: number;
    view_count: number;
    created_at: string;
    user_display_name: string | null;
    user_avatar_url: string | null;
    university_name: string | null;
    subject_name: string | null;
}

/**
 * List all universities
 */
export async function listUniversities(): Promise<University[]> {
    try {
        const { data, error } = await supabase
            .from('universities')
            .select('*')
            .order('name');

        if (error) return [];
        return (data || []) as University[];
    } catch (e) {
        console.warn("listUniversities error:", e);
        return [];
    }
}

/**
 * List degree programs for a university
 */
export async function listPrograms(universityId: string): Promise<DegreeProgram[]> {
    try {
        const { data, error } = await supabase
            .from('degree_programs')
            .select('*')
            .eq('university_id', universityId)
            .order('name');

        if (error) return [];
        return (data || []) as DegreeProgram[];
    } catch (e) {
        console.warn("listPrograms error:", e);
        return [];
    }
}

/**
 * List subjects for a degree program
 */
export async function listSubjects(programId: string): Promise<Subject[]> {
    try {
        const { data, error } = await supabase
            .from('subjects')
            .select('*')
            .eq('program_id', programId)
            .order('year')
            .order('semester')
            .order('name');

        if (error) return [];
        return (data || []) as Subject[];
    } catch (e) {
        console.warn("listSubjects error:", e);
        return [];
    }
}

/**
 * Search published documents using the DB function
 */
export async function searchDocuments(
    query: string,
    limit = 20,
    offset = 0
): Promise<PublishedDocument[]> {
    try {
        const { data, error } = await supabase
            .rpc('search_published_documents', {
                p_query: query,
                p_limit: limit,
                p_offset: offset,
            });

        if (error) {
            console.warn("searchDocuments error:", error.message);
            return [];
        }
        return (data || []) as PublishedDocument[];
    } catch (e) {
        console.warn("searchDocuments error:", e);
        return [];
    }
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — Publish & Rate
// ═══════════════════════════════════════════════════════════

/**
 * Publish a project as a public document
 */
export async function publishDocument(data: {
    project_id: string;
    subject_id?: string;
    category?: string;
    title: string;
    description?: string;
    tags?: string[];
    pdf_url?: string;
    thumbnail_url?: string;
}): Promise<string | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: doc, error } = await supabase
            .from('published_documents')
            .insert({
                ...data,
                user_id: user.id,
                subject_id: data.subject_id || null,
            })
            .select('id')
            .single();

        if (error) {
            console.warn("Failed to publish document:", error.message);
            return null;
        }
        return doc.id;
    } catch (e) {
        console.warn("publishDocument error:", e);
        return null;
    }
}

/**
 * Rate a published document (1-5)
 */
export async function rateDocument(documentId: string, rating: number): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { error } = await supabase
            .from('document_ratings')
            .upsert(
                {
                    document_id: documentId,
                    user_id: user.id,
                    rating: Math.min(5, Math.max(1, Math.round(rating))),
                },
                { onConflict: 'document_id,user_id' }
            );

        if (error) {
            console.warn("Failed to rate document:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("rateDocument error:", e);
        return false;
    }
}


// ═══════════════════════════════════════════════════════════
// Phase 2 — Profile Management
// ═══════════════════════════════════════════════════════════

export interface UserProfile {
    id: string;
    email: string | null;
    plan: string;
    display_name: string | null;
    avatar_url: string | null;
    university_id: string | null;
    degree_program_id: string | null;
    theme: 'light' | 'dark';
}

/**
 * Get the current user's profile
 */
export async function getProfile(): Promise<UserProfile | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('id, email, plan, display_name, avatar_url, university_id, degree_program_id, theme')
            .eq('id', user.id)
            .single();

        if (error) return null;
        return data as UserProfile;
    } catch (e) {
        console.warn("getProfile error:", e);
        return null;
    }
}

/**
 * Update the current user's profile
 */
export async function updateProfile(data: {
    display_name?: string;
    avatar_url?: string;
    university_id?: string | null;
    degree_program_id?: string | null;
    theme?: 'light' | 'dark';
}): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { error } = await supabase
            .from('profiles')
            .update(data)
            .eq('id', user.id);

        if (error) {
            console.warn("Failed to update profile:", error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.warn("updateProfile error:", e);
        return false;
    }
}
