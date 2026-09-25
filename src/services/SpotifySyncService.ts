import type { StreamResult } from '../types/music';
import type { Track } from './musicApi';
import { resolveSoundCloudStream } from './musicApi';
import type { ImportedPlaylist } from './spotifyImportService';

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
const RESOLVE_CONCURRENCY = 4;

export type SpotifyImportStage = 'extracting' | 'matching';

export interface SpotifyImportCallbacks {
  onStage?: (stage: SpotifyImportStage) => void;
  onProgress?: (current: number, total: number, currentTitle?: string) => void;
}

interface ParsedRawTrack {
  title: string;
  artists: string;
  durationMs?: number;
  artwork?: string;
  sourceKey: string;
}

interface ParsedPlaylist {
  title: string;
  artwork: string;
  tracks: ParsedRawTrack[];
}

function extractPlaylistId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Paste a Spotify playlist link first.');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)?.[1]?.toLowerCase();
    if (scheme && scheme !== 'http' && scheme !== 'https') {
      throw new Error('Only http(s) URLs or a bare playlist ID are supported.');
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new Error('Playlist link must be a valid http(s) URL.');
    }
  }
  const match = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
  const id = match?.[1] || trimmed;
  if (!id) {
    throw new Error('Playlist link is empty.');
  }
  return id;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/html, application/json',
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`${url} responded with status ${response.status}`);
  }
  return response.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`${url} responded with status ${response.status}`);
  }
  return (await response.json()) as T;
}

