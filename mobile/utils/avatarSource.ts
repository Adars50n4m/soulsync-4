import { Image } from 'expo-image';
import { proxySupabaseUrl, SUPABASE_ENDPOINT } from '../config/api';

type AvatarType = 'default' | 'teddy' | 'memoji' | 'custom';
type TeddyVariant = 'boy' | 'girl';

interface ResolveAvatarImageUriParams {
  uri?: string | null;
  localUri?: string | null;
  avatarType?: AvatarType;
  teddyVariant?: TeddyVariant;
  fallbackId?: string | null;
}

const warmedAvatarSources = new Set<string>();

export const normalizeAvatarSource = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const isAlreadyProxiedAvatarSource = (value?: string) => {
  if (!value) return false;
  const proxyOrigin = SUPABASE_ENDPOINT?.replace(/\/$/, '');
  return Boolean(
    value.startsWith('data:') ||
      value.startsWith('file://') ||
      value.includes('wsrv.nl/?url=') ||
      (proxyOrigin && value.startsWith(proxyOrigin))
  );
};

export const proxyAvatarRemoteUri = (value?: string | null) => {
  const normalized = normalizeAvatarSource(value);
  if (!normalized) return undefined;
  if (isAlreadyProxiedAvatarSource(normalized)) return normalized;
  return proxySupabaseUrl(normalized) || normalized;
};

export const resolveAvatarImageUri = ({
  uri,
  localUri,
  avatarType = 'default',
  teddyVariant,
  fallbackId,
}: ResolveAvatarImageUriParams) => {
  const normalizedLocalUri = normalizeAvatarSource(localUri);
  const normalizedUri = normalizeAvatarSource(uri);

  if (avatarType === 'teddy' || avatarType === 'memoji') {
    const variant = avatarType === 'memoji' ? 'girl' : (teddyVariant || 'boy');
    const identifier = fallbackId || normalizedUri || 'default';
    return `https://avatar.iran.liara.run/public/${variant}?username=${identifier}`;
  }

  return normalizedLocalUri || proxyAvatarRemoteUri(normalizedUri) || normalizedUri || '';
};

export const markAvatarSourceWarm = (value?: string | null) => {
  const normalized = normalizeAvatarSource(value);
  if (normalized) {
    warmedAvatarSources.add(normalized);
  }
};

export const isAvatarSourceWarm = (value?: string | null) => {
  const normalized = normalizeAvatarSource(value);
  return normalized ? warmedAvatarSources.has(normalized) : false;
};

export const warmAvatarSource = async (value?: string | null) => {
  const normalized = normalizeAvatarSource(value);
  if (!normalized) return false;

  if (warmedAvatarSources.has(normalized)) {
    return true;
  }

  if (!normalized.startsWith('http')) {
    markAvatarSourceWarm(normalized);
    return true;
  }

  try {
    const success = await Image.prefetch(normalized);
    if (success) {
      markAvatarSourceWarm(normalized);
    }
    return Boolean(success);
  } catch {
    return false;
  }
};
