import { Platform } from 'react-native';
import { searchITunes, Track } from './musicApi';

export interface ImportedPlaylist {
  title: string;
  artwork: string;
  tracks: Track[];
}

export type ImportProgressCallback = (current: number, total: number, currentTitle?: string) => void;

interface ParsedTrack {
  title: string;
  artists: string;
}

interface ParsedPlaylist {
  title: string;
  artwork: string;
  tracks: ParsedTrack[];
}

const FETCH_TIMEOUT_MS = 12000;
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

function extractPlaylistId(input: string): string {
  const match = input.match(/playlist\/([a-zA-Z0-9]+)/);
  const id = (match || [])[1] || input.trim();
  if (!id) {
    throw new Error('Playlist link is empty.');
  }
  return id;
}

async function corsSafeFetch(url: string, options?: RequestInit): Promise<Response> {
  if (Platform.OS !== 'web') {
    return fetch(url, options);
  }
  const proxyUrls = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  for (const proxyUrl of proxyUrls) {
    try {
      return await fetch(proxyUrl, options);
    } catch (error) {
      console.warn('[import] CORS proxy failed:', proxyUrl, error);
    }
  }
  throw new Error('The browser blocked cross-origin requests and both CORS proxies failed.');
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await corsSafeFetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${url} responded with status ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, options?: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await corsSafeFetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`${url} responded with status ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function stringifyArtists(artists: unknown): string {
  if (Array.isArray(artists)) {
    return artists
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
      .filter(Boolean)
      .join(', ');
  }
  if (typeof artists === 'string') {
    return artists;
  }
  return '';
}

function extractScriptBlock(html: string, id: string): unknown | null {
  const match = html.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`));
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function findEntityWithTrackList(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findEntityWithTrackList(item);
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
      const found = findEntityWithTrackList(obj[key]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

interface SpotifyEmbedTrackItem {
  title?: unknown;
  artistNames?: unknown;
  artists?: unknown;
}

function parseSpotifyEmbed(html: string): ParsedPlaylist | null {
  const stateJson =
    extractScriptBlock(html, '__NEXT_DATA__') ??
    extractScriptBlock(html, 'initial-state') ??
    extractScriptBlock(html, 'session');
  if (!stateJson) {
    return null;
  }
  const entity = findEntityWithTrackList(stateJson);
  if (!entity) {
    return null;
  }
  const name = typeof entity.name === 'string' ? entity.name : 'Imported Playlist';

  const coverArt = entity.coverArt as
    | { sources?: Array<{ url?: string; width?: number }>; url?: string }
    | undefined;
  let artwork = '';
  if (coverArt) {
    const sources = coverArt.sources ?? [];
    if (sources.length > 0) {
      sources.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
      artwork = sources[0]?.url ?? '';
    } else {
      artwork = coverArt.url ?? '';
    }
  }

  const rawTracks = Array.isArray(entity.trackList) ? (entity.trackList as SpotifyEmbedTrackItem[]) : [];
  const tracks: ParsedTrack[] = rawTracks
    .map((raw) => ({
      title: typeof raw.title === 'string' ? raw.title.trim() : '',
      artists:
        typeof raw.artistNames === 'string' ? raw.artistNames : stringifyArtists(raw.artists),
    }))
    .filter((item) => item.title.length > 0);

  return { title: name, artwork, tracks };
}

async function fetchFromSpotifyEmbed(playlistId: string): Promise<ParsedPlaylist | null> {
  const html = await fetchText(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: {
      Accept: 'text/html',
      'User-Agent': USER_AGENT,
    },
  });
  return parseSpotifyEmbed(html);
}

async function fetchFromSpotifyHtml(playlistId: string): Promise<ParsedPlaylist | null> {
  const html = await fetchText(`https://open.spotify.com/playlist/${playlistId}`, {
    headers: {
      Accept: 'text/html',
      'User-Agent': USER_AGENT,
    },
  });
  return parseSpotifyEmbed(html);
}

async function fetchSpotifyAnonymousToken(): Promise<string> {
  const json = await fetchJson<{ accessToken?: string }>(
    'https://open.spotify.com/get_access_token?reason=transport&productType=web_player',
    {
      method: 'POST',
      headers: {
        Origin: 'https://open.spotify.com',
        Referer: 'https://open.spotify.com/',
        'User-Agent': USER_AGENT,
      },
    }
  );
  const token = json.accessToken;
  if (!token) {
    throw new Error('Spotify anonymous token request returned no token.');
  }
  return token;
}

interface SpotifyApiTrack {
  name?: string;
  artists?: Array<{ name?: string }>;
}

interface SpotifyApiPlaylistResponse {
  name?: string;
  images?: Array<{ url?: string }>;
  tracks?: {
    items?: Array<{ track?: SpotifyApiTrack | null }>;
  };
}

async function fetchFromSpotifyApi(playlistId: string): Promise<ParsedPlaylist | null> {
  const token = await fetchSpotifyAnonymousToken();
  const url = `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images,tracks.items(track(name,artists,album(images)))`;
  const json = await fetchJson<SpotifyApiPlaylistResponse>(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  const items = json.tracks?.items ?? [];
  const tracks: ParsedTrack[] = items
    .filter((item) => Boolean(item.track?.name))
    .map((item) => ({
      title: (item.track?.name ?? '').trim(),
      artists: (item.track?.artists ?? []).map((artist) => artist.name ?? '').join(', '),
    }));
  return {
    title: json.name || 'Imported Playlist',
    artwork: json.images?.[0]?.url || '',
    tracks,
  };
}

export function importSpotifyPlaylist(
  playlistUrlOrId: string,
  onProgress?: ImportProgressCallback
): { promise: Promise<ImportedPlaylist>; cancel: () => void } {
  let cancelled = false;
  const promise = (async () => {
    const playlistId = extractPlaylistId(playlistUrlOrId);

    const tiers: Array<{ name: string; run: () => Promise<ParsedPlaylist | null> }> = [
      { name: 'Spotify embed', run: () => fetchFromSpotifyEmbed(playlistId) },
      { name: 'Spotify playlist page', run: () => fetchFromSpotifyHtml(playlistId) },
      { name: 'Spotify API', run: () => fetchFromSpotifyApi(playlistId) },
    ];

    let parsed: ParsedPlaylist | null = null;
    for (const tier of tiers) {
      if (cancelled) {
        throw new Error('Import cancelled.');
      }
      try {
        const result = await tier.run();
        if (result && result.tracks.length > 0) {
          parsed = result;
          break;
        }
      } catch (error) {
        console.warn(`[import] ${tier.name} tier failed.`, error);
      }
    }
    if (!parsed) {
      throw new Error(
        'Could not fetch the playlist. Double-check the link, make sure the playlist is public, and try again.'
      );
    }

    const tracks: Track[] = [];
    for (let index = 0; index < parsed.tracks.length; index += 1) {
      if (cancelled) {
        throw new Error('Import cancelled.');
      }
      const raw = parsed.tracks[index];
      if (raw.title) {
        try {
          const matches = await searchITunes(`${raw.title} ${raw.artists}`.trim(), 1);
          if (matches.length > 0) {
            tracks.push(matches[0]);
          }
        } catch (error) {
          console.warn('[import] Failed to match track:', raw.title, error);
        }
      }
      if (onProgress) {
        onProgress(index + 1, parsed.tracks.length, raw.title);
      }
    }

    return { title: parsed.title, artwork: parsed.artwork, tracks };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}