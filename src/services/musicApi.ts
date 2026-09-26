import type { Track, StreamResult } from '../types/music';

export type { Track, StreamResult };

interface ITunesResult {
  results?: Array<{
    trackId: number;
    trackName: string;
    artistName: string;
    collectionName: string;
    artworkUrl100?: string;
    previewUrl?: string;
    trackTimeMillis?: number;
  }>;
}

const ARTWORK_HIRES_SUFFIX = '600x600bb.jpg';

const REQUEST_TIMEOUT_MS = 2500;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * iOS ATS blocks cleartext http streams, so upgrade any http stream URL to
 * https (which most CDNs redirect/accept) and reject non-http(s) schemes.
 */
function toHttps(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (url.startsWith('http://')) {
    return url.replace(/^http:\/\//i, 'https://');
  }
  return /^https:\/\//i.test(url) ? url : null;
}

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
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`iTunes search failed with status ${response.status}`);
  }
  const json = (await response.json()) as ITunesResult;
  return (json.results ?? []).map((result) => ({
    id: `it-${result.trackId}`,
    title: result.trackName,
    artist: result.artistName,
    album: result.collectionName,
    artwork: (result.artworkUrl100 ?? '').replace('100x100bb.jpg', ARTWORK_HIRES_SUFFIX),
    previewUrl: result.previewUrl ?? '',
    duration:
      typeof result.trackTimeMillis === 'number' && result.trackTimeMillis > 0
        ? result.trackTimeMillis / 1000
        : undefined,
    provider: 'itunes' as const,
  }));
}

const API_TIMEOUT_MS = REQUEST_TIMEOUT_MS;

const API_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
};

/**
 * Mirrors confirmed unreachable this session (network error, timeout, or a
 * non-2xx response) are skipped for subsequent lookups so a dead JioSaavn
 * third-party mirror never stalls resolution again. A mirror that succeeds
 * later is re-admitted automatically.
 */
const deadApiMirrors = new Set<string>();

function isTerminalMirrorFailure(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (status != null) {
    return status === 401 || status === 403 || status === 404 || status >= 500;
  }
  // Abort (timeout), DNS, or network failure.
  return true;
}

function firstFulfilled<T>(promises: Array<Promise<T>>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let remaining = promises.length;
    let lastError: unknown;
    for (const promise of promises) {
      promise.then(resolve, (error: unknown) => {
        lastError = error;
        remaining -= 1;
        if (remaining === 0) {
          reject(lastError);
        }
      });
    }
  });
}

