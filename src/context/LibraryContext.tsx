import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { Track } from '../services/musicApi';
import * as storage from '../services/storage';
import { useAuth } from './AuthContext';

type SavedPlaylist = storage.SavedPlaylist;

interface LibraryContextValue {
  likedSongs: Track[];
  playlists: SavedPlaylist[];
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  createImportedPlaylist: (name: string, coverUrl: string, tracks: Track[]) => Promise<SavedPlaylist | null>;
  removePlaylist: (playlistId: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
  updatePlaylistDetails: (playlistId: string, name: string, description: string) => Promise<void>;
  reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setLikedSongs([]);
      setPlaylists([]);
      return;
    }
    (async () => {
      const [songs, savedPlaylists] = await Promise.all([
        storage.getLikedSongs(userId),
        storage.getPlaylists(userId),
      ]);
      if (active) {
        setLikedSongs(songs);
        setPlaylists(savedPlaylists);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const likedIds = useMemo(() => new Set(likedSongs.map((track) => track.id)), [likedSongs]);

  const isLiked = (trackId: string) => likedIds.has(trackId);

  const toggleLike = async (track: Track) => {
    if (!userId) {
      return;
    }
    const next = likedIds.has(track.id)
      ? await storage.removeLikedSong(userId, track.id)
      : await storage.addLikedSong(userId, track);
    setLikedSongs(next);
  };

  const createPlaylist = async (name: string) => {
    if (!userId) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const next = await storage.createPlaylist(userId, trimmed);
    setPlaylists(next);
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
    return created;
  };

  const removePlaylist = async (playlistId: string) => {
    if (!userId) {
      return;
    }
    const next = await storage.removePlaylist(userId, playlistId);
    setPlaylists(next);
  };

  const addToPlaylist = async (playlistId: string, track: Track) => {
    if (!userId) {
      return;
    }
    const next = await storage.addTrackToPlaylist(userId, playlistId, track);
    setPlaylists(next);
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    if (!userId) {
      return;
    }
    const next = await storage.removeTrackFromPlaylist(userId, playlistId, trackId);
    setPlaylists(next);
  };

  const updatePlaylistDetails = async (playlistId: string, name: string, description: string) => {
    if (!userId) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const next = await storage.updatePlaylistDetails(userId, playlistId, trimmed, description);
    setPlaylists(next);
  };

  const reorderPlaylistTracks = async (playlistId: string, fromIndex: number, toIndex: number) => {
    if (!userId) {
      return;
    }
    const next = await storage.reorderPlaylistTracks(userId, playlistId, fromIndex, toIndex);
    setPlaylists(next);
  };

  const value = useMemo<LibraryContextValue>(
    () => ({
      likedSongs,
      playlists,
      isLiked,
      toggleLike,
      createPlaylist,
      createImportedPlaylist,
      removePlaylist,
      addToPlaylist,
      removeTrackFromPlaylist,
      updatePlaylistDetails,
      reorderPlaylistTracks,
    }),
    [likedSongs, playlists]
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