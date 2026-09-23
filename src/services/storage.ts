import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DownloadedTrack } from './downloadService';
import type { Track } from './musicApi';
import { bootLog } from './bootLog';

export interface SavedPlaylist {
  id: string;
  name: string;
  description?: string;
  tracks: Track[];
  coverUrl?: string;
  isImported?: boolean;
}

export interface AuthAccount {
  id: string;
  name: string;
  username: string;
  password: string;
  createdAt: number;
}

export const ACCOUNTS_KEY = '@aymnx_auth_accounts';

export interface LikedMeta {
  name?: string;
  description?: string;
  coverUrl?: string;
}

export const LIKED_META_KEY = '@aymnx_liked_meta';

export async function getLikedMeta(userId: string): Promise<LikedMeta> {
  try {
    const raw = await AsyncStorage.getItem(`${LIKED_META_KEY}_${userId}`);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as LikedMeta;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('[storage] Failed to read liked meta.', error);
    return {};
  }
}

export async function setLikedMeta(userId: string, meta: LikedMeta): Promise<LikedMeta> {
  await AsyncStorage.setItem(`${LIKED_META_KEY}_${userId}`, JSON.stringify(meta));
  return meta;
}

const normalizeIdentifier = (value: string): string => value.trim().toLowerCase();

async function readAccounts(): Promise<AuthAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as AuthAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[storage] Failed to read accounts.', error);
    return [];
  }
}