function extractScriptBlock(html: string, id: string): unknown | null {
  const match = html.match(
    new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`)
  );
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]) as unknown;
  } catch {
    return null;
  }
}

function findPlaylistEntity(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPlaylistEntity(item);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.name === 'string' && Array.isArray(obj.trackList)) {
      return obj;
    }
    for (const key of Object.keys(obj)) {
      const found = findPlaylistEntity(obj[key]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function stringifyArtists(artists: unknown): string {
  if (Array.isArray(artists)) {
    const names = artists
      .map((artist) => {
        if (typeof artist === 'string') {
          return artist;
        }
        if (artist && typeof artist === 'object') {
          const name = (artist as { name?: unknown }).name;
          if (typeof name === 'string') {
            return name;
          }
        }
        return '';
      })
      .filter(Boolean);
    return names.join(', ');
  }
  return typeof artists === 'string' ? artists : '';
}

function parseSubtitleArtists(subtitle: string): string {
  const separator = subtitle.indexOf('•');
  return (separator >= 0 ? subtitle.slice(separator + 1) : subtitle).trim();
}

function parseDurationMs(value: unknown): number | undefined {
  if (value && typeof value === 'object') {
    const total = (value as { totalMilliseconds?: unknown }).totalMilliseconds;
    if (typeof total === 'number' && Number.isFinite(total)) {
      return total;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function extractImage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) ? value : undefined;
  }
  if (value && typeof value === 'object') {
    const obj = value as { url?: unknown; sources?: Array<{ url?: unknown; width?: unknown }> };
    const sources = Array.isArray(obj.sources) ? obj.sources : [];
    const widthOf = (image: { width?: unknown }) =>
      typeof image.width === 'number' && Number.isFinite(image.width) ? image.width : 0;
    const best = [...sources].sort((a, b) => widthOf(b) - widthOf(a))[0];
    if (typeof best?.url === 'string') {
      return best.url;
    }
    if (typeof obj.url === 'string') {
      return obj.url;
    }
  }
  return undefined;
}

function sourceKeyFromUri(uri: string, title: string, artists: string): string {
  const spotifyId = uri.match(/^spotify:track:([a-zA-Z0-9]+)$/)?.[1];
  if (spotifyId) {
    return spotifyId;
  }
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-');
  return `${normalize(title)}-${normalize(artists)}`;
}

function parseEmbedTrack(item: unknown): ParsedRawTrack | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const obj = item as Record<string, unknown>;
  const rawTitle =
    typeof obj.title === 'string' ? obj.title : typeof obj.name === 'string' ? obj.name : '';
  const title = rawTitle.trim();
  if (!title) {
    return null;
  }
  const subtitle = typeof obj.subtitle === 'string' ? obj.subtitle : '';
  const artistNames = typeof obj.artistNames === 'string' ? obj.artistNames : '';
  const artists =
    artistNames.trim() ||
    stringifyArtists(obj.artists) ||
    parseSubtitleArtists(subtitle);
  const uri = typeof obj.uri === 'string' ? obj.uri : '';
  return {
    title,
    artists: artists || 'Unknown artist',
    durationMs: parseDurationMs(obj.duration),
    artwork: extractImage(obj.image ?? obj.images),
    sourceKey: sourceKeyFromUri(uri, title, artists),
  };
}

function parseSpotifyEmbed(html: string): ParsedPlaylist | null {
  const stateJson =
    extractScriptBlock(html, '__NEXT_DATA__') ??
    extractScriptBlock(html, 'initial-state') ??
    extractScriptBlock(html, 'session');
  if (!stateJson) {
    return null;
  }
  const entity = findPlaylistEntity(stateJson);
  if (!entity) {
    return null;
  }
  const name = typeof entity.name === 'string' ? entity.name.trim() : '';
  const trackList = Array.isArray(entity.trackList) ? entity.trackList : [];
  const tracks: ParsedRawTrack[] = trackList
    .map(parseEmbedTrack)
    .filter((track): track is ParsedRawTrack => track !== null);
  return {
    title: name || 'Imported Playlist',
    artwork: extractImage(entity.coverArt) ?? '',
    tracks,
  };
}

async function fetchFromSpotifyEmbed(playlistId: string): Promise<ParsedPlaylist | null> {
  const html = await fetchText(`https://open.spotify.com/embed/playlist/${playlistId}`);
  return parseSpotifyEmbed(html);
}

async function fetchFromSpotifyPage(playlistId: string): Promise<ParsedPlaylist | null> {
  const html = await fetchText(`https://open.spotify.com/playlist/${playlistId}`);
  return parseSpotifyEmbed(html);
}

async function fetchSpotifyPlaylistMeta(playlistId: string): Promise<{
  title?: string;
  artwork?: string;
}> {
  try {
    const json = await fetchJson<{ title?: string; thumbnail_url?: string }>(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(
        `https://open.spotify.com/playlist/${playlistId}`
      )}`
    );
    return {
      title: typeof json.title === 'string' ? json.title : undefined,
      artwork: typeof json.thumbnail_url === 'string' ? json.thumbnail_url : undefined,
    };
  } catch (error) {
    console.warn('[spotify-import] oEmbed lookup failed.', error);
    return {};
  }
}

function buildImportedTrack(
  raw: ParsedRawTrack,
  stream: StreamResult | null,
  index: number
): Track {
  return {
    id: `spotify-${raw.sourceKey}-${index}`,
    title: raw.title,
    artist: raw.artists || 'Unknown artist',
    album: '',
    artwork: raw.artwork ?? '',
    previewUrl: '',
    duration: raw.durationMs != null && Number.isFinite(raw.durationMs) ? raw.durationMs / 1000 : undefined,
    ...(stream
      ? {
          streamUrl: stream.url,
          streamMimeType: stream.mimeType,
          provider: 'soundcloud' as const,
        }
      : {}),
  };
}

export function importSpotifyPlaylist(
  link: string,
  callbacks?: SpotifyImportCallbacks
): { promise: Promise<ImportedPlaylist>; cancel: () => void } {
  let cancelled = false;
  const promise = (async () => {
    const playlistId = extractPlaylistId(link);

    callbacks?.onStage?.('extracting');
    let parsed: ParsedPlaylist | null = null;
    try {
      const embed = await fetchFromSpotifyEmbed(playlistId);
      if (embed && embed.tracks.length > 0) {
        parsed = embed;
      }
    } catch (error) {
      console.warn('[spotify-import] Embed tier failed.', error);
    }
    if (!parsed) {
      try {
        const page = await fetchFromSpotifyPage(playlistId);
        if (page && page.tracks.length > 0) {
          parsed = page;
        }
      } catch (error) {
        console.warn('[spotify-import] Playlist page tier failed.', error);
      }
    }
    if (!parsed) {
      const meta = await fetchSpotifyPlaylistMeta(playlistId);
      throw new Error(
        meta.title
          ? `Could not extract tracks from "${meta.title}". Make sure the playlist is public and the link is correct.`
          : 'Could not fetch the playlist. Make sure it is public and the link is correct.'
      );
    }

    callbacks?.onStage?.('matching');
    const rawTracks = parsed.tracks;
    const playlistTitle = parsed.title;
    const playlistArtwork = parsed.artwork;
    const tracks: Track[] = new Array(rawTracks.length);
    let nextIndex = 0;
    let progress = 0;

    const worker = async () => {
      while (!cancelled) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= rawTracks.length) {
          return;
        }
        const raw = rawTracks[index];
        let stream: StreamResult | null = null;
        try {
          stream = await resolveSoundCloudStream(raw.title, raw.artists);
        } catch (error) {
          console.warn(`[spotify-import] Stream match failed for "${raw.title}".`, error);
        }
        if (cancelled) {
          return;
        }
        tracks[index] = buildImportedTrack(raw, stream, index);
        progress += 1;
        callbacks?.onProgress?.(progress, rawTracks.length, raw.title);
      }
    };

    const workers = Math.min(RESOLVE_CONCURRENCY, rawTracks.length);
    await Promise.all(Array.from({ length: workers }, () => worker()));
    if (cancelled) {
      throw new Error('Import cancelled.');
    }

    return { title: playlistTitle, artwork: playlistArtwork, tracks };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}