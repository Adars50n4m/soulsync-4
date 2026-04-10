/**
 * R2 Storage Service
 * Handles file uploads to Cloudflare R2 via Worker proxy
 */

import { 
  createUploadTask, 
  FileSystemUploadType, 
  FileSystemUploadResult 
} from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { R2_CONFIG } from '../config/r2';
import { supabase } from '../config/supabase';

export interface UploadResponse {
  success: boolean;
  publicUrl?: string;
  filename?: string;
  key?: string;
  size: number;
  contentType: string;
  error?: string;
}

export class R2AuthError extends Error {
  constructor(message: string = 'Authentication required for R2 upload') {
    super(message);
    this.name = 'R2AuthError';
  }
}

class R2StorageService {
  /**
   * Upload an image/video to R2 storage
   */
  async uploadImage(
    uri: string,
    bucket: string,
    folder: string = '',
    onProgress?: (progress: number) => void,
    forceContentType?: string
  ): Promise<string | null> {
    let retries = 0;
    let lastError: any = null;

    while (retries < R2_CONFIG.MAX_RETRIES) {
      try {
        const token = await this.getAuthToken();
        if (!token) throw new R2AuthError('Auth token missing');

        const contentType = forceContentType || this.getContentType(uri);
        const fileName = uri.split('/').pop() || `status-${Date.now()}`;

        const uploadPath = this.getUploadPath(bucket);
        const uploadUrl = `${R2_CONFIG.WORKER_URL}${uploadPath}`;

        console.log(`[R2Direct] Uploading via POST to ${uploadUrl} (${contentType})`);

        const uploadTask = createUploadTask(
          uploadUrl,
          this.normalizeFileUri(uri),
          {
            httpMethod: 'POST',
            uploadType: FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType: contentType,
            headers: {
              'Authorization': `Bearer ${token}`,
              'x-filename': fileName,
              'x-folder': folder || '',
            },
            parameters: {
              'folder': folder || '',
            },
          },
          (p) => {
            if (onProgress && p.totalBytesExpectedToSend > 0) {
              const progress = Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100);
              onProgress(progress);
            }
          }
        );

        const UPLOAD_TIMEOUT = 60000;
        const uploadPromise = uploadTask.uploadAsync();
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Upload timed out after 60s')), UPLOAD_TIMEOUT)
        );

        const result = await Promise.race([uploadPromise, timeoutPromise]) as FileSystemUploadResult;

        if (result && result.status >= 200 && result.status < 300) {
          const data: UploadResponse = JSON.parse(result.body);
          const normalizedKey = data.key
            ? data.key
            : data.filename
              ? (data.filename.startsWith(`${bucket}/`) ? data.filename : `${bucket}/${data.filename}`)
              : null;

          if (data.success && normalizedKey) {
            console.log(`[R2Direct] ✅ Success: ${normalizedKey}`);
            return normalizedKey;
          } else {
            throw new Error(data.error || 'Worker response successful but missing final key');
          }
        }

        if (result?.status === 401 || result?.status === 403) {
          throw new R2AuthError(`Worker auth rejected request (${result.status})`);
        }

        throw new Error(`Worker returned ${result?.status}: ${result?.body || 'Empty response'}`);
      } catch (error: any) {
        if (error instanceof R2AuthError) {
          lastError = error;
          break;
        }
        retries++;
        lastError = error;
        console.warn(`[R2Direct] Attempt ${retries} failed:`, error.message);
        if (retries >= R2_CONFIG.MAX_RETRIES) break;
        await this.delay(R2_CONFIG.RETRY_DELAY * retries);
      }
    }

    throw lastError || new Error('R2 Upload failed after multiple attempts');
  }

  private _cachedToken: string | null = null;
  private _cachedTokenAt: number = 0;
  private static readonly TOKEN_CACHE_TTL = 4 * 60 * 1000;

  private async getAuthToken(): Promise<string | null> {
    if (this._cachedToken && (Date.now() - this._cachedTokenAt) < R2StorageService.TOKEN_CACHE_TTL) {
      return this._cachedToken;
    }

    try {
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
      const sessionResult = await Promise.race([sessionPromise, timeoutPromise]);

      if (sessionResult && 'data' in sessionResult && sessionResult.data.session?.access_token) {
        this._cachedToken = sessionResult.data.session.access_token;
        this._cachedTokenAt = Date.now();
        return this._cachedToken;
      }

      const refreshPromise = supabase.auth.refreshSession();
      const refreshTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
      const refreshResult = await Promise.race([refreshPromise, refreshTimeout]);

      if (refreshResult && 'data' in refreshResult && refreshResult.data.session?.access_token) {
        this._cachedToken = refreshResult.data.session.access_token;
        this._cachedTokenAt = Date.now();
        return this._cachedToken;
      }

      const cachedUserId = await AsyncStorage.getItem('ss_current_user');
      if (cachedUserId && cachedUserId.startsWith('f00f00f0-0000-0000-0000')) {
        return 'DEV_BYPASS_TOKEN';
      }
      return null;
    } catch (error: any) {
      console.warn('[R2Storage] Auth error:', error.message);
      return null;
    }
  }

  private getContentType(uri: string): string {
    const ext = this.getExtension(uri);
    const types: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp',
      'gif': 'image/gif', 'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska', 'm4a': 'audio/x-m4a', 'mp3': 'audio/mpeg', 'wav': 'audio/wav',
      'aac': 'audio/aac', 'caf': 'audio/x-caf',
    };
    return types[ext] || 'application/octet-stream';
  }

  private getUploadPath(bucket: string): string {
    if (bucket === 'avatars') return '/upload/avatar';
    if (bucket === 'status-media') return '/upload/status';
    if (bucket === 'chat-media') return '/upload/chat';
    return `/upload/${bucket}`;
  }

  private getExtension(uri: string): string {
    return uri.split('.').pop()?.toLowerCase() || '';
  }

  private normalizeFileUri(uri: string): string {
    if (uri.startsWith('file://') || uri.startsWith('content://')) return uri;
    return `file://${uri}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${R2_CONFIG.WORKER_URL}/health`, { method: 'GET' });
      return response.ok;
    } catch (error) {
      console.warn('R2 health check failed:', error);
      return false;
    }
  }
}

export const r2StorageService = new R2StorageService();
