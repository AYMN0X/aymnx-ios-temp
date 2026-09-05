import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { resolveStream, Track } from '../services/musicApi';

interface PlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  playbackPosition: number;
  duration: number;
  isLoadingAudio: boolean;
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
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const resolvingRef = useRef(false);
  const sourceRef = useRef<{ piped: boolean; trackId: string } | null>(null);

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
    setIsLoadingAudio(true);
    resolvingRef.current = true;
    queueRef.current = queue;
    indexRef.current = index;
    let resolvedUrl = '';
    let resolvedProvider: 'soundcloud' | 'piped' | 'itunes' | undefined;
    try {
      const result = await resolveStream(track.title, track.artist, track.previewUrl);
      resolvedUrl = result.url;
      resolvedProvider = result.provider;
    } catch (error) {
      console.warn('[audio] Stream resolution failed, falling back to iTunes preview URL.', error);
      resolvedUrl = track.previewUrl;
      resolvedProvider = 'itunes';
    } finally {
      resolvingRef.current = false;
    }
    if (!resolvedUrl) {
      console.error('[audio] No playable URL available for track:', track.title, track.artist);
      setIsLoadingAudio(false);
      return;
    }
    try {
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist,
        albumTitle: track.album,
        artworkUrl: track.artwork,
      });
      player.replace({ uri: resolvedUrl });
      player.play();
      sourceRef.current = { piped: resolvedProvider !== 'itunes', trackId: track.id };
      console.warn(
        `[audio] Playing "${track.title}" via ${resolvedProvider ?? 'unknown'} stream source.`
      );
    } catch (error) {
      console.warn('[audio] Playback start failed, retrying with iTunes preview URL.', error);
      if (resolvedUrl !== track.previewUrl && track.previewUrl) {
        try {
          player.replace({ uri: track.previewUrl });
          player.play();
          sourceRef.current = { piped: false, trackId: track.id };
        } catch (fallbackError) {
          console.error('[audio] iTunes preview fallback failed.', fallbackError);
        }
      }
    } finally {
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
    const source = sourceRef.current;
    if (
      status.playbackState === 'error' &&
      currentTrack &&
      source &&
      source.piped &&
      source.trackId === currentTrack.id &&
      currentTrack.previewUrl
    ) {
      console.warn('[audio] Stream playback error, switching to iTunes preview URL.');
      try {
        player.replace({ uri: currentTrack.previewUrl });
        player.play();
        sourceRef.current = { piped: false, trackId: currentTrack.id };
      } catch (error) {
        console.error('[audio] iTunes preview fallback failed.', error);
      }
    }
  }, [status.playbackState, currentTrack, player]);

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
      playTrack,
      togglePlayPause,
      seekTo,
      playNext,
      playPrevious,
    }),
    [currentTrack, status.playing, status.currentTime, status.duration, isLoadingAudio]
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