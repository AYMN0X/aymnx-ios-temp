import * as FileSystem from 'expo-file-system/legacy';
import { resolveDownloadableStream, searchTrackArtwork, Track } from './musicApi';
import { canonicalizeHttpUrl } from '../utils/streamCache';
import { extractId3Picture, base64ToBytes, bytesToBase64 } from '../utils/id3Artwork';
import { isNetworkAvailable } from '../utils/network';

export interface DownloadedTrack extends Track {
  localAudioUri: string;
  localArtworkUri: string;
  downloadedAt: number;
}

const TRACKS_DIR = `${FileSystem.documentDirectory ?? ''}tracks/`;

// A real audio file is orders of magnitude larger than an HLS manifest (which
// is a few KB of plaintext with remote segment URLs). Anything under this size
// is a manifest, a partial/corrupt write, or an empty file — not playable.
const MIN_AUDIO_FILE_BYTES = 100_000;

// Per-track metadata sidecar, written as soon as a download validates. This is
// the only place the full Track metadata for a file on disk survives, since the
// filename encodes just a sanitized id.
const TRACK_META_SUFFIX = '.meta.json';

// A cover image is a few KB, so anything empty is a failed write. Kept separate
// from the audio threshold: artwork is optional, but an empty file is worse than
// no file because the image loader would try to decode it forever.
const MIN_ARTWORK_FILE_BYTES = 1;

// Durable record of an in-flight batch, so a terminated app can resume instead
// of orphaning every file it had already written.
const PENDING_BATCH_FILE = '_pending_batch.json';

// Sidecars and the batch journal live in the same directory as the audio, so
// directory scans must never mistake them for playable tracks.
function isMetadataArtifact(name: string): boolean {
  return name.endsWith(TRACK_META_SUFFIX) || name === PENDING_BATCH_FILE;
}

const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

const isLocalSource = (uri: string): boolean => {
  return uri.startsWith('file://') || uri.startsWith('/');
};

