
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../config/supabase';

export const storageService = {
    /**
     * Upload an image to Supabase Storage
     * @param uri The local file URI
     * @param bucket The storage bucket (default: 'avatars' or 'status-media')
     * @param folder The folder path (optional)
     */
    async uploadImage(uri: string, bucket: string, folder: string = ''): Promise<string | null> {
        try {
            const ext = uri.substring(uri.lastIndexOf('.') + 1);
            const fileName = `${folder ? folder + '/' : ''}${Date.now()}.${ext}`;

            // Read file as base64 and decode to ArrayBuffer
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: 'base64',
            });
            const arrayBuffer = decode(base64);

            // Try uploading
            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(fileName, arrayBuffer, {
                    contentType: `image/${ext}`,
                    upsert: true,
                });

            if (error) {
                // If bucket not found, fallback to Base64 Data URI
                // This ensures the app "just works" even if storage is not set up
                if (error.message.includes('Bucket not found') || (error as any).statusCode === '404') {
                    console.warn(`Bucket '${bucket}' missing. Falling back to Base64...`);
                    
                    const base64Data = await FileSystem.readAsStringAsync(uri, {
                        encoding: 'base64',
                    });
                    
                    return `data:image/${ext};base64,${base64Data}`;
                } else {
                    console.warn('Storage upload error:', error);
                    throw new Error(error.message);
                }
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from(bucket)
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (e: any) {
            console.warn('Upload failed:', e.message);
            throw e; // Re-throw to be handled by caller
        }
    }
};
