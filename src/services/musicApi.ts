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
  provider?: 'invidious' | 'soundcloud' | 'piped' | 'itunes';
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
  throw new Error(`All audio API instances failed: ${String(lastError)}`);
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

const SOUNDCLOUD_FALLBACK_CLIENT_IDS = [
  'iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX',
  'a3e059563d7fd3372b49b37f00a00bcf',
];

interface SoundCloudTranscoding {
  url?: string;
  snipped?: boolean;
  audio_quality?: string;
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

const SOUNDCLOUD_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  Referer: 'https://soundcloud.com/',
};

const SOUNDCLOUD_PAGE_HEADERS = {
  Accept: 'text/html',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

let soundCloudClientIdCache: string | null = null;
let soundCloudClientIdPromise: Promise<string | null> | null = null;

async function fetchSoundCloudClientId(): Promise<string | null> {
  if (soundCloudClientIdCache) {
    return soundCloudClientIdCache;
  }
  if (soundCloudClientIdPromise) {
    return soundCloudClientIdPromise;
  }
  soundCloudClientIdPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PIPED_TIMEOUT_MS);
      try {
        const response = await fetch('https://soundcloud.com/', {
          headers: SOUNDCLOUD_PAGE_HEADERS,
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`soundcloud.com responded with status ${response.status}`);
        }
        const html = await response.text();
        const scriptMatches = Array.from(
          html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"']+\.js/g)
        );
        const lastScript = scriptMatches[scriptMatches.length - 1]?.[0];
        if (!lastScript) {
          return null;
        }
        const scriptController = new AbortController();
        const scriptTimer = setTimeout(() => scriptController.abort(), PIPED_TIMEOUT_MS);
        const scriptResponse = await fetch(lastScript, {
          headers: SOUNDCLOUD_HEADERS,
          signal: scriptController.signal,
        });
        clearTimeout(scriptTimer);
        if (!scriptResponse.ok) {
          throw new Error(`script bundle responded with status ${scriptResponse.status}`);
        }
        const scriptText = await scriptResponse.text();
        const idMatch = scriptText.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (idMatch) {
          soundCloudClientIdCache = idMatch[1];
          return idMatch[1];
        }
        return null;
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      console.warn('[audio] SoundCloud client_id extraction failed.', error);
      return null;
    } finally {
      soundCloudClientIdPromise = null;
    }
  })();
  return soundCloudClientIdPromise;
}

async function soundCloudFetch<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PIPED_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: SOUNDCLOUD_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw Object.assign(new Error(`SoundCloud responded with status ${response.status}`), {
        status: response.status,
      });
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
    transcodings.find(
      (item) => item.format?.protocol === 'progressive' && item.snipped === false
    ) ??
    transcodings.find((item) => item.format?.protocol === 'hls' && item.snipped === false) ??
    transcodings.find((item) => item.format?.protocol === 'progressive') ??
    transcodings.find((item) => item.format?.protocol === 'hls') ??
    transcodings[0]
  );
}

async function soundCloudSearch(
  query: string,
  clientId: string
): Promise<SoundCloudTrack[]> {
  const search = await soundCloudFetch<SoundCloudSearchResponse>(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&limit=3&client_id=${clientId}`
  );
  return search.collection ?? [];
}

async function resolveSoundCloudWithClientId(
  title: string,
  artist: string,
  clientId: string
): Promise<StreamResult | null> {
  const tracks = await soundCloudSearch(`${title} ${artist}`, clientId);
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
    `${transcodingUrl}${separator}client_id=${clientId}`
  );
  const url = result.url;
  if (!url) {
    return null;
  }
  return { url, mimeType: transcoding?.format?.mime_type ?? 'audio/mpeg', provider: 'soundcloud' };
}

export async function resolveSoundCloudStream(
  title: string,
  artist: string
): Promise<StreamResult | null> {
  try {
    const dynamicId = await fetchSoundCloudClientId();
    const candidates = [
      ...(dynamicId ? [dynamicId] : []),
      ...SOUNDCLOUD_FALLBACK_CLIENT_IDS.filter((id) => id !== dynamicId),
    ];
    if (candidates.length > SOUNDCLOUD_FALLBACK_CLIENT_IDS.length) {
      candidates.length = SOUNDCLOUD_FALLBACK_CLIENT_IDS.length;
    }
    for (const clientId of candidates) {
      try {
        const result = await resolveSoundCloudWithClientId(title, artist, clientId);
        if (result) {
          return result;
        }
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 401 || status === 403) {
          console.warn(`[audio] SoundCloud client_id rejected (${status}), rotating.`);
          continue;
        }
        throw error;
      }
    }
    return null;
  } catch (error) {
    console.warn('[audio] SoundCloud resolution failed.', error);
    return null;
  }
}

const INVIDIOUS_INSTANCES = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.slipfox.xyz',
  'https://invidious.materialio.us',
];

interface InvidiousSearchResult {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
}

interface InvidiousVideoFormat {
  url?: string;
  type?: string;
  bitrate?: number;
}

interface InvidiousVideoResponse {
  formatStreams?: InvidiousVideoFormat[];
  adaptiveFormats?: InvidiousVideoFormat[];
}

async function invidiousVideoId(query: string): Promise<string | null> {
  const search = await pipedFetch<InvidiousSearchResult[]>(
    `/api/v1/search?q=${encodeURIComponent(query)}&type=video`,
    INVIDIOUS_INSTANCES
  );
  const items = Array.isArray(search) ? search : [];
  const match = items.find((item) => item.type === 'video' && item.videoId) ?? items[0];
  return match?.videoId ?? null;
}

function pickInvidiousStream(video: InvidiousVideoResponse): InvidiousVideoFormat | undefined {
  const formats = [...(video.adaptiveFormats ?? []), ...(video.formatStreams ?? [])];
  const audioFormats = formats.filter((format) =>
    (format.type ?? '').toLowerCase().startsWith('audio/')
  );
  return (
    audioFormats.find((format) => (format.type ?? '').toLowerCase().includes('mp4')) ??
    audioFormats.find((format) => (format.type ?? '').toLowerCase().includes('webm')) ??
    audioFormats[0]
  );
}

async function resolveInvidiousVideo(
  videoId: string
): Promise<StreamResult | null> {
  const video = await pipedFetch<InvidiousVideoResponse>(
    `/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats`,
    INVIDIOUS_INSTANCES
  );
  const stream = pickInvidiousStream(video);
  const url = stream?.url?.startsWith('http') ? stream.url : null;
  if (!url) {
    return null;
  }
  return { url, mimeType: stream?.type ?? 'audio/mp4', provider: 'invidious' };
}

export async function resolveInvidiousStream(
  title: string,
  artist: string
): Promise<StreamResult | null> {
  try {
    const videoId = await invidiousVideoId(`${title} ${artist}`);
    if (!videoId) {
      return null;
    }
    return await resolveInvidiousVideo(videoId);
  } catch (error) {
    console.warn('[audio] Invidious resolution failed.', error);
    return null;
  }
}

export async function resolveStream(
  title: string,
  artist: string,
  previewUrl: string
): Promise<StreamResult> {
  const invidious = await resolveInvidiousStream(title, artist);
  if (invidious) {
    return invidious;
  }
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