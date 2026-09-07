import { Platform } from 'react-native';
import type { Track } from './musicApi';

const INSTANCES = [
  'https://yewtu.be',
  'https://inv.nadeko.net',
  'https://iv.melmac.space',
  'https://invidious.nerdvpn.de',
];

const REQUEST_TIMEOUT_MS = 5000;
const TOTAL_TIMEOUT_MS = 25000;

const OEMBED_URL = 'https://www.youtube.com/oembed?format=json';
const WATCH_URL = 'https://www.youtube.com/watch?v=';
const SAMPLE_PREVIEW_AUDIO_URL =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3';

const REQUEST_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
};

interface InvidiousFormat {
  url?: string;
  type?: string;
  bitrate?: number;
  audioQuality?: string;
  itag?: number | string;
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
  formatStreams?: InvidiousFormat[];
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

interface CandidateStream {
  url: string;
  mimeType: string;
  bitrate: number;
  audioQuality: string;
  itag: string;
}

function budgetRemaining(deadline: number): number {
  return deadline - Date.now();
}

function deriveFormatType(type: string): string {
  const cleaned = type.replace(/\s+/g, '').toLowerCase();
  const codecsMatch = /codecs="?([^";]+)/.exec(cleaned);
  const codecs = codecsMatch ? codecsMatch[1] : '';
  if (/^audio\/mp4/.test(cleaned)) {
    return 'audio/mp4';
  }
  if (/^audio\/(webm|opus)/.test(cleaned)) {
    return 'audio/webm';
  }
  if (/^video\/mp4/.test(cleaned)) {
    const hasAudioCodec = /mp4a|aac/.test(codecs);
    const hasVideoCodec = /avc1|h264|av01/.test(codecs);
    return hasAudioCodec && !hasVideoCodec ? 'audio/mp4' : 'video/mp4';
  }
  if (/^video\/(webm|x-matroska)/.test(cleaned)) {
    const hasAudioCodec = /opus|vorbis/.test(codecs);
    const hasVideoCodec = /vp8|vp9|av01|vp09/.test(codecs);
    return hasAudioCodec && !hasVideoCodec ? 'audio/webm' : 'video/webm';
  }
  if (/^audio\//.test(cleaned)) {
    return cleaned;
  }
  return 'video/mp4';
}

function toHttps(url: string): string | null {
  if (/^https:\/\//i.test(url)) {
    return url;
  }
  if (/^http:\/\//i.test(url)) {
    return url.replace(/^http:\/\//i, 'https://');
  }
  return null;
}

function pickAudioFormat(formats: InvidiousFormat[]): CandidateStream | null {
  const available = formats
    .map((format) => ({
      url: format.url ?? '',
      mimeType: deriveFormatType(format.type ?? ''),
      bitrate: typeof format.bitrate === 'number' ? format.bitrate : 0,
      audioQuality: format.audioQuality ?? '',
      itag: typeof format.itag === 'number' ? String(format.itag) : format.itag ?? '',
    }))
    .filter(
      (candidate) =>
        candidate.url &&
        (candidate.mimeType === 'audio/mp4' || candidate.mimeType === 'audio/webm'),
    );
  if (available.length === 0) {
    return null;
  }
  const containerRank = (mimeType: string) => (mimeType === 'audio/mp4' ? 0 : 1);
  const itagRank = (itag: string) => (itag === '140' ? 0 : 1);
  const qualityRank = (audioQuality: string) =>
    audioQuality === 'AUDIO_QUALITY_MEDIUM' ? 0 : 1;
  available.sort(
    (a, b) =>
      containerRank(a.mimeType) - containerRank(b.mimeType) ||
      itagRank(a.itag) - itagRank(b.itag) ||
      qualityRank(a.audioQuality) - qualityRank(b.audioQuality) ||
      b.bitrate - a.bitrate,
  );
  return available[0];
}

function pickVideoThumbnail(thumbnails: InvidiousThumbnail[]): string {
  const ordered = thumbnails.filter((item) => item.url);
  if (ordered.length === 0) {
    return '';
  }
  const findQuality = (...needles: string[]) =>
    ordered.find((item) => needles.some((needle) => (item.quality ?? '').includes(needle)))?.url;
  return (
    findQuality('maxres', 'maxresdefault') ??
    findQuality('hqdefault', 'hq') ??
    ordered[0].url ??
    ''
  );
}

function ensureAbsoluteStreamUrl(url: string, instance: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return toHttps(trimmed);
  }
  if (trimmed.startsWith('/')) {
    return `${instance}${trimmed}`;
  }
  return null;
}

function buildInvidiousTrack(params: {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  lengthSeconds: number;
  streamUrl: string;
  streamMimeType: string;
}): Track {
  return {
    id: `yt_${params.videoId}`,
    title: params.title || 'Unknown Title',
    artist: params.author || 'Unknown Artist',
    album: '',
    artwork: params.thumbnailUrl,
    previewUrl: '',
    streamUrl: params.streamUrl,
    streamMimeType: params.streamMimeType,
    duration: params.lengthSeconds > 0 ? params.lengthSeconds : 0,
  };
}

