import type { Track } from './musicApi';
import { lanStreamBaseUrl } from '../utils/streamCache';

const REQUEST_TIMEOUT_MS = 4000;

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|flac|wav|ogg|webm|opus)(\?.*)?$/i;
const COVER_EXTENSIONS = /\.(jpe?g|png|webp|gif)(\?.*)?$/i;

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  opus: 'audio/ogg',
};

export interface LanServerStatus {
  connected: boolean;
  host: string;
  latencyMs: number | null;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function rawFileName(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0];
  const parts = withoutQuery.split('/');
  return parts[parts.length - 1] || '';
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodedTitle(url: string): string {
  const name = safeDecode(rawFileName(url)).trim();
  return name.replace(/\.[a-z0-9]+$/i, '').trim();
}

function basenameKey(url: string): string {
  return decodedTitle(url).toLowerCase().trim();
}

function mimeForUrl(url: string): string {
  const match = url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return (match && AUDIO_MIME[match[1].toLowerCase()]) || 'audio/mpeg';
}

function resolveHref(baseUrl: string, href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed === '/' || trimmed === './' || trimmed === '../') {
    return null;
  }
  if (/^(https?:)?\/\//i.test(trimmed) || /^[a-z]+:/i.test(trimmed)) {
    return trimmed.startsWith('//') ? `http:${trimmed}` : trimmed;
  }
  const cleanBase = baseUrl.replace(/\/+$/, '');
  if (trimmed.startsWith('/')) {
    return `${cleanBase}${trimmed}`;
  }
  return `${cleanBase}/${trimmed}`;
}

