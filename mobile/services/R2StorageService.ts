/**
 * R2 Storage Service
 * Handles file uploads to Cloudflare R2 via Worker proxy
 */

import { R2_CONFIG } from '../config/r2';
import { supabase } from '../config/supabase';

interface UploadResponse {
  success: boolean;
  publicUrl: string;
  filename: string;
  size: number;
  contentType: string;
}

class R2StorageService {
  /**
   * Upload an image/video to R2 storage
   * @param uri Local file URI (file:// or content://)
   * @param bucket Bucket name ('avatars' or 'status-media')
   * @param folder Optional folder path (defaults to user ID)
   * @returns Public URL or null on failure
   */
  async uploadImage(
    uri: string,
    bucket: string,
    folder: string = ''
  ): Promise<string | null> {
    let retries = 0;

    while (retries < R2_CONFIG.MAX_RETRIES) {
      try {
        return await this.attemptUpload(uri, bucket, folder);
      } catch (error) {
        retries++;
        console.warn(`Upload attempt ${retries} failed:`, error);

        if (retries >= R2_CONFIG.MAX_RETRIES) {
          console.error('Max retries reached, falling back to data URI');
          return this.getFallbackDataUri(uri);
        }

        // Wait before retrying
        await this.delay(R2_CONFIG.RETRY_DELAY * retries);
      }
    }

    return null;
  }

  /**
   * Attempt to upload file to R2
   */
  private async attemptUpload(
    uri: string,
    bucket: string,
    folder: string
  ): Promise<string> {
    // 1. Get authentication token
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error('Failed to get authentication token');
    }

    // 2. Detect content type
    const contentType = this.getContentType(uri);

    // 3. Create form data
    const formData = new FormData();

    // Read file as blob for upload
    const response = await fetch(uri);
    const blob = await response.blob();

    formData.append('file', blob, this.getFilename(uri));
    formData.append('folder', folder);

    // 5. Upload to Worker
    const uploadResponse = await fetch(
      `${R2_CONFIG.WORKER_URL}/upload/${bucket}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Upload failed with status ${uploadResponse.status}`
      );
    }

    const data: UploadResponse = await uploadResponse.json();

    if (!data.success || !data.publicUrl) {
      throw new Error('Invalid response from upload server');
    }

    console.log(`✅ Upload successful: ${data.filename} (${data.size} bytes)`);
    return data.publicUrl;
  }

  /**
   * Get Supabase authentication token
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        console.warn('No active session, using mock token for development');
        // For development without auth, return a mock token
        // In production, this should fail if no session exists
        return 'mock-token-for-dev';
      }

      return data.session.access_token;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Get content type from file URI
   */
  private getContentType(uri: string): string {
    const ext = this.getExtension(uri);
    const types: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Get file extension from URI
   */
  private getExtension(uri: string): string {
    return uri.split('.').pop()?.toLowerCase() || '';
  }

  /**
   * Get filename from URI
   */
  private getFilename(uri: string): string {
    const parts = uri.split('/');
    return parts[parts.length - 1] || 'upload';
  }

  /**
   * Fallback to base64 data URI if upload fails
   */
  private async getFallbackDataUri(uri: string): Promise<string | null> {
    try {
      console.log('Using fallback data URI...');
      const response = await fetch(uri);
      const blob = await response.blob();

      // Convert blob to base64 using FileReader
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64Part = result.split(',')[1];
          resolve(base64Part);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const contentType = this.getContentType(uri);
      return `data:${contentType};base64,${base64}`;
    } catch (error) {
      console.error('Failed to create fallback data URI:', error);
      return null;
    }
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if R2 is available (health check)
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${R2_CONFIG.WORKER_URL}/health`, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      console.warn('R2 health check failed:', error);
      return false;
    }
  }
}

export const r2StorageService = new R2StorageService();