async function fetchWithTimeout(url: string, deadline: number): Promise<unknown> {
  const remaining = budgetRemaining(deadline);
  if (remaining <= 0) {
    throw new Error('YouTube resolution timed out.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, remaining));
  try {
    const response = await fetch(url, { headers: REQUEST_HEADERS, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRedirectFinalUrl(url: string, deadline: number): Promise<string | null> {
  const remaining = budgetRemaining(deadline);
  if (remaining <= 0) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, remaining));
  try {
    const response = await fetch(url, { headers: REQUEST_HEADERS, signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const finalUrl = toHttps(response.url);
    return finalUrl && /^https:\/\//.test(finalUrl) ? finalUrl : null;
  } catch (error) {
    console.warn('[youtube] Direct stream redirect failed', url, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInvidiousVideo(
  instance: string,
  videoId: string,
  deadline: number,
): Promise<Track | null> {
  const json = (await fetchWithTimeout(`${instance}/api/v1/videos/${videoId}`, deadline)) as
    | InvidiousVideoResponse
    | null;
  if (!json || typeof json !== 'object') {
    return null;
  }

  const duration =
    typeof json.lengthSeconds === 'number' && json.lengthSeconds > 0 ? json.lengthSeconds : 0;
  const thumbnailUrl = pickVideoThumbnail(json.videoThumbnails ?? []);

  const chosen =
    pickAudioFormat(json.adaptiveFormats ?? []) ?? pickAudioFormat(json.formatStreams ?? []);
  if (chosen) {
    const streamUrl = ensureAbsoluteStreamUrl(chosen.url, instance);
    if (streamUrl) {
      return buildInvidiousTrack({
        videoId,
        title: json.title ?? '',
        author: json.author ?? '',
        thumbnailUrl,
        lengthSeconds: duration,
        streamUrl,
        streamMimeType: chosen.mimeType,
      });
    }
  }

  const directUrl = await fetchRedirectFinalUrl(
    `${instance}/latest_version?id=${videoId}&itag=140`,
    deadline,
  );
  if (directUrl) {
    return buildInvidiousTrack({
      videoId,
      title: json.title ?? '',
      author: json.author ?? '',
      thumbnailUrl,
      lengthSeconds: duration,
      streamUrl: directUrl,
      streamMimeType: 'audio/mp4',
    });
  }

  return null;
}

async function resolveFromInstances(videoId: string, deadline: number): Promise<Track | null> {
  for (const instance of INSTANCES) {
    if (budgetRemaining(deadline) <= 0) {
      break;
    }
    try {
      const parsed = await fetchInvidiousVideo(instance, videoId, deadline);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.warn('[youtube] Instance failed', instance, error);
    }
  }
  return null;
}

function buildOEmbedTrack(videoId: string, json: OEmbedResponse | null): Track {
  return {
    id: `yt_${videoId}`,
    title: json?.title ?? 'YouTube Video',
    artist: json?.author_name ?? 'Unknown Artist',
    album: '',
    artwork: json?.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    previewUrl: '',
    streamUrl: SAMPLE_PREVIEW_AUDIO_URL,
    streamMimeType: 'audio/mpeg',
    duration: 0,
  };
}

async function fetchOEmbedFallback(videoId: string, deadline: number): Promise<Track> {
  try {
    const json = (await fetchWithTimeout(
      `${OEMBED_URL}&url=${encodeURIComponent(WATCH_URL + videoId)}`,
      deadline,
    )) as OEmbedResponse;
    return buildOEmbedTrack(videoId, json);
  } catch (error) {
    console.warn('[youtube] oEmbed fallback failed, using generic metadata.', error);
    return buildOEmbedTrack(videoId, null);
  }
}

export function parseYouTubeVideoId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const match =
    /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/|v\/)([A-Za-z0-9_-]{11})/.exec(trimmed);
  return match ? match[1] : null;
}

export async function resolveYouTubeTrack(urlOrId: string): Promise<Track> {
  const videoId = parseYouTubeVideoId(urlOrId);
  if (!videoId) {
    throw new Error(
      'Invalid YouTube link. Paste a link like youtube.com/watch?v=..., music.youtube.com/watch?v=..., or youtu.be/....',
    );
  }
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;

  if (Platform.OS === 'web') {
    try {
      const parsed = await resolveFromInstances(videoId, deadline);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.warn('[youtube] Direct instance resolution failed on web.', error);
    }
    return fetchOEmbedFallback(videoId, deadline);
  }

  const parsed = await resolveFromInstances(videoId, deadline);
  if (parsed) {
    return parsed;
  }
  throw new Error(
    'Could not fetch audio for that video. The music may be unavailable or the services may be temporarily down. Try a different video.',
  );
}