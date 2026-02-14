
import { decode } from 'base64-arraybuffer';
import { supabase } from '../config/supabase';
import { R2_CONFIG } from '../config/r2';
import { r2StorageService } from './R2StorageService';

// Convert blob to base64 string using FileReader
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Extract base64 part from "data:...;base64,..." format
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export const storageService = {
    /**
     * Upload media (image or video) to storage
     * Routes to R2 or Supabase Storage based on feature flag
     * @param uri The local file URI
     * @param bucket The storage bucket (default: 'avatars' or 'status-media')
     * @param folder The folder path (optional)
     */
    async uploadImage(uri: string, bucket: string, folder: string = ''): Promise<string | null> {
        // Feature flag: Use R2 if enabled, otherwise use Supabase Storage
        if (R2_CONFIG.USE_R2) {
            console.log('📤 Using Cloudflare R2 for upload');
            return r2StorageService.uploadImage(uri, bucket, folder);
        }

        // Original Supabase Storage implementation below
        console.log('📤 Using Supabase Storage for upload');
        try {
            const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
            const fileName = `${folder ? folder + '/' : ''}${Date.now()}.${ext}`;

            // Determine content type
            let contentType = `image/${ext}`;
            if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
                contentType = `video/${ext === 'mov' ? 'quicktime' : ext}`;
            }

            // Read file using fetch and convert to ArrayBuffer
            const response = await fetch(uri);
            const blob = await response.blob();
            const base64 = await blobToBase64(blob);
            const arrayBuffer = decode(base64);

            // Try uploading
            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(fileName, arrayBuffer, {
                    contentType: contentType,
                    upsert: true,
                });

            if (error) {
                // If bucket not found, fallback to Base64 Data URI
                // This ensures the app "just works" even if storage is not set up
                if (error.message.includes('Bucket not found') || (error as any).statusCode === '404') {
                    console.warn(`Bucket '${bucket}' missing. Falling back to Base64...`);
                    
                    // For videos, base64 might be too large/slow, but we keep the fallback for now
                    return `data:${contentType};base64,${base64}`;
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
