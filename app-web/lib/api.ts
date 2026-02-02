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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .rpc('get_usage_status', { p_user_id: user.id })
        .single();

    if (error) {
        console.error("Failed to get usage status:", error);
        return null;
    }

    return data as UsageStatus;
}

/**
 * Increment message count and check if limit reached
 */
export async function incrementMessageCount(): Promise<IncrementResult | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .rpc('increment_message_count', { p_user_id: user.id })
        .single();

    if (error) {
        console.error("Failed to increment message count:", error);
        return null;
    }

    return data as IncrementResult;
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
        console.error("Failed to save chat:", error);
        return null;
    }

    return data.id;
}

/**
 * Update existing chat
 */
export async function updateChat(chatId: string, chatData: {
    title?: string;
    latex_content?: string;
    messages?: Array<{ role: string; content: string }>;
}): Promise<boolean> {
    const { error } = await supabase
        .from('chats')
        .update({
            ...chatData,
            updated_at: new Date().toISOString(),
        })
        .eq('id', chatId);

    if (error) {
        console.error("Failed to update chat:", error);
        return false;
    }

    return true;
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
    const { data, error } = await supabase
        .from('chats')
        .select('id, title, created_at, updated_at')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error("Failed to load chats:", error);
        return [];
    }

    return data || [];
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
    const { data, error } = await supabase
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .single();

    if (error) {
        console.error("Failed to load chat:", error);
        return null;
    }

    return data;
}

/**
 * Delete a chat
 */
export async function deleteChat(chatId: string): Promise<boolean> {
    const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);

    if (error) {
        console.error("Failed to delete chat:", error);
        return false;
    }

    return true;
}
