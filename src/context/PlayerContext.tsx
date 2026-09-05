import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getDownloadedTrack } from '../services/downloadService';
import { resolveStream, Track } from '../services/musicApi';

interface PlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  playbackPosition: number;
  duration: number;
  isLoadingAudio: boolean;
  playbackError: string | null;
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  togglePlayPause: () => void;
  seekTo: (millis: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const resolvingRef = useRef(false);
  const reportedErrorRef = useRef<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((error) => {
      console.warn('Failed to configure audio mode', error);
    });
  }, []);

  const playbackPosition = Number.isFinite(status.currentTime) ? status.currentTime * 1000 : 0;
  const duration = Number.isFinite(status.duration) ? status.duration * 1000 : 0;

  const startTrack = async (track: Track, queue: Track[], index: number) => {
    setCurrentTrack(track);
    setPlaybackError(null);
    reportedErrorRef.current = null;
    setIsLoadingAudio(true);
    resolvingRef.current = true;
    queueRef.current = queue;
    indexRef.current = index;
    let resolvedUrl = '';
    let resolvedProvider: 'local' | 'jiosaavn' | 'soundcloud' | undefined;
    let artworkUri = track.artwork;
    try {
      const downloaded = await getDownloadedTrack(track.id);
      if (downloaded) {
        resolvedUrl = downloaded.localAudioUri;
        resolvedProvider = 'local';
        artworkUri = downloaded.localArtworkUri || track.artwork;
      } else {
        const result = await resolveStream(track.title, track.artist);
        resolvedUrl = result.url;
        resolvedProvider = result.provider;
      }
    } catch (error) {
      console.error('[audio] No playable stream found for:', track.title, track.artist, error);
      setPlaybackError('Could not find a playable source for this track.');
      setIsLoadingAudio(false);
      return;
    } finally {
      resolvingRef.current = false;
    }
    if (!resolvedUrl) {
      console.error('[audio] No playable URL available for track:', track.title, track.artist);
      setPlaybackError('Could not find a playable source for this track.');
      setIsLoadingAudio(false);
      return;
    }
    try {
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist,
        albumTitle: track.album,
        artworkUrl: artworkUri,
      });
      player.replace({ uri: resolvedUrl });
      player.seekTo(0);
      player.play();
      console.warn(
        `[audio] Playing "${track.title}" via ${resolvedProvider ?? 'unknown'} source.`
      );
    } catch (error) {
      console.error('[audio] Playback failed to start:', error);
      setPlaybackError('Playback failed to start.');
      setIsLoadingAudio(false);
    }
  };

  const playTrack = async (track: Track, queue: Track[] = []) => {
    if (queue.length > 0) {
      const index = Math.max(queue.findIndex((item) => item.id === track.id), 0);
      await startTrack(track, queue, index);
    } else {
      await startTrack(track, [track], 0);
    }
  };

  const playNext = async () => {
    const queue = queueRef.current;
    if (queue.length === 0 || !currentTrack) {
      return;
    }
    const nextIndex = indexRef.current < queue.length - 1 ? indexRef.current + 1 : 0;
    await startTrack(queue[nextIndex], queue, nextIndex);
  };

  const playPrevious = async () => {
    const queue = queueRef.current;
    if (queue.length === 0 || !currentTrack) {
      return;
    }
    if (playbackPosition > 3000) {
      await player.seekTo(0);
      return;
    }
    const prevIndex = indexRef.current > 0 ? indexRef.current - 1 : queue.length - 1;
    await startTrack(queue[prevIndex], queue, prevIndex);
  };

  useEffect(() => {
    if (status.didJustFinish) {
      playNext();
    }
  }, [status.didJustFinish]);

  useEffect(() => {
    if (!currentTrack) {
      return;
    }
    if (status.isBuffering) {
      setIsLoadingAudio(true);
    } else if (!resolvingRef.current && status.isLoaded) {
      setIsLoadingAudio(false);
    }
  }, [status.isBuffering, status.isLoaded, currentTrack]);

  useEffect(() => {
    if (status.playbackState === 'error' && currentTrack) {
      console.error('[audio] Playback error for track:', currentTrack.title);
      if (reportedErrorRef.current !== currentTrack.id) {
        reportedErrorRef.current = currentTrack.id;
        setPlaybackError('Stream failed during playback.');
      }
    }
  }, [status.playbackState, currentTrack]);

  const togglePlayPause = () => {
    if (!currentTrack) {
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const seekTo = async (millis: number) => {
    if (millis == null || !Number.isFinite(millis)) {
      return;
    }
    if (!Number.isFinite(status.duration) || status.duration <= 0) {
      return;
    }
    await player.seekTo(millis / 1000);
  };

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrack,
      isPlaying: status.playing,
      playbackPosition,
      duration,
      isLoadingAudio,
      playbackError,
      playTrack,
      togglePlayPause,
      seekTo,
      playNext,
      playPrevious,
    }),
    [
      currentTrack,
      status.playing,
      status.currentTime,
      status.duration,
      isLoadingAudio,
      playbackError,
    ]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}