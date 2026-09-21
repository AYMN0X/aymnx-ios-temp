import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { Track } from '../services/musicApi';
import * as storage from '../services/storage';
import { approximateBytes, bootLog, bootLogOnce } from '../services/bootLog';
import { fetchLikedTracks, removeLikedTrack, setLikedTrack } from '../services/firebase';
import { createOrUpdatePlaylist, deletePlaylist, fetchPlaylists } from '../services/firebase';
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
      try {
        const [savedPlaylists, meta] = await Promise.all([
          storage.getPlaylists(userId),
          storage.getLikedMeta(userId),
        ]);
        if (!active) {
          return;
        }
        setPlaylists(savedPlaylists);
        setLikedMeta(meta);
        if (isGuestUser) {
          const songs = await storage.getLikedSongs(userId);
          if (active) {
            setLikedSongs(songs);
            bootLog('library hydrated (guest)', {
              liked: songs.length,
              likedKb: Math.round(approximateBytes(songs) / 1024),
            });
          }
          return;
        }
        try {
          const [songs, cloudPlaylists] = await Promise.all([
            fetchLikedTracks(userId),
            fetchPlaylists(userId),
          ]);
          const merged = mergePlaylists(savedPlaylists, cloudPlaylists);
          if (active) {
            setLikedSongs(songs);
            setPlaylists(merged);
            bootLog('library hydrated (cloud)', {
              liked: songs.length,
              likedKb: Math.round(approximateBytes(songs) / 1024),
              playlists: merged.length,
              playlistTracks: countPlaylistTracks(merged),
              playlistsKb: Math.round(approximateBytes(merged) / 1024),
            });
          }
        } catch (error) {
          console.warn('[library] Failed to sync from Firestore.', error);
          const songs = await storage.getLikedSongs(userId);
          if (active) {
            setLikedSongs(songs);
            bootLog('library hydrated (local fallback)', {
              liked: songs.length,
              likedKb: Math.round(approximateBytes(songs) / 1024),
            });
          }
        }
      } catch (error) {
        console.warn('[library] Failed to load the library.', error);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, isGuestUser]);

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
      try {
        const [songs, cloudPlaylists] = await Promise.all([
          fetchLikedTracks(userId),
          fetchPlaylists(userId),
        ]);
        setLikedSongs(songs);
        setPlaylists(mergePlaylists(savedPlaylists, cloudPlaylists));
      } catch (error) {
        console.warn('[library] Failed to sync from Firestore.', error);
        const songs = await storage.getLikedSongs(userId);
        setLikedSongs(songs);
      }
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