async function apiFetch<T>(path: string, instances: string[]): Promise<T> {
  const healthy = instances.filter((instance) => !deadApiMirrors.has(instance));
  // If every mirror looks dead, retry the full set once so transient outages
  // can self-heal instead of failing closed.
  const candidates = healthy.length > 0 ? healthy : instances;
  const attempts = candidates.map(async (instance) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch(`${instance}${path}`, {
        headers: API_HEADERS,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw Object.assign(new Error(`${instance} responded with status ${response.status}`), {
          status: response.status,
        });
      }
      deadApiMirrors.delete(instance);
      return (await response.json()) as T;
    } catch (error) {
      if (isTerminalMirrorFailure(error)) {
        deadApiMirrors.add(instance);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
  return firstFulfilled(attempts);
}

const JIOSAAVN_INSTANCES = [
  'https://saavn.dev.mahar.biz',
  'https://jiosaavn-api-2-harsh-patel.vercel.app',
  'https://jiosaavn-api-private-six.vercel.app',
  'https://shnwazdev-jiosaavn-apii.vercel.app',
  'https://jiosaavn.rajputhemant.me',
];

interface JioSaavnDownload {
  quality?: string;
  url?: string;
}

interface JioSaavnSong {
  id?: string;
  name?: string;
  duration?: number | string;
  artists?: { primary?: Array<{ name?: string }> };
  downloadUrl?: JioSaavnDownload[];
  image?: Array<{ link?: string; quality?: string }>;
}

interface JioSaavnSearchResponse {
  status?: string;
  data?: { results?: JioSaavnSong[] };
}

function parseJioSaavnQuality(quality: string): number {
  const match = String(quality).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function normalizeTrackTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  const curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) {
      prev[j] = curr[j];
    }
  }
  return prev[b.length];
}

export function titleMatches(requested: string, candidate: string): boolean {
  const req = normalizeTrackTitle(requested);
  const cand = normalizeTrackTitle(candidate);
  if (!req || !cand) {
    return false;
  }
  if (req === cand) {
    return true;
  }
  if (cand.includes(req) || req.includes(cand)) {
    return true;
  }
  return levenshteinDistance(req, cand) <= Math.max(2, Math.floor(req.length * 0.25));
}

function pickJioSaavnDownload(song: JioSaavnSong): string | null {
  const downloads = (song.downloadUrl ?? []).filter((item) => {
    const value = String(item.url ?? '');
    return /^https?:\/\//i.test(value);
  });
  if (downloads.length === 0) {
    return null;
  }
  downloads.sort(
    (a, b) => parseJioSaavnQuality(b.quality ?? '') - parseJioSaavnQuality(a.quality ?? '')
  );
  return toHttps(downloads[0]?.url) ?? null;
}

function pickJioSaavnArtwork(song: JioSaavnSong): string {
  const images = (song.image ?? [])
    .map((entry) => entry.link ?? '')
    .filter((link) => /^https?:\/\//i.test(link) && !/r2\.music\.api\.com|\.audio/i.test(link));
  if (images.length === 0) {
    return '';
  }
  const hires = images.find((link) => /500x500/.test(link));
  return toHttps(hires ?? images[0]) ?? '';
}

function scoreJioSaavnSong(song: JioSaavnSong, title: string, artist: string): number {
  const songTitle = (song.name ?? '').toLowerCase();
  const artistNames = (song.artists?.primary ?? [])
    .map((entry) => (entry.name ?? '').toLowerCase())
    .join(' ');
  const haystack = `${songTitle} ${artistNames}`;
  const terms = `${title} ${artist}`
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);
  let score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
  const normSongTitle = normalizeTrackTitle(songTitle);
  const normRequestedTitle = normalizeTrackTitle(title);
  if (
    normRequestedTitle &&
    normSongTitle &&
    (normSongTitle === normRequestedTitle ||
      normSongTitle.includes(normRequestedTitle) ||
      normRequestedTitle.includes(normSongTitle))
  ) {
    score += 3;
  }
  return score;
}

const JIOSAAVN_MATCH_MIN_SCORE = 1;

export async function resolveJioSaavnStream(
  title: string,
  artist: string
): Promise<StreamResult | null> {
  try {
    const search = await apiFetch<JioSaavnSearchResponse>(
      `/api/search/songs?query=${encodeURIComponent(`${title} ${artist}`)}&limit=8`,
      JIOSAAVN_INSTANCES
    );
    const results = search.data?.results ?? [];
    if (results.length === 0) {
      return null;
    }
    const ranked = results
      .map((song) => ({ song, score: scoreJioSaavnSong(song, title, artist) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < JIOSAAVN_MATCH_MIN_SCORE) {
      return null;
    }
    const url = pickJioSaavnDownload(best.song);
    if (!url) {
      return null;
    }
    return { url, mimeType: 'audio/mp4', provider: 'jiosaavn' };
  } catch (error) {
    console.warn('[audio] JioSaavn resolution failed.', error);
    return null;
  }
}

export async function searchJioSaavn(query: string, limit = 15): Promise<Track[]> {
  const term = query.trim();
  if (!term) {
    return [];
  }
  try {
    const search = await apiFetch<JioSaavnSearchResponse>(
      `/api/search/songs?query=${encodeURIComponent(term)}&limit=${limit}`,
      JIOSAAVN_INSTANCES
    );
    const results = search.data?.results ?? [];
    return results.map((song, index) => {
      const artists = (song.artists?.primary ?? [])
        .map((entry) => (entry.name ?? '').trim())
        .filter(Boolean);
      const rawDuration =
        typeof song.duration === 'number'
          ? song.duration
          : parseFloat(String(song.duration ?? ''));
      const duration =
        Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : undefined;
      return {
        id: song.id ? `js-${song.id}` : `js-${normalizeTrackTitle(song.name ?? '')}-${index}`,
        title: song.name ?? 'Unknown track',
        artist: artists.length > 0 ? artists.join(', ') : 'Unknown artist',
        album: '',
        artwork: pickJioSaavnArtwork(song),
        previewUrl: pickJioSaavnDownload(song) ?? '',
        duration,
        provider: 'jiosaavn' as const,
      };
    });
  } catch (error) {
    console.warn('[audio] searchJioSaavn failed.', error);
    throw error;
  }
}

/**
 * Rotating guest client_ids for api-v2.soundcloud.com. The first entry was
 * re-verified against the live API on 2026-09-20 (the same value that the
 * homepage `__sc_hydration` currently publishes); the later entries are older
 * public IDs kept so the rotation logic has candidates to try while the
 * dynamic extraction is still running or unavailable. The first verified ID is
 * tried immediately so a fetch never hangs waiting on the homepage scrape.
 */
const SOUNDCLOUD_FALLBACK_CLIENT_IDS = [
  'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo',
  'bOhNcaq9F32sB3eS8zWLywAyh4OdDXbC',
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
  duration?: number;
  artwork_url?: string;
  permalink?: string;
  permalink_url?: string;
  user?: { username?: string; avatar_url?: string };
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
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://soundcloud.com',
  Referer: 'https://soundcloud.com/',
};

const SOUNDCLOUD_PAGE_HEADERS = {
  Accept: 'text/html',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
};

let soundCloudClientIdCache: string | null = null;
let soundCloudClientIdPromise: Promise<string | null> | null = null;

/**
 * Guest client_ids that answered 401/403 and are therefore presumed dead until
 * the app is restarted. A SoundCloud-wide revocation is a global condition, not a
 * per-track one, so remembering it turns every later resolution from "try 4 ids,
 * then scrape the homepage and its JS bundles" (multiple seconds) into an instant
 * miss that lets the caller's JioSaavn/preview fallback take over.
 */
const deadSoundCloudClientIds = new Set<string>();

/**
 * How long to stop attempting the dynamic homepage scrape after every candidate
 * has been rejected. The scrape itself costs several seconds (homepage HTML plus
 * a JS bundle fetch), and during a batch download it would otherwise be repeated
 * once per track. Kept short enough that a genuinely new client_id can still be
 * picked up within the same session.
 */
const SOUNDCLOUD_DYNAMIC_RETRY_COOLDOWN_MS = 60_000;
let soundCloudDynamicBlockedUntil = 0;

function extractSoundCloudHydrationClientId(html: string): string | null {
  const markerIndex = html.indexOf('window.__sc_hydration');
  if (markerIndex < 0) {
    return null;
  }
  const jsonStart = html.indexOf('[', markerIndex);
  if (jsonStart < 0) {
    return null;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '[' || char === '{') {
      depth += 1;
    } else if (char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          const payload = JSON.parse(html.slice(jsonStart, i + 1)) as Array<{
            hydratable?: string;
            data?: { id?: string };
          }>;
          const apiClient = payload.find((item) => item.hydratable === 'apiClient');
          const id = apiClient?.data?.id;
          if (typeof id === 'string' && /^[a-zA-Z0-9]{32}$/.test(id)) {
            return id;
          }
        } catch (error) {
          console.warn('[audio-soundcloud] Could not parse __sc_hydration payload.', error);
        }
        return null;
      }
    }
  }
  return null;
}