const isHlsStreamUrl = (url: string): boolean => {
  return url.split(/[?#]/)[0].endsWith('.m3u8');
};

/**
 * iOS AVPlayer (expo-audio) strictly requires `file://`-scheme paths for local
 * playback. Normalize any absolute or scheme-less path before passing it to
 * the native player.
 */
export function toLocalFileUri(uri: string): string {
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

const MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
  'audio/x-flac': '.flac',
  'audio/flac': '.flac',
};

function extensionFor(track: Track): string {
  if (track.streamMimeType) {
    const mapped = MIME_TO_EXT[track.streamMimeType.split(';')[0].trim().toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }
  for (const candidate of [track.streamUrl, track.previewUrl]) {
    if (candidate) {
      const match = candidate.split(/[?#]/)[0].match(/\.([a-z0-9]{1,5})$/i);
      if (match) {
        return `.${match[1].toLowerCase()}`;
      }
    }
  }
  return '.m4a';
}

const audioFileUri = (trackId: string, ext = '.m4a') => `${TRACKS_DIR}${sanitizeId(trackId)}${ext}`;
const artworkFileUri = (trackId: string, ext = '.jpg') =>
  `${TRACKS_DIR}${sanitizeId(trackId)}_art${ext}`;

/**
 * Resolves an already-downloaded artwork file, if one exists. Artwork is
 * optional, so a miss returns '' rather than throwing. Needed by re-adoption,
 * where the caller has no in-memory record of what was written.
 */
async function findLocalArtwork(trackId: string): Promise<string> {
  for (const ext of ['.jpg', '.png', '.jpeg', '.webp']) {
    const candidate = artworkFileUri(trackId, ext);
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      // A zero-byte file is a failed write left behind by an older version. It
      // would be adopted here and then fail to decode at render time, so treat
      // it as absent and let the caller re-fetch.
      if (info.exists && (info.size ?? 0) >= MIN_ARTWORK_FILE_BYTES) {
        return candidate;
      }
    } catch (error) {
      // Treat an unreadable candidate as absent and try the next extension.
    }
  }
  return '';
}

/**
 * Downloads one artwork candidate to disk and returns its URI, or '' if the
 * fetch did not produce a real image file.
 *
 * Three failure modes are handled explicitly, because each one previously left
 * a URI in the download record that pointed at nothing usable:
 *   - a non-2xx status, which FileSystem reports without throwing
 *   - a thrown transport error (offline, DNS, TLS)
 *   - a 2xx that wrote an empty file, which some CDNs return for a hotlink
 *     rejection
 * The destination is removed on every failure so a later `findLocalArtwork`
 * cannot adopt the junk.
 */
async function saveArtworkFile(source: string, trackId: string): Promise<string> {
  const destination = artworkFileUri(trackId);
  let artSource: string;
  try {
    artSource = canonicalizeHttpUrl(source);
  } catch {
    return '';
  }
  try {
    // Clear any prior file first. Downloading over an existing path that turns
    // out to be a redirect body would otherwise leave stale bytes in place.
    await FileSystem.deleteAsync(destination, { idempotent: true });
    const artResult = await FileSystem.downloadAsync(artSource, destination, {
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      headers: buildDownloadHeaders(artSource, 'artwork'),
    });
    if (!artResult || artResult.status < 200 || artResult.status >= 300) {
      console.warn(
        '[downloads] Artwork fetch returned status',
        artResult?.status,
        'for:',
        source
      );
      await FileSystem.deleteAsync(destination, { idempotent: true });
      return '';
    }
    // Status alone is not proof of an image. 206 and a few edge responses report
    // success while leaving nothing on disk, so the written file is re-checked
    // the same way the audio file is.
    const info = await FileSystem.getInfoAsync(destination);
    if (!info.exists || (info.size ?? 0) < MIN_ARTWORK_FILE_BYTES) {
      await FileSystem.deleteAsync(destination, { idempotent: true });
      return '';
    }
    return destination;
  } catch (error) {
    console.warn('[downloads] Artwork download failed; continuing without it.', error);
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    return '';
  }
}

function extensionForMime(mimeType: string | undefined): string {
  if (mimeType) {
    const mapped = MIME_TO_EXT[mimeType.split(';')[0].trim().toLowerCase()];
    if (mapped) {
      return mapped;
    }
  }
  return '.mp3';
}

// Some SoundCloud tracks expose no progressive transcoding at all — only an HLS
// (.m3u8) playlist. Those are bundled into a directory of local segment files
// plus a rewritten playlist, all relative to image the bundle at:
//   <documentDirectory>/tracks/<sanitizedId>/playlist.m3u8
const hlsDirFor = (trackId: string): string =>
  `${TRACKS_DIR}${sanitizeId(trackId)}/`;
const hlsManifestUri = (trackId: string): string =>
  `${hlsDirFor(trackId)}playlist.m3u8`;

/**
 * The audio CDNs this app talks to (JioSaavn, SoundCloud) reject requests that
 * do not look like they came from a browser, and NSURLSession's default
 * User-Agent is not one. Sending a desktop/Safari UA is what makes a signed CDN
 * link return 200 instead of 403.
 */
const DOWNLOAD_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

type DownloadHeaderKind = 'audio' | 'artwork' | 'manifest';

const ACCEPT_BY_KIND: Record<DownloadHeaderKind, string> = {
  audio: 'audio/*,*/*;q=0.9',
  artwork: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  manifest: 'application/vnd.apple.mpegurl,application/x-mpegURL,*/*;q=0.8',
};

function hostOf(url: string): string {
  return url.match(/^https?:\/\/([^/?#]+)/i)?.[1]?.toLowerCase() ?? '';
}

function originOf(url: string): string {
  return url.match(/^(https?:\/\/[^/?#]+)/i)?.[1] ?? '';
}

/**
 * Referer that the audio host expects. Both providers gate their media hosts on
 * a matching Referer: SoundCloud's CDN rejects a bare cross-origin fetch, and
 * JioSaavn checks for its own site. Anything unrecognised falls back to the
 * resource's own origin, which is always a safe same-origin referrer.
 */
function refererFor(url: string): string {
  const host = hostOf(url);
  if (/soundcloud\.com|sndcdn\.com|sc-cdn\.net/i.test(host)) {
    return 'https://soundcloud.com/';
  }
  if (/jiosaavn\.com|saavn\.com/i.test(host)) {
    return 'https://www.jiosaavn.com/';
  }
  return originOf(url) ? `${originOf(url)}/` : '';
}

/**
 * Browser-shaped headers for every file-system fetch. A file:// or otherwise
 * unparseable source still gets the UA, since dropping it is what triggers 403.
 */
export function buildDownloadHeaders(
  url: string,
  kind: DownloadHeaderKind = 'audio'
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': DOWNLOAD_USER_AGENT,
    Accept: ACCEPT_BY_KIND[kind],
  };
  const referer = refererFor(url);
  if (referer) {
    headers.Referer = referer;
  }
  return headers;
}

/**
 * HTTP failure that carries its status, so callers can distinguish an expired
 * signed URL (403, worth re-resolving) from a genuinely dead track (404, not
 * worth retrying).
 */
class HttpStatusError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

const isForbidden = (error: unknown): boolean =>
  error instanceof HttpStatusError && error.status === 403;

const HLS_SEGMENT_BATCH_SIZE = 6;

function resolveSegmentUrl(segment: string, manifestBaseUrl: string): string {
  const trimmed = segment.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  // Root-relative (starts with '/') segments resolve against the manifest host.
  if (trimmed.startsWith('/')) {
    const host = manifestBaseUrl.match(/^https?:\/\/[^/]+/i)?.[0];
    return host ? `${host}${trimmed}` : trimmed;
  }
  return `${manifestBaseUrl}${trimmed}`;
}

/**
 * Download an HLS (.m3u8) playlist and all of its media segments so the bundle
 * plays fully offline. Segments are fetched concurrently in small batches and
 * stored as `seg_<index>.ts`; the manifest is rewritten to reference those
 * relative paths (iOS AVPlayer resolves relative segment URIs against the local
 * playlist, enabling offline playback of local .m3u8 files).
 */
async function downloadHlsTrack(
  trackId: string,
  sourceUrl: string,
  onProgress?: (bytesWritten: number, totalBytes: number) => void
): Promise<{ audioUri: string; mimeType: string; totalBytes: number }> {
  const dir = hlsDirFor(trackId);
  // Clear any previous bundle before writing. A 403 retry re-enters this
  // function, and makeDirectoryAsync throws on an existing directory, so without
  // this the retry would fail with a confusing "file exists" instead of a real
  // error. It also stops a failed attempt's segments from being mixed into the
  // retry's playlist.
  await FileSystem.deleteAsync(dir, { idempotent: true });
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const manifestResponse = await fetch(sourceUrl, {
    headers: buildDownloadHeaders(sourceUrl, 'manifest'),
  });
  if (!manifestResponse.ok) {
    throw new HttpStatusError(
      manifestResponse.status,
      `HLS manifest download failed (HTTP ${manifestResponse.status}).`
    );
  }
  const manifestText = await manifestResponse.text();
  if (!manifestText.includes('#EXTM3U')) {
    throw new Error('Downloaded manifest is not a valid HLS playlist.');
  }
  const manifestBaseUrl = sourceUrl.split(/[?#]/)[0];
  const baseDir = manifestBaseUrl.slice(0, manifestBaseUrl.lastIndexOf('/') + 1);
  const lines = manifestText.split(/\r?\n/);
  const segmentLineToIndex = new Map<number, number>();
  let segmentCounter = 0;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      return;
    }
    segmentLineToIndex.set(index, segmentCounter++);
  });

  const segmentUrls = lines
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    })
    .map((line) => resolveSegmentUrl(line.trim(), baseDir));

  // Download segment chunks in small concurrent batches to keep peak memory and
  // simultaneous connections bounded.
  let totalBytes = 0;
  for (let start = 0; start < segmentUrls.length; start += HLS_SEGMENT_BATCH_SIZE) {
    const batch = segmentUrls.slice(start, start + HLS_SEGMENT_BATCH_SIZE);
    const sizes = await Promise.all(
      batch.map(async (segmentUrl, offset) => {
        const index = start + offset;
        const uri = `${dir}seg_${index}.ts`;
        const result = await FileSystem.downloadAsync(segmentUrl, uri, {
          sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          headers: buildDownloadHeaders(segmentUrl, 'audio'),
        });
        if (!result || result.status < 200 || result.status >= 300) {
          throw new HttpStatusError(
            result?.status ?? 0,
            `HLS segment ${index} download failed (HTTP ${result?.status}).`
          );
        }
        const info = await FileSystem.getInfoAsync(uri);
        return info.exists ? (info.size ?? 0) : 0;
      })
    );
    totalBytes += sizes.reduce((sum, size) => sum + size, 0);
    if (onProgress) {
      onProgress(totalBytes, 0);
    }
  }

  // Rewrite the manifest so every segment line points at a local relative file,
  // preserving all directive (#) lines untouched.
  const rewritten = lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        return line;
      }
      const segmentIndex = segmentLineToIndex.get(index);
      return segmentIndex != null ? `seg_${segmentIndex}.ts` : line;
    })
    .join('\n');

  const playlistUri = hlsManifestUri(trackId);
  await FileSystem.writeAsStringAsync(playlistUri, rewritten, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return {
    audioUri: playlistUri,
    mimeType: 'application/vnd.apple.mpegurl',
    totalBytes,
  };
}

async function totalHlsBundleBytes(playlistUri: string): Promise<number> {
  try {
    const dir = playlistUri.replace(/playlist\.m3u8$/, '');
    const entries = await FileSystem.readDirectoryAsync(dir);
    let total = 0;
    for (const name of entries) {
      if (name.startsWith('seg_')) {
        const info = await FileSystem.getInfoAsync(`${dir}${name}`);
        total += info.exists ? (info.size ?? 0) : 0;
      }
    }
    return total;
  } catch (error) {
    console.warn('[downloads] Could not measure HLS bundle size.', error);
    return 0;
  }
}

async function extractEmbeddedArtwork(audioUri: string, trackId: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(audioUri);
    if (!info.exists || (info.size ?? 0) > 64 * 1024 * 1024) {
      return '';
    }
    const base64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const picture = extractId3Picture(base64ToBytes(base64));
    if (!picture || picture.data.length < 128) {
      return '';
    }
    const uri = artworkFileUri(trackId, picture.ext);
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(picture.data), {
      encoding: FileSystem.EncodingType.Base64,
    });
    const written = await FileSystem.getInfoAsync(uri);
    return written.exists && (written.size ?? 0) > 0 ? uri : '';
  } catch (error) {
    console.warn('[downloads] Could not extract embedded artwork from:', audioUri, error);
    return '';
  }
}

async function ensureTracksDirectory(): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(TRACKS_DIR, {
      intermediates: true,
    });
  } catch (error) {
    console.warn('[downloads] Could not ensure tracks directory.', error);
  }
}

