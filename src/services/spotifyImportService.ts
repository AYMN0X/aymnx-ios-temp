import { searchITunes, Track } from './musicApi';

export interface ImportedPlaylist {
  title: string;
  artwork: string;
  tracks: Track[];
}

interface SpotifyEmbedTrack {
  title?: string;
  artistNames?: string;
}

interface SpotifyEmbedResponse {
  name?: string;
  coverArt?: {
    sources?: Array<{ url?: string; width?: number }>;
  };
  trackList?: SpotifyEmbedTrack[];
}

function extractPlaylistId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Playlist link is empty.');
  }
  const barePlaylistMatch = trimmed.match(/^[\w-]+$/);
  if (barePlaylistMatch) {
    return barePlaylistMatch[0];
  }
  const urlMatch = trimmed.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9_-]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  throw new Error('Could not find a Spotify playlist in that link.');
}

async function fetchSpotifyRaw(
  playlistId: string
): Promise<{ title: string; artwork: string; rawTracks: SpotifyEmbedTrack[] }> {
  const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(
    `https://open.spotify.com/playlist/${playlistId}`
  )}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Spotify metadata fetch failed with status ${response.status}`);
  }
  const json = (await response.json()) as SpotifyEmbedResponse;
  const title = json.name?.trim() || 'Imported Playlist';
  const sources = json.coverArt?.sources ?? [];
  sources.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const artwork = sources[0]?.url ?? '';
  return { title, artwork, rawTracks: json.trackList ?? [] };
}

export function importSpotifyPlaylist(
  playlistUrlOrId: string,
  onProgress?: (matched: number, total: number) => void
): { promise: Promise<ImportedPlaylist>; cancel: () => void } {
  let cancelled = false;
  const promise = (async () => {
    const playlistId = extractPlaylistId(playlistUrlOrId);
    const { title, artwork, rawTracks } = await fetchSpotifyRaw(playlistId);

    const tracks: Track[] = [];
    for (const raw of rawTracks) {
      if (cancelled) {
        throw new Error('Import cancelled.');
      }
      const trackTitle = raw.title;
      const artist = raw.artistNames;
      if (trackTitle && artist) {
        try {
          const matches = await searchITunes(`${trackTitle} ${artist}`, 1);
          if (matches.length > 0) {
            tracks.push(matches[0]);
          }
        } catch (error) {
          console.warn('[import] Failed to match track:', trackTitle, error);
        }
      }
      if (onProgress) {
        onProgress(tracks.length, rawTracks.length);
      }
    }

    return { title, artwork, tracks };
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}