function finalizeUrl(baseUrl: string, href: string): string | null {
  const resolved = resolveHref(baseUrl, href);
  if (!resolved) {
    return null;
  }
  if (/[\s]/i.test(resolved)) {
    const [head, ...rest] = resolved.split('?');
    const encodedPath = head
      .split('/')
      .map((segment) => encodeURIComponent(safeDecode(segment)))
      .join('/');
    return rest.length > 0 ? `${encodedPath}?${rest.join('?')}` : encodedPath;
  }
  return resolved;
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const hrefRe = /(?:href|src)="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const value = m[1];
    if (!/^(data|javascript|mailto|#):/i.test(value)) {
      links.push(value);
    }
  }
  return Array.from(new Set(links));
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html,application/json,*/*' },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.text()).slice(0, 2_000_000);
  } catch (error) {
    console.warn('[lan] Fetch failed for', url, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface LanTrackJson {
  id?: string | number;
  title?: string;
  name?: string;
  artist?: string;
  album?: string;
  file?: string;
  url?: string;
  streamUrl?: string;
  path?: string;
  cover?: string;
  artwork?: string;
  coverUrl?: string;
  duration?: number;
}

interface LanTracksPayload {
  tracks?: LanTrackJson[] | Record<string, LanTrackJson[]>;
  songs?: LanTrackJson[];
  items?: LanTrackJson[];
}

function normalizeJsonTracks(payload: LanTracksPayload, baseUrl: string): Track[] {
  const raw: LanTrackJson[] = [];
  if (Array.isArray(payload.tracks)) {
    raw.push(...payload.tracks);
  } else if (payload.tracks && typeof payload.tracks === 'object') {
    for (const list of Object.values(payload.tracks)) {
      if (Array.isArray(list)) {
        raw.push(...list);
      }
    }
  }
  if (Array.isArray(payload.songs)) {
    raw.push(...payload.songs);
  }
  if (Array.isArray(payload.items)) {
    raw.push(...payload.items);
  }
  const tracks: Track[] = [];
  for (const entry of raw) {
    const file = entry.file || entry.url || entry.streamUrl || entry.path || '';
    const audioUrl = resolveHref(baseUrl, file);
    if (!audioUrl || !AUDIO_EXTENSIONS.test(audioUrl)) {
      continue;
    }
    const id = entry.id != null ? `lan_${entry.id}` : `lan_${hashString(audioUrl)}`;
    const provided = (entry.title || entry.name || '').trim();
    const title =
      (provided ? safeDecode(provided).replace(/\s+/g, ' ').trim() : '') ||
      decodedTitle(audioUrl) ||
      'Untitled';
    const artist = safeDecode((entry.artist || 'Local Files').trim());
    const album = (entry.album || '').trim();
    const coverRaw = entry.cover || entry.artwork || entry.coverUrl;
    const artwork = coverRaw ? finalizeUrl(baseUrl, coverRaw) ?? '' : '';
    tracks.push({
      id,
      title,
      artist,
      album,
      artwork,
      previewUrl: audioUrl,
      streamUrl: audioUrl,
      streamMimeType: mimeForUrl(audioUrl),
      duration: typeof entry.duration === 'number' && entry.duration > 0 ? entry.duration : undefined,
    });
  }
  return tracks;
}

function trackFromAudio(audioUrl: string, coverUrl?: string, parentTitle?: string): Track {
  const audioUri = finalizeUrl(audioUrl, audioUrl) ?? audioUrl;
  return {
    id: `lan_${hashString(audioUri)}`,
    title: decodedTitle(audioUri) || 'Untitled',
    artist: parentTitle ?? 'Local Files',
    album: '',
    artwork: coverUrl ?? '',
    previewUrl: audioUri,
    streamUrl: audioUri,
    streamMimeType: mimeForUrl(audioUri),
  };
}

export async function checkLanServer(base?: string): Promise<LanServerStatus> {
  const baseUrl = lanStreamBaseUrl(base);
  const started = Date.now();
  const html = await fetchText(`${baseUrl}/`);
  return {
    connected: html !== null,
    host: baseUrl,
    latencyMs: html !== null ? Date.now() - started : null,
  };
}

export async function fetchLanTracks(base?: string): Promise<Track[]> {
  const baseUrl = lanStreamBaseUrl(base);
  const jsonText = await fetchText(`${baseUrl}/api/tracks`);
  if (jsonText) {
    try {
      const data = JSON.parse(jsonText) as LanTracksPayload;
      const tracks = normalizeJsonTracks(data, baseUrl);
      if (tracks.length > 0) {
        return tracks.sort((a, b) => a.title.localeCompare(b.title));
      }
    } catch (error) {
      console.warn('[lan] JSON parse failed, falling back to listing.', error);
    }
  }
  const directories = ['/', '/Tracks/', '/Covers/'];
  const listings = await Promise.all(
    directories.map(async (path) => ({
      path,
      html: await fetchText(`${baseUrl}${path}`),
    }))
  );
  const allLinks: string[] = [];
  for (const entry of listings) {
    if (!entry.html) {
      continue;
    }
    for (const href of extractLinks(entry.html)) {
      const resolved = resolveHref(`${baseUrl}${entry.path}`, href);
      if (resolved) {
        allLinks.push(resolved);
      }
    }
  }
  const seenAudio = new Set<string>();
  const audioLinks: string[] = [];
  for (const link of allLinks) {
    if (!AUDIO_EXTENSIONS.test(link)) {
      continue;
    }
    const resolved = finalizeUrl(baseUrl, link);
    if (!resolved) {
      continue;
    }
    const key = basenameKey(resolved);
    if (seenAudio.has(key)) {
      continue;
    }
    seenAudio.add(key);
    audioLinks.push(resolved);
  }
  const coverByBase = new Map<string, string>();
  for (const link of allLinks) {
    if (!COVER_EXTENSIONS.test(link)) {
      continue;
    }
    const resolved = finalizeUrl(baseUrl, link);
    if (!resolved) {
      continue;
    }
    const key = basenameKey(resolved);
    if (!coverByBase.has(key)) {
      coverByBase.set(key, resolved);
    }
  }
  const tracks = audioLinks.map((audio) => {
    const cover = coverByBase.get(basenameKey(audio));
    return trackFromAudio(audio, cover);
  });
  return tracks.sort((a, b) => a.title.localeCompare(b.title));
}
