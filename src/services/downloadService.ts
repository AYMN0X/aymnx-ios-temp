import * as FileSystem from 'expo-file-system/legacy';
import { resolveDownloadableStream, Track } from './musicApi';
import { canonicalizeHttpUrl } from '../utils/streamCache';
import { extractId3Picture, base64ToBytes, bytesToBase64 } from '../utils/id3Artwork';

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
      if (info.exists) {
        return candidate;
      }
    } catch (error) {
      // Treat an unreadable candidate as absent and try the next extension.
    }
  }
  return '';
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

const DOWNLOAD_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

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
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const manifestResponse = await fetch(sourceUrl, {
    headers: { 'User-Agent': DOWNLOAD_USER_AGENT },
  });
  if (!manifestResponse.ok) {
    throw new Error(`HLS manifest download failed (HTTP ${manifestResponse.status}).`);
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
        });
        if (!result || result.status < 200 || result.status >= 300) {
          throw new Error(`HLS segment ${index} download failed (HTTP ${result?.status}).`);
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

export async function downloadTrack(
  track: Track,
  onProgress?: (bytesWritten: number, totalBytes: number) => void
): Promise<DownloadedTrack> {
if (!FileSystem.documentDirectory) {
    throw new Error('Downloads are not supported in this environment.');
  }
  await ensureTracksDirectory();

  const ownSource = track.streamUrl && track.streamUrl.trim();
  let audioUri = '';
  let resolvedMime: string | undefined;
  let isHlsBundle = false;
  if (ownSource && isLocalSource(ownSource)) {
    audioUri = audioFileUri(track.id, extensionFor(track));
    await FileSystem.copyAsync({ from: ownSource, to: audioUri });
  } else if (ownSource) {
    const source = canonicalizeHttpUrl(ownSource);
    if (isHlsStreamUrl(source)) {
      isHlsBundle = true;
      const hls = await downloadHlsTrack(track.id, source, onProgress);
      audioUri = hls.audioUri;
      resolvedMime = hls.mimeType;
    } else {
      audioUri = audioFileUri(track.id, extensionFor(track));
      const result = await FileSystem.downloadAsync(source, audioUri, {
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      });
      if (!result || result.status < 200 || result.status >= 300) {
        throw new Error(`Audio download failed (HTTP ${result?.status}).`);
      }
    }
  } else {
    const stream = await resolveDownloadableStream(track.title, track.artist);
    if (!stream.url) {
      throw new Error('Could not find a downloadable source for this track.');
    }
    if (isHlsStreamUrl(stream.url)) {
      isHlsBundle = true;
      const hls = await downloadHlsTrack(track.id, stream.url, onProgress);
      audioUri = hls.audioUri;
      resolvedMime = hls.mimeType;
    } else {
      resolvedMime = stream.mimeType;
      audioUri = audioFileUri(track.id, extensionForMime(stream.mimeType));
      const task = FileSystem.createDownloadResumable(
        stream.url,
        audioUri,
        { sessionType: FileSystem.FileSystemSessionType.BACKGROUND },
        (progress) => {
          if (onProgress) {
            onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
          }
        }
      );
      const result = await task.downloadAsync();
      if (!result || !result.uri) {
        throw new Error('Audio download failed.');
      }
    }
  }

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

  let localArtworkUri = '';
  if (track.artwork) {
    if (isLocalSource(track.artwork)) {
      localArtworkUri = track.artwork;
    } else {
      try {
        const artSource = canonicalizeHttpUrl(track.artwork);
        const artResult = await FileSystem.downloadAsync(
          artSource,
          artworkFileUri(track.id),
          { sessionType: FileSystem.FileSystemSessionType.BACKGROUND }
        );
        if (artResult && artResult.status === 200) {
          localArtworkUri = artworkFileUri(track.id);
        }
      } catch (error) {
        console.warn('[downloads] Artwork download failed; continuing without it.', error);
      }
    }
  }
  if (!localArtworkUri) {
    localArtworkUri = await extractEmbeddedArtwork(audioUri, track.id);
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
