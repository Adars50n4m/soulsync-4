/**
 * MediaDownloadService - WhatsApp-style offline media handling
 * 
 * Handles downloading media files from Cloudflare R2 to local device storage
 * using expo-file-system for offline viewing.
 */

import { 
  documentDirectory, 
  getInfoAsync, 
  makeDirectoryAsync, 
  deleteAsync, 
  downloadAsync, 
  copyAsync,
  readDirectoryAsync,
  FileInfo
} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { offlineService, getDb } from './LocalDBService';
import { MediaStatus } from '../types';
import { soulFolderService } from './SoulFolderService';
import { proxySupabaseUrl } from '../config/api';

// OLD flat cache — kept for backward compatibility during migration
const LEGACY_MEDIA_DIR = `${documentDirectory}media_cache`;

export interface DownloadProgress {
  messageId: string;
  progress: number; // 0-100
  bytesWritten: number;
  totalBytes: number;
}

export interface DownloadResult {
  success: boolean;
  localUri?: string;
  error?: string;
  fileSize?: number;
  messageId?: string;
}

/**
 * Ensure media directory exists — now uses Soul folder structure
 */
async function ensureMediaDir(mediaType?: string, isSent?: boolean): Promise<string> {
  await soulFolderService.init();
  if (mediaType) {
    const type = mediaType as 'image' | 'video' | 'audio' | 'document' | 'voice_note';
    return soulFolderService.getMediaPath(type, isSent ?? false);
  }
  const dirInfo = await getInfoAsync(LEGACY_MEDIA_DIR);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(LEGACY_MEDIA_DIR, { intermediates: true });
  }
  return LEGACY_MEDIA_DIR;
}

export async function localFileExists(localUri: string): Promise<boolean> {
  try {
    const info = await getInfoAsync(localUri);
    return info.exists;
  } catch {
    return false;
  }
}

export async function deleteLocalFile(localUri: string): Promise<boolean> {
  try {
    const exists = await localFileExists(localUri);
    if (exists) {
      await deleteAsync(localUri, { idempotent: true });
    }
    return true;
  } catch (error) {
    console.error('[MediaDownload] Error deleting file:', error);
    return false;
  }
}

export async function downloadMedia(
  messageId: string,
  remoteUrl: string,
  onProgress?: (progress: DownloadProgress) => void,
  mediaType?: string,
  isSent: boolean = false
): Promise<DownloadResult> {
  try {
    const ext = remoteUrl.split('.').pop()?.split('?')[0] || 'bin';
    const inferredType = mediaType || soulFolderService.inferMediaType(ext);
    const destPath = soulFolderService.getDestinationPath(inferredType as any, isSent, remoteUrl);
    
    const existingUri = await offlineService.getMediaDownload(messageId);
    if (existingUri) {
      if (await localFileExists(existingUri)) {
        return { success: true, localUri: existingUri, messageId };
      }
    }
    
    await offlineService.updateMediaStatus(messageId, 'downloading');
    console.log(`[MediaDownload] Starting download for msg ${messageId}:`, remoteUrl);
    
    const downloadResult = await downloadAsync(remoteUrl, destPath, { headers: { 'Accept': '*/*' } });
    const fileInfo = await getInfoAsync(downloadResult.uri) as FileInfo;
    const fileSize = fileInfo.exists ? (fileInfo as any).size : 0;
    
    await offlineService.updateMessageLocalUri(messageId, downloadResult.uri, fileSize);

    try {
      await soulFolderService.saveToDeviceGallery(downloadResult.uri, inferredType as any, isSent);
    } catch (galErr) {
      console.warn('[MediaDownload] Gallery save ignored:', galErr);
    }

    return { success: true, localUri: downloadResult.uri, fileSize };
  } catch (error) {
    console.error('[MediaDownload] Download failed:', error);
    await offlineService.updateMediaStatus(messageId, 'download_failed' as any);
    return { success: false, error: error instanceof Error ? error.message : 'Download failed' };
  }
}

