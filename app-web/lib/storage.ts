import { supabase } from "@/supabaseClient";

export async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
    });
}

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
