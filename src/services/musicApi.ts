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
  provider?: 'soundcloud' | 'piped' | 'itunes';
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

const SOUNDCLOUD_CLIENT_ID = 'bU3a3c2P7yYk4wZ1Mv5sHjJ9QdE8lR6t';

interface SoundCloudTranscoding {
  url?: string;
  format?: {
    protocol?: string;
    mime_type?: string;
  };
}

interface SoundCloudTrack {
  id: number;
  title?: string;
  user?: { username?: string };
  media?: {
    transcodings?: SoundCloudTranscoding[];
  };
}

interface SoundCloudSearchResponse {
  collection?: SoundCloudTrack[];
}

interface SoundCloudTranscodingResponse {
  url?: string;
}

async function soundCloudFetch<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PIPED_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: PIPED_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SoundCloud responded with status ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function scoreSoundCloudMatch(track: SoundCloudTrack, title: string, artist: string): number {
  const haystack = `${track.title ?? ''} ${track.user?.username ?? ''}`.toLowerCase();
  const terms = `${title} ${artist}`
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function pickSoundCloudTranscoding(
  track: SoundCloudTrack
): SoundCloudTranscoding | undefined {
  const transcodings = track.media?.transcodings ?? [];
  return (
    transcodings.find((item) => item.format?.protocol === 'progressive') ??
    transcodings.find((item) => item.format?.protocol === 'hls') ??
    transcodings[0]
  );
}

export async function resolveSoundCloudStream(
  title: string,
  artist: string
): Promise<StreamResult | null> {
  try {
    const query = encodeURIComponent(`${title} ${artist}`.trim());
    const search = await soundCloudFetch<SoundCloudSearchResponse>(
      `https://api-v2.soundcloud.com/search/tracks?q=${query}&limit=3&client_id=${SOUNDCLOUD_CLIENT_ID}`
    );
    const tracks = search.collection ?? [];
    if (tracks.length === 0) {
      return null;
    }
    const best = tracks.reduce((current, next) =>
      scoreSoundCloudMatch(next, title, artist) > scoreSoundCloudMatch(current, title, artist)
        ? next
        : current
    );
    const transcoding = pickSoundCloudTranscoding(best);
    const transcodingUrl = transcoding?.url;
    if (!transcodingUrl) {
      return null;
    }
    const separator = transcodingUrl.includes('?') ? '&' : '?';
    const result = await soundCloudFetch<SoundCloudTranscodingResponse>(
      `${transcodingUrl}${separator}client_id=${SOUNDCLOUD_CLIENT_ID}`
    );
    const url = result.url;
    if (!url) {
      return null;
    }
    return { url, mimeType: transcoding?.format?.mime_type ?? 'audio/mpeg', provider: 'soundcloud' };
  } catch (error) {
    console.warn('[audio] SoundCloud resolution failed.', error);
    return null;
  }
}

export async function resolveStream(
  title: string,
  artist: string,
  previewUrl: string
): Promise<StreamResult> {
  const soundCloud = await resolveSoundCloudStream(title, artist);
  if (soundCloud) {
    return soundCloud;
  }
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
        return { url, mimeType: stream?.mimeType ?? '', provider: 'piped' };
      }
    }
  } catch (error) {
    console.warn('[audio] Piped resolution failed, falling back to iTunes preview.', error);
  }
  if (previewUrl) {
    return { url: previewUrl, mimeType: 'audio/mp4', provider: 'itunes' };
  }
  throw new Error('No playable audio stream found');
}