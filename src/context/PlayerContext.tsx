import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  State,
  usePlaybackState,
  useProgress,
  useTrackPlayerEvents,
} from 'react-native-track-player';
import { resolveStream, Track } from '../services/musicApi';
import { getRecommendedNextTracks } from '../services/autoplayService';
import { setPlaybackServiceBridge } from '../services/playbackService';
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
  volume: number;
  setVolume: (value: number) => void;
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

const DEFAULT_VOLUME = 0.5;
const FILL_BATCH = 6;
const PREVIOUS_RESTART_THRESHOLD_MS = 3000;

interface ResolvedPlayable {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
}

const delayMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { downloadedTracks } = useDownloads();

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [autoplayAddedIds, setAutoplayAddedIds] = useState<Set<string>>(new Set());
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const currentTrackRef = useRef<Track | null>(null);
  const startSeqRef = useRef(0);
  const queueGenRef = useRef(0);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const resolvingRef = useRef(false);
  const reportedErrorRef = useRef<string | null>(null);
  const playedSetRef = useRef<Set<string>>(new Set());
  const autoplayLoadingRef = useRef(false);
  const autoplayFailedForRef = useRef<string | null>(null);
  const autoplayEnabledRef = useRef(true);
  const playerInitiatedRef = useRef(false);
  const downloadedRef = useRef<typeof downloadedTracks>([]);
  const mirrorIdsRef = useRef<Set<string>>(new Set());
  const lastMirrorIndexRef = useRef(-1);
  const fillInFlightRef = useRef(false);
  const fillPendingRequestRef = useRef<{ full: boolean } | null>(null);

  const { state } = usePlaybackState();
  const progress = useProgress(500);
  const playbackPosition = Number.isFinite(progress.position) ? progress.position * 1000 : 0;
  const duration = Number.isFinite(progress.duration) ? progress.duration * 1000 : 0;

  useEffect(() => {
    autoplayEnabledRef.current = isAutoplayEnabled;
  }, [isAutoplayEnabled]);

  useEffect(() => {
    downloadedRef.current = downloadedTracks;
  }, [downloadedTracks]);

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

  const resolveTrackSource = useCallback(async (track: Track): Promise<ResolvedPlayable | null> => {
    const local = downloadedRef.current.find((item) => item.id === track.id);
    if (local) {
      return {
        id: track.id,
        url: local.localAudioUri,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: local.localArtworkUri || track.artwork || undefined,
      };
    }
    try {
      const result = await resolveStream(track.title, track.artist);
      return {
        id: track.id,
        url: result.url,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork || undefined,
      };
    } catch (error) {
      console.error('[audio] No playable stream found for:', track.title, track.artist, error);
      return null;
    }
  }, []);

  const mirrorPositionForIndex = useCallback((appIndex: number): number => {
    const q = queueRef.current;
    let position = 0;
    for (let i = 0; i < Math.min(appIndex, q.length); i += 1) {
      if (q[i]?.id && mirrorIdsRef.current.has(q[i].id)) {
        position += 1;
      }
    }
    return position;
  }, []);

  const fillMirror = useCallback(
    async ({ full = false }: { full?: boolean } = {}) => {
      if (!playerInitiatedRef.current) {
        return;
      }
      if (fillInFlightRef.current) {
        fillPendingRequestRef.current = { full };
        return;
      }
      const initial = fillPendingRequestRef.current;
      fillPendingRequestRef.current = null;
      fillInFlightRef.current = true;
      try {
        let currentFull = full || initial?.full === true;
        let keepGoing = true;
        while (keepGoing) {
          keepGoing = false;
          const gen = queueGenRef.current;
          const q = queueRef.current;
          let added = 0;
          for (let i = Math.max(0, lastMirrorIndexRef.current + 1); i < q.length; i += 1) {
            lastMirrorIndexRef.current = i;
            const item = q[i];
            if (!item || !item.id) {
              continue;
            }
            if (mirrorIdsRef.current.has(item.id)) {
              continue;
            }
            if (!currentFull && added >= FILL_BATCH) {
              break;
            }
            const playable = await resolveTrackSource(item);
            if (gen !== queueGenRef.current) {
              return;
            }
            if (playable) {
              const position = mirrorPositionForIndex(i);
              await TrackPlayer.add(playable, position);
              if (gen !== queueGenRef.current) {
                return;
              }
              mirrorIdsRef.current.add(item.id);
              added += 1;
            }
          }
          const pending = fillPendingRequestRef.current as { full: boolean } | null;
          if (pending) {
            fillPendingRequestRef.current = null;
            if (pending.full) {
              currentFull = true;
            }
            keepGoing = true;
          }
        }
      } finally {
        fillInFlightRef.current = false;
        const pending = fillPendingRequestRef.current as { full: boolean } | null;
        if (pending) {
          fillPendingRequestRef.current = null;
          fillMirror(pending).catch((error) => console.warn('[player] Fill failed.', error));
        }
      }
    },
    [resolveTrackSource, mirrorPositionForIndex]
  );

  const advanceToNextPlayable = async (start: number) => {
    const q = queueRef.current;
    if (q.length === 0) {
      return;
    }
    for (let offset = 0; offset < q.length; offset += 1) {
      const targetIndex = (start + offset) % q.length;
      const target = q[targetIndex];
      if (!target || !target.id) {
        continue;
      }
      if (mirrorIdsRef.current.has(target.id)) {
        await TrackPlayer.skipToNext();
        return;
      }
      const playable = await resolveTrackSource(target);
      if (playable) {
        const position = mirrorPositionForIndex(targetIndex);
        await TrackPlayer.add(playable, position);
        mirrorIdsRef.current.add(target.id);
        await TrackPlayer.skipToNext();
        return;
      }
      if (offset === 0) {
        notifyStreamFailure(target);
      }
    }
  };

  const playNext = async () => {
    const q = queueRef.current;
    if (q.length === 0 || !currentTrackRef.current) {
      return;
    }
    await advanceToNextPlayable(indexRef.current + 1);
  };

  const playPrevious = async () => {
    const q = queueRef.current;
    if (q.length === 0 || !currentTrackRef.current) {
      return;
    }
    if (playbackPosition > PREVIOUS_RESTART_THRESHOLD_MS) {
      await TrackPlayer.seekTo(0);
      return;
    }
    const prevIndex = indexRef.current > 0 ? indexRef.current - 1 : q.length - 1;
    const target = q[prevIndex];
    if (!target || !target.id) {
      return;
    }
    if (mirrorIdsRef.current.has(target.id)) {
      await TrackPlayer.skipToPrevious();
      return;
    }
    const playable = await resolveTrackSource(target);
    if (!playable) {
      notifyStreamFailure(target);
      return;
    }
    const position = mirrorPositionForIndex(prevIndex);
    await TrackPlayer.add(playable, position);
    mirrorIdsRef.current.add(target.id);
    await TrackPlayer.skipToPrevious();
  };

  const ensureAutoplayTracks = useCallback(async () => {
    if (autoplayLoadingRef.current || !currentTrackRef.current) {
      return;
    }
    const queueNow = queueRef.current;
    if (queueNow.length === 0) {
      return;
    }
    if (indexRef.current < queueNow.length - 1) {
      return;
    }
    const currentTrack = currentTrackRef.current;
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
  }, []);

  const waitForIdleFills = async (gen: number) => {
    let waited = 0;
    while (
      (fillInFlightRef.current || fillPendingRequestRef.current) &&
      gen === queueGenRef.current &&
      waited < 40
    ) {
      await delayMs(120);
      waited += 1;
    }
  };

  const resolveCountBeyond = () => {
    const q = queueRef.current;
    const idx = indexRef.current;
    return q.slice(idx + 1).filter((item) => item?.id && mirrorIdsRef.current.has(item.id)).length;
  };

  const handleQueueEnded = async () => {
    const q = queueRef.current;
    if (q.length === 0 || indexRef.current < 0 || resolvingRef.current) {
      return;
    }
    const gen = queueGenRef.current;
    await fillMirror({ full: true });
    await waitForIdleFills(gen);
    if (gen !== queueGenRef.current) {
      return;
    }
    if (resolveCountBeyond() > 0) {
      await TrackPlayer.skipToNext();
      return;
    }
    if (!autoplayEnabledRef.current) {
      return;
    }
    await ensureAutoplayTracks();
    if (gen !== queueGenRef.current) {
      return;
    }
    await fillMirror({ full: true });
    await waitForIdleFills(gen);
    if (gen !== queueGenRef.current) {
      return;
    }
    if (resolveCountBeyond() > 0) {
      await TrackPlayer.skipToNext();
    }
  };

  const notifyStreamFailure = (track: Track) => {
    Alert.alert(
      'Unable to stream this track',
      `"${track.title}" by ${track.artist} could not be played. Pick a different track to continue.`
    );
  };

  const startTrack = async (track: Track, queue: Track[], index: number) => {
    const seq = ++startSeqRef.current;
    queueGenRef.current += 1;
    setCurrentTrack(track);
    currentTrackRef.current = track;
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
    const isCurrent = () => seq === startSeqRef.current;
    let resolvedUrl = '';
    let resolvedProvider: 'local' | 'jiosaavn' | 'soundcloud' | 'youtube' | undefined;
    let artworkUri = track.artwork;
    try {
      const local = downloadedRef.current.find((item) => item.id === track.id);
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
      if (!isCurrent()) {
        return;
      }
      setPlaybackError('Could not find a playable source for this track.');
      setIsLoadingAudio(false);
      resolvingRef.current = false;
      notifyStreamFailure(track);
      return;
    }
    if (!isCurrent()) {
      return;
    }
    if (!resolvedUrl) {
      console.error('[audio] No playable URL available for track:', track.title, track.artist);
      setPlaybackError('Could not find a playable source for this track.');
      setIsLoadingAudio(false);
      resolvingRef.current = false;
      notifyStreamFailure(track);
      return;
    }
    try {
      await TrackPlayer.reset();
      mirrorIdsRef.current = new Set();
      lastMirrorIndexRef.current = -1;
      const playable: ResolvedPlayable = {
        id: track.id,
        url: resolvedUrl,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: artworkUri || undefined,
      };
      await TrackPlayer.add(playable);
      mirrorIdsRef.current.add(track.id);
      await TrackPlayer.setVolume(volumeRef.current);
      await TrackPlayer.play();
      console.warn(`[audio] Playing "${track.title}" via ${resolvedProvider ?? 'unknown'} source.`);
    } catch (error) {
      console.error('[audio] Playback failed to start:', error);
      setPlaybackError('Playback failed to start.');
      setIsLoadingAudio(false);
    } finally {
      if (isCurrent()) {
        resolvingRef.current = false;
      }
    }
    if (isCurrent()) {
      fillMirror().catch((error) => console.warn('[player] Fill failed.', error));
    }
  };

  const playTrack = async (track: Track, queue: Track[] = []) => {
    playerInitiatedRef.current = true;
    setAutoplayAddedIds(new Set());
    if (queue.length > 0) {
      const index = Math.max(queue.findIndex((item) => item.id === track.id), 0);
      await startTrack(track, queue, index);
    } else {
      await startTrack(track, [track], 0);
    }
  };

  useTrackPlayerEvents([Event.PlaybackActiveTrackChanged], (event) => {
    const activeId = event.track?.id;
    if (!activeId) {
      return;
    }
    const q = queueRef.current;
    const appIndex = q.findIndex((item) => item.id === activeId);
    if (appIndex < 0) {
      return;
    }
    const appTrack = q[appIndex];
    let indexChanged = false;
    if (indexRef.current !== appIndex) {
      indexRef.current = appIndex;
      setQueueIndex(appIndex);
      indexChanged = true;
    }
    if (currentTrackRef.current?.id !== appTrack.id) {
      currentTrackRef.current = appTrack;
      setCurrentTrack(appTrack);
      setPlaybackError(null);
      reportedErrorRef.current = null;
      if (appTrack.id) {
        playedSetRef.current.add(appTrack.id);
      }
    }
    TrackPlayer.setVolume(volumeRef.current).catch((error) =>
      console.warn('[player] Could not reapply volume.', error)
    );
    if (indexChanged) {
      fillMirror().catch((error) => console.warn('[player] Fill failed.', error));
    }
  });

  useTrackPlayerEvents([Event.PlaybackError], () => {
    const active = currentTrackRef.current;
    if (!active) {
      return;
    }
    console.error('[audio] Playback error for track:', active.title);
    if (reportedErrorRef.current !== active.id) {
      reportedErrorRef.current = active.id;
      setPlaybackError('Stream failed during playback.');
    }
  });

  useEffect(() => {
    if (state === State.Loading || state === State.Buffering) {
      setIsLoadingAudio(true);
    } else if (!resolvingRef.current) {
      setIsLoadingAudio(false);
    }
  }, [state]);

  useEffect(() => {
    if (state === State.Error) {
      const active = currentTrackRef.current;
      if (!active) {
        return;
      }
      console.error('[audio] Playback error for track:', active.title);
      if (reportedErrorRef.current !== active.id) {
        reportedErrorRef.current = active.id;
        setPlaybackError('Stream failed during playback.');
      }
    }
  }, [state]);

  useEffect(() => {
    setPlaybackServiceBridge({
      onRemoteNext: () => playNext(),
      onRemotePrevious: () => playPrevious(),
      onQueueEnded: () => handleQueueEnded(),
    });
    return () => {
      setPlaybackServiceBridge(null);
    };
  });

  useEffect(() => {
    (async () => {
      try {
        await TrackPlayer.setupPlayer({
          iosCategory: IOSCategory.Playback,
          autoHandleInterruptions: true,
        });
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
          ],
          progressUpdateEventInterval: 1,
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
          },
        });
        await TrackPlayer.setVolume(DEFAULT_VOLUME);
      } catch (error) {
        console.warn('[player] Failed to initialize TrackPlayer.', error);
      }
    })();
  }, []);

  useEffect(() => {
    if (user) {
      return;
    }
    playerInitiatedRef.current = false;
    startSeqRef.current += 1;
    queueGenRef.current += 1;
    setCurrentTrack(null);
    currentTrackRef.current = null;
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
    mirrorIdsRef.current = new Set();
    lastMirrorIndexRef.current = -1;
    TrackPlayer.reset().catch((error) => console.warn('[player] Could not reset on logout.', error));
  }, [user]);

  useEffect(() => {
    if (user && currentTrack) {
      storage
        .writeLastPlayedTrack(user.id, currentTrack)
        .catch((error) => console.warn('[player] Could not save last played track.', error));
    }
  }, [user, currentTrack]);

  const togglePlayPause = () => {
    if (!currentTrackRef.current) {
      return;
    }
    if (state === State.Playing) {
      TrackPlayer.pause();
    } else {
      TrackPlayer.play();
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

  const setVolume = (value: number) => {
    const next = Math.min(Math.max(value, 0), 1);
    volumeRef.current = next;
    setVolumeState(next);
    TrackPlayer.setVolume(next).catch((error) =>
      console.warn('[player] Could not set volume.', error)
    );
  };

  const seekTo = async (millis: number) => {
    if (millis == null || !Number.isFinite(millis)) {
      return;
    }
    if (duration <= 0) {
      return;
    }
    await TrackPlayer.seekTo(millis / 1000);
  };

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrack,
      isPlaying: state === State.Playing,
      playbackPosition,
      duration,
      isLoadingAudio,
      playbackError,
      volume,
      setVolume,
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
      state,
      playbackPosition,
      duration,
      isLoadingAudio,
      playbackError,
      volume,
      queue,
      queueIndex,
      isAutoplayEnabled,
      autoplayAddedIds,
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