import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadedTrack } from './downloadService';
import type { Track } from './musicApi';

export interface SavedPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  coverUrl?: string;
}

export interface StoredUserData {
  likedSongs?: Track[];
  playlists?: SavedPlaylist[];
  downloadedTracks?: DownloadedTrack[];
  lastPlayedTrack?: Track | null;
}

export function getUserDataKey(userId: string): string {
  return `@spotify_user_data_${userId}`;
}

const playlistId = () =>
  `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

async function readUserData(userId: string): Promise<StoredUserData> {
  try {
    const raw = await AsyncStorage.getItem(getUserDataKey(userId));
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as StoredUserData;
  } catch (error) {
    console.warn('[storage] Failed to read user data.', error);
    return {};
  }
}

async function writeUserData(userId: string, data: StoredUserData): Promise<void> {
  await AsyncStorage.setItem(getUserDataKey(userId), JSON.stringify(data));
}

async function updateUserData(
  userId: string,
  updater: (data: StoredUserData) => StoredUserData
): Promise<StoredUserData> {
  const data = await readUserData(userId);
  const next = updater(data);
  await writeUserData(userId, next);
  return next;
}

export async function getLikedSongs(userId: string): Promise<Track[]> {
  return (await readUserData(userId)).likedSongs ?? [];
}

export async function addLikedSong(userId: string, track: Track): Promise<Track[]> {
  const data = await updateUserData(userId, (d) => {
    const current = d.likedSongs ?? [];
    if (current.some((item) => item.id === track.id)) {
      return d;
    }
    return { ...d, likedSongs: [track, ...current] };
  });
  return data.likedSongs ?? [];
}

export async function removeLikedSong(userId: string, trackId: string): Promise<Track[]> {
  const data = await updateUserData(userId, (d) => ({
    ...d,
    likedSongs: (d.likedSongs ?? []).filter((item) => item.id !== trackId),
  }));
  return data.likedSongs ?? [];
}

export async function isLiked(userId: string, trackId: string): Promise<boolean> {
  return (await getLikedSongs(userId)).some((item) => item.id === trackId);
}

export async function getPlaylists(userId: string): Promise<SavedPlaylist[]> {
  return (await readUserData(userId)).playlists ?? [];
}

export async function createPlaylist(userId: string, name: string): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => {
    const playlist: SavedPlaylist = {
      id: playlistId(),
      name,
      tracks: [],
    };
    return { ...d, playlists: [...(d.playlists ?? []), playlist] };
  });
  return data.playlists ?? [];
}

export async function createImportedPlaylist(
  userId: string,
  name: string,
  coverUrl: string,
  tracks: Track[]
): Promise<{ playlists: SavedPlaylist[]; created: SavedPlaylist }> {
  const created: SavedPlaylist = {
    id: playlistId(),
    name,
    coverUrl,
    tracks,
  };
  const data = await updateUserData(userId, (d) => ({
    ...d,
    playlists: [...(d.playlists ?? []), created],
  }));
  return { playlists: data.playlists ?? [], created };
}

export async function removePlaylist(userId: string, playlistId: string): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => ({
    ...d,
    playlists: (d.playlists ?? []).filter((playlist) => playlist.id !== playlistId),
  }));
  return data.playlists ?? [];
}

export async function addTrackToPlaylist(
  userId: string,
  playlistId: string,
  track: Track
): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => {
    const playlists = (d.playlists ?? []).map((playlist) => {
      if (playlist.id !== playlistId) {
        return playlist;
      }
      if (playlist.tracks.some((item) => item.id === track.id)) {
        return playlist;
      }
      return { ...playlist, tracks: [track, ...playlist.tracks] };
    });
    return { ...d, playlists };
  });
  return data.playlists ?? [];
}

export async function removeTrackFromPlaylist(
  userId: string,
  playlistId: string,
  trackId: string
): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => {
    const playlists = (d.playlists ?? []).map((playlist) =>
      playlist.id === playlistId
        ? { ...playlist, tracks: playlist.tracks.filter((item) => item.id !== trackId) }
        : playlist
    );
    return { ...d, playlists };
  });
  return data.playlists ?? [];
}

export async function getDownloadedTracks(userId: string): Promise<DownloadedTrack[]> {
  return (await readUserData(userId)).downloadedTracks ?? [];
}

export async function writeDownloadedTracks(userId: string, tracks: DownloadedTrack[]): Promise<void> {
  await updateUserData(userId, (d) => ({ ...d, downloadedTracks: tracks }));
}

export async function getLastPlayedTrack(userId: string): Promise<Track | null> {
  return (await readUserData(userId)).lastPlayedTrack ?? null;
}

export async function writeLastPlayedTrack(userId: string, track: Track | null): Promise<void> {
  await updateUserData(userId, (d) => ({ ...d, lastPlayedTrack: track }));
}

const AUTOPLAY_KEY = '@spotify_autoplay_enabled';

export async function getAutoplayEnabled(): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTOPLAY_KEY);
    if (raw == null) {
      return null;
    }
    return JSON.parse(raw) === true;
  } catch (error) {
    console.warn('[storage] Failed to read autoplay setting.', error);
    return null;
  }
}

export async function setAutoplayEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(AUTOPLAY_KEY, JSON.stringify(value));
}

const ONBOARDING_KEY = '@spotify_onboarding_seen';

export async function getHasSeenOnboarding(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_KEY);
    if (raw == null) {
      return false;
    }
    return JSON.parse(raw) === true;
  } catch (error) {
    console.warn('[storage] Failed to read onboarding flag.', error);
    return false;
  }
}

export async function setHasSeenOnboarding(value: boolean): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(value));
}