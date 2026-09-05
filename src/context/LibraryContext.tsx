import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import type { Track } from '../services/musicApi';
import * as storage from '../services/storage';

type SavedPlaylist = storage.SavedPlaylist;

interface LibraryContextValue {
  likedSongs: Track[];
  playlists: SavedPlaylist[];
  isLiked: (trackId: string) => boolean;
  toggleLike: (track: Track) => Promise<void>;
  createPlaylist: (name: string) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [likedSongs, setLikedSongs] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([]);

  useEffect(() => {
    (async () => {
      const [songs, savedPlaylists] = await Promise.all([
        storage.getLikedSongs(),
        storage.getPlaylists(),
      ]);
      setLikedSongs(songs);
      setPlaylists(savedPlaylists);
    })();
  }, []);

  const likedIds = useMemo(() => new Set(likedSongs.map((track) => track.id)), [likedSongs]);

  const isLiked = (trackId: string) => likedIds.has(trackId);

  const toggleLike = async (track: Track) => {
    const next = likedIds.has(track.id)
      ? await storage.removeLikedSong(track.id)
      : await storage.addLikedSong(track);
    setLikedSongs(next);
  };

  const createPlaylist = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    const next = await storage.createPlaylist(trimmed);
    setPlaylists(next);
  };

  const removePlaylist = async (playlistId: string) => {
    const next = await storage.removePlaylist(playlistId);
    setPlaylists(next);
  };

  const addToPlaylist = async (playlistId: string, track: Track) => {
    const next = await storage.addTrackToPlaylist(playlistId, track);
    setPlaylists(next);
  };

  const removeTrackFromPlaylist = async (playlistId: string, trackId: string) => {
    const next = await storage.removeTrackFromPlaylist(playlistId, trackId);
    setPlaylists(next);
  };

  const value = useMemo<LibraryContextValue>(
    () => ({
      likedSongs,
      playlists,
      isLiked,
      toggleLike,
      createPlaylist,
      removePlaylist,
      addToPlaylist,
      removeTrackFromPlaylist,
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