/**
 * Progressive (non-HLS) audio fetch. Uses a resumable task so the progress
 * callback still fires, and sends browser headers because the media hosts 403 a
 * bare NSURLSession request.
 */
async function downloadProgressiveAudio(
  url: string,
  fileUri: string,
  onProgress?: (bytesWritten: number, totalBytes: number) => void
): Promise<void> {
  const task = FileSystem.createDownloadResumable(
    url,
    fileUri,
    {
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      headers: buildDownloadHeaders(url, 'audio'),
    },
    (progress) => {
      if (onProgress) {
        onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
      }
    }
  );
  const result = await task.downloadAsync();
  if (!result) {
    throw new HttpStatusError(0, 'Audio download failed.');
  }
  // A 403 leaves a 0-byte or error-page file behind, so clear it before
  // retrying or the retry would resume onto the garbage.
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
    throw new HttpStatusError(
      result.status,
      `Audio download failed (HTTP ${result.status}).`
    );
  }
}

interface ResolvedAudioSource {
  url: string;
  mimeType?: string;
}

/**
 * Extension for the saved file. A freshly resolved source always carries a mime
 * type, but the stored-URL fallback may not, in which case the original track
 * metadata (and failing that, the URL suffix) decides it rather than blindly
 * defaulting to .mp3.
 */
