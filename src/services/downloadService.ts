import * as FileSystem from 'expo-file-system/legacy';
import { resolveStream, Track } from './musicApi';

export interface DownloadedTrack extends Track {
  localAudioUri: string;
  localArtworkUri: string;
  downloadedAt: number;
}

const TRACKS_DIR = `${FileSystem.documentDirectory ?? ''}tracks/`;

const sanitizeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');

const audioFileUri = (trackId: string) => `${TRACKS_DIR}${sanitizeId(trackId)}.m4a`;
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
  const stream = await resolveStream(track.title, track.artist);
  if (!stream.url) {
    throw new Error('Could not find a downloadable source for this track.');
  }
  const audioUri = audioFileUri(track.id);
  const artUri = artworkFileUri(track.id);

  const task = FileSystem.createDownloadResumable(stream.url, audioUri, {}, (progress) => {
    if (onProgress) {
      onProgress(progress.totalBytesWritten, progress.totalBytesExpectedToWrite);
    }
  });
  const result = await task.downloadAsync();
  if (!result || !result.uri) {
    throw new Error('Audio download failed.');
  }

  let localArtworkUri = '';
  if (track.artwork) {
    try {
      const artResult = await FileSystem.downloadAsync(track.artwork, artUri);
      if (artResult && artResult.status === 200) {
        localArtworkUri = artUri;
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
  await Promise.allSettled([
    FileSystem.deleteAsync(audioFileUri(trackId), { idempotent: true }),
    FileSystem.deleteAsync(artworkFileUri(trackId), { idempotent: true }),
  ]);
}