async function fetchSoundCloudClientIdFromScript(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: SOUNDCLOUD_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`script bundle responded with status ${response.status}`);
    }
    const scriptText = await response.text();
    const idMatch = scriptText.match(/client_id:"([a-zA-Z0-9]{32})"/);
    return idMatch ? idMatch[1] : null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSoundCloudClientIdFromBundles(html: string): Promise<string | null> {
  const scriptUrls = Array.from(
    new Set(
      Array.from(
        html.matchAll(/https:\/\/[a-z0-9.-]*sndcdn\.com\/assets\/[^"'>\s]+\.js/gi)
      ).map((match) => match[0])
    )
  );
  for (const url of scriptUrls) {
    try {
      const id = await fetchSoundCloudClientIdFromScript(url);
      if (id) {
        return id;
      }
    } catch (error) {
      console.warn(`[audio-soundcloud] Could not scrape client_id from ${url}.`, error);
    }
  }
  return null;
}

async function fetchSoundCloudClientId(): Promise<string | null> {
  if (soundCloudClientIdCache) {
    return soundCloudClientIdCache;
  }
  if (soundCloudClientIdPromise) {
    return soundCloudClientIdPromise;
  }
  soundCloudClientIdPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch('https://soundcloud.com/', {
        headers: SOUNDCLOUD_PAGE_HEADERS,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`soundcloud.com responded with status ${response.status}`);
      }
      const html = await response.text();
      const hydrationId = extractSoundCloudHydrationClientId(html);
      if (hydrationId) {
        soundCloudClientIdCache = hydrationId;
        return hydrationId;
      }
      const bundleId = await fetchSoundCloudClientIdFromBundles(html);
      if (bundleId) {
        soundCloudClientIdCache = bundleId;
        return bundleId;
      }
      console.warn('[audio-soundcloud] Could not extract a client_id from soundcloud.com.');
      return null;
    } catch (error) {
      console.warn('[audio-soundcloud] SoundCloud client_id extraction failed.', error);
      return null;
    } finally {
      clearTimeout(timer);
      soundCloudClientIdPromise = null;
    }
  })();
  return soundCloudClientIdPromise;
}

