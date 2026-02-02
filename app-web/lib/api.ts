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