function extensionForSource(track: Track, source: ResolvedAudioSource): string {
  return source.mimeType ? extensionForMime(source.mimeType) : extensionFor(track);
}

/**
 * Resolves a downloadable URL for this track at the moment of the download.
 *
 * The stored `streamUrl` is deliberately NOT trusted for network sources. It is
 * a signed, short-lived CDN link (JioSaavn hands out `dl.jiosaavn.com` URLs with
 * an expiry in the query string) that gets persisted alongside the library, so a
 * playlist imported last week 403s on download today. Resolving at the last
 * possible moment is what fixes that class of failure.
 *
 * `allowStoredFallback` exists for the retry path only: if the providers are
 * unreachable, retrying with the same expired URL is pointless, so the retry
 * reports failure rather than looping.
 */
async function resolveAudioSource(
  track: Track,
  allowStoredFallback: boolean
): Promise<ResolvedAudioSource | null> {
  try {
    const stream = await resolveDownloadableStream(track.title, track.artist);
    if (stream.url) {
      return { url: canonicalizeHttpUrl(stream.url), mimeType: stream.mimeType };
    }
  } catch (error) {
    if (!allowStoredFallback) {
      return null;
    }
    // A provider outage should not block a download that a still-valid stored
    // URL could satisfy, so fall through rather than failing outright.
    console.warn('[downloads] Fresh stream resolution failed; using stored URL.', error);
  }
  if (!allowStoredFallback) {
    return null;
  }
  const stored = track.streamUrl?.trim() ?? '';
  if (stored && !isLocalSource(stored)) {
    return { url: canonicalizeHttpUrl(stored), mimeType: track.streamMimeType };
  }
  return null;
}

