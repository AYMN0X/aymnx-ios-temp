import { Directory, File, Paths } from 'expo-file-system';

const LAN_HOST_FROM_ENV = process.env.EXPO_PUBLIC_LAN_STREAM_HOST;
const LAN_PORT_FROM_ENV = process.env.EXPO_PUBLIC_LAN_STREAM_PORT;

export const LAN_STREAM_DEFAULT_HOST = (LAN_HOST_FROM_ENV || '100.97.76.123').trim();
export const LAN_STREAM_HTTP_PORT = Number.parseInt(LAN_PORT_FROM_ENV || '8080', 10) || 8080;

export function lanStreamBaseUrl(host: string = LAN_STREAM_DEFAULT_HOST): string {
  let clean = host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!/:\d+$/.test(clean)) {
    clean = `${clean}:${LAN_STREAM_HTTP_PORT}`;
  }
  return `http://${clean}`;
}

export function isLanHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h === LAN_STREAM_DEFAULT_HOST.toLowerCase()) {
    return true;
  }
  if (h === 'localhost' || h.endsWith('.local')) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return true;
  }
  return false;
}

function hostOf(input: string): string | null {
  const match = input.match(/^https?:\/\/([^/?#]+)/i);
  return match ? match[1].split(':')[0].toLowerCase() : null;
}

export function isLanStreamUrl(input: string): boolean {
  const url = toHttpUrl(input);
  if (!url) {
    return false;
  }
  return isLanHost(hostOf(url) ?? '');
}

const CACHE_DIR_NAME = 'stream-cache';

const MIN_AUDIO_FILE_BYTES = 2048;

/**
 * Cached LAN mirror files older than this are considered stale and re-downloaded
 * on next access, so a changed source file (or a reused tokenized URL) can no
 * longer serve outdated or wrong audio indefinitely.
 */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/flac': '.flac',
  'audio/webm': '.webm',
};

export type StreamResolveKind = 'local' | 'cached' | 'network';

export interface StreamResolveResult {
  uri: string;
  kind: StreamResolveKind;
}

export function isLocalUri(input: string): boolean {
  return /^(file|content|photoroom|android\.resource):/i.test(input.trim());
}

export function isWindowsLocalPath(input: string): boolean {
  return /^[a-z]:[\\/]/i.test(input.trim());
}

function toHttpUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const smb = trimmed.match(/^smb:\/\/([^/]+)(\/.*)?$/i);
  if (smb) {
    return withLanPort(smb[1], smb[2] || '/');
  }
  if (trimmed.startsWith('\\\\')) {
    const suffix = trimmed.replace(/^\\\\/, '').replace(/\\/g, '/');
    const separator = suffix.indexOf('/');
    const host = separator < 0 ? suffix : suffix.slice(0, separator);
    const rest = separator < 0 ? '/' : suffix.slice(separator);
    return withLanPort(host, rest);
  }
  return null;
}

function withLanPort(host: string, path: string): string {
  const cleanHost = host.includes(':') ? host.split(':')[0] : host;
  return `http://${cleanHost}:${LAN_STREAM_HTTP_PORT}${path || '/'}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function canonicalizeHttpUrl(input: string): string {
  const url = toHttpUrl(input);
  if (!url) {
    return input;
  }
  const [beforeQuery, ...queryParts] = url.split('?');
  const originMatch = beforeQuery.match(/^(https?:\/\/[^/?#]+)/i);
  if (!originMatch) {
    return input;
  }
  const origin = originMatch[1];
  const rawPath = beforeQuery.slice(origin.length);
  const encodedPath = rawPath
    .split('/')
    .map((segment) => (segment ? encodeURIComponent(safeDecode(segment)) : segment))
    .join('/');
  const query = queryParts.length > 0 ? `?${queryParts.join('?')}` : '';
  return `${origin}${encodedPath}${query}`;
}

function hashString(value: string): string {
  // Two independent 32-bit hashes concatenated into a 64-bit filename key so
  // URL hash collisions cannot alias two different streams to one cached file.
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    h1 = (h1 * 33) ^ code;
    h2 = (h2 * 31) ^ code;
    h1 |= 0;
    h2 |= 0;
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}`;
}

function pathExtension(url: string): string {
  const noQuery = url.split(/[?#]/, 1)[0];
  const match = noQuery.match(/\.[a-zA-Z0-9]{1,5}$/);
  return match ? match[0].toLowerCase() : '';
}

function extensionFor(url: string, mimeType?: string): string {
  if (mimeType) {
    const mapped = MIME_EXTENSIONS[mimeType.split(';')[0].trim().toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }
  const ext = pathExtension(url);
  return ext || '.bin';
}

function cacheDirectory(): Directory {
  return new Directory(Paths.cache, CACHE_DIR_NAME);
}

function cacheFilePath(url: string, mimeType?: string): string {
  return new File(
    cacheDirectory(),
    `${hashString(url)}${extensionFor(url, mimeType)}`
  ).uri;
}

export async function getCachedStream(httpUrl: string): Promise<string | null> {
  if (!httpUrl || !/^https?:\/\//i.test(httpUrl)) {
    return null;
  }
  const file = new File(cacheFilePath(httpUrl));
  try {
    if (!file.exists) {
      return null;
    }
    if ((file.size ?? 0) < MIN_AUDIO_FILE_BYTES) {
      console.warn('[stream-cache] Ignoring suspiciously small cached stream, re-downloading.');
      return null;
    }
    const modifiedAt = file.modificationTime;
    if (typeof modifiedAt === 'number' && Date.now() - modifiedAt > CACHE_MAX_AGE_MS) {
      console.warn('[stream-cache] Cached stream is stale, re-downloading.');
      return null;
    }
    return file.uri;
  } catch (error) {
    console.warn('[stream-cache] Cache lookup failed.', error);
    return null;
  }
}

export async function cacheStream(httpUrl: string, mimeType?: string): Promise<string> {
  if (!httpUrl || !/^https?:\/\//i.test(httpUrl)) {
    throw new Error(`[stream-cache] Not a fetchable URL: ${httpUrl}`);
  }
  const directory = cacheDirectory();
  try {
    directory.create({ idempotent: true, intermediates: true });
  } catch (error) {
    console.warn('[stream-cache] Could not create cache directory.', error);
  }
  const destination = new File(directory, `${hashString(httpUrl)}${extensionFor(httpUrl, mimeType)}`);
  if (destination.exists) {
    const stale =
      typeof destination.modificationTime === 'number' &&
      Date.now() - destination.modificationTime > CACHE_MAX_AGE_MS;
    const tooSmall = (destination.size ?? 0) < MIN_AUDIO_FILE_BYTES;
    if (!stale && !tooSmall) {
      return destination.uri;
    }
    console.warn('[stream-cache] Replacing stale cache entry for:', httpUrl);
    try {
      destination.delete();
    } catch (error) {
      console.warn('[stream-cache] Could not delete stale cache entry.', error);
    }
  }
  const downloaded = await File.downloadFileAsync(httpUrl, destination);
  const file = downloaded && downloaded.exists ? downloaded : destination;
  try {
    if (file.exists && (file.size ?? 0) < MIN_AUDIO_FILE_BYTES) {
      file.delete();
      throw new Error(
        `[stream-cache] Downloaded file too small to be audio (${file.size ?? 0} bytes): ${httpUrl}`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('too small')) {
      throw error;
    }
    console.warn('[stream-cache] Could not validate downloaded file.', error);
  }
  return file.exists ? file.uri : destination.uri;
}

export async function resolveStreamForPlayback(
  input: string,
  mimeType?: string
): Promise<StreamResolveResult | null> {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return null;
  }
  if (isLocalUri(trimmed)) {
    return { uri: trimmed, kind: 'local' };
  }
  if (isWindowsLocalPath(trimmed)) {
    console.warn('[stream-cache] Windows local path is not playable on device:', trimmed);
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    if (isLanStreamUrl(trimmed)) {
      return resolveLanStreamForCache(canonicalizeHttpUrl(trimmed), mimeType);
    }
    return { uri: trimmed, kind: 'network' };
  }
  const httpUrl = toHttpUrl(trimmed);
  if (!httpUrl) {
    console.warn('[stream-cache] Unrecognized stream reference:', trimmed);
    return null;
  }
  return resolveLanStreamForCache(canonicalizeHttpUrl(httpUrl), mimeType);
}

async function resolveLanStreamForCache(
  httpUrl: string,
  mimeType?: string
): Promise<StreamResolveResult | null> {
  try {
    const cached = await getCachedStream(httpUrl);
    if (cached) {
      return { uri: cached, kind: 'cached' };
    }
  } catch (error) {
    console.warn('[stream-cache] Cache lookup failed.', error);
  }
  try {
    const uri = await cacheStream(httpUrl, mimeType);
    return { uri, kind: 'cached' };
  } catch (error) {
    console.warn('[stream-cache] LAN mirror download failed; no playable fallback for:', httpUrl, error);
    return null;
  }
}

export async function clearStreamCache(): Promise<void> {
  const directory = cacheDirectory();
  try {
    if (directory.exists) {
      directory.delete();
    }
  } catch (error) {
    console.warn('[stream-cache] Could not clear cache.', error);
  }
}

export async function getStreamCacheInfo(): Promise<{ count: number; size: number }> {
  const directory = cacheDirectory();
  try {
    if (!directory.exists) {
      return { count: 0, size: 0 };
    }
    const items = directory.list();
    return {
      count: items.length,
      size: items.reduce((total, item) => total + (item.size ?? 0), 0),
    };
  } catch (error) {
    console.warn('[stream-cache] Could not inspect cache.', error);
    return { count: 0, size: 0 };
  }
}