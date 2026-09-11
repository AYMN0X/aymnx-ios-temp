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

export function toHttpUrl(input: string): string | null {
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

export async function getCachedStream(input: string): Promise<string | null> {
  const url = toHttpUrl(input);
  if (!url) {
    return null;
  }
  const file = new File(cacheFilePath(url));
  try {
    return file.exists ? file.uri : null;
  } catch (error) {
    console.warn('[stream-cache] Cache lookup failed.', error);
    return null;
  }
}

export async function cacheStream(input: string, mimeType?: string): Promise<string> {
  const url = toHttpUrl(input);
  if (!url) {
    throw new Error(`[stream-cache] Not a fetchable network stream: ${input}`);
  }
  const directory = cacheDirectory();
  try {
    directory.create({ idempotent: true, intermediates: true });
  } catch (error) {
    console.warn('[stream-cache] Could not create cache directory.', error);
  }
  const destination = new File(directory, `${hashString(url)}${extensionFor(url, mimeType)}`);
  if (destination.exists) {
    return destination.uri;
  }
  const downloaded = await File.downloadFileAsync(url, destination);
  return downloaded.uri;
}

export async function resolveStreamForPlayback(
  input: string,
  mimeType?: string
): Promise<StreamResolveResult> {
  const trimmed = (input || '').trim();
  if (!trimmed) {
    return { uri: input, kind: 'local' };
  }
  if (isLocalUri(trimmed)) {
    return { uri: trimmed, kind: 'local' };
  }
  const url = toHttpUrl(trimmed);
  if (!url) {
    return { uri: trimmed, kind: 'network' };
  }
  try {
    const cached = await getCachedStream(url);
    if (cached) {
      return { uri: cached, kind: 'cached' };
    }
  } catch (error) {
    console.warn('[stream-cache] Cache lookup failed.', error);
  }
  try {
    const uri = await cacheStream(url, mimeType);
    return { uri, kind: 'cached' };
  } catch (error) {
    console.warn('[stream-cache] Download failed, streaming directly.', error);
    return { uri: url, kind: 'network' };
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