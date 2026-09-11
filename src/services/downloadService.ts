import * as FileSystem from 'expo-file-system/legacy';
import { resolveStream, Track } from './musicApi';
import { canonicalizeHttpUrl } from '../utils/streamCache';

export interface DownloadedTrack extends Track {
  localAudioUri: string;
  localArtworkUri: string;
  downloadedAt: number;
}

const TRACKS_DIR = `${FileSystem.documentDirectory ?? ''}tracks/`;

const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

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
const artworkFileUri = (trackId: string) => `${TRACKS_DIR}${sanitizeId(trackId)}_art.jpg`;

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
  const audioUri = audioFileUri(track.id, extensionFor(track));

  const ownSource = track.streamUrl && track.streamUrl.trim();
  if (ownSource) {
    const source = canonicalizeHttpUrl(ownSource);
    const result = await FileSystem.downloadAsync(source, audioUri);
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`Audio download failed (HTTP ${result?.status}).`);
    }
  } else {
    const stream = await resolveStream(track.title, track.artist);
    if (!stream.url) {
      throw new Error('Could not find a downloadable source for this track.');
    }
    const task = FileSystem.createDownloadResumable(stream.url, audioUri, {}, (progress) => {
      if (onProgress) {
        onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
      }
    });
    const result = await task.downloadAsync();
    if (!result || !result.uri) {
      throw new Error('Audio download failed.');
    }
  }

  let localArtworkUri = '';
  if (track.artwork) {
    try {
      const artResult = await FileSystem.downloadAsync(track.artwork, artworkFileUri(track.id));
      if (artResult && artResult.status === 200) {
        localArtworkUri = artworkFileUri(track.id);
      }
    } catch (error) {
      console.warn('[downloads] Artwork download failed; continuing without it.', error);
    }
  }

  return {
    ...track,
    localAudioUri: audioUri,
    localArtworkUri,
    downloadedAt: Date.now(),
  };
}

export async function deleteTrackFiles(trackId: string): Promise<void> {
  const prefix = sanitizeId(trackId);
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