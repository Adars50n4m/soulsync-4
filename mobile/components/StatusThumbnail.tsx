import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ImageStyle, StyleProp, ViewStyle } from 'react-native';
import { SoulLoader } from './ui/SoulLoader';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { getInfoAsync } from 'expo-file-system';
import { proxySupabaseUrl } from '../config/api';
import { statusService } from '../services/StatusService';

interface StatusThumbnailProps {
  statusId: string;
  mediaKey?: string;
  uriHint?: string;
  mediaType: 'image' | 'video';
  style?: StyleProp<ViewStyle | ImageStyle>;
  containerStyle?: any;
  blurRadius?: number;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  fallback?: React.ReactNode;
  showLoader?: boolean;
}

// ── Persistent resolved-URI cache ──────────────────────────────────────────
// Module-level cache of successfully-resolved URIs keyed by statusId.
//
// Two layers:
//   1) In-memory Map → survives remounts within a session (no loader flash
//      when the parent re-renders or the contact list re-orders).
//   2) AsyncStorage mirror → survives full app restarts so thumbnails reload
//      instantly on cold start, mirroring WhatsApp/Instagram behaviour.
//
// We also rely on expo-image's `memory-disk` cache policy (set on the <Image/>
// below) so that the actual image bytes for remote URLs are persisted on disk
// by the imaging layer itself. This cache only tracks "which URL to use".
const RESOLVED_CACHE_STORAGE_KEY = 'soul:status_thumb_cache_v1';
const RESOLVED_CACHE_MAX_ENTRIES = 500;

const resolvedUriCache = new Map<string, string>();
let cacheHydrated = false;
let cacheHydratePromise: Promise<void> | null = null;

const hydrateCacheOnce = (): Promise<void> => {
  if (cacheHydrated) return Promise.resolve();
  if (cacheHydratePromise) return cacheHydratePromise;
  cacheHydratePromise = (async () => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const raw = await AsyncStorage.getItem(RESOLVED_CACHE_STORAGE_KEY);
      if (raw) {
        const obj = JSON.parse(raw) as Record<string, string>;
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'string' && v) resolvedUriCache.set(k, v);
        }
      }
    } catch (e) {
      console.warn('[StatusThumbnail] Failed to hydrate cache:', e);
    } finally {
      cacheHydrated = true;
    }
  })();
  return cacheHydratePromise;
};

// Kick off hydration eagerly at module load.
void hydrateCacheOnce();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
const persistCacheSoon = () => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      // Cap stored entries; keep the most recently inserted ones (Map preserves insertion order).
      const entries = Array.from(resolvedUriCache.entries()).slice(-RESOLVED_CACHE_MAX_ENTRIES);
      const obj: Record<string, string> = {};
      for (const [k, v] of entries) obj[k] = v;
      await AsyncStorage.setItem(RESOLVED_CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('[StatusThumbnail] Failed to persist cache:', e);
    }
  }, 500);
};

/**
 * StatusThumbnail — Asynchronously resolves and displays a status image or video frame.
 * Handles R2 URL signing and local cache lookups automatically.
 */
