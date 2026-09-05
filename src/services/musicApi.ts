export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  previewUrl: string;
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
    previewUrl?: string;
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
    previewUrl: result.previewUrl ?? '',
  }));
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://pipedapi.adminforge.de',
];

const PIPED_TIMEOUT_MS = 3500;

const PIPED_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
};

async function pipedFetch<T>(path: string, instances: string[] = PIPED_INSTANCES): Promise<T> {
  let lastError: unknown;
  for (const instance of instances) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PIPED_TIMEOUT_MS);
    try {
      const response = await fetch(`${instance}${path}`, {
        headers: PIPED_HEADERS,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`${instance} responded with status ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
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

export async function resolveStream(
  title: string,
  artist: string,
  previewUrl: string
): Promise<StreamResult> {
  try {
    const query = encodeURIComponent(`${title} ${artist}`.trim());
    const search = await pipedFetch<PipedSearchResponse>(
      `/search?q=${query}&filter=music_songs`
    );
    const items = search.items ?? [];
    const match = items.find((item) => item.url?.includes('/watch?v=')) ?? items[0];
    const videoId = match ? extractVideoId(match) : null;
    if (videoId) {
      const streams = await pipedFetch<PipedStreamsResponse>(`/streams/${videoId}`);
      const stream = pickAudioStream(streams.audioStreams ?? []);
      const url = stream?.url?.startsWith('http') ? stream.url : null;
      if (url) {
        return { url, mimeType: stream?.mimeType ?? '' };
      }
    }
  } catch (error) {
    console.warn('[audio] Piped resolution failed, falling back to iTunes preview.', error);
  }
  if (previewUrl) {
    return { url: previewUrl, mimeType: 'audio/mp4' };
  }
  throw new Error('No playable audio stream found');
}