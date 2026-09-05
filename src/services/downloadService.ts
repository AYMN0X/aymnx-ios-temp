import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveStream, Track } from './musicApi';

export interface DownloadedTrack extends Track {
  localAudioUri: string;
  localArtworkUri: string;
  downloadedAt: number;
}

const STORAGE_KEY = '@spotify_downloaded_tracks';
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

async function readDownloadedTracks(): Promise<DownloadedTrack[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DownloadedTrack[]) : [];
  } catch (error) {
    console.warn('[downloads] Failed to read download metadata.', error);
    return [];
  }
}

async function writeDownloadedTracks(tracks: DownloadedTrack[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
}

async function fileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

export async function getDownloadedTracks(): Promise<DownloadedTrack[]> {
  const metadata = await readDownloadedTracks();
  const existing: DownloadedTrack[] = [];
  for (const meta of metadata) {
    if (await fileExists(meta.localAudioUri)) {
      existing.push(meta);
    }
  }
  if (existing.length !== metadata.length) {
    await writeDownloadedTracks(existing);
  }
  return existing;
}

export async function getDownloadedTrack(trackId: string): Promise<DownloadedTrack | null> {
  const metadata = await readDownloadedTracks();
  const meta = metadata.find((item) => item.id === trackId);
  if (!meta) {
    return null;
  }
  if (!(await fileExists(meta.localAudioUri))) {
    await deleteDownloadedTrack(trackId);
    return null;
  }
  return meta;
}

export async function isTrackDownloaded(trackId: string): Promise<boolean> {
  return (await getDownloadedTrack(trackId)) !== null;
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

  const meta: DownloadedTrack = {
    ...track,
    localAudioUri: audioUri,
    localArtworkUri,
    downloadedAt: Date.now(),
  };

  const existing = await readDownloadedTracks();
  const next = [...existing.filter((item) => item.id !== track.id), meta];
  await writeDownloadedTracks(next);
  return meta;
}

export async function deleteDownloadedTrack(trackId: string): Promise<void> {
  const metadata = await readDownloadedTracks();
  const meta = metadata.find((item) => item.id === trackId);
  if (meta) {
    await Promise.allSettled([
      FileSystem.deleteAsync(meta.localAudioUri, { idempotent: true }),
      ...(meta.localArtworkUri
        ? [FileSystem.deleteAsync(meta.localArtworkUri, { idempotent: true })]
        : []),
    ]);
  }
  await writeDownloadedTracks(metadata.filter((item) => item.id !== trackId));
}