export const StatusThumbnail: React.FC<StatusThumbnailProps> = ({
  statusId,
  mediaKey,
  uriHint,
  mediaType,
  style,
  containerStyle,
  blurRadius = 0,
  resizeMode = 'cover',
  fallback,
  showLoader = true,
}) => {
  // Seed state from the module-level cache so a remount with a previously-
  // resolved statusId is instant (no loader flash, no re-fetch).
  const cachedUri = resolvedUriCache.get(statusId) ?? null;
  const [uri, setUri] = useState<string | null>(cachedUri);
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedUri);
  const [sourceAttempt, setSourceAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const persist = (resolved: string) => {
      resolvedUriCache.set(statusId, resolved);
      persistCacheSoon();
      if (isMounted) {
        setUri(resolved);
        setSourceAttempt(0);
      }
    };

    const resolveMedia = async () => {
      try {
        // Always start fresh — a new statusId/mediaKey/uriHint shouldn't
        // inherit the previous resource's exhausted state.
        if (isMounted) setSourceAttempt(0);

        // Make sure the disk-backed cache has loaded before we decide
        // whether to show the loader. On cold start this avoids a
        // pointless loader flash for thumbnails we already resolved
        // in a previous session.
        await hydrateCacheOnce();

        // Sync displayed state to the current statusId synchronously:
        //  - cached → render its URI immediately (no loader flash)
        //  - not cached → clear any stale URI from a previous statusId
        //    so we don't briefly show the wrong thumbnail while loading
        const existing = resolvedUriCache.get(statusId);
        if (isMounted) {
          if (existing) {
            setUri(existing);
            setLoading(false);
          } else {
            setUri(null);
            setLoading(true);
          }
        }

        if (uriHint) {
          if (uriHint.startsWith('http://') || uriHint.startsWith('https://') || uriHint.startsWith('content://')) {
            persist(uriHint);
            return;
          }

          if (uriHint.startsWith('file://')) {
            const info = await getInfoAsync(uriHint);
            if (info.exists) {
              persist(uriHint);
              return;
            }
          }
        }

        const source = await statusService.getMediaSource(statusId, mediaKey || uriHint);
        if (source) {
          console.log(`[StatusThumbnail] Resolved URI for ${statusId}: ${source.uri}`);
          persist(source.uri);
        }
      } catch (error) {
        console.warn(`[StatusThumbnail] Failed to resolve media for ${statusId}:`, error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    resolveMedia();

    return () => { isMounted = false; };
  }, [statusId, mediaKey, uriHint]);

  useEffect(() => {
    let isMounted = true;

    const buildVideoThumbnail = async () => {
      if (mediaType !== 'video' || !uri) {
        if (isMounted) setThumbnailUri(null);
        return;
      }

      try {
        const VideoThumbnails = require('expo-video-thumbnails');
        if (!VideoThumbnails?.getThumbnailAsync) {
          if (isMounted) setThumbnailUri(null);
          return;
        }

        const result = await VideoThumbnails.getThumbnailAsync(uri, { time: 1000 });
        if (isMounted) {
          setThumbnailUri(result?.uri || null);
        }
      } catch (error) {
        console.warn(`[StatusThumbnail] Failed to build video thumbnail for ${statusId}:`, error);
        if (isMounted) setThumbnailUri(null);
      }
    };

    void buildVideoThumbnail();

    return () => { isMounted = false; };
  }, [mediaType, statusId, uri]);

  const fallbackCandidates = [
    uri,
    mediaKey ? proxySupabaseUrl(mediaKey) : null,
    mediaKey || null,
    uriHint || null,
  ].filter((value, index, arr): value is string => !!value && arr.indexOf(value) === index);

  const exhausted = sourceAttempt >= fallbackCandidates.length;
  const displayUri = mediaType === 'video'
    ? thumbnailUri
    : (exhausted ? null : (fallbackCandidates[sourceAttempt] || uri));

  const handleImageError = () => {
    if (mediaType === 'video') {
      setThumbnailUri(null);
      return;
    }

    if (sourceAttempt < fallbackCandidates.length - 1) {
      const nextAttempt = sourceAttempt + 1;
      console.warn(
        `[StatusThumbnail] Image load failed for ${statusId}, retrying with fallback ${nextAttempt + 1}/${fallbackCandidates.length}`
      );
      setSourceAttempt(nextAttempt);
      return;
    }

    // All fallbacks exhausted. Drop the (now stale) cached URI so a future
    // remount with fresh props can re-resolve from scratch, and mark this
    // render as exhausted so the fallback icon shows. Don't setUri(null) —
    // we'd lose the value the next remount could've reused.
    console.warn(`[StatusThumbnail] All image sources failed for ${statusId}`);
    resolvedUriCache.delete(statusId);
    persistCacheSoon();
    setSourceAttempt((n) => n + 1); // push past length so `exhausted` becomes true
  };

  return (
    <View style={[styles.container, style as any, containerStyle]}>
      {displayUri ? (
        <Image
          source={{ uri: displayUri }}
          style={styles.image}
          contentFit={resizeMode as any}
          transition={200}
          // Force expo-image to keep the bytes in its on-disk cache so a
          // second viewing of the same URL never hits the network. Pairs
          // with our resolved-URI cache: that one remembers WHICH URL,
          // this one remembers the BYTES of that URL.
          cachePolicy="memory-disk"
          recyclingKey={statusId}
          onError={handleImageError}
        />
      ) : !loading && (
        fallback ? (
          <View style={styles.fallback}>
            {fallback}
          </View>
        ) : (
          <View style={styles.fallback}>
            <MaterialIcons 
              name="image-not-supported" 
              size={24} 
              color="rgba(255,255,255,0.2)" 
            />
          </View>
        )
      )}
      
      {loading && showLoader && (
        <View style={styles.loader}>
          <SoulLoader size={30} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
});