/**
 * Resolves the artwork for a track to a file on disk, without the embedded-ID3
 * fallback, which needs the audio file to already exist.
 *
 * Split out of `finalizeTrackDownload` so `downloadTrack` can start this before
 * the audio transfer begins and let the two overlap. Artwork is a small transfer
 * behind a provider lookup, so serializing it after the audio added its full
 * latency to every track in a batch.
 */
async function fetchTrackArtworkFile(track: Track): Promise<string> {
  // Cover art is best-effort: a failure here must never fail the audio download.
  // The record still has to be *true*, though. Storing a URI that was never
  // successfully written is what leaves a track showing a broken image forever,
  // so every path below verifies the file before it is linked into the record.
  let localArtworkUri = '';
  // Ordered candidates: the track's own artwork, then a title/artist lookup for
  // tracks that carry no art at all (common for Spotify imports and some
  // SoundCloud rows). Embedded ID3 art is the last resort, handled by the caller
  // because it depends on the audio file being present.
  const remoteArtworkCandidates: string[] = [];
  if (track.artwork) {
    if (isLocalSource(track.artwork)) {
      // Already on disk, so prefer the copy this app manages; fall back to the
      // incoming path only once it is confirmed to exist.
      const localArt = await findLocalArtwork(track.id);
      if (localArt) {
        localArtworkUri = localArt;
      } else {
        const info = await FileSystem.getInfoAsync(track.artwork);
        if (info.exists) {
          localArtworkUri = track.artwork;
        }
      }
    } else {
      remoteArtworkCandidates.push(track.artwork);
    }
  }
  if (!localArtworkUri && (await isNetworkAvailable())) {
    // Gated on connectivity: an artless track downloaded offline would otherwise
    // stall on two provider timeouts before the audio could be finalized. The
    // lookup is cached, so this costs nothing for repeat downloads.
    const looked = await searchTrackArtwork(track.title, track.artist);
    if (looked) {
      remoteArtworkCandidates.push(looked);
    }
  }
  for (const candidate of remoteArtworkCandidates) {
    const saved = await saveArtworkFile(candidate, track.id);
    if (saved) {
      localArtworkUri = saved;
      break;
    }
  }
  return localArtworkUri;
}

/**
 * Validation, artwork, and the sidecar write for audio that is already on disk.
 * Shared by the network paths and the local-share copy path so every download
 * produces an identical record.
 *
 * `artworkPromise` is an already-in-flight `fetchTrackArtworkFile` call. When
 * supplied it is awaited here instead of starting fresh work, so the artwork
 * transfer overlaps the audio transfer instead of following it.
 */
async function finalizeTrackDownload(
  track: Track,
  audioUri: string,
  resolvedMime: string | undefined,
  isHlsBundle: boolean,
  artworkPromise?: Promise<string>
): Promise<DownloadedTrack> {
  // Validation: reject empty writes, partial/interrupted downloads and broken
  // HLS bundles so a garbage file is never marked as "downloaded". An HLS
  // playlist file itself is tiny, so its validity is measured by the total size
  // of the bundled segments instead.
  const audioInfo = await FileSystem.getInfoAsync(audioUri);
  const totalSize = isHlsBundle
    ? await totalHlsBundleBytes(audioUri)
    : audioInfo.exists
      ? (audioInfo.size ?? 0)
      : 0;
  if (!audioInfo.exists || totalSize < MIN_AUDIO_FILE_BYTES) {
    if (isHlsBundle) {
      await FileSystem.deleteAsync(hlsDirFor(track.id), { idempotent: true });
    } else {
      await FileSystem.deleteAsync(audioUri, { idempotent: true });
    }
    throw new Error(`Downloaded audio too small to be a valid track: ${track.title}`);
  }

  // Artwork resolves in parallel with the audio transfer when the caller supplies
  // an in-flight promise; otherwise it is fetched here. Either way the audio file
  // is already on disk, so embedded ID3 art can be used as the last resort.
  let localArtworkUri = artworkPromise ? await artworkPromise : await fetchTrackArtworkFile(track);
  if (!localArtworkUri) {
    localArtworkUri = await extractEmbeddedArtwork(audioUri, track.id);
  }
  if (localArtworkUri) {
    localArtworkUri = toLocalFileUri(localArtworkUri);
  }

  const meta: DownloadedTrack = {
    ...track,
    streamMimeType: resolvedMime ?? track.streamMimeType,
    localAudioUri: toLocalFileUri(audioUri),
    localArtworkUri,
    downloadedAt: Date.now(),
  };
  // Write the sidecar BEFORE returning, so the audio file on disk is never
  // un-attributable. If the process dies immediately after this, the next
  // launch can still re-adopt the file with its full Track metadata.
  await writeTrackMeta(meta);
  return meta;
}

