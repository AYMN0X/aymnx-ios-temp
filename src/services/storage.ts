import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Track } from './musicApi';

export interface SavedPlaylist {
  id: string;
  name: string;
  tracks: Track[];
}

const LIKED_SONGS_KEY = '@spotify_white/liked_songs';
const PLAYLISTS_KEY = '@spotify_white/playlists';

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getLikedSongs(): Promise<Track[]> {
  return readJSON<Track[]>(LIKED_SONGS_KEY, []);
}

export async function addLikedSong(track: Track): Promise<Track[]> {
  const current = await getLikedSongs();
  if (current.some((item) => item.id === track.id)) {
    return current;
  }
  const next = [track, ...current];
  await writeJSON(LIKED_SONGS_KEY, next);
  return next;
}

export async function removeLikedSong(trackId: string): Promise<Track[]> {
  const current = await getLikedSongs();
  const next = current.filter((item) => item.id !== trackId);
  await writeJSON(LIKED_SONGS_KEY, next);
  return next;
}

export async function isLiked(trackId: string): Promise<boolean> {
  return (await getLikedSongs()).some((item) => item.id === trackId);
}

export async function getPlaylists(): Promise<SavedPlaylist[]> {
  return readJSON<SavedPlaylist[]>(PLAYLISTS_KEY, []);
}

export async function createPlaylist(name: string): Promise<SavedPlaylist[]> {
  const current = await getPlaylists();
  const playlist: SavedPlaylist = {
    id: `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    tracks: [],
  };
  const next = [...current, playlist];
  await writeJSON(PLAYLISTS_KEY, next);
  return next;
}

export async function removePlaylist(playlistId: string): Promise<SavedPlaylist[]> {
  const current = await getPlaylists();
  const next = current.filter((playlist) => playlist.id !== playlistId);
  await writeJSON(PLAYLISTS_KEY, next);
  return next;
}

export async function addTrackToPlaylist(playlistId: string, track: Track): Promise<SavedPlaylist[]> {
  const current = await getPlaylists();
  const next = current.map((playlist) => {
    if (playlist.id !== playlistId) {
      return playlist;
    }
    if (playlist.tracks.some((item) => item.id === track.id)) {
      return playlist;
    }
    return { ...playlist, tracks: [track, ...playlist.tracks] };
  });
  await writeJSON(PLAYLISTS_KEY, next);
  return next;
}

export async function removeTrackFromPlaylist(
  playlistId: string,
  trackId: string
): Promise<SavedPlaylist[]> {
  const current = await getPlaylists();
  const next = current.map((playlist) =>
    playlist.id === playlistId
      ? { ...playlist, tracks: playlist.tracks.filter((item) => item.id !== trackId) }
      : playlist
  );
  await writeJSON(PLAYLISTS_KEY, next);
  return next;
}