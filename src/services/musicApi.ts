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
    id: String(result.trackId),
    title: result.trackName,
    artist: result.artistName,
    album: result.collectionName,
    artwork: (result.artworkUrl100 ?? '').replace('100x100bb.jpg', ARTWORK_HIRES_SUFFIX),
    previewUrl: result.previewUrl ?? '',
  }));
}

const API_TIMEOUT_MS = REQUEST_TIMEOUT_MS;

const API_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
};

async function apiFetch<T>(path: string, instances: string[]): Promise<T> {
  let lastError: unknown;
  for (const instance of instances) {
    if (!/^https:\/\//i.test(instance)) {
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch(`${instance}${path}`, {
        headers: API_HEADERS,
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
  throw new Error(`All API instances failed: ${String(lastError)}`);
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

function pickJioSaavnSong(results: JioSaavnSong[], artist: string): JioSaavnSong {
  const target = artist.toLowerCase().trim();
  const match = results.find((song) =>
    (song.artists?.primary ?? []).some((primary) => {
      const name = (primary.name ?? '').toLowerCase();
      return name && (name.includes(target) || target.includes(name));
    })
  );
  return match ?? results[0];
}

export async function resolveJioSaavnStream(
  title: string,
  artist: string
): Promise<StreamResult | null> {
  try {
    const search = await apiFetch<JioSaavnSearchResponse>(
      `/api/search/songs?query=${encodeURIComponent(title)}&limit=8`,
      JIOSAAVN_INSTANCES
    );
    const results = search.data?.results ?? [];
    if (results.length === 0) {
      return null;
    }
    const preferred = pickJioSaavnSong(results, artist);
    let song: JioSaavnSong | null = null;
    if (preferred && titleMatches(title, preferred.name ?? '')) {
      song = preferred;
    } else {
      song = results.find((item) => titleMatches(title, item.name ?? '')) ?? null;
    }
    if (!song) {
      return null;
    }
    const url = pickJioSaavnDownload(song);
    if (!url) {
      return null;
    }
    return { url, mimeType: 'audio/mp4', provider: 'jiosaavn' };
  } catch (error) {
    console.warn('[audio] JioSaavn resolution failed.', error);
    return null;
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

async function resolveSoundCloudWithClientId(
  title: string,
  artist: string,
  clientId: string,
  permalink?: string
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
  if (!permalink && (!best.duration || best.duration <= 60000)) {
    return null;
  }
  const transcoding = pickSoundCloudTranscoding(best);
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
    if (value && !seen.has(value)) {
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
        console.warn(`[audio-soundcloud] ${label} client_id rejected (${status}), rotating.`);
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  const dynamicId = await fetchSoundCloudClientId();
  if (dynamicId && !candidates.includes(dynamicId)) {
    try {
      const value = await action(dynamicId);
      if (value != null) {
        soundCloudClientIdCache = dynamicId;
        return value;
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        console.warn(`[audio-soundcloud] ${label} dynamic client_id rejected (${status}).`);
        lastError = error;
      } else {
        throw error;
      }
    }
  }
  if (lastError) {
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
  const jioSaavn = await resolveJioSaavnStream(title, artist);
  if (jioSaavn?.url) {
    const url = toHttps(jioSaavn.url);
    if (url) {
      return { ...jioSaavn, url };
    }
  }
  const soundCloud = await resolveSoundCloudStream(title, artist);
  if (soundCloud?.url) {
    const url = toHttps(soundCloud.url);
    if (url) {
      return { ...soundCloud, url };
    }
  }
  throw new Error('No playable https stream found from any provider');
}