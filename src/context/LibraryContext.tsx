import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { Track } from '../services/musicApi';
import * as storage from '../services/storage';
import { fetchLikedTracks, removeLikedTrack, setLikedTrack } from '../services/firebase';
import { createOrUpdatePlaylist, deletePlaylist, fetchPlaylists } from '../services/firebase';
import { useAuth } from './AuthContext';

type SavedPlaylist = storage.SavedPlaylist;

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
  updatePlaylistDetails: (playlistId: string, name: string, description: string, coverUrl?: string) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => Promise<void>;
  reorderLikedSongs: (fromIndex: number, toIndex: number) => Promise<void>;
  updateLikedMeta: (meta: storage.LikedMeta) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isGuestUser = user?.isGuest === true;
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);
  const [likedMeta, setLikedMeta] = useState<storage.LikedMeta>({});

  useEffect(() => {
    let active = true;
    if (!userId) {
      setLikedSongs([]);
      setPlaylists([]);
      setLikedMeta({});
      return;
    }
    (async () => {
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
        }
        return;
      }
      try {
        const [songs, cloudPlaylists] = await Promise.all([
          fetchLikedTracks(userId),
          fetchPlaylists(userId),
        ]);
        if (active) {
          setLikedSongs(songs);
          setPlaylists(mergePlaylists(savedPlaylists, cloudPlaylists));
        }
      } catch (error) {
        console.warn('[library] Failed to sync from Firestore.', error);
        const songs = await storage.getLikedSongs(userId);
        if (active) {
          setLikedSongs(songs);
        }
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
      ? await storage.removeLikedSong(userId, track.id)
      : await storage.addLikedSong(userId, track);
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
    const next = await storage.createPlaylist(userId, trimmed);
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
    const { playlists: next, created } = await storage.createImportedPlaylist(
      userId,
      trimmed,
      coverUrl,
      tracks
    );
    setPlaylists(next);
    await syncPlaylistToCloud(created);
    return created;
  };

  const removePlaylist = async (playlistId: string) => {
    if (!userId) {
      return;
    }
    const next = await storage.removePlaylist(userId, playlistId);
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
    const next = await storage.addTrackToPlaylist(userId, playlistId, track);
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    if (!userId) {
      return;
    }
    const next = await storage.removeTrackFromPlaylist(userId, playlistId, trackId);
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
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
    const next = await storage.updatePlaylistDetails(userId, playlistId, trimmed, description, coverUrl);
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
  };

  const reorderPlaylistTracks = async (playlistId: string, fromIndex: number, toIndex: number) => {
    if (!userId) {
      return;
    }
    const next = await storage.reorderPlaylistTracks(userId, playlistId, fromIndex, toIndex);
    setPlaylists(next);
    await syncPlaylistToCloud(next.find((playlist) => playlist.id === playlistId));
  };

  const reorderLikedSongs = async (fromIndex: number, toIndex: number) => {
    if (!userId) {
      return;
    }
    const next = await storage.reorderLikedSongs(userId, fromIndex, toIndex);
    setLikedSongs(next);
  };

  const updateLikedMeta = async (meta: storage.LikedMeta) => {
    if (!userId) {
      return;
    }
    const next = await storage.setLikedMeta(userId, meta);
    setLikedMeta(next);
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
      updatePlaylistDetails,
      reorderPlaylistTracks,
      reorderLikedSongs,
      updateLikedMeta,
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