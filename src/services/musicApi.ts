export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
}

export interface StreamResult {
  url: string;
  mimeType: string;
}

interface ITunesResult {
  results?: Array<{
    trackId: number;
    trackName: string;
    artistName: string;
    collectionName: string;
    artworkUrl100?: string;
  }>;
}

interface PipedSearchItem {
  url?: string;
  title?: string;
}

interface PipedSearchResponse {
  items?: PipedSearchItem[];
}

interface PipedAudioStream {
  url?: string;
  mimeType?: string;
  format?: string;
}

interface PipedStreamsResponse {
  audioStreams?: PipedAudioStream[];
  videoStreams?: Array<{ url?: string }>;
}

const ARTWORK_HIRES_SUFFIX = '600x600bb.jpg';

export async function fetchTrendingNow(): Promise<Track[]> {
  return searchITunes('trending now', 30);
}

export async function fetchPopularHits(): Promise<Track[]> {
  return searchITunes('popular hits', 30);
}

export async function searchITunes(query: string, limit = 25): Promise<Track[]> {
  const term = query.trim();
  if (!term) {
    return [];
  }
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`iTunes search failed with status ${response.status}`);
  }
  const json = (await response.json()) as ITunesResult;
  return (json.results ?? []).map((result) => ({
    id: String(result.trackId),
    title: result.trackName,
    artist: result.artistName,
    album: result.collectionName,
    artwork: (result.artworkUrl100 ?? '').replace('100x100bb.jpg', ARTWORK_HIRES_SUFFIX),
  }));
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://pipedapi.adminforge.de',
];

async function pipedFetch<T>(path: string, instances: string[] = PIPED_INSTANCES): Promise<T> {
  let lastError: unknown;
  for (const instance of instances) {
    try {
      const response = await fetch(`${instance}${path}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`${instance} responded with status ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`All Piped API instances failed: ${String(lastError)}`);
}

function extractVideoId(item: PipedSearchItem): string | null {
  const url = item.url ?? '';
  const queryMatch = url.match(/v=([^&]+)/);
  if (queryMatch) {
    return queryMatch[1];
  }
  return url.startsWith('/watch?v=') ? url.replace('/watch?v=', '') : null;
}

function pickAudioStream(audioStreams: PipedAudioStream[]): PipedAudioStream | undefined {
  return (
    audioStreams.find((stream) => (stream.mimeType ?? '').toLowerCase().includes('m4a')) ??
    audioStreams.find((stream) => (stream.mimeType ?? '').toLowerCase().includes('mp4')) ??
    audioStreams.find((stream) => (stream.mimeType ?? '').toLowerCase().includes('opus')) ??
    audioStreams.find((stream) => (stream.format ?? '').toLowerCase().includes('m4a')) ??
    audioStreams[0]
  );
}

export async function resolveStream(track: Track): Promise<StreamResult> {
  const query = encodeURIComponent(`${track.title} ${track.artist}`);
  const search = await pipedFetch<PipedSearchResponse>(
    `/search?q=${query}&filter=music_songs`
  );
  const items = search.items ?? [];
  const match = items.find((item) => item.url?.includes('/watch?v=')) ?? items[0];
  const videoId = match ? extractVideoId(match) : null;
  if (!videoId) {
    throw new Error('No matching song found on Piped instances');
  }
  const streams = await pipedFetch<PipedStreamsResponse>(`/streams/${videoId}`);
  const stream = pickAudioStream(streams.audioStreams ?? []);
  const url = stream?.url ?? streams.videoStreams?.[0]?.url;
  if (!url) {
    throw new Error('No playable audio stream found');
  }
  return { url, mimeType: stream?.mimeType ?? '' };
}