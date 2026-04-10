/**
 * MediaManager — WhatsApp-style local media file system
 * Structured with lazy initialization to prevent Hermes ReferenceErrors.
 */

import { 
  documentDirectory, 
  getInfoAsync, 
  makeDirectoryAsync, 
  copyAsync, 
  downloadAsync, 
  deleteAsync, 
  readDirectoryAsync 
} from 'expo-file-system';

let BASE_DIR = '';
const DIRS: Record<string, string> = {};

function updateDirs() {
  BASE_DIR = `${documentDirectory}Soul/`;
  DIRS.images = `${BASE_DIR}media/images/`;
  DIRS.videos = `${BASE_DIR}media/videos/`;
  DIRS.audio = `${BASE_DIR}media/audio/`;
  DIRS.files = `${BASE_DIR}media/files/`;
  DIRS.thumbnails = `${BASE_DIR}thumbnails/`;
  DIRS.statusMy = `${BASE_DIR}status/my/`;
  DIRS.statusReceived = `${BASE_DIR}status/received/`;
  DIRS.temp = `${BASE_DIR}temp/`;
}

type MediaType = 'image' | 'video' | 'audio' | 'file' | 'status';

export const ensureDirectories = async (): Promise<void> => {
  updateDirs();
  for (const dir of Object.values(DIRS)) {
    const info = await getInfoAsync(dir);
    if (!info.exists) {
      await makeDirectoryAsync(dir, { intermediates: true });
    }
  }
  console.log('[MediaManager] Directory structure initialized.');
};

const getDirForType = (type: MediaType, subType?: 'my' | 'received'): string => {
  updateDirs();
  switch (type) {
    case 'image': return DIRS.images;
    case 'video': return DIRS.videos;
    case 'audio': return DIRS.audio;
    case 'file': return DIRS.files;
    case 'status': return subType === 'received' ? DIRS.statusReceived : DIRS.statusMy;
    default: return DIRS.files;
  }
};

const getExtension = (uri: string): string => {
  const parts = uri.split('.');
  return parts[parts.length - 1]?.split('?')[0]?.toLowerCase() || 'bin';
};

const generateFilename = (type: string, messageId: string, ext: string): string => {
  const prefix = type === 'image' ? 'img' : type === 'video' ? 'vid' : type === 'audio' ? 'aud' : 'file';
  return `${prefix}_${messageId}_${Date.now()}.${ext}`;
};

export const saveMediaLocally = async (uri: string, type: MediaType, messageId: string, subType?: 'my' | 'received'): Promise<string> => {
  await ensureDirectories();
  const destPath = getDirForType(type, subType) + generateFilename(type, messageId, getExtension(uri));
  await copyAsync({ from: uri, to: destPath });
  return destPath;
};

export const downloadMedia = async (url: string, type: MediaType, messageId: string, subType?: 'my' | 'received'): Promise<string> => {
  await ensureDirectories();
  const destPath = getDirForType(type, subType) + generateFilename(type, messageId, getExtension(url));
  const result = await downloadAsync(url, destPath);
  return result.uri;
};

export const saveToTemp = async (uri: string, messageId: string): Promise<string> => {
  await ensureDirectories();
  const destPath = `${DIRS.temp}temp_${messageId}_${Date.now()}.${getExtension(uri)}`;
  await copyAsync({ from: uri, to: destPath });
  return destPath;
};

export const fileExists = async (path: string): Promise<boolean> => {
  try {
    const info = await getInfoAsync(path);
    return info.exists;
  } catch { return false; }
};

export const deleteLocalFile = async (path: string): Promise<void> => {
  try {
    const info = await getInfoAsync(path);
    if (info.exists) await deleteAsync(path, { idempotent: true });
  } catch (_) {}
};

export const cleanTemp = async (): Promise<void> => {
  updateDirs();
  try {
    const info = await getInfoAsync(DIRS.temp);
    if (info.exists) {
      await deleteAsync(DIRS.temp, { idempotent: true });
      await makeDirectoryAsync(DIRS.temp, { intermediates: true });
    }
  } catch (_) {}
};

export const getStorageUsage = async (): Promise<{ totalBytes: number; breakdown: Record<string, number> }> => {
  updateDirs();
  const breakdown: Record<string, number> = {};
  let totalBytes = 0;
  for (const [key, dir] of Object.entries(DIRS)) {
    try {
      const info = await getInfoAsync(dir);
      if (info.exists) {
        const files = await readDirectoryAsync(dir);
        let dirSize = 0;
        for (const file of files) {
          const fInfo = await getInfoAsync(dir + file);
          if (fInfo.exists && (fInfo as any).size) dirSize += (fInfo as any).size;
        }
        breakdown[key] = dirSize;
        totalBytes += dirSize;
      }
    } catch (_) { breakdown[key] = 0; }
  }
  return { totalBytes, breakdown };
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const mediaManager = {
  ensureDirectories, saveMediaLocally, downloadMedia, saveToTemp,
  fileExists, deleteLocalFile, cleanTemp, getStorageUsage, formatBytes,
  get BASE_DIR() { updateDirs(); return BASE_DIR; },
  get DIRS() { updateDirs(); return DIRS; }
};
