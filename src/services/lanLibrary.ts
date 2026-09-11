import type { Track } from './musicApi';
import { lanStreamBaseUrl, canonicalizeHttpUrl } from '../utils/streamCache';
import * as FileSystem from 'expo-file-system/legacy';
import { extractId3Picture, base64ToBytes, bytesToBase64 } from '../utils/id3Artwork';

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
  return decodedTitle(url).toLowerCase().replace(/[-_\s]+/g, ' ').trim();
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
  return canonicalizeHttpUrl(resolved);
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
    const audioUrl = finalizeUrl(baseUrl, file);
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
  const coverKeys: string[] = [];
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
      coverKeys.push(key);
    }
  }
  const tracks = audioLinks.map((audio) => {
    const cover = findCoverArtwork(basenameKey(audio), coverByBase, coverKeys);
    return trackFromAudio(audio, cover);
  });
  return tracks.sort((a, b) => a.title.localeCompare(b.title));
}

const GENERIC_COVER_KEYS = ['cover', 'folder', 'albumart', 'album', 'artwork', 'front', 'frontcover'];

function findCoverArtwork(
  audioKey: string,
  coverByBase: Map<string, string>,
  coverKeys: string[]
): string | undefined {
  const exact = coverByBase.get(audioKey);
  if (exact) {
    return exact;
  }
  for (const key of coverKeys) {
    if (key.includes(audioKey) || audioKey.includes(key)) {
      return coverByBase.get(key);
    }
  }
  for (const generic of GENERIC_COVER_KEYS) {
    const hit = coverByBase.get(generic);
    if (hit) {
      return hit;
    }
  }
  return coverKeys.length > 0 ? coverByBase.get(coverKeys[0]) : undefined;
}

const LAN_TRACKS_DIR_NAME = 'lan_tracks';
const LAN_COVERS_DIR_NAME = 'covers';
const MIN_AUDIO_FILE_BYTES = 2048;

const LAN_MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-flac': '.flac',
  'audio/flac': '.flac',
};

function lanExtensionFor(track: Track): string {
  if (track.streamMimeType) {
    const mapped = LAN_MIME_EXTENSIONS[track.streamMimeType.split(';')[0].trim().toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }
  for (const candidate of [track.streamUrl, track.previewUrl]) {
    if (candidate) {
      const match = candidate.split(/[?#]/)[0].match(/\.([a-z0-9]{1,5})$/i);
      if (match) {
        return `.${match[1].toLowerCase()}`;
      }
    }
  }
  return '.mp3';
}

function lanTracksRoot(): string {
  return `${FileSystem.documentDirectory ?? ''}${LAN_TRACKS_DIR_NAME}/`;
}

function lanCoversRoot(): string {
  return `${lanTracksRoot()}${LAN_COVERS_DIR_NAME}/`;
}

async function ensureDirectory(directory: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
}

async function ensureLanDirectories(): Promise<void> {
  await ensureDirectory(lanTracksRoot());
  await ensureDirectory(lanCoversRoot());
}

async function extractArtworkToFile(audioUri: string, basePath: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(audioUri);
    if (!info.exists || (info.size ?? 0) > 64 * 1024 * 1024) {
      return '';
    }
    const base64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bytes = base64ToBytes(base64);
    const picture = extractId3Picture(bytes);
    if (!picture || picture.data.length < 128) {
      return '';
    }
    const uri = `${basePath}${picture.ext}`;
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(picture.data), {
      encoding: FileSystem.EncodingType.Base64,
    });
    const written = await FileSystem.getInfoAsync(uri);
    return written.exists && (written.size ?? 0) > 0 ? uri : '';
  } catch (error) {
    console.warn('[lan] Could not extract embedded artwork from:', audioUri, error);
    return '';
  }
}

export async function downloadLanTrackAudio(track: Track): Promise<Track> {
  const source = track.streamUrl || track.previewUrl;
  if (!source) {
    throw new Error(`No stream URL for "${track.title}".`);
  }
  const httpUrl = canonicalizeHttpUrl(source);
  await ensureLanDirectories();
  const audioUri = `${lanTracksRoot()}${hashString(httpUrl)}${lanExtensionFor(track)}`;

  const existingAudio = await FileSystem.getInfoAsync(audioUri);
  if (!existingAudio.exists) {
    const result = await FileSystem.downloadAsync(httpUrl, audioUri);
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`LAN audio download failed (HTTP ${result?.status}): ${track.title}`);
    }
    const audioInfo = await FileSystem.getInfoAsync(audioUri);
    if (!audioInfo.exists || (audioInfo.size ?? 0) < MIN_AUDIO_FILE_BYTES) {
      await FileSystem.deleteAsync(audioUri, { idempotent: true });
      throw new Error(`Downloaded LAN audio too small to be valid: ${track.title}`);
    }
  }

  let artworkUri = '';
  if (track.artwork && /^https?:\/\//i.test(track.artwork)) {
    const coverUri = `${lanCoversRoot()}${hashString(httpUrl)}.jpg`;
    const existingCover = await FileSystem.getInfoAsync(coverUri);
    if (existingCover.exists) {
      artworkUri = coverUri;
    } else {
      try {
        const coverResult = await FileSystem.downloadAsync(canonicalizeHttpUrl(track.artwork), coverUri);
        if (coverResult && coverResult.status >= 200 && coverResult.status < 300) {
          artworkUri = coverUri;
        }
      } catch (error) {
        console.warn('[lan] Standalone cover download failed for:', track.title, error);
      }
    }
  }
  if (!artworkUri) {
    artworkUri = await extractArtworkToFile(audioUri, `${lanCoversRoot()}${hashString(httpUrl)}_id3`);
  }

  return {
    ...track,
    artwork: artworkUri || track.artwork || '',
    streamUrl: audioUri,
    previewUrl: audioUri,
  };
}

export async function downloadLanTracks(
  tracks: Track[],
  onProgress?: (done: number, total: number) => void
): Promise<Track[]> {
  const updated: Track[] = [];
  const total = tracks.length;
  let failed = 0;
  for (let index = 0; index < total; index += 1) {
    const track = tracks[index];
    try {
      updated.push(await downloadLanTrackAudio(track));
    } catch (error) {
      failed += 1;
      console.warn('[lan] Failed to download audio for:', track.title, error);
      updated.push(track);
    }
    if (onProgress) {
      onProgress(index + 1, total);
    }
  }
  if (total > 0 && failed === total) {
    throw new Error(
      'None of the local tracks could be downloaded. Check that your PC server is reachable.'
    );
  }
  return updated;
}