/**
 * Fetches the audio for an already-resolved URL and finalizes the record.
 * Shared by the initial attempt and the 403 retry so both produce an identical
 * `DownloadedTrack`.
 */
async function downloadResolvedAudio(
  track: Track,
  source: ResolvedAudioSource,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
  artworkPromise?: Promise<string>
): Promise<DownloadedTrack> {
  if (isHlsStreamUrl(source.url)) {
    const hls = await downloadHlsTrack(track.id, source.url, onProgress);
    return finalizeTrackDownload(track, hls.audioUri, hls.mimeType, true, artworkPromise);
  }
  const audioUri = audioFileUri(track.id, extensionForSource(track, source));
  await downloadProgressiveAudio(source.url, audioUri, onProgress);
  return finalizeTrackDownload(track, audioUri, source.mimeType, false);
}

export async function downloadTrack(
  track: Track,
  onProgress?: (bytesWritten: number, totalBytes: number) => void
): Promise<DownloadedTrack> {
  if (!FileSystem.documentDirectory) {
    throw new Error('Downloads are not supported in this environment.');
  }
  await ensureTracksDirectory();

  const ownSource = track.streamUrl?.trim() ?? '';

  // A LAN/library share points at a real file on disk. That file IS the media,
  // not a resolvable pointer, so it must be copied as-is and never replaced by a
  // network lookup or a re-resolve.
  if (ownSource && isLocalSource(ownSource)) {
    const localUri = audioFileUri(track.id, extensionFor(track));
    await FileSystem.copyAsync({ from: ownSource, to: localUri });
    return finalizeTrackDownload(track, localUri, track.streamMimeType, false);
  }

  // Start the artwork transfer now, before the stream is even resolved, and do not
  // await it. It is handed to `finalizeTrackDownload`, which awaits it once the
  // audio has landed, so the provider lookup and the image download run
  // concurrently with stream resolution and the audio transfer instead of adding
  // their latency to the end of every track. A rejection is absorbed here: artwork
  // is best-effort and must never fail an otherwise good audio download.
  const artworkPromise = fetchTrackArtworkFile(track).catch((error) => {
    console.warn('[downloads] Artwork lookup failed for:', track.title, error);
    return '';
  });

  const source = await resolveAudioSource(track, true);
  if (!source) {
    throw new Error('Could not find a downloadable source for this track.');
  }
  try {
    return await downloadResolvedAudio(track, source, onProgress, artworkPromise);
  } catch (error) {
    if (!isForbidden(error)) {
      throw error;
    }
    // 403 on a signed CDN link means the URL expired between resolution and the
    // request (or the resolver handed back a stale link). One fresh resolve and
    // one retry is worth it; a second failure means the track is genuinely
    // unavailable rather than transiently expired.
    const refreshed = await resolveAudioSource(track, false);
    if (!refreshed || refreshed.url === source.url) {
      throw error;
    }
    return downloadResolvedAudio(track, refreshed, onProgress, artworkPromise);
  }
}

