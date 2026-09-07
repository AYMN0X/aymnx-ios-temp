import type { Track } from './musicApi';

const REQUEST_TIMEOUT_MS = 8000;

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
};

type InstanceKind = 'piped' | 'invidious';

interface YouTubeInstance {
  baseUrl: string;
  kind: InstanceKind;
}

const YOUTUBE_INSTANCES: YouTubeInstance[] = [
  { baseUrl: 'https://api-piped.mha.fi', kind: 'piped' },
  { baseUrl: 'https://pipedapi.kavin.rocks', kind: 'piped' },
  { baseUrl: 'https://inv.nadeko.net', kind: 'invidious' },
];

interface PipedAudioStream {
  url?: string;
  mimeType?: string;
  bitrate?: number;
}

interface PipedStreamsResponse {
  title?: string;
  uploader?: string;
  thumbnailUrl?: string;
  duration?: number;
  audioStreams?: PipedAudioStream[];
}

interface InvidiousFormat {
  url?: string;
  type?: string;
  bitrate?: number;
}

interface InvidiousThumbnail {
  quality?: string;
  url?: string;
}

interface InvidiousVideoResponse {
  title?: string;
  author?: string;
  videoThumbnails?: InvidiousThumbnail[];
  lengthSeconds?: number;
  adaptiveFormats?: InvidiousFormat[];
}

interface CandidateStream {
  url: string;
  mimeType: string;
  bitrate: number;
}

interface ParsedVideo {
  videoId: string;
  title: string;
  artist: string;
  artwork: string;
  durationSeconds: number | undefined;
  streamUrl: string;
  streamMimeType: string;
}

export function parseYouTubeVideoId(urlOrId: string): string | null {
  const input = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }
  const match = input.match(
    /(?:[?&]v=|\/watch\/|\/shorts\/|\/embed\/|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

function toHttps(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith('http://')) {
    return url.replace(/^http:\/\//i, 'https://');
  }
  return /^https:\/\//i.test(url) ? url : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMimeType(type: string): string {
  return type.split(';')[0].trim().toLowerCase();
}

function pickAudioStream(streams: CandidateStream[]): CandidateStream | null {
  const audio = streams.filter((stream) => stream.url && stream.mimeType.startsWith('audio/'));
  if (audio.length === 0) {
    return null;
  }
  const mp4 = audio.filter((stream) => stream.mimeType === 'audio/mp4');
  const pool = mp4.length > 0 ? mp4 : audio;
  pool.sort((a, b) => b.bitrate - a.bitrate);
  return pool[0];
}

function pickInvidiousThumbnail(thumbnails: InvidiousThumbnail[]): string {
  const ordered = thumbnails.filter((item) => item.url);
  if (ordered.length === 0) {
    return '';
  }
  const findQuality = (...needles: string[]) =>
    ordered.find((item) => needles.some((needle) => (item.quality ?? '').includes(needle)))?.url;
  return findQuality('maxres', 'maxresdefault') ?? findQuality('hqdefault', 'hq') ?? ordered[0].url ?? '';
}

function buildYouTubeTrack(parts: ParsedVideo): Track {
  const rawDuration = parts.durationSeconds;
  const duration =
    typeof rawDuration === 'number' && rawDuration > 0 ? Math.round(rawDuration) : undefined;
  return {
    id: `yt_${parts.videoId}`,
    title: (parts.title || 'YouTube Audio').trim(),
    artist: (parts.artist || 'YouTube').trim(),
    album: 'YouTube',
    artwork:
      parts.artwork || `https://i.ytimg.com/vi/${parts.videoId}/hqdefault.jpg`,
    previewUrl: '',
    streamUrl: parts.streamUrl,
    streamMimeType: parts.streamMimeType || 'audio/mp4',
    duration,
  };
}

async function fetchPipedVideo(videoId: string, baseUrl: string): Promise<Track | null> {
  for (const suffix of ['?local=true', '']) {
    try {
      const json = await fetchJson<PipedStreamsResponse>(
        `${baseUrl}/streams/${videoId}${suffix}`
      );
      const chosen = pickAudioStream(
        (json.audioStreams ?? []).map((stream) => ({
          url: stream.url ?? '',
          mimeType: normalizeMimeType(stream.mimeType ?? ''),
          bitrate: stream.bitrate ?? 0,
        }))
      );
      if (!chosen) {
        continue;
      }
      const url = toHttps(chosen.url);
      if (!url) {
        continue;
      }
      return buildYouTubeTrack({
        videoId,
        title: json.title ?? '',
        artist: json.uploader ?? '',
        artwork: json.thumbnailUrl ?? '',
        durationSeconds: json.duration,
        streamUrl: url,
        streamMimeType: chosen.mimeType,
      });
    } catch (error) {
      if (!suffix) {
        throw error;
      }
    }
  }
  return null;
}

async function fetchInvidiousVideo(videoId: string, baseUrl: string): Promise<Track | null> {
  const json = await fetchJson<InvidiousVideoResponse>(
    `${baseUrl}/api/v1/videos/${videoId}`
  );
  const chosen = pickAudioStream(
    (json.adaptiveFormats ?? []).map((format) => ({
      url: format.url ?? '',
      mimeType: normalizeMimeType(format.type ?? ''),
      bitrate: format.bitrate ?? 0,
    }))
  );
  if (!chosen) {
    return null;
  }
  const url = toHttps(chosen.url);
  if (!url) {
    return null;
  }
  return buildYouTubeTrack({
    videoId,
    title: json.title ?? '',
    artist: json.author ?? '',
    artwork: pickInvidiousThumbnail(json.videoThumbnails ?? []),
    durationSeconds: json.lengthSeconds,
    streamUrl: url,
    streamMimeType: chosen.mimeType,
  });
}

export async function resolveYouTubeTrack(urlOrId: string): Promise<Track> {
  const videoId = parseYouTubeVideoId(urlOrId);
  if (!videoId) {
    throw new Error(
      'Invalid YouTube link. Paste a link like youtube.com/watch?v=..., music.youtube.com/watch?v=..., or youtu.be/....'
    );
  }
  let lastError: unknown = new Error('No available provider could serve this video.');
  for (const instance of YOUTUBE_INSTANCES) {
    try {
      const parsed =
        instance.kind === 'piped'
          ? await fetchPipedVideo(videoId, instance.baseUrl)
          : await fetchInvidiousVideo(videoId, instance.baseUrl);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      lastError = error;
    }
  }
  console.warn('[youtube] All instances failed for video', videoId, lastError);
  throw new Error(
    'Could not fetch audio for that video. The link may be private, region-locked, or the service is temporarily unreachable. Try another video.'
  );
}