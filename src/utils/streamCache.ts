import { Directory, File, Paths } from 'expo-file-system';

export const LAN_STREAM_HTTP_PORT = 8080;

const CACHE_DIR_NAME = 'stream-cache';

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

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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
    return file.exists ? file.uri : null;
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
    return destination.uri;
  }
  const downloaded = await File.downloadFileAsync(httpUrl, destination);
  if (downloaded) {
    return downloaded.uri;
  }
  if (destination.exists) {
    return destination.uri;
  }
  throw new Error(`[stream-cache] Download returned no file: ${httpUrl}`);
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
    return { uri: trimmed, kind: 'network' };
  }
  const httpUrl = toHttpUrl(trimmed);
  if (!httpUrl) {
    console.warn('[stream-cache] Unrecognized stream reference:', trimmed);
    return null;
  }
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
    console.warn('[stream-cache] Mirror download failed; no playable fallback for:', httpUrl, error);
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