export async function deleteTrackFiles(trackId: string): Promise<void> {
  const prefix = sanitizeId(trackId);
  try {
    await FileSystem.deleteAsync(`${TRACKS_DIR}${prefix}/`, { idempotent: true });
  } catch (error) {
    console.warn('[downloads] Could not remove HLS bundle directory.', error);
  }
  try {
    const entries = await FileSystem.readDirectoryAsync(TRACKS_DIR);
    await Promise.allSettled(
      entries
        .filter((name) => name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}_`))
        .map((name) => FileSystem.deleteAsync(`${TRACKS_DIR}${name}`, { idempotent: true }))
    );
  } catch (error) {
    console.warn('[downloads] Could not list tracks directory for deletion.', error);
  }
}

export async function filterExistingDownloads(
  tracks: DownloadedTrack[]
): Promise<DownloadedTrack[]> {
  const results = await Promise.all(
    tracks.map(async (track) => {
      if (!track.localAudioUri) {
        return null;
      }
      try {
        const info = await FileSystem.getInfoAsync(track.localAudioUri);
        if (!info.exists) {
          return null;
        }
        const isHls = /\.m3u8?$/i.test(track.localAudioUri);
        // Prune manifest-sized / corrupt entries so they are never treated as
        // downloaded (offline playback must not attempt a broken file). An HLS
        // playlist file itself is tiny, so its bundle of segments is measured
        // instead of the playlist's own byte size.
        const totalSize = isHls
          ? await totalHlsBundleBytes(track.localAudioUri)
          : (info.size ?? 0);
        if (totalSize < MIN_AUDIO_FILE_BYTES) {
          await FileSystem.deleteAsync(track.localAudioUri, { idempotent: true });
          if (isHls) {
            await FileSystem.deleteAsync(
              track.localAudioUri.replace(/playlist\.m3u8$/, ''),
              { idempotent: true }
            );
          }
          // Drop the sidecar with the audio. A sidecar for a track that no longer
          // has a file would otherwise linger and could later resurrect a record
          // for an id the user has effectively removed.
          await FileSystem.deleteAsync(trackMetaFileUri(sanitizeId(track.id)), {
            idempotent: true,
          });
          return null;
        }
        return track;
      } catch (error) {
        console.warn('[downloads] Could not verify download file for:', track.id, error);
        return null;
      }
    })
  );
  return results.filter((track): track is DownloadedTrack => track !== null);
}

/**
 * Reverse half of the disk cross-check: audio artifacts that exist on disk but
 * have no storage record. Returns SANITIZED ids, not original track ids, because
 * the filename is the only identity on disk and `sanitizeId` is lossy for any id
 * containing characters outside [a-zA-Z0-9_-].
 *
 * A returned prefix can be resolved back to a full DownloadedTrack via
 * `resolveOrphanTrack`, which is what makes re-adoption possible without a
 * storage record.
 */
export async function findOrphanedDownloadIds(tracks: DownloadedTrack[]): Promise<string[]> {
  const known = new Set(tracks.map((track) => sanitizeId(track.id)));
  const orphans = new Set<string>();
  let entries: string[];
  try {
    entries = await FileSystem.readDirectoryAsync(TRACKS_DIR);
  } catch (error) {
    console.warn('[downloads] Could not list tracks directory for orphan scan.', error);
    return [];
  }
  for (const name of entries) {
    // Skip artwork sidecars, metadata artifacts, dotfiles, and the HLS manifest
    // itself (the bundle directory entry below covers that case).
    if (name.includes('_art') || name.startsWith('.') || isMetadataArtifact(name)) continue;
    const dot = name.lastIndexOf('.');
    const isBundleDir = dot === -1;
    if (!isBundleDir && /\.m3u8?$/i.test(name)) continue;
    const prefix = isBundleDir ? name : name.slice(0, dot);
    if (!prefix || known.has(prefix)) continue;
    orphans.add(prefix);
  }
  return [...orphans];
}

function trackMetaFileUri(sanitizedPrefix: string): string {
  return `${TRACKS_DIR}${sanitizedPrefix}${TRACK_META_SUFFIX}`;
}

/**
 * Persists the full Track metadata for a completed download next to its audio
 * file. Best-effort: a failure here must not fail the download, because the
 * storage record written by the caller is still the primary source of truth.
 */
export async function writeTrackMeta(track: DownloadedTrack): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(
      trackMetaFileUri(sanitizeId(track.id)),
      JSON.stringify(track),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  } catch (error) {
    console.warn('[downloads] Could not write track sidecar:', track.id, error);
  }
}

/**
 * Recovers a full DownloadedTrack for an on-disk file using only its sanitized
 * id prefix. Returns null when no usable sidecar exists, which is the signal
 * that the file genuinely cannot be re-adopted.
 */
export async function readTrackMeta(sanitizedPrefix: string): Promise<DownloadedTrack | null> {
  const uri = trackMetaFileUri(sanitizedPrefix);
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return null;
    }
    const raw = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw) as DownloadedTrack;
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      parsed.id.length === 0 ||
      typeof parsed.localAudioUri !== 'string' ||
      parsed.localAudioUri.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('[downloads] Could not read track sidecar:', sanitizedPrefix, error);
    return null;
  }
}

/**
 * Rebuilds a full DownloadedTrack for an orphaned on-disk file from a Track
 * pulled out of the pending-batch journal, then writes its sidecar so the
 * recovery only has to happen once.
 *
 * This is the fallback for the transfer that was in flight when the app died: it
 * has no sidecar yet (nothing finished), but the journal still carries its
 * metadata, and the background session may have written the audio after JS
 * stopped running.
 */
async function recoverTrackFromJournal(
  prefix: string,
  queued: Track[]
): Promise<DownloadedTrack | null> {
  const queuedTrack = queued.find((track) => sanitizeId(track.id) === prefix);
  if (!queuedTrack) {
    return null;
  }
  const audioFile = await getLocalTrackFile(queuedTrack.id);
  if (!audioFile) {
    return null;
  }
  let downloadedAt = Date.now();
  try {
    const info = await FileSystem.getInfoAsync(audioFile);
    if (info.exists && typeof info.modificationTime === 'number') {
      downloadedAt = info.modificationTime;
    }
  } catch (error) {
    // mtime is cosmetic (sort order only); fall through to "now".
  }
  const recovered: DownloadedTrack = {
    ...queuedTrack,
    localAudioUri: toLocalFileUri(audioFile),
    localArtworkUri: await findLocalArtwork(queuedTrack.id),
    downloadedAt,
  };
  await writeTrackMeta(recovered);
  return recovered;
}

/**
 * Full re-adoption path for one orphaned file, given the sanitized id prefix
 * that was found on disk and the pending-batch queue. Tries the durable sidecar
 * first, then the journal. Returns null when neither can supply the metadata
 * that `DownloadedTrack` requires, which is the honest answer: the file cannot
 * be rendered as a track without inventing a title and artist.
 */
export async function resolveOrphanTrack(
  prefix: string,
  queued: Track[]
): Promise<DownloadedTrack | null> {
  const fromMeta = await readTrackMeta(prefix);
  if (fromMeta) {
    // Guard against a sidecar whose own id doesn't hash to the prefix we found,
    // which would mean the filename and the metadata disagree.
    if (sanitizeId(fromMeta.id) === prefix) {
      return fromMeta;
    }
    return null;
  }
  return recoverTrackFromJournal(prefix, queued);
}

export async function writePendingBatch(tracks: Track[]): Promise<void> {
  try {
    await ensureTracksDirectory();
    await FileSystem.writeAsStringAsync(
      `${TRACKS_DIR}${PENDING_BATCH_FILE}`,
      JSON.stringify(tracks),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  } catch (error) {
    console.warn('[downloads] Could not persist pending batch.', error);
  }
}

export async function readPendingBatch(): Promise<Track[] | null> {
  try {
    const uri = `${TRACKS_DIR}${PENDING_BATCH_FILE}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return null;
    }
    const raw = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = JSON.parse(raw) as Track[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch (error) {
    console.warn('[downloads] Could not read pending batch.', error);
    return null;
  }
}

export async function clearPendingBatch(): Promise<void> {
  try {
    await FileSystem.deleteAsync(`${TRACKS_DIR}${PENDING_BATCH_FILE}`, { idempotent: true });
  } catch (error) {
    console.warn('[downloads] Could not clear pending batch.', error);
  }
}

/**
 * Direct lookup of a cached audio file by deterministic download path, without
 * consulting the in-memory registry. This is the offline guarantee: playback
 * can find the file (e.g. `tracks/<sanitized-id>.m4a` or the HLS bundle at
 * `tracks/<sanitized-id>/playlist.m3u8`) even if the download registry has not
 * hydrated yet or is stale. Returns the first existing, validly-sized audio
 * artifact for the track id, or null.
 */
export async function getLocalTrackFile(trackId: string): Promise<string | null> {
  const prefix = sanitizeId(trackId);
  let entries: string[] = [];
  try {
    entries = await FileSystem.readDirectoryAsync(TRACKS_DIR);
  } catch (error) {
    console.warn('[downloads] Could not list tracks directory for local lookup.', error);
  }
  for (const name of entries) {
    if (name.startsWith(`${prefix}.`) && !name.includes('_art') && !isMetadataArtifact(name)) {
      if (/\.m3u8?$/i.test(name)) {
        continue;
      }
      const uri = toLocalFileUri(`${TRACKS_DIR}${name}`);
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists && (info.size ?? 0) >= MIN_AUDIO_FILE_BYTES) {
        return uri;
      }
    }
  }
  // HLS bundle: validate the whole segment directory, then return the playlist.
  const playlistUri = hlsManifestUri(trackId);
  try {
    const playlistInfo = await FileSystem.getInfoAsync(playlistUri);
    if (playlistInfo.exists && (await totalHlsBundleBytes(playlistUri)) >= MIN_AUDIO_FILE_BYTES) {
      return toLocalFileUri(playlistUri);
    }
  } catch (error) {
    console.warn('[downloads] Could not inspect HLS bundle for local lookup.', error);
  }
  return null;
}
