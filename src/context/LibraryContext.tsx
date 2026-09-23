import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { Track } from '../services/musicApi';
import * as storage from '../services/storage';
import { approximateBytes, bootLog, bootLogOnce } from '../services/bootLog';
import { fetchLikedTracks, removeLikedTrack, setLikedTrack } from '../services/firebase';
import { createOrUpdatePlaylist, deletePlaylist, fetchPlaylists } from '../services/firebase';
import { isNetworkAvailable, invalidateNetworkCache } from '../utils/network';
import { useAuth } from './AuthContext';

type SavedPlaylist = storage.SavedPlaylist;

function countPlaylistTracks(playlists: SavedPlaylist[]): number {
  return playlists.reduce((total, playlist) => total + (playlist.tracks?.length ?? 0), 0);
}

function mergePlaylists(local: SavedPlaylist[], cloud: SavedPlaylist[]): SavedPlaylist[] {
  const byId = new Map<string, SavedPlaylist>();
  for (const playlist of local) {
    byId.set(playlist.id, playlist);
  }
  for (const playlist of cloud) {
    byId.set(playlist.id, playlist);
  }
  return Array.from(byId.values());
}

function mergeLikedSongsList(local: Track[], cloud: Track[]): Track[] {
  const byId = new Map<string, Track>();
  for (const track of local) {
    byId.set(track.id, track);
  }
  for (const track of cloud) {
    byId.set(track.id, track);
  }
  return Array.from(byId.values());
}

async function persistLibrarySnapshot(
  userId: string,
  likedSongs: Track[],
  playlists: SavedPlaylist[]
): Promise<void> {
  try {
    const [, savedPlaylists] = await Promise.all([
      storage.saveLikedSongs(userId, likedSongs),
      storage.savePlaylists(userId, playlists),
    ]);
    bootLog('library snapshot persisted locally', {
      liked: likedSongs.length,
      playlists: savedPlaylists.length,
    });
  } catch (error) {
    console.warn('[library] Failed to persist library snapshot locally.', error);
  }
}

interface LibraryContextValue {
  likedSongs: Track[];
  playlists: SavedPlaylist[];
  likedMeta: storage.LikedMeta;
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  createImportedPlaylist: (name: string, coverUrl: string, tracks: Track[]) => Promise<SavedPlaylist | null>;
  removePlaylist: (playlistId: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  replaceTrack: (originalId: string, replacement: Track) => Promise<void>;
  updatePlaylistDetails: (playlistId: string, name: string, description: string, coverUrl?: string) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => Promise<void>;
  reorderLikedSongs: (fromIndex: number, toIndex: number) => Promise<void>;
  updateLikedMeta: (meta: storage.LikedMeta) => Promise<void>;
  refresh: () => Promise<void>;
  mergeLikedSongs: (tracks: Track[]) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  bootLogOnce('LibraryProvider mounted');
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isGuestUser = user?.isGuest === true;
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);
  const [likedMeta, setLikedMeta] = useState<storage.LikedMeta>({});