async function writeAccounts(accounts: AuthAccount[]): Promise<void> {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function getAccounts(): Promise<AuthAccount[]> {
  return readAccounts();
}

export async function findAccount(identifier: string): Promise<AuthAccount | null> {
  const key = normalizeIdentifier(identifier);
  const accounts = await readAccounts();
  return accounts.find((account) => normalizeIdentifier(account.username) === key) ?? null;
}

export async function createAccount(input: {
  name: string;
  username: string;
  password: string;
}): Promise<AuthAccount> {
  const key = normalizeIdentifier(input.username);
  if (!key) {
    throw new Error('Please enter a username or email.');
  }
  if (!input.name.trim()) {
    throw new Error('Please enter a display name.');
  }
  if (!input.password) {
    throw new Error('Please enter a password.');
  }
  const accounts = await readAccounts();
  if (accounts.some((account) => normalizeIdentifier(account.username) === key)) {
    throw new Error('An account with that username or email already exists.');
  }
  const account: AuthAccount = {
    id: `user_${key.replace(/[^a-z0-9]+/g, '.')}`,
    name: input.name.trim(),
    username: input.username.trim(),
    password: input.password,
    createdAt: Date.now(),
  };
  await writeAccounts([...accounts, account]);
  return account;
}

export async function verifyCredentials(
  identifier: string,
  password: string
): Promise<AuthAccount | null> {
  const account = await findAccount(identifier);
  if (!account || account.password !== password) {
    return null;
  }
  return account;
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

// All readers of the user blob (`likedSongs`, `playlists`, `downloadedTracks`,
// `lastPlayedTrack`) share one AsyncStorage JSON document. Parsing that document
// eagerly for EVERY reader (e.g. library + downloads + player hydration on cold
// boot) materializes the full track/playlist graph multiple times in the JS
// heap. Cache the parsed document per user so a session parses it exactly once;
// every write replaces the cached entry alongside the persisted copy.
const userDataCache = new Map<string, StoredUserData>();

async function readUserData(userId: string): Promise<StoredUserData> {
  const cached = userDataCache.get(userId);
  if (cached) {
    return cached;
  }
  try {
    const raw = await AsyncStorage.getItem(getUserDataKey(userId));
    if (!raw) {
      const empty: StoredUserData = {};
      userDataCache.set(userId, empty);
      return empty;
    }
    const parsed = JSON.parse(raw) as StoredUserData;
    bootLog('user data blob parsed (once per session)', {
      bytes: raw.length,
      liked: parsed.likedSongs?.length ?? 0,
      playlists: parsed.playlists?.length ?? 0,
      downloaded: parsed.downloadedTracks?.length ?? 0,
    });
    userDataCache.set(userId, parsed);
    return parsed;
  } catch (error) {
    console.warn('[storage] Failed to read user data.', error);
    return {};
  }
}

async function writeUserData(userId: string, data: StoredUserData): Promise<void> {
  userDataCache.set(userId, data);
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

export async function reorderLikedSongs(
  userId: string,
  fromIndex: number,
  toIndex: number
): Promise<Track[]> {
  const data = await updateUserData(userId, (d) => {
    const songs = d.likedSongs ?? [];
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      fromIndex >= songs.length ||
      toIndex < 0 ||
      toIndex >= songs.length
    ) {
      return d;
    }
    const next = [...songs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return { ...d, likedSongs: next };
  });
  return data.likedSongs ?? [];
}

export async function getPlaylists(userId: string): Promise<SavedPlaylist[]> {
  return (await readUserData(userId)).playlists ?? [];
}

export async function saveLikedSongs(userId: string, tracks: Track[]): Promise<Track[]> {
  const data = await updateUserData(userId, (d) => ({ ...d, likedSongs: tracks }));
  return data.likedSongs ?? [];
}

export async function savePlaylists(
  userId: string,
  playlists: SavedPlaylist[]
): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => ({ ...d, playlists }));
  return data.playlists ?? [];
}

export async function createPlaylist(userId: string, name: string): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => {
    const playlist: SavedPlaylist = {
      id: playlistId(),
      name,
      tracks: [],
      isImported: false,
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
  const trimmedName = name.trim();
  const normalized = trimmedName.toLowerCase();
  const existing = (await readUserData(userId)).playlists ?? [];
  const match = existing.find(
    (playlist) =>
      playlist.isImported && playlist.name.trim().toLowerCase() === normalized
  );
  if (match) {
    const merged: SavedPlaylist = {
      ...match,
      name: trimmedName,
      coverUrl: coverUrl || match.coverUrl,
      tracks,
      isImported: true,
    };
    const data = await updateUserData(userId, (d) => ({
      ...d,
      playlists: (d.playlists ?? []).map((playlist) =>
        playlist.id === match.id ? merged : playlist
      ),
    }));
    return { playlists: data.playlists ?? [], created: merged };
  }
  const created: SavedPlaylist = {
    id: playlistId(),
    name: trimmedName,
    coverUrl,
    tracks,
    isImported: true,
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

export async function updatePlaylistDetails(
  userId: string,
  playlistId: string,
  name: string,
  description: string,
  coverUrl?: string
): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => ({
    ...d,
    playlists: (d.playlists ?? []).map((playlist) =>
      playlist.id === playlistId
        ? {
            ...playlist,
            name,
            description: description.length > 0 ? description : undefined,
            coverUrl:
              coverUrl === undefined
                ? playlist.coverUrl
                : coverUrl.length > 0
                ? coverUrl
                : undefined,
          }
        : playlist
    ),
  }));
  return data.playlists ?? [];
}

export async function reorderPlaylistTracks(
  userId: string,
  playlistId: string,
  fromIndex: number,
  toIndex: number
): Promise<SavedPlaylist[]> {
  const data = await updateUserData(userId, (d) => {
    const playlists = (d.playlists ?? []).map((playlist) => {
      if (playlist.id !== playlistId) {
        return playlist;
      }
      const tracks = playlist.tracks;
      if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) {
        return playlist;
      }
      const next = [...tracks];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { ...playlist, tracks: next };
    });
    return { ...d, playlists };
  });
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

export async function replaceTrackEverywhere(
  userId: string,
  originalId: string,
  replacement: Track
): Promise<{ likedSongs: Track[]; playlists: SavedPlaylist[] }> {
  const data = await updateUserData(userId, (d) => {
    const likedSongs = (d.likedSongs ?? []).map((item) =>
      item.id === originalId ? { ...replacement, id: originalId } : item
    );
    const playlists = (d.playlists ?? []).map((playlist) => {
      let changed = false;
      const tracks = playlist.tracks.map((item) => {
        if (item.id !== originalId) {
          return item;
        }
        changed = true;
        return { ...replacement, id: originalId };
      });
      return changed ? { ...playlist, tracks } : playlist;
    });
    return { ...d, likedSongs, playlists };
  });
  return { likedSongs: data.likedSongs ?? [], playlists: data.playlists ?? [] };
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