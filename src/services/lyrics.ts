import AsyncStorage from '@react-native-async-storage/async-storage';
import { isNetworkAvailable } from '../utils/network';
import { parsePlainLyrics, parseSyncedLyrics, type LyricLine } from './lrc';

export { parsePlainLyrics, parseSyncedLyrics, toLrc, findActiveLineIndex } from './lrc';
export type { LyricLine } from './lrc';

const LRCLIB_GET_URL = 'https://lrclib.net/api/get';
const LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_KEY = '@aymnx_lyrics_cache';
const CACHE_VERSION = 1;
const MAX_CACHE_ENTRIES = 80;
// Hits stay fresh for a month; misses are only remembered for the session so a
// lyric added upstream later can still be picked up without a reinstall.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
// Only trust a search hit if its length is within this many seconds of ours,
// otherwise a same-titled different song wins.
const DURATION_TOLERANCE_SEC = 8;
// A search hit must clear this bar to be trusted as the same song.
const SEARCH_ACCEPT_SCORE = 40;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

export interface LyricsResult {
  lines: LyricLine[];
  synced: boolean;
  /** Set when nothing usable was found, so callers can explain the empty state. */
  reason?: 'not-found' | 'offline' | 'error';
}

interface LrclibRecord {
  id?: number;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

interface CacheEntry {
  v: number;
  savedAt: number;
  result: LyricsResult;
}

type CacheShape = Record<string, CacheEntry>;

const EMPTY: LyricsResult = { lines: [], synced: false };

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, { savedAt: number; result: LyricsResult }>();
const inflight = new Map<string, Promise<LyricsResult>>();
let diskCache: CacheShape | null = null;
let diskCacheLoad: Promise<CacheShape> | null = null;

const readDiskCache = async (): Promise<CacheShape> => {
  if (diskCache) {
    return diskCache;
  }
  if (!diskCacheLoad) {
    diskCacheLoad = (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (!raw) {
          diskCache = {};
          return diskCache;
        }
        const parsed = JSON.parse(raw) as CacheShape;
        const now = Date.now();
        const fresh: CacheShape = {};
        for (const [id, entry] of Object.entries(parsed ?? {})) {
          if (
            entry &&
            entry.v === CACHE_VERSION &&
            now - entry.savedAt < CACHE_TTL_MS &&
            Array.isArray(entry.result?.lines)
          ) {
            fresh[id] = entry;
          }
        }
        diskCache = fresh;
        return diskCache;
      } catch {
        diskCache = {};
        return diskCache;
      }
    })();
  }
  return diskCacheLoad;
};

const persistDiskCache = async (trackId: string, result: LyricsResult): Promise<void> => {
  try {
    const cache = { ...(await readDiskCache()) };
    cache[trackId] = { v: CACHE_VERSION, savedAt: Date.now(), result };
    // Evict oldest first so the blob cannot grow without bound.
    const entries = Object.entries(cache);
    if (entries.length > MAX_CACHE_ENTRIES) {
      entries.sort((a, b) => a[1].savedAt - b[1].savedAt);
      for (const [id] of entries.slice(0, entries.length - MAX_CACHE_ENTRIES)) {
        delete cache[id];
      }
    }
    diskCache = cache;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A cache write failure must never break lyric playback.
  }
};

const readMemory = (trackId: string): LyricsResult | null => {
  const hit = memoryCache.get(trackId);
  if (!hit) {
    return null;
  }
  if (hit.result.lines.length === 0 && Date.now() - hit.savedAt > MISS_TTL_MS) {
    memoryCache.delete(trackId);
    return null;
  }
  return hit.result;
};

export function clearLyricsCache(): void {
  memoryCache.clear();
  inflight.clear();
  diskCache = null;
  diskCacheLoad = null;
  AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * LRCLIB intermittently answers 5xx, which is not the same as "this song has no
 * lyrics". Retry once before giving up so a blip does not surface as a
 * permanent "No lyrics found".
 */
async function requestJson(url: string): Promise<unknown | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.status >= 500) {
        if (attempt < MAX_ATTEMPTS) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
        continue;
      }
      return null;
    }
  }
  return null;
}

