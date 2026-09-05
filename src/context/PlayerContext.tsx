import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { resolveStream, Track } from '../services/musicApi';
import { getRecommendedNextTracks } from '../services/autoplayService';
import * as storage from '../services/storage';
import { useAuth } from './AuthContext';
import { useDownloads } from './DownloadContext';

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
  queue: Track[];
  queueIndex: number;
  isAutoplayEnabled: boolean;
  autoplayAddedIds: Set<string>;
  toggleAutoplay: () => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const { user } = useAuth();
  const { downloadedTracks } = useDownloads();

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [autoplayAddedIds, setAutoplayAddedIds] = useState<Set<string>>(new Set());
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const resolvingRef = useRef(false);
  const reportedErrorRef = useRef<string | null>(null);
  const playedSetRef = useRef<Set<string>>(new Set());
  const autoplayLoadingRef = useRef(false);
  const autoplayFailedForRef = useRef<string | null>(null);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((error) => {
      console.warn('Failed to configure audio mode', error);
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    storage
      .getAutoplayEnabled()
      .then((value) => {
        if (mounted && value != null) {
          setIsAutoplayEnabled(value);
        }
      })
      .catch((error) => console.warn('[player] Could not load autoplay setting.', error));
    return () => {
      mounted = false;
    };
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
    setQueue(queue);
    setQueueIndex(index);
    autoplayFailedForRef.current = null;
    if (track.id) {
      playedSetRef.current.add(track.id);
    }
    let resolvedUrl = '';
    let resolvedProvider: 'local' | 'jiosaavn' | 'soundcloud' | undefined;
    let artworkUri = track.artwork;
    try {
      const local = downloadedTracks.find((item) => item.id === track.id);
      if (local) {
        resolvedUrl = local.localAudioUri;
        resolvedProvider = 'local';
        artworkUri = local.localArtworkUri || track.artwork;
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
    setAutoplayAddedIds(new Set());
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

  const ensureAutoplayTracks = useCallback(async () => {
    if (autoplayLoadingRef.current || !currentTrack) {
      return;
    }
    const queueNow = queueRef.current;
    if (queueNow.length === 0) {
      return;
    }
    if (indexRef.current < queueNow.length - 1) {
      return;
    }
    const attemptKey = `${currentTrack.id}:${queueNow.length}`;
    if (autoplayFailedForRef.current === attemptKey) {
      return;
    }
    autoplayLoadingRef.current = true;
    try {
      const played = Array.from(playedSetRef.current);
      const recommendations = await getRecommendedNextTracks(currentTrack, played);
      const fresh = recommendations.filter(
        (item) => item.id && !playedSetRef.current.has(item.id)
      );
      if (fresh.length > 0 && queueRef.current === queueNow) {
        const nextQueue = [...queueNow, ...fresh];
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        setAutoplayAddedIds((prev) => {
          const next = new Set(prev);
          fresh.forEach((item) => next.add(item.id));
          return next;
        });
      } else {
        autoplayFailedForRef.current = attemptKey;
      }
    } catch (error) {
      console.warn('[autoplay] Failed to fetch recommendations.', error);
      autoplayFailedForRef.current = attemptKey;
    } finally {
      autoplayLoadingRef.current = false;
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!isAutoplayEnabled || !currentTrack) {
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }
    const queueNow = queueRef.current;
    if (queueNow.length === 0 || indexRef.current < queueNow.length - 1) {
      return;
    }
    if (playbackPosition < Math.max(duration - 8000, duration * 0.9)) {
      return;
    }
    ensureAutoplayTracks();
  }, [playbackPosition, duration, currentTrack, isAutoplayEnabled, ensureAutoplayTracks]);

  useEffect(() => {
    if (!status.didJustFinish) {
      return;
    }
    (async () => {
      const queueNow = queueRef.current;
      if (queueNow.length === 0 || !currentTrack) {
        return;
      }
      if (isAutoplayEnabled && indexRef.current >= queueNow.length - 1) {
        if (autoplayLoadingRef.current) {
          const deadline = Date.now() + 6000;
          while (autoplayLoadingRef.current && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 120));
          }
        } else {
          await ensureAutoplayTracks();
        }
      }
      if (indexRef.current < queueRef.current.length - 1) {
        await playNext();
      }
    })();
  }, [status.didJustFinish, isAutoplayEnabled, ensureAutoplayTracks]);

  useEffect(() => {
    if (user && currentTrack) {
      storage
        .writeLastPlayedTrack(user.id, currentTrack)
        .catch((error) => console.warn('[player] Could not save last played track.', error));
    }
  }, [user, currentTrack]);

  useEffect(() => {
    if (user) {
      return;
    }
    setCurrentTrack(null);
    setPlaybackError(null);
    reportedErrorRef.current = null;
    queueRef.current = [];
    indexRef.current = -1;
    setQueue([]);
    setQueueIndex(-1);
    setAutoplayAddedIds(new Set());
    playedSetRef.current = new Set();
    autoplayLoadingRef.current = false;
    autoplayFailedForRef.current = null;
    player.pause();
  }, [user]);

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

  const toggleAutoplay = () => {
    setIsAutoplayEnabled((prev) => {
      const next = !prev;
      storage
        .setAutoplayEnabled(next)
        .catch((error) => console.warn('[player] Could not save autoplay setting.', error));
      return next;
    });
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
      queue,
      queueIndex,
      isAutoplayEnabled,
      autoplayAddedIds,
      toggleAutoplay,
    }),
    [
      currentTrack,
      status.playing,
      status.currentTime,
      status.duration,
      isLoadingAudio,
      playbackError,
      queue,
      queueIndex,
      isAutoplayEnabled,
      autoplayAddedIds,
      downloadedTracks,
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