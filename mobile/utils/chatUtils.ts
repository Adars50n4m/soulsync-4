import { proxySupabaseUrl } from '../config/api';
import { Message } from '../types';
export const MEDIA_GROUP_MARKER = '__MEDIA_GROUP_V1__:';

export interface ChatMediaItem {
    url: string;
    type: string;
    caption?: string;
    name?: string;
    localFileUri?: string;
    thumbnail?: string;
    duration?: number;
}

const normalizeMediaUrl = (url?: string) => (url ? proxySupabaseUrl(url) : '');

export const isGroupedMediaThumbnail = (thumbnail?: string): boolean =>
    !!thumbnail && thumbnail.startsWith(MEDIA_GROUP_MARKER);

export const decodeGroupedItems = (thumbnail?: string): ChatMediaItem[] => {
    if (!thumbnail || !thumbnail.startsWith(MEDIA_GROUP_MARKER)) return [];
    try {
        const raw = thumbnail.slice(MEDIA_GROUP_MARKER.length);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(Boolean).map((item: any) => ({
            url: normalizeMediaUrl(item?.url),
            type: item?.type || 'image',
            caption: item?.caption,
            name: item?.name,
            localFileUri: item?.localFileUri,
            thumbnail: item?.thumbnail,
            duration: item?.duration,
        }));
    } catch {
        return [];
    }
};

export const encodeGroupedItems = (items: ChatMediaItem[]): string =>
    `${MEDIA_GROUP_MARKER}${JSON.stringify(items)}`;

export const mergeGroupedMediaThumbnail = (
    existingThumbnail?: string,
    nextThumbnail?: string
): string | undefined => {
    if (!isGroupedMediaThumbnail(nextThumbnail)) {
        return nextThumbnail || existingThumbnail;
    }

    if (!isGroupedMediaThumbnail(existingThumbnail)) {
        return nextThumbnail;
    }

    const existingItems = decodeGroupedItems(existingThumbnail);
    const nextItems = decodeGroupedItems(nextThumbnail);
    const merged = nextItems.map((nextItem, index) => {
        const existingItem = existingItems[index];
        return {
            ...existingItem,
            ...nextItem,
            url: nextItem.url || existingItem?.url || '',
            localFileUri: nextItem.localFileUri || existingItem?.localFileUri,
            thumbnail: nextItem.thumbnail || existingItem?.thumbnail,
            type: nextItem.type || existingItem?.type || 'image',
            caption: nextItem.caption ?? existingItem?.caption,
            name: nextItem.name ?? existingItem?.name,
            duration: nextItem.duration ?? existingItem?.duration,
        };
    });

    return encodeGroupedItems(merged);
};

export const applyGroupedMediaLocalUri = (
    thumbnail: string | undefined,
    index: number,
    localFileUri: string
): string | undefined => {
    if (!isGroupedMediaThumbnail(thumbnail)) return thumbnail;

    const items = decodeGroupedItems(thumbnail);
    if (!items[index]) return thumbnail;

    items[index] = {
        ...items[index],
        localFileUri,
    };

    return encodeGroupedItems(items);
};

export const getMessageMediaItems = (msg: Message | any): ChatMediaItem[] => {
    if (!msg?.media) return [];

    // Check if media item has ANY renderable source (url, local file, or thumbnail)
    const hasSource = (m: any) => !!(m?.url || m?.localFileUri || m?.thumbnail || msg.localFileUri);

    if (Array.isArray(msg.media)) {
        return msg.media.filter(hasSource).map((m: any, index: number) => ({ 
            ...m, 
            url: normalizeMediaUrl(m?.url),
            localFileUri: m.localFileUri || (index === 0 ? msg.localFileUri : undefined),
            thumbnail: m.thumbnail || msg.media?.thumbnail 
        }));
    }

    if (Array.isArray(msg.media?.items)) {
        return msg.media.items.filter(hasSource).map((m: any, index: number) => ({ 
            ...m, 
            url: normalizeMediaUrl(m?.url),
            localFileUri: m.localFileUri || (index === 0 ? msg.localFileUri : undefined),
            thumbnail: m.thumbnail || msg.media?.thumbnail
        }));
    }

    const groupedFromThumbnail = decodeGroupedItems(msg.media?.thumbnail);
    if (groupedFromThumbnail.length > 0) {
        return groupedFromThumbnail.filter(hasSource).map((m: any, index: number) => ({
            ...m,
            localFileUri: m.localFileUri || (index === 0 ? msg.localFileUri : undefined),
        }));
    }

    if (msg.media?.url || msg.localFileUri || msg.media?.thumbnail || msg.media?.type) {
        return [{
            ...msg.media,
            url: normalizeMediaUrl(msg.media?.url),
            localFileUri: msg.localFileUri,
            thumbnail: msg.media.thumbnail
        }];
    }

    return [];
};

/**
 * Returns true if a message has no meaningful content (no text and no media).
 */
export const isMessageEmpty = (msg: Message | any): boolean => {
    if (!msg) return true;
    const hasText = !!(msg.text && msg.text.trim().length > 0);
    const hasMedia = !!(msg.media?.url || msg.media?.type);
    return !hasText && !hasMedia;
};

export const sanitizeSongTitle = (title: string): string => {
    if (!title) return '';
    return title
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\s*\[[^\]]*\]/g, '')
        .trim();
};