  const guardedStorage = async <T,>(label: string, operation: () => Promise<T>): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      console.warn(`[library] ${label} failed.`, error);
      return null;
    }
  };

  const syncCloudLibrary = useCallback(
    async (userId: string): Promise<{ likedSongs: Track[]; playlists: SavedPlaylist[] } | null> => {
      try {
        const [cloudSongs, cloudPlaylists] = await Promise.all([
          fetchLikedTracks(userId),
          fetchPlaylists(userId),
        ]);
        const [localSongs, localPlaylists] = await Promise.all([
          storage.getLikedSongs(userId),
          storage.getPlaylists(userId),
        ]);
        const songs = mergeLikedSongsList(localSongs, cloudSongs);
        const mergedPlaylists = mergePlaylists(localPlaylists, cloudPlaylists);
        await persistLibrarySnapshot(userId, songs, mergedPlaylists);
        return { likedSongs: songs, playlists: mergedPlaylists };
      } catch (error) {
        console.warn('[library] Failed to sync from Firestore.', error);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    if (!userId) {
      setLikedSongs([]);
      setPlaylists([]);
      setLikedMeta({});
      return;
    }
    bootLog('library hydration start');
    (async () => {
      const hydrateLocal = async () => {
        const [savedPlaylists, meta] = await Promise.all([
          storage.getPlaylists(userId),
          storage.getLikedMeta(userId),
        ]);
        const songs = await storage.getLikedSongs(userId);
        if (!active) {
          return;
        }
        setPlaylists(savedPlaylists);
        setLikedMeta(meta);
        setLikedSongs(songs);
        bootLog('library hydrated (local snapshot)', {
          liked: songs.length,
          likedKb: Math.round(approximateBytes(songs) / 1024),
          playlists: savedPlaylists.length,
          playlistTracks: countPlaylistTracks(savedPlaylists),
          playlistsKb: Math.round(approximateBytes(savedPlaylists) / 1024),
        });
      };
      try {
        await hydrateLocal();
      } catch (error) {
        console.warn('[library] Failed to load the local library.', error);
        return;
      }
      if (!active || isGuestUser) {
        return;
      }
      let online = false;
      try {
        online = await isNetworkAvailable();
      } catch {
        online = false;
      }
      if (!active) {
        return;
      }
      if (!online) {
        bootLog('library offline; keeping local snapshot');
        return;
      }
      const synced = await syncCloudLibrary(userId);
      if (!active || !synced) {
        return;
      }
      setLikedSongs(synced.likedSongs);
      setPlaylists(synced.playlists);
      bootLog('library hydrated (cloud, persisted locally)', {
        liked: synced.likedSongs.length,
        likedKb: Math.round(approximateBytes(synced.likedSongs) / 1024),
        playlists: synced.playlists.length,
        playlistTracks: countPlaylistTracks(synced.playlists),
        playlistsKb: Math.round(approximateBytes(synced.playlists) / 1024),
      });
    })();
    return () => {
      active = false;
    };
  }, [userId, isGuestUser, syncCloudLibrary]);

  useEffect(() => {
    if (!userId || isGuestUser) {
      return undefined;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      invalidateNetworkCache();
      (async () => {
        const online = await isNetworkAvailable();
        if (!online) {
          return;
        }
        const synced = await syncCloudLibrary(userId);
        if (synced) {
          setLikedSongs(synced.likedSongs);
          setPlaylists(synced.playlists);
        }
      })().catch((error) => console.warn('[library] Background library re-sync failed.', error));
    });
    return () => {
      subscription.remove();
    };
  }, [userId, isGuestUser, syncCloudLibrary]);

  const likedIds = useMemo(() => new Set(likedSongs.map((track) => track.id)), [likedSongs]);

  const isLiked = (trackId: string) => likedIds.has(trackId);

  const syncPlaylistToCloud = async (playlist: SavedPlaylist | undefined) => {
    if (!playlist || isGuestUser || !userId) {
      return;
    }
    try {
      await createOrUpdatePlaylist(userId, playlist);
    } catch (error) {
      console.warn('[library] Failed to sync playlist to Firestore.', error);
    }
  };

  const toggleLike = async (track: Track) => {
    if (!userId) {
      return;
    }
    const wasLiked = likedIds.has(track.id);
    const next = wasLiked
      ? await guardedStorage('unsaving liked song', () =>
          storage.removeLikedSong(userId, track.id)
        )
      : await guardedStorage('saving liked song', () => storage.addLikedSong(userId, track));
    if (!next) {
      return;
    }
    setLikedSongs(next);
    if (!isGuestUser) {
      try {
        if (wasLiked) {
          await removeLikedTrack(userId, track.id);
        } else {
          await setLikedTrack(userId, track);
        }
      } catch (error) {
        console.warn('[library] Failed to sync like to Firestore.', error);
      }
    }
  };

  const createPlaylist = async (name: string) => {
    if (!userId) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const existingIds = new Set(playlists.map((playlist) => playlist.id));
    const next = await guardedStorage('creating playlist', () => storage.createPlaylist(userId, trimmed));
    if (!next) {
      return;
    }
    const created = next.find((playlist) => !existingIds.has(playlist.id));
    setPlaylists(next);
    await syncPlaylistToCloud(created);
  };

  const createImportedPlaylist = async (name: string, coverUrl: string, tracks: Track[]) => {
    if (!userId) {
      return null;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    const result = await guardedStorage('creating imported playlist', () =>
      storage.createImportedPlaylist(userId, trimmed, coverUrl, tracks)
    );
    if (!result) {
      return null;
    }
    const { playlists: next, created } = result;
    setPlaylists(next);
    await syncPlaylistToCloud(created);
    return created;
  };

  const removePlaylist = async (playlistId: string) => {
    if (!userId) {
      return;
    }
    const next = await guardedStorage('removing playlist', () =>
      storage.removePlaylist(userId, playlistId)
    );
    if (!next) {
      return;
    }
    setPlaylists(next);
    if (!isGuestUser) {
      try {
        await deletePlaylist(userId, playlistId);
      } catch (error) {
        console.warn('[library] Failed to delete playlist from Firestore.', error);
      }
    }
  };

  const addToPlaylist = async (playlistId: string, track: Track) => {
    if (!userId) {
      return;
    }
    const next = await guardedStorage('saving playlist track', () =>
      storage.addTrackToPlaylist(userId, playlistId, track)
    );
    if (!next) {
      return;
    }
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    if (!userId) {
      return;
    }
    const next = await guardedStorage('removing playlist track', () =>
      storage.removeTrackFromPlaylist(userId, playlistId, trackId)
    );
    if (!next) {
      return;
    }
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
  };

  const replaceTrack = async (originalId: string, replacement: Track) => {
    if (!userId) {
      return;
    }
    const data = await guardedStorage('replacing track', () =>
      storage.replaceTrackEverywhere(userId, originalId, replacement)
    );
    if (!data) {
      return;
    }
    setLikedSongs(data.likedSongs);
    setPlaylists(data.playlists);
    if (!isGuestUser) {
      const syncs: Promise<void>[] = [];
      const replacedLiked = data.likedSongs.find((item) => item.id === originalId);
      if (replacedLiked) {
        syncs.push(
          setLikedTrack(userId, replacedLiked).catch((error) =>
            console.warn('[library] Failed to sync replaced like to Firestore.', error)
          )
        );
      }
      for (const playlist of data.playlists) {
        if (playlist.tracks.some((item) => item.id === originalId)) {
          syncs.push(syncPlaylistToCloud(playlist));
        }
      }
      await Promise.all(syncs);
    }
  };

  const updatePlaylistDetails = async (
    playlistId: string,
    name: string,
    description: string,
    coverUrl?: string
  ) => {
    if (!userId) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const next = await guardedStorage('updating playlist details', () =>
      storage.updatePlaylistDetails(userId, playlistId, trimmed, description, coverUrl)
    );
    if (!next) {
      return;
    }
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
  };

  const reorderPlaylistTracks = async (playlistId: string, fromIndex: number, toIndex: number) => {
    if (!userId) {
      return;
    }
    const next = await guardedStorage('reordering playlist tracks', () =>
      storage.reorderPlaylistTracks(userId, playlistId, fromIndex, toIndex)
    );
    if (!next) {
      return;
    }
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
  };

  const reorderLikedSongs = async (fromIndex: number, toIndex: number) => {
    if (!userId) {
      return;
    }
    const next = await guardedStorage('reordering liked songs', () =>
      storage.reorderLikedSongs(userId, fromIndex, toIndex)
    );
    if (!next) {
      return;
    }
    setLikedSongs(next);
  };

  const updateLikedMeta = async (meta: storage.LikedMeta) => {
    if (!userId) {
      return;
    }
    const next = await guardedStorage('saving liked meta', () => storage.setLikedMeta(userId, meta));
    if (!next) {
      return;
    }
    setLikedMeta(next);
  };

  const refresh = async () => {
    if (!userId) {
      return;
    }
    try {
      const [savedPlaylists, meta] = await Promise.all([
        storage.getPlaylists(userId),
        storage.getLikedMeta(userId),
      ]);
      setPlaylists(savedPlaylists);
      setLikedMeta(meta);
      if (isGuestUser) {
        const songs = await storage.getLikedSongs(userId);
        setLikedSongs(songs);
        return;
      }
      let online = false;
      try {
        online = await isNetworkAvailable();
      } catch {
        online = false;
      }
      if (online) {
        const synced = await syncCloudLibrary(userId);
        if (synced) {
          setLikedSongs(synced.likedSongs);
          setPlaylists(synced.playlists);
          return;
        }
      }
      const songs = await storage.getLikedSongs(userId);
      setLikedSongs(songs);
    } catch (error) {
      console.warn('[library] Failed to refresh the library.', error);
    }
  };

  const mergeLikedSongs = async (tracks: Track[]) => {
    if (!userId) {
      return;
    }
    const fresh = tracks.filter((track) => !likedIds.has(track.id));
    if (fresh.length === 0) {
      return;
    }
    try {
      for (const track of fresh) {
        await storage.addLikedSong(userId, track);
      }
      const next = await storage.getLikedSongs(userId);
      setLikedSongs(next);
    } catch (error) {
      console.warn('[library] Failed to save liked songs locally.', error);
      return;
    }
    if (!isGuestUser) {
      await Promise.all(
        fresh.map((track) =>
          setLikedTrack(userId, track).catch((error) =>
            console.warn('[library] Failed to sync liked song to Firestore.', error)
          )
        )
      );
    }
  };

  const value = useMemo<LibraryContextValue>(
    () => ({
      likedSongs,
      playlists,
      likedMeta,
      isLiked,
      toggleLike,
      createPlaylist,
      createImportedPlaylist,
      removePlaylist,
      addToPlaylist,
      removeTrackFromPlaylist,
      replaceTrack,
      updatePlaylistDetails,
      reorderPlaylistTracks,
      reorderLikedSongs,
      updateLikedMeta,
      refresh,
      mergeLikedSongs,
    }),
    [likedSongs, playlists, likedMeta]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
}