async function soundCloudFetch<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
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

const SOUNDCLOUD_MATCH_MIN_SCORE = 1;

function pickSoundCloudTranscoding(
  track: SoundCloudTrack
): SoundCloudTranscoding | undefined {
  const transcodings = track.media?.transcodings ?? [];
  for (const item of transcodings) {
    if (item.format?.protocol === 'progressive' && item.snipped === false) {
      return item;
    }
  }
  for (const item of transcodings) {
    if (item.format?.protocol === 'hls' && item.snipped === false) {
      return item;
    }
  }
  return undefined;
}

/**
 * Download-safe transcoding picker. Only a progressive MP3/AAC stream can be
 * persisted as a real audio file; an HLS transcoding is an m3u8 playlist with
 * remote segment URLs that AVPlayer cannot open offline ("Cannot Open").
 * Ogg/Opus containers are excluded too because iOS AVPlayer can't decode them.
 * Returns undefined when only non-progressive transcodings exist. When only HLS
 * is available (some tracks have no progressive MP3/MP4 at all) the best HLS
 * transcoding is returned as a download fallback, since offline HLS bundles are
 * now supported by the downloader.
 */
function pickDownloadableSoundCloudTranscoding(
  track: SoundCloudTrack
): SoundCloudTranscoding | undefined {
  const available = (track.media?.transcodings ?? []).filter((item) => item.snipped === false);
  const progressive = available.filter((item) => item.format?.protocol === 'progressive');
  if (progressive.length > 0) {
    const mpeg = progressive.find((item) =>
      (item.format?.mime_type ?? '').toLowerCase().includes('mpeg')
    );
    if (mpeg) {
      return mpeg;
    }
    return progressive.find((item) =>
      (item.format?.mime_type ?? '').toLowerCase().includes('mp4')
    );
  }
  const hls = available.filter((item) => item.format?.protocol === 'hls');
  const hlsMpeg = hls.find((item) =>
    (item.format?.mime_type ?? '').toLowerCase().includes('mpeg')
  );
  if (hlsMpeg) {
    return hlsMpeg;
  }
  return hls.find((item) => (item.format?.mime_type ?? '').toLowerCase().includes('mp4'));
}

const isHlsStreamUrl = (url: string): boolean => {
  const path = url.split(/[?#]/)[0];
  return path.endsWith('.m3u8');
};

async function soundCloudSearch(
  query: string,
  clientId: string,
  limit = 3
): Promise<SoundCloudTrack[]> {
  const search = await soundCloudFetch<SoundCloudSearchResponse>(
    `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&limit=${limit}&client_id=${clientId}`
  );
  return search.collection ?? [];
}

async function performSoundCloudSearch(
  term: string,
  clientId: string,
  limit: number
): Promise<Track[]> {
  const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(term)}&limit=${limit}&client_id=${clientId}`;
  console.log(`[audio-soundcloud] search URL: ${url}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: SOUNDCLOUD_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      console.log(`[audio-soundcloud] search for "${term}" failed with status ${response.status}`);
      throw Object.assign(new Error(`SoundCloud search responded with status ${response.status}`), {
        status: response.status,
      });
    }
    const json = (await response.json()) as SoundCloudSearchResponse;
    console.log(`[audio-soundcloud] search status ${response.status}, body: ${JSON.stringify(json).slice(0, 300)}`);
    const collection = json.collection ?? [];
    console.log(`[audio-soundcloud] search for "${term}" returned ${collection.length} tracks`);
    return collection.map(soundCloudTrackToTrack);
  } finally {
    clearTimeout(timer);
  }
}