const buildResult = (record: LrclibRecord | null): LyricsResult => {
  if (!record) {
    return EMPTY;
  }
  if (record.instrumental) {
    return { lines: [], synced: false, reason: 'not-found' };
  }
  const synced = parseSyncedLyrics(record.syncedLyrics ?? '');
  if (synced.length > 0) {
    return { lines: synced, synced: true };
  }
  const plain = parsePlainLyrics(record.plainLyrics ?? '');
  if (plain.length > 0) {
    return { lines: plain, synced: false };
  }
  return EMPTY;
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const titleMatches = (candidate: string, wanted: string): boolean => {
  const a = normalize(candidate);
  const b = normalize(wanted);
  return Boolean(a) && Boolean(b) && (a === b || a.includes(b) || b.includes(a));
};

const scoreRecord = (record: LrclibRecord, title: string, artist: string, durationSec: number) => {
  let score = 0;
  if (titleMatches(record.trackName ?? '', title)) {
    score += 60;
  }
  if (titleMatches(record.artistName ?? '', artist)) {
    score += 30;
  }
  if (durationSec > 0 && typeof record.duration === 'number') {
    if (Math.abs(record.duration - durationSec) <= DURATION_TOLERANCE_SEC) {
      score += 25;
    } else if (Math.abs(record.duration - durationSec) <= 20) {
      score += 8;
    } else {
      score -= 20;
    }
  }
  if (record.syncedLyrics) {
    score += 12;
  }
  return score;
};

const fetchExactMatch = async (
  title: string,
  artist: string,
  album: string,
  durationSec: number
): Promise<LrclibRecord | null> => {
  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
  });
  if (album) {
    params.set('album_name', album);
  }
  if (durationSec > 0) {
    params.set('duration', String(Math.round(durationSec)));
  }
  const payload = await requestJson(`${LRCLIB_GET_URL}?${params.toString()}`);
  // A 404 is the documented "no exact match" response with an empty body, so a
  // null payload simply means the caller should try the search endpoint.
  return payload && typeof payload === 'object' ? (payload as LrclibRecord) : null;
};

const fetchSearchMatch = async (
  title: string,
  artist: string,
  durationSec: number
): Promise<LrclibRecord | null> => {
  // A combined "title artist" query is the best signal but is also the most
  // likely to come back empty or 5xx, so fall back to the title on its own.
  const queries = [[title, artist].filter(Boolean).join(' ').trim(), title.trim()].filter(
    (value, index, all) => value.length > 0 && all.indexOf(value) === index
  );

  let best: LrclibRecord | null = null;
  let bestScore = -Infinity;
  for (const query of queries) {
    const payload = await requestJson(
      `${LRCLIB_SEARCH_URL}?${new URLSearchParams({ q: query }).toString()}`
    );
    const records = Array.isArray(payload) ? (payload as LrclibRecord[]) : [];
    for (const record of records) {
      if (!record) {
        continue;
      }
      const candidate = scoreRecord(record, title, artist, durationSec);
      if (candidate > bestScore) {
        bestScore = candidate;
        best = record;
      }
    }
    if (bestScore >= SEARCH_ACCEPT_SCORE) {
      break;
    }
  }
  // Reject weak matches; an unrelated song's lyrics are worse than none.
  return bestScore >= SEARCH_ACCEPT_SCORE ? best : null;
};

const load = async (
  trackId: string,
  title: string,
  artist: string,
  album: string,
  durationSec: number
): Promise<LyricsResult> => {
  if (!(await isNetworkAvailable())) {
    const cached = readMemory(trackId);
    if (cached && cached.lines.length > 0) {
      return cached;
    }
    return { lines: [], synced: false, reason: 'offline' };
  }

  const exact = await fetchExactMatch(title, artist, album, durationSec);
  let result = buildResult(exact);
  // The exact endpoint is strict about duration, so fall back to a ranked
  // search when it 404s.
  if (result.lines.length === 0 && exact === null) {
    result = buildResult(await fetchSearchMatch(title, artist, durationSec));
  }
  if (result.lines.length === 0 && !result.reason) {
    result = { lines: [], synced: false, reason: 'not-found' };
  }

  memoryCache.set(trackId, { savedAt: Date.now(), result });
  if (result.lines.length > 0) {
    await persistDiskCache(trackId, result);
  }
  return result;
};

export interface LyricsTrackInput {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
}

export async function getLyrics(track: LyricsTrackInput): Promise<LyricsResult> {
  const trackId = (track?.id ?? '').trim();
  if (!trackId) {
    return EMPTY;
  }

  const memory = readMemory(trackId);
  if (memory) {
    return memory;
  }

  const disk = await readDiskCache();
  const hit = disk[trackId];
  if (hit) {
    memoryCache.set(trackId, { savedAt: hit.savedAt, result: hit.result });
    return hit.result;
  }

  const pending = inflight.get(trackId);
  if (pending) {
    return pending;
  }

  const durationSec =
    typeof track.duration === 'number' && Number.isFinite(track.duration)
      ? track.duration
      : 0;
  const request = load(
    trackId,
    (track.title ?? '').trim(),
    (track.artist ?? '').trim(),
    (track.album ?? '').trim(),
    durationSec
  )
    .catch(() => ({ lines: [], synced: false, reason: 'error' }) as LyricsResult)
    .finally(() => {
      inflight.delete(trackId);
    });

  inflight.set(trackId, request);
  return request;
}