export async function downloadMediaWithProgress(
  messageId: string,
  remoteUrl: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadResult> {
  const result = await downloadMedia(messageId, remoteUrl);
  if (onProgress && result.success) {
    onProgress({
      messageId,
      progress: 100,
      bytesWritten: result.fileSize || 0,
      totalBytes: result.fileSize || 0
    });
  }
  return result;
}

export async function saveLocalMediaFromUri(
  messageId: string,
  sourceUri: string,
  mediaType?: string
): Promise<DownloadResult> {
  try {
    const ext = sourceUri.split('.').pop()?.split('?')[0] || 'bin';
    const inferredType = mediaType || soulFolderService.inferMediaType(ext);
    const destUri = soulFolderService.getDestinationPath(inferredType as any, true, sourceUri);
    
    await ensureMediaDir(inferredType, true);
    await copyAsync({ from: sourceUri, to: destUri });

    try {
      await soulFolderService.saveToDeviceGallery(destUri, inferredType as any, true);
    } catch (galErr) {
      console.warn('[MediaDownload] Gallery save for sent media failed:', galErr);
    }

    const fileInfo = await getInfoAsync(destUri) as FileInfo;
    const fileSize = fileInfo.exists ? (fileInfo as any).size : 0;

    return { success: true, localUri: destUri, fileSize };
  } catch (error) {
    console.error('[MediaDownload] Save local media failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Save failed' };
  }
}

export async function clearMediaCache(): Promise<{ deletedCount: number; freedBytes: number }> {
  let totalDeleted = 0;
  let totalFreed = 0;

  try {
    const dirInfo = await getInfoAsync(LEGACY_MEDIA_DIR);
    if (dirInfo.exists) {
      const files = await readDirectoryAsync(LEGACY_MEDIA_DIR);
      for (const file of files) {
        const fileUri = `${LEGACY_MEDIA_DIR}/${file}`;
        const info = await getInfoAsync(fileUri) as FileInfo;
        if (info.exists && (info as any).size) {
          totalFreed += (info as any).size;
          totalDeleted++;
        }
      }
      await deleteAsync(LEGACY_MEDIA_DIR, { idempotent: true });
    }
  } catch (_) {}

  try {
    const breakdown = await soulFolderService.getStorageBreakdown();
    for (const type of Object.keys(breakdown)) {
      const stats = breakdown[type];
      totalDeleted += stats.count;
      totalFreed += stats.bytes;
    }
    for (const type of ['images', 'videos', 'audio', 'documents', 'voiceNotes'] as const) {
      await soulFolderService.clearMediaByType(type);
    }
  } catch (_) {}

  try {
    const docDir = documentDirectory;
    if (docDir) {
      const files = await readDirectoryAsync(docDir);
      for (const file of files.filter(f => f.startsWith('cached_media_'))) {
        const filePath = `${docDir}${file}`;
        const info = await getInfoAsync(filePath) as FileInfo;
        if (info.exists && (info as any).size) {
          totalFreed += (info as any).size;
          totalDeleted++;
        }
        await deleteAsync(filePath, { idempotent: true });
      }
    }
  } catch (_) {}

  return { deletedCount: totalDeleted, freedBytes: totalFreed };
}

export async function getMediaCacheSize(): Promise<{ fileCount: number; totalBytes: number }> {
  let totalFiles = 0;
  let totalBytes = 0;

  try {
    const dirInfo = await getInfoAsync(LEGACY_MEDIA_DIR);
    if (dirInfo.exists) {
      const files = await readDirectoryAsync(LEGACY_MEDIA_DIR);
      for (const file of files) {
        const fileUri = `${LEGACY_MEDIA_DIR}/${file}`;
        const info = await getInfoAsync(fileUri) as FileInfo;
        if (info.exists && (info as any).size) {
          totalBytes += (info as any).size;
          totalFiles++;
        }
      }
    }
  } catch (_) {}

  try {
    const breakdown = await soulFolderService.getStorageBreakdown();
    for (const type of Object.keys(breakdown)) {
      totalFiles += breakdown[type].count;
      totalBytes += breakdown[type].bytes;
    }
  } catch (_) {}

  return { fileCount: totalFiles, totalBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const mediaDownloadService = {
  downloadMedia,
  downloadMediaWithProgress,
  saveLocalMediaFromUri,
  deleteLocalFile,
  localFileExists,
  clearMediaCache,
  getMediaCacheSize,
  formatBytes,
  getLocalMediaUri: (messageId: string, filename: string) => `${LEGACY_MEDIA_DIR}/${filename}`
};

export async function syncAvatar(contactId: string, remoteUrl: string | null, serverUpdatedAt?: string): Promise<string | null> {
  if (!remoteUrl || remoteUrl.startsWith('file://')) return null;
  const resolvedRemoteUrl = proxySupabaseUrl(remoteUrl);
  try {
    const contact = await offlineService.getContact(contactId);
    if (contact?.localAvatarUri && contact?.avatarUpdatedAt === serverUpdatedAt) {
      if (await localFileExists(contact.localAvatarUri)) return contact.localAvatarUri;
    }
    const destination = soulFolderService.getDestinationPath('profile_photo', false, resolvedRemoteUrl, contactId);
    if (!resolvedRemoteUrl.trim().startsWith('http')) return null;
    await soulFolderService.init();
    const result = await downloadAsync(resolvedRemoteUrl, destination);
    if (result.status === 200) {
      await offlineService.updateContactAvatar(contactId, result.uri, serverUpdatedAt || new Date().toISOString());
      return result.uri;
    }
    return contact?.localAvatarUri || null;
  } catch (error) {
    console.warn(`[MediaDownload] syncAvatar failed for ${contactId}:`, error);
    return null;
  }
}

export async function downloadStatusMedia(status: any): Promise<string | null> {
  if (status.mediaLocalPath && await localFileExists(status.mediaLocalPath)) return status.mediaLocalPath;
  const url = status.mediaUrl;
  if (!url) return null;
  try {
    await soulFolderService.init();
    const destPath = soulFolderService.getDestinationPath('status' as any, false, url, status.id);
    const result = await downloadAsync(url, destPath);
    if (result.status === 200) {
      const db = await getDb();
      await db.runAsync('UPDATE cached_statuses SET media_local_path = ? WHERE id = ?', [result.uri, status.id]);
      return result.uri;
    }
  } catch (err) {
    console.error(`[MediaDownload] downloadStatusMedia failed:`, err);
  }
  return null;
}