const SOUNDCLOUD_SEARCH_LIMIT = 25;

function cleanSoundCloudPermalink(url: string): string {
  const trimmed = url.trim();
  const match = trimmed.match(/^https?:\/\/[^/]+\/([^?#]+)/i);
  const path = match ? `/${match[1]}` : trimmed;
  return path.startsWith('/') ? path : `/${path}`;
}

export function getHighResArtworkUrl(url?: string | null): string {
  if (!url) {
    return '';
  }
  if (url.includes('-large.')) {
    return url.replace('-large.', '-t500x500.');
  }
  if (url.includes('-badge.')) {
    return url.replace('-badge.', '-t500x500.');
  }
  if (url.includes('-small.')) {
    return url.replace('-small.', '-t500x500.');
  }
  return url;
}

const ARTWORK_THUMBNAIL_SUFFIX = '-t120x120.';

export function getThumbnailArtworkUrl(url?: string | null): string {
  if (!url) {
    return '';
  }
  if (/-t\d+x\d+\./i.test(url)) {
    return url.replace(/-t\d+x\d+\./i, ARTWORK_THUMBNAIL_SUFFIX);
  }
  for (const variant of ['-large.', '-badge.', '-small.']) {
    if (url.includes(variant)) {
      return url.replace(variant, ARTWORK_THUMBNAIL_SUFFIX);
    }
  }
  return url;
}

/**
 * Looks up real album art for a track whose own artwork is missing (or was
 * previously polluted with a playlist cover). Uses the same providers as search
 * and prefers a title match so a same-named cover song cannot win by position.
 */
export async function resolveArtworkForTrack(track: Track): Promise<string> {
  return searchTrackArtwork(track.title, track.artist);
}

// ---------------------------------------------------------------------------
// Artwork lookup cache
// ---------------------------------------------------------------------------

// Every track row can independently notice missing artwork and ask for a
// lookup, and a screen can mount the same track in several places at once. Each
// uncached lookup costs two provider round-trips, so without this a playlist of
// artless tracks fires a burst of duplicate requests on every mount. Mirrors the
// in-flight + TTL pattern already used by services/lyrics.ts.
const ARTWORK_HIT_TTL_MS = 24 * 60 * 60 * 1000;
// Misses get a much shorter lease. Artwork providers do occasionally lag a new
// release, so a miss must be allowed to heal quickly without re-scanning the
// providers on every single mount.
const ARTWORK_MISS_TTL_MS = 15 * 60 * 1000;
// Bounds the cache so a long session browsing many tracks cannot grow it
// without limit.
const ARTWORK_CACHE_LIMIT = 500;

interface ArtworkCacheEntry {
  savedAt: number;
  url: string;
}

const artworkCache = new Map<string, ArtworkCacheEntry>();
const artworkInflight = new Map<string, Promise<string>>();

function artworkCacheKey(title: string, artist: string): string {
  return `${normalizeTrackTitle(title)}|${normalizeTrackTitle(artist)}`;
}

function readArtworkCache(key: string): string | null {
  const hit = artworkCache.get(key);
  if (!hit) {
    return null;
  }
  const ttl = hit.url ? ARTWORK_HIT_TTL_MS : ARTWORK_MISS_TTL_MS;
  if (Date.now() - hit.savedAt > ttl) {
    artworkCache.delete(key);
    return null;
  }
  return hit.url;
}

function writeArtworkCache(key: string, url: string): void {
  if (artworkCache.size >= ARTWORK_CACHE_LIMIT) {
    // Map preserves insertion order, so the first key is the oldest entry.
    const oldest = artworkCache.keys().next();
    if (!oldest.done) {
      artworkCache.delete(oldest.value);
    }
  }
  artworkCache.set(key, { savedAt: Date.now(), url });
}

/** Test/logout seam, matching clearLyricsCache in services/lyrics.ts. */
export function clearArtworkCache(): void {
  artworkCache.clear();
  artworkInflight.clear();
}

async function lookupArtwork(title: string, artist: string): Promise<string> {
  const query = [title, artist].filter(Boolean).join(' ').trim();
  if (!query) {
    return '';
  }
  const settled = await Promise.allSettled([
    searchITunes(query, 5),
    searchJioSaavn(query, 5),
  ]);
  const candidates: Track[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      candidates.push(...result.value);
    }
  }
  const withArtwork = candidates.filter((item) => Boolean(item.artwork));
  if (withArtwork.length === 0) {
    return '';
  }
  const match = withArtwork.find((item) => titleMatches(title, item.title));
  return getHighResArtworkUrl((match ?? withArtwork[0]).artwork);
}

/**
 * Resolves cover art for a track from its title and artist alone, via iTunes and
 * JioSaavn. Deduplicated and cached: concurrent callers asking for the same
 * track share one request, and repeats are served from memory.
 *
 * Returns '' when nothing has art, which callers must treat as "still unknown"
 * rather than "definitively none" — the short miss TTL exists so this heals.
 */
export async function searchTrackArtwork(
  title: string,
  artist: string
): Promise<string> {
  const cleanTitle = (title ?? '').trim();
  const cleanArtist = (artist ?? '').trim();
  if (!cleanTitle && !cleanArtist) {
    return '';
  }
  const key = artworkCacheKey(cleanTitle, cleanArtist);
  const cached = readArtworkCache(key);
  if (cached !== null) {
    return cached;
  }
  const pending = artworkInflight.get(key);
  if (pending) {
    return pending;
  }
  // The catch is attached before the map write so a provider outage resolves to
  // '' instead of rejecting, and so a rejection can never poison the in-flight
  // map for every later caller.
  const request = lookupArtwork(cleanTitle, cleanArtist)
    .catch((error) => {
      console.warn('[artwork] Lookup failed for:', cleanTitle, error);
      return '';
    })
    .then((url) => {
      writeArtworkCache(key, url);
      return url;
    })
    .finally(() => {
      artworkInflight.delete(key);
    });
  artworkInflight.set(key, request);
  return request;
}

function soundCloudArtworkFor(track: SoundCloudTrack): string {
  return getHighResArtworkUrl(toHttps(track.artwork_url ?? track.user?.avatar_url ?? ''));
}

function soundCloudTrackToTrack(source: SoundCloudTrack): Track {
  const seconds =
    typeof source.duration === 'number' && Number.isFinite(source.duration) && source.duration > 0
      ? source.duration / 1000
      : undefined;
  return {
    id: `sc-${source.id}`,
    title: source.title ?? 'Unknown track',
    artist: source.user?.username ?? 'Unknown artist',
    album: '',
    artwork: soundCloudArtworkFor(source),
    previewUrl: '',
    duration: seconds,
    provider: 'soundcloud' as const,
    permalink: source.permalink_url ? cleanSoundCloudPermalink(source.permalink_url) : (source.permalink ? cleanSoundCloudPermalink(source.permalink) : undefined),
  };
}

export async function searchSoundCloudTracks(
  query: string,
  limit = SOUNDCLOUD_SEARCH_LIMIT
): Promise<Track[]> {
  const term = query.trim();
  if (!term) {
    return [];
  }
  try {
    const tracks = await runSoundCloudClientIdAction(
      (clientId) => performSoundCloudSearch(term, clientId, limit),
      'search'
    );
    if (!tracks) {
      throw new Error('No working SoundCloud client_id is available for search');
    }
    return tracks;
  } catch (error) {
    console.warn('[audio-soundcloud] searchSoundCloudTracks failed.', error);
    throw error;
  }
}

/**
 * Aggregated multi-source search. Runs every available catalog provider
 * concurrently with Promise.allSettled so one failing/slow source never blocks
 * the others, then interleaves the results round-robin (1 from each provider at
 * a time) and dedupes by title + artist. Every returned track carries its
 * correct `provider` tag so the UI can render the right source badge.
 */
export async function searchTracks(query: string, perSourceLimit = 20): Promise<Track[]> {
  const term = query.trim();
  if (!term) {
    return [];
  }
  const settled = await Promise.allSettled([
    searchSoundCloudTracks(term, perSourceLimit),
    searchJioSaavn(term, perSourceLimit),
    searchITunes(term, perSourceLimit),
  ]);
  const scResults = settled[0].status === 'fulfilled' ? settled[0].value : [];
  const jsResults = settled[1].status === 'fulfilled' ? settled[1].value : [];
  const itResults = settled[2].status === 'fulfilled' ? settled[2].value : [];
  console.log('[Search Results]', {
    sc: scResults.length,
    js: jsResults.length,
    it: itResults.length,
  });

  const combined: Track[] = [];
  const seen = new Set<string>();
  const sources = [scResults, jsResults, itResults];
  const longest = Math.max(...sources.map((list) => list.length));
  for (let index = 0; index < longest; index += 1) {
    for (const list of sources) {
      const track = list[index];
      if (!track) {
        continue;
      }
      const key = `${track.title}|${track.artist}`.trim().toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      combined.push(track);
    }
  }
  return combined;
}

async function resolveSoundCloudWithClientId(
  title: string,
  artist: string,
  clientId: string,
  permalink?: string,
  downloadMode = false
): Promise<StreamResult | null> {
  let best: SoundCloudTrack | null = null;
  if (permalink) {
    try {
      const resolved = await soundCloudFetch<SoundCloudTrack>(
        `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(`https://soundcloud.com${cleanSoundCloudPermalink(permalink)}`)}&client_id=${clientId}`
      );
      if (resolved && typeof resolved.id === 'number') {
        best = resolved;
      }
    } catch (error) {
      console.warn('[audio] SoundCloud resolve failed, falling back to search.', error);
    }
  }
  if (!best) {
    const tracks = await soundCloudSearch(`${title} ${artist}`, clientId);
    if (tracks.length === 0) {
      return null;
    }
    best = tracks.reduce((current, next) =>
      scoreSoundCloudMatch(next, title, artist) > scoreSoundCloudMatch(current, title, artist)
        ? next
        : current
    );
  }
  if (!best) {
    return null;
  }
  // Strict identity gate: an arbitrary SoundCloud track (score 0) is never a
  // valid resolution for a permalink-less query. The only exception is when the
  // caller supplied an explicit permalink that already resolved above, which is
  // an exact match by definition.
  if (!permalink && scoreSoundCloudMatch(best, title, artist) < SOUNDCLOUD_MATCH_MIN_SCORE) {
    return null;
  }
  if (!permalink && (!best.duration || best.duration <= 60000)) {
    return null;
  }
  const transcoding = downloadMode
    ? pickDownloadableSoundCloudTranscoding(best)
    : pickSoundCloudTranscoding(best);
  const transcodingHttps = toHttps(transcoding?.url);
  if (!transcodingHttps) {
    return null;
  }
  const separator = transcodingHttps.includes('?') ? '&' : '?';
  const result = await soundCloudFetch<SoundCloudTranscodingResponse>(
    `${transcodingHttps}${separator}client_id=${clientId}`
  );
  const url = result.url ? toHttps(result.url) : null;
  if (!url) {
    return null;
  }
  return { url, mimeType: transcoding?.format?.mime_type ?? 'audio/mpeg', provider: 'soundcloud' };
}

function soundCloudClientIdCandidates(): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (value: string | null | undefined) => {
    if (value && !seen.has(value) && !deadSoundCloudClientIds.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  };
  push(soundCloudClientIdCache);
  for (const id of SOUNDCLOUD_FALLBACK_CLIENT_IDS) {
    push(id);
  }
  return ordered;
}

async function runSoundCloudClientIdAction<T>(
  action: (clientId: string) => Promise<T | null>,
  label: string
): Promise<T | null> {
  let lastError: unknown = null;
  const candidates = soundCloudClientIdCandidates();
  for (const clientId of candidates) {
    try {
      const value = await action(clientId);
      if (value != null) {
        soundCloudClientIdCache = clientId;
        return value;
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        // Remember the rejection. Revocation is not track-specific, so this id is
        // now a known-dead candidate for every later resolution in this session.
        deadSoundCloudClientIds.add(clientId);
        console.warn(`[audio-soundcloud] ${label} client_id rejected (${status}), rotating.`);
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  // Every static candidate is exhausted. Re-scraping costs seconds and, in a batch
  // download, would repeat for each remaining track, so it is rate-limited: once a
  // full sweep has failed the scrape is suppressed for a cooldown and this call
  // fast-fails to the caller's fallback instead of burning the latency budget.
  if (Date.now() < soundCloudDynamicBlockedUntil) {
    console.warn(
      `[audio-soundcloud] All client_ids rejected for ${label}; skipping dynamic scrape during cooldown.`
    );
    return null;
  }
  const dynamicId = await fetchSoundCloudClientId();
  if (dynamicId && !candidates.includes(dynamicId) && !deadSoundCloudClientIds.has(dynamicId)) {
    try {
      const value = await action(dynamicId);
      if (value != null) {
        soundCloudClientIdCache = dynamicId;
        return value;
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        deadSoundCloudClientIds.add(dynamicId);
        console.warn(`[audio-soundcloud] ${label} dynamic client_id rejected (${status}).`);
        lastError = error;
      } else {
        throw error;
      }
    }
  }
  if (lastError) {
    soundCloudDynamicBlockedUntil = Date.now() + SOUNDCLOUD_DYNAMIC_RETRY_COOLDOWN_MS;
    console.warn(`[audio-soundcloud] All client_ids rejected for ${label}.`, lastError);
  }
  return null;
}

export async function resolveSoundCloudStream(
  title: string,
  artist: string,
  permalink?: string
): Promise<StreamResult | null> {
  try {
    return await runSoundCloudClientIdAction(
      (clientId) => resolveSoundCloudWithClientId(title, artist, clientId, permalink),
      'stream resolution'
    );
  } catch (error) {
    console.warn('[audio-soundcloud] SoundCloud resolution failed.', error);
    return null;
  }
}

export async function resolveStream(
  title: string,
  artist: string
): Promise<StreamResult> {
  const [jioSaavn, soundCloud] = await Promise.allSettled([
    resolveJioSaavnStream(title, artist),
    resolveSoundCloudStream(title, artist),
  ]);
  const jioSaavnResult = jioSaavn.status === 'fulfilled' ? jioSaavn.value : null;
  const soundCloudResult = soundCloud.status === 'fulfilled' ? soundCloud.value : null;
  if (jioSaavnResult?.url) {
    const url = toHttps(jioSaavnResult.url);
    if (url) {
      return { ...jioSaavnResult, url };
    }
  }
  if (soundCloudResult?.url) {
    const url = toHttps(soundCloudResult.url);
    if (url) {
      return { ...soundCloudResult, url };
    }
  }
  throw new Error('No playable https stream found from any provider');
}

export async function resolveSoundCloudDownloadableStream(
  title: string,
  artist: string,
  permalink?: string
): Promise<StreamResult | null> {
  try {
    return await runSoundCloudClientIdAction(
      (clientId) => resolveSoundCloudWithClientId(title, artist, clientId, permalink, true),
      'downloadable stream resolution'
    );
  } catch (error) {
    console.warn('[audio-soundcloud] Downloadable SoundCloud resolution failed.', error);
    return null;
  }
}

/**
 * Stream resolution for OFFLINE caching. Prefers a progressive MP3/AAC from
 * JioSaavn or SoundCloud; falls back to an HLS (`.m3u8`) playlist only when no
 * progressive stream exists, so tracks without progressive transcodings can
 * still be downloaded as offline HLS bundles.
 */
export async function resolveDownloadableStream(
  title: string,
  artist: string
): Promise<StreamResult> {
  const [jioSaavn, soundCloud] = await Promise.allSettled([
    resolveJioSaavnStream(title, artist),
    resolveSoundCloudDownloadableStream(title, artist),
  ]);
  const candidates = [
    jioSaavn.status === 'fulfilled' ? jioSaavn.value : null,
    soundCloud.status === 'fulfilled' ? soundCloud.value : null,
  ];
  const progressive = candidates.find((candidate) => {
    const url = candidate?.url ? toHttps(candidate.url) : '';
    return url ? !isHlsStreamUrl(url) : false;
  });
  if (progressive?.url) {
    return { ...progressive, url: toHttps(progressive.url)! };
  }
  const hls = candidates.find((candidate) => {
    const url = candidate?.url ? toHttps(candidate.url) : '';
    return url ? isHlsStreamUrl(url) : false;
  });
  if (hls?.url) {
    return { ...hls, url: toHttps(hls.url)! };
  }
  throw new Error('No playable https stream found from any provider');
}