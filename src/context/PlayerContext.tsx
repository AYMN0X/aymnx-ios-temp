import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { AudioPlayer, AudioStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { resolveSoundCloudStream, resolveStream, Track } from '../services/musicApi';
import { getLocalTrackFile, toLocalFileUri } from '../services/downloadService';
import { getRecommendedNextTracks } from '../services/autoplayService';
import * as storage from '../services/storage';
import { resolveStreamForPlayback, isLanStreamUrl, StreamResolveResult } from '../utils/streamCache';
import { isNetworkAvailable } from '../utils/network';
import {
  initializeAudioSession,
  isStreamTimeoutError,
  loadAudioSource,
  MAX_CONSECUTIVE_STREAM_FAILURES,
  RESOLUTION_TIMEOUT_MS,
  STREAM_TIMEOUT_MS,
  withStreamTimeout,
} from '../services/AudioService';
import { useAuth, User } from './AuthContext';
import { useDownloads } from './DownloadContext';
import { PlayerErrorBoundary } from '../components/PlayerErrorBoundary';
import { ToastMessage } from '../components/Toast';
import { bootLog, bootLogOnce } from '../services/bootLog';

interface PlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  duration: number;
  isLoadingAudio: boolean;
  playbackError: string | null;
  volume: number;
  setVolume: (value: number) => void;
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  togglePlayPause: () => void;
  seekTo: (millis: number) => Promise<void>;
  playNext: (track?: Track) => Promise<void>;
  playPrevious: () => Promise<void>;
  addToQueue: (track: Track) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  replaceTrackInSession: (replacement: Track) => Promise<void>;
  jumpToQueueIndex: (index: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  queue: Track[];
  queueIndex: number;
  repeatMode: RepeatModeState;
  toggleRepeatMode: () => void;
  isAutoplayEnabled: boolean;
  autoplayAddedIds: Set<string>;
  toggleAutoplay: () => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

/**
 * Fast-changing playback head position. Kept OUT of `PlayerContextValue` so a
 * time tick does not rebuild the whole player context (which would re-render
 * every `usePlayer()` consumer, including the heavy NowPlayingScreen tree).
 * Consumers that only paint a progress bar / scrubber read this context; it
 * updates at PROGRESS_POLL_MS, independent of the main context identity.
 */
interface ProgressContextValue {
  positionMs: number;
  durationMs: number;
}

const ProgressContext = createContext<ProgressContextValue | undefined>(undefined);

type RepeatModeState = 'off' | 'all' | 'one';

const REPEAT_CYCLE: RepeatModeState[] = ['off', 'all', 'one'];

const DEFAULT_VOLUME = 0.5;
const PREVIOUS_RESTART_THRESHOLD_MS = 3000;
const PROGRESS_POLL_MS = 500;
const MAX_AUTOPLAY_BATCH = 12;
const MAX_QUEUE_LENGTH = 120;

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';

type StreamFailureReason = 'load' | 'playback' | 'timeout';

const isLanSourced = (track: Track) =>
  (track.id ? track.id.indexOf('lan_') === 0 : false) ||
  (track.streamUrl ? isLanStreamUrl(track.streamUrl) : false);

const normalizeTrackSnapshot = (value: unknown): Track | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id : '';
  const title = typeof source.title === 'string' ? source.title : '';
  const artist = typeof source.artist === 'string' ? source.artist : '';
  if (!id || !title) {
    return null;
  }
  const stringOrEmpty = (input: unknown) => (typeof input === 'string' ? input : '');
  const stringOrUndefined = (input: unknown) => (typeof input === 'string' ? input : undefined);
  const finiteNumberOrUndefined = (input: unknown) =>
    typeof input === 'number' && Number.isFinite(input) ? input : undefined;
  const provider =
    typeof source.provider === 'string' ? (source.provider as Track['provider']) : undefined;
  return {
    id,
    title,
    artist,
    album: stringOrEmpty(source.album),
    artwork: stringOrEmpty(source.artwork),
    previewUrl: stringOrEmpty(source.previewUrl),
    streamUrl: stringOrUndefined(source.streamUrl),
    streamMimeType: stringOrUndefined(source.streamMimeType),
    duration: finiteNumberOrUndefined(source.duration),
    provider,
    permalink: stringOrUndefined(source.permalink),
  };
};

export function PlayerProvider({ children }: { children: ReactNode }) {
  bootLogOnce('PlayerProvider mounted');
  const { user } = useAuth();
  const { downloadedTracks, deleteDownload } = useDownloads();

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [autoplayAddedIds, setAutoplayAddedIds] = useState<Set<string>>(new Set());
  const [repeatMode, setRepeatMode] = useState<RepeatModeState>('off');
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const queueRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const currentTrackRef = useRef<Track | null>(null);
  const startSeqRef = useRef(0);
  const queueGenRef = useRef(0);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const repeatModeRef = useRef<RepeatModeState>('off');
  const resolvingRef = useRef(false);
  const reportedErrorRef = useRef<string | null>(null);
  const playedSetRef = useRef<Set<string>>(new Set());
  const autoplayLoadingRef = useRef(false);
  const autoplayFailedForRef = useRef<string | null>(null);
  const autoplayEnabledRef = useRef(true);
  const playerInitiatedRef = useRef(false);
  const downloadedRef = useRef<typeof downloadedTracks>([]);
  const playerRef = useRef<AudioPlayer | null>(null);
  const playerDisposeRef = useRef<(() => void) | null>(null);
  const userRef = useRef<User | null>(null);
  const sessionRestoredRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const streamFailureHandledRef = useRef<string | null>(null);
  const handleStreamFailureRef = useRef<
    (track: Track, reason: StreamFailureReason) => Promise<void>
  >(async () => undefined);
  const handleFinishedRef = useRef<() => Promise<void>>(async () => undefined);
  const onStatusRef = useRef<(status: AudioStatus) => void>(() => undefined);
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flattenedDuration = Number.isFinite(currentTrack?.duration)
    ? (currentTrack?.duration ?? 0) * 1000
    : 0;
  const duration = durationMs > 0 ? durationMs : flattenedDuration;
  const rawPositionMs = positionMs;
  const playbackPosition = duration > 0 ? Math.min(rawPositionMs, duration) : rawPositionMs;

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

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined;
    }
    initializeAudioSession().catch((error) =>
      console.warn('[player] Failed to initialize the audio session.', error)
    );
    return undefined;
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    const payload = { message, id: Date.now() + Math.random() };
    setToast(payload);
    toastTimeoutRef.current = setTimeout(() => {
      toastTimeoutRef.current = null;
      setToast((current) => (current?.id === payload.id ? null : current));
    }, 2500);
  }, []);

  const stopCurrentPlayer = useCallback(async () => {
    const player = playerRef.current;
    const dispose = playerDisposeRef.current;
    playerRef.current = null;
    playerDisposeRef.current = null;
    if (!player) {
      return;
    }
    setIsPlaying(false);
    if (dispose) {
      try {
        dispose();
      } catch (error) {
        console.warn('[player] Could not release the previous sound.', error);
      }
      return;
    }
    try {
      player.pause();
    } catch (error) {
      console.warn('[player] Could not pause the previous sound.', error);
    }
    try {
      player.remove();
    } catch (error) {
      console.warn('[player] Could not unload the previous sound.', error);
    }
  }, []);

  const playerStatusHandler = useCallback((status: AudioStatus) => {
    onStatusRef.current(status);
  }, []);

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
        const capacity = MAX_QUEUE_LENGTH - queueNow.length;
        const appendable = capacity > 0 ? fresh.slice(0, Math.min(MAX_AUTOPLAY_BATCH, capacity)) : [];
        if (appendable.length === 0) {
          autoplayFailedForRef.current = attemptKey;
          return;
        }
        const nextQueue = [...queueNow, ...appendable];
        queueRef.current = nextQueue;
        setQueue(nextQueue);
        setAutoplayAddedIds((prev) => {
          const next = new Set(prev);
          appendable.forEach((item) => next.add(item.id));
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

  const pauseCurrentPlayer = async () => {
    const player = playerRef.current;
    if (!player) {
      return;
    }
    player.pause();
  };

  const startTrack = async (track: Track, queue: Track[], index: number) => {
    const seq = ++startSeqRef.current;
    queueGenRef.current += 1;
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setPlaybackError(null);
    reportedErrorRef.current = null;
    streamFailureHandledRef.current = null;
    sessionRestoredRef.current = false;
    setIsLoadingAudio(true);
    resolvingRef.current = true;
    queueRef.current = queue;
    indexRef.current = index;
    setQueue(queue);
    setQueueIndex(index);
    setPositionMs(0);
    setDurationMs(0);
    autoplayFailedForRef.current = null;
    if (track.id) {
      playedSetRef.current.add(track.id);
    }
    const isCurrent = () => seq === startSeqRef.current;

    // Immediately stop and release the previously active sound instance before
    // resolving or buffering the next track. Otherwise the old player keeps
    // playing while the new stream resolves, and rapid track taps can leave two
    // live players active at the same time (overlapping audio).
    await stopCurrentPlayer();

    // Set when playback resolves to a local file, so a load failure can be
    // attributed to a corrupt/unsupported cached file and cleanup the download.
    let localPlaybackUri = '';

    const loadAndStartPlayback = async (): Promise<void> => {
      let resolvedUrl = '';
      let resolvedProvider: 'local' | 'jiosaavn' | 'soundcloud' | 'youtube' | 'itunes' | undefined;
      let resolvedMimeType: string | undefined;
      // Offline-first: use the in-memory download registry, then fall back to a
      // direct filesystem lookup of the cached audio file. The FS check covers
      // cold-start races where the registry has not hydrated yet, so a
      // downloaded track is never sent to remote API resolution.
      const local = downloadedRef.current.find((item) => item.id === track.id);
      let localUri = local?.localAudioUri ?? '';
      if (!localUri) {
        try {
          const persisted = await getLocalTrackFile(track.id);
          if (persisted) {
            localUri = persisted;
            console.log(`[Playback] Playing offline file for "${track.title}": ${persisted}`);
          }
        } catch (error) {
          console.warn('[audio] Failed to check local cache for:', track.title, error);
        }
      }
      if (localUri) {
        resolvedUrl = toLocalFileUri(localUri);
        localPlaybackUri = localUri;
        resolvedProvider = 'local';
      } else if (track.streamUrl) {
        let resolved: StreamResolveResult | null = null;
        try {
          resolved = await resolveStreamForPlayback(track.streamUrl, track.streamMimeType);
        } catch (error) {
          console.warn('[audio] Failed to resolve stream source for:', track.streamUrl, error);
        }
        if (resolved) {
          resolvedUrl = resolved.uri;
          resolvedProvider = resolved.kind === 'network' ? 'jiosaavn' : 'local';
          resolvedMimeType = track.streamMimeType || 'audio/mp4';
        }
      } else if (isLanSourced(track)) {
        console.error(
          '[audio] LAN-sourced track has no resolvable source; refusing online fallback:',
          track.title,
          track.artist
        );
      } else if (track.provider === 'soundcloud') {
        const result = await resolveSoundCloudStream(track.title, track.artist, track.permalink);
        resolvedUrl = result?.url ?? '';
        resolvedProvider = result?.provider;
        resolvedMimeType = result?.mimeType;
      } else {
        const result = await resolveStream(track.title, track.artist);
        resolvedUrl = result.url;
        resolvedProvider = result.provider;
        resolvedMimeType = result.mimeType;
      }
      if (!isCurrent()) {
        return;
      }
      // Last-resort fallback: a 30s preview of the RIGHT track is strictly
      // better than a full-length stream of the WRONG track. SoundCloud tracks
      // never carry previews and LAN tracks are excluded because they must not
      // fall back online.
      if (!resolvedUrl) {
        if (
          !isLanSourced(track) &&
          track.previewUrl &&
          /^https:\/\//i.test(track.previewUrl)
        ) {
          resolvedUrl = track.previewUrl;
          resolvedProvider = 'itunes';
          resolvedMimeType = resolvedMimeType || 'audio/mpeg';
        }
      }
      if (!resolvedUrl) {
        throw new Error('No playable stream URL for this track');
      }
      const loaded = await loadAudioSource(
        {
          uri: resolvedUrl,
          contentType: resolvedMimeType,
          userAgent: resolvedProvider === 'local' ? undefined : DEFAULT_USER_AGENT,
        },
        playerStatusHandler
      );
      if (!isCurrent()) {
        loaded.dispose();
        return;
      }
      // Race guard: a stale load may have adopted a player after our entry
      // stop, so release whatever is currently referenced before adopting the
      // freshly-loaded instance. Only one player may ever be active.
      await stopCurrentPlayer();
      playerRef.current = loaded.player;
      playerDisposeRef.current = loaded.dispose;
      loaded.player.volume = volumeRef.current;
      if (!isCurrent()) {
        playerRef.current = null;
        playerDisposeRef.current = null;
        loaded.dispose();
        return;
      }
      loaded.player.play();
      console.warn(`[audio] Playing "${track.title}" via ${resolvedProvider ?? 'unknown'} source.`);
    };

    try {
      await withStreamTimeout(loadAndStartPlayback(), RESOLUTION_TIMEOUT_MS);
    } catch (error) {
      if (!isCurrent()) {
        return;
      }
      console.error('[audio] Stream load failed for:', track.title, track.artist, error);
      // A local file that fails to open is corrupt (e.g. an HLS manifest saved
      // as audio, or a 0-byte write): delete it and unmark it as downloaded so
      // it stops surfacing the offline badge and breaking playback.
      if (localPlaybackUri) {
        console.warn(
          `[audio] Local file corrupted for "${track.title}" (${track.id}), clearing download...`
        );
        await deleteDownload(track.id).catch((cleanupError) =>
          console.warn('[player] Could not remove corrupt download.', cleanupError)
        );
      }
      // Graceful offline guard: an un-downloaded track that fails resolution
      // because no reachable stream exists is almost always the device being in
      // Airplane mode. Surface a friendly message instead of a redbox and do not
      // advance the queue (which would otherwise fail-track after fail-track).
      const isNoSourceError =
        error instanceof Error && error.message.includes('No playable https stream');
      if (isNoSourceError) {
        let offline = true;
        try {
          offline = !(await isNetworkAvailable());
        } catch {
          offline = true;
        }
        if (offline) {
          const offlineMessage = 'Not available offline. Download this track to listen without internet.';
          console.warn(`[audio] Offline playback guard for "${track.title}".`);
          setPlaybackError(offlineMessage);
          showToast(offlineMessage);
          setIsLoadingAudio(false);
          resolvingRef.current = false;
          return;
        }
      }
      const timedOut = isStreamTimeoutError(error);
      setPlaybackError(
        timedOut
          ? 'Stream timed out while loading.'
          : 'Could not find a playable source for this track.'
      );
      setIsLoadingAudio(false);
      resolvingRef.current = false;
      await handleStreamFailureRef
        .current(track, timedOut ? 'timeout' : 'load')
        .catch((recoverError) => console.warn('[player] Stream failure recovery failed.', recoverError));
      return;
    } finally {
      if (isCurrent()) {
        resolvingRef.current = false;
      }
    }
    if (isCurrent()) {
      setIsLoadingAudio(false);
    }
  };

  const handleStreamFailure = async (track: Track, reason: StreamFailureReason) => {
    console.warn(`[player] Stream failure (${reason}) for:`, track?.title, track?.artist);
    if (!playerInitiatedRef.current || !track || !track.id) {
      return;
    }
    if (streamFailureHandledRef.current === track.id) {
      return;
    }
    streamFailureHandledRef.current = track.id;
    consecutiveFailuresRef.current += 1;
    if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_STREAM_FAILURES) {
      consecutiveFailuresRef.current = 0;
      streamFailureHandledRef.current = null;
      setPlaybackError('Too many tracks failed to stream. Check your connection and try again.');
      showToast('Playback paused. Too many unavailable tracks.');
      Alert.alert(
        'Playback paused',
        'Several tracks could not be streamed. Check your connection and try again.'
      );
      await pauseCurrentPlayer().catch((error) => console.warn('[player] Could not pause.', error));
      return;
    }
    showToast('Track unavailable. Skipping...');
    const q = queueRef.current;
    const idx = indexRef.current;
    if (q.length === 0 || idx < 0) {
      await pauseCurrentPlayer().catch((error) => console.warn('[player] Could not pause.', error));
      return;
    }
    let nextIndex = idx + 1;
    if (nextIndex >= q.length) {
      if (repeatModeRef.current === 'off') {
        await pauseCurrentPlayer().catch((error) =>
          console.warn('[player] Could not pause.', error)
        );
        return;
      }
      nextIndex = 0;
    }
    const nextTrack = q[nextIndex];
    if (!nextTrack || !nextTrack.id) {
      await pauseCurrentPlayer().catch((error) => console.warn('[player] Could not pause.', error));
      return;
    }
    await startTrack(nextTrack, q, nextIndex);
  };
  handleStreamFailureRef.current = handleStreamFailure;

  const handleFinished = async () => {
    const current = currentTrackRef.current;
    const player = playerRef.current;
    if (!current || !playerInitiatedRef.current || resolvingRef.current) {
      return;
    }
    if (repeatModeRef.current === 'one') {
      if (!player) {
        return;
      }
      try {
        await player.seekTo(0);
        player.play();
        return;
      } catch (error) {
        console.warn('[player] Could not replay track.', error);
        await handleStreamFailureRef
          .current(current, 'playback')
          .catch((recoverError) => console.warn('[player] Replay recovery failed.', recoverError));
        return;
      }
    }
    const q = queueRef.current;
    if (q.length === 0 || indexRef.current < 0) {
      return;
    }
    const wrap = repeatModeRef.current === 'all';
    let nextIndex = indexRef.current + 1;
    if (nextIndex >= q.length) {
      if (!wrap) {
        if (!autoplayEnabledRef.current) {
          return;
        }
        await ensureAutoplayTracks();
        const queueAfter = queueRef.current;
        const next = indexRef.current + 1;
        if (next < queueAfter.length) {
          await startTrack(queueAfter[next], queueAfter, next);
        }
        return;
      }
      nextIndex = 0;
    }
    const target = q[nextIndex];
    if (!target || !target.id) {
      return;
    }
    await startTrack(target, q, nextIndex);
  };
  handleFinishedRef.current = handleFinished;

  const onStatus = (status: AudioStatus) => {
    if (status.error) {
      const active = currentTrackRef.current;
      if (active && reportedErrorRef.current !== active.id) {
        reportedErrorRef.current = active.id;
        setPlaybackError('Stream failed during playback.');
        handleStreamFailureRef.current(active, 'playback').catch((error) =>
          console.warn('[player] Playback error recovery failed.', error)
        );
      }
      return;
    }
    if (status.didJustFinish) {
      setIsPlaying(false);
      handleFinishedRef.current().catch((error) =>
        console.warn('[player] Queue advance failed.', error)
      );
      return;
    }
    setIsPlaying(status.playing);
    if (status.playing) {
      consecutiveFailuresRef.current = 0;
    }
    setIsLoadingAudio(status.isBuffering);
  };
  onStatusRef.current = onStatus;

  const playTrack = async (track: Track, queue: Track[] = []) => {
    playerInitiatedRef.current = true;
    sessionRestoredRef.current = false;
    consecutiveFailuresRef.current = 0;
    streamFailureHandledRef.current = null;
    setAutoplayAddedIds(new Set());
    if (queue.length > 0) {
      const index = Math.max(queue.findIndex((item) => item.id === track.id), 0);
      await startTrack(track, queue, index);
    } else {
      await startTrack(track, [track], 0);
    }
  };

  const togglePlayPause = () => {
    const track = currentTrackRef.current;
    if (!track) {
      return;
    }
    if (resolvingRef.current) {
      return;
    }
    const player = playerRef.current;
    if (sessionRestoredRef.current || !player) {
      sessionRestoredRef.current = false;
      playerInitiatedRef.current = true;
      startTrack(track, queueRef.current, indexRef.current);
      return;
    }
    if (isPlaying) {
      player.pause();
    } else {
      const restart = duration > 0 && playbackPosition >= Math.max(duration - 100, 0);
      (async () => {
        try {
          if (restart) {
            await player.seekTo(0);
          }
          player.play();
        } catch (error) {
          console.warn('[player] Could not play.', error);
        }
      })();
    }
  };

  const playNext = async (track?: Track) => {
    if (!track) {
      const q = queueRef.current;
      if (q.length === 0 || !currentTrackRef.current) {
        return;
      }
      const wrap = repeatModeRef.current === 'all';
      let nextIndex = indexRef.current + 1;
      if (nextIndex >= q.length) {
        if (!wrap) {
          return;
        }
        nextIndex = 0;
      }
      const target = q[nextIndex];
      if (!target || !target.id) {
        return;
      }
      await startTrack(target, q, nextIndex);
      return;
    }
    const q = queueRef.current;
    if (q.length === 0 || !currentTrackRef.current) {
      return;
    }
    const newIndex = Math.min(indexRef.current + 1, q.length);
    const nextQueue = [...q.slice(0, newIndex), track, ...q.slice(newIndex)];
    queueGenRef.current += 1;
    queueRef.current = nextQueue;
    setQueue(nextQueue);
  };

  const playPrevious = async () => {
    const q = queueRef.current;
    if (q.length === 0 || !currentTrackRef.current) {
      return;
    }
    if (playbackPosition > PREVIOUS_RESTART_THRESHOLD_MS) {
      const player = playerRef.current;
      if (player) {
        try {
          await player.seekTo(0);
        } catch (error) {
          console.warn('[player] Could not restart track.', error);
        }
      }
      return;
    }
    const prevIndex = indexRef.current > 0 ? indexRef.current - 1 : q.length - 1;
    const target = q[prevIndex];
    if (!target || !target.id) {
      return;
    }
    await startTrack(target, q, prevIndex);
  };

  const addToQueue = async (track: Track) => {
    if (!track || !track.id || !currentTrackRef.current) {
      return;
    }
    const nextQueue = [...queueRef.current, track];
    queueGenRef.current += 1;
    queueRef.current = nextQueue;
    setQueue(nextQueue);
  };

  const removeFromQueue = async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) {
      return;
    }
    if (index === indexRef.current) {
      return;
    }
    const nextQueue = q.filter((_, i) => i !== index);
    queueGenRef.current += 1;
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    if (index < indexRef.current) {
      indexRef.current -= 1;
      setQueueIndex(indexRef.current);
    }
  };

  const replaceTrackInSession = async (replacement: Track) => {
    const q = queueRef.current;
    const current = currentTrackRef.current;
    if ((!replacement || !replacement.id || q.length === 0) && !current?.id) {
      return;
    }
    if (!current) {
      return;
    }
    const replacedInQueue = q.some((item) => item.id === replacement.id);
    if (!replacedInQueue && current.id !== replacement.id) {
      return;
    }
    const nextQueue = q.map((item) => (item.id === replacement.id ? replacement : item));
    if (current.id === replacement.id) {
      indexRef.current = Math.max(
        nextQueue.findIndex((item) => item.id === replacement.id),
        0
      );
      queueRef.current = nextQueue;
      setQueue(nextQueue);
      setQueueIndex(indexRef.current);
      await startTrack(replacement, nextQueue, indexRef.current);
      return;
    }
    queueRef.current = nextQueue;
    setQueue(nextQueue);
  };

  const jumpToQueueIndex = async (index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) {
      return;
    }
    const target = q[index];
    if (!target || !target.id) {
      return;
    }
    await startTrack(target, q, index);
  };

  const clearQueue = async () => {
    const q = queueRef.current;
    const idx = indexRef.current;
    if (idx < 0) {
      return;
    }
    const removed = q.slice(idx + 1);
    if (removed.length === 0) {
      return;
    }
    const nextQueue = q.slice(0, idx + 1);
    queueGenRef.current += 1;
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    if (autoplayAddedIds.size > 0) {
      setAutoplayAddedIds(new Set());
    }
  };

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
    streamFailureHandledRef.current = null;
    sessionRestoredRef.current = false;
    consecutiveFailuresRef.current = 0;
    queueRef.current = [];
    indexRef.current = -1;
    setQueue([]);
    setQueueIndex(-1);
    setRepeatMode('off');
    repeatModeRef.current = 'off';
    setAutoplayAddedIds(new Set());
    playedSetRef.current = new Set();
    autoplayLoadingRef.current = false;
    autoplayFailedForRef.current = null;
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
    stopCurrentPlayer().catch((error) => console.warn('[player] Could not clear player on logout.', error));
  }, [user]);

  useEffect(() => {
    Image.clearMemoryCache().catch(() => undefined);
    if (user && currentTrack) {
      storage
        .writeLastPlayedTrack(user.id, currentTrack)
        .catch((error) => console.warn('[player] Could not save last played track.', error));
    }
  }, [user, currentTrack]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }
    let cancelled = false;
    bootLog('player session hydrate start');
    (async () => {
      try {
        const saved = await storage.getLastPlayedTrack(user.id);
        if (cancelled || playerInitiatedRef.current || currentTrackRef.current) {
          return;
        }
        const normalized = normalizeTrackSnapshot(saved);
        if (!normalized) {
          await storage.writeLastPlayedTrack(user.id, null);
          return;
        }
        sessionRestoredRef.current = true;
        const restoredQueue = [normalized];
        queueRef.current = restoredQueue;
        indexRef.current = 0;
        setQueue(restoredQueue);
        setQueueIndex(0);
        setCurrentTrack(normalized);
        currentTrackRef.current = normalized;
        setPlaybackError(null);
        setPositionMs(0);
        setDurationMs(0);
        setIsPlaying(false);
        await stopCurrentPlayer();
        bootLog('player session restored', { track: normalized.title });
      } catch (error) {
        console.warn('[player] Could not restore last played track.', error);
        try {
          await storage.writeLastPlayedTrack(user.id, null);
        } catch (purgeError) {
          console.warn('[player] Could not purge invalid session.', purgeError);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      const status = player.currentStatus;
      if (!status || !status.isLoaded) {
        return;
      }
      if (Number.isFinite(status.currentTime)) {
        setPositionMs(status.currentTime * 1000);
      }
      if (Number.isFinite(status.duration) && status.duration > 0) {
        setDurationMs(status.duration * 1000);
      }
    }, PROGRESS_POLL_MS);
    return () => clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    const activeId = currentTrack?.id;
    if (!activeId || !playerInitiatedRef.current || streamFailureHandledRef.current === activeId) {
      return undefined;
    }
    const timer = setTimeout(() => {
      const active = currentTrackRef.current;
      if (!active || active.id !== activeId || !playerInitiatedRef.current) {
        return;
      }
      if (reportedErrorRef.current === active.id || streamFailureHandledRef.current === active.id) {
        return;
      }
      const markTimedOut = () => {
        reportedErrorRef.current = active.id;
        setPlaybackError('Stream timed out while loading.');
        handleStreamFailureRef
          .current(active, 'timeout')
          .catch((error) => console.warn('[player] Stream timeout recovery failed.', error));
      };
      // While the stream is still being resolved the strict 5s timer must not
      // fire - resolution has its own (longer) budget handled by the outer
      // `RESOLUTION_TIMEOUT_MS` race. This watchdog only guards a frozen native
      // audio engine that never reports a loaded/buffering state.
      if (resolvingRef.current) {
        return;
      }
      const player = playerRef.current;
      if (!player) {
        markTimedOut();
        return;
      }
      const status = player.currentStatus;
      if (status?.isLoaded && (status.playing || !status.isBuffering)) {
        return;
      }
      markTimedOut();
    }, STREAM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [currentTrack?.id, isLoadingAudio, isPlaying]);

  const toggleAutoplay = () => {
    setIsAutoplayEnabled((prev) => {
      const next = !prev;
      storage
        .setAutoplayEnabled(next)
        .catch((error) => console.warn('[player] Could not save autoplay setting.', error));
      return next;
    });
  };

  const toggleRepeatMode = () => {
    setRepeatMode((prev) => {
      const next = REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(prev) + 1) % REPEAT_CYCLE.length];
      repeatModeRef.current = next;
      return next;
    });
  };

  const setVolume = (value: number) => {
    const next = Math.min(Math.max(value, 0), 1);
    volumeRef.current = next;
    setVolumeState(next);
    const player = playerRef.current;
    if (player) {
      player.volume = next;
    }
  };

  const seekTo = async (millis: number) => {
    if (millis == null || !Number.isFinite(millis) || millis < 0) {
      return;
    }
    const player = playerRef.current;
    if (!player) {
      return;
    }
    const target = duration > 0 ? Math.min(millis, duration) : millis;
    try {
      await player.seekTo(target / 1000);
    } catch (error) {
      console.warn('[player] Seek failed.', error);
    }
  };

  const resetPlaybackToIdle = useCallback(
    async (options: { purgeSession?: boolean } = {}) => {
      const { purgeSession } = options;
      playerInitiatedRef.current = false;
      sessionRestoredRef.current = false;
      startSeqRef.current += 1;
      queueGenRef.current += 1;
      consecutiveFailuresRef.current = 0;
      streamFailureHandledRef.current = null;
      reportedErrorRef.current = null;
      setCurrentTrack(null);
      currentTrackRef.current = null;
      setPlaybackError(null);
      setIsLoadingAudio(false);
      resolvingRef.current = false;
      setIsPlaying(false);
      setPositionMs(0);
      setDurationMs(0);
      queueRef.current = [];
      indexRef.current = -1;
      setQueue([]);
      setQueueIndex(-1);
      setAutoplayAddedIds(new Set());
      playedSetRef.current = new Set();
      autoplayLoadingRef.current = false;
      autoplayFailedForRef.current = null;
      setRepeatMode('off');
      repeatModeRef.current = 'off';
      await stopCurrentPlayer();
      if (purgeSession && userRef.current?.id) {
        await storage
          .writeLastPlayedTrack(userRef.current.id, null)
          .catch((error) => console.warn('[player] Could not purge session.', error));
      }
    },
    [stopCurrentPlayer]
  );

  const progressValue = useMemo<ProgressContextValue>(
    () => ({ positionMs: playbackPosition, durationMs: duration }),
    [duration, playbackPosition]
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      currentTrack,
      isPlaying,
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
      addToQueue,
      removeFromQueue,
      replaceTrackInSession,
      jumpToQueueIndex,
      clearQueue,
      queue,
      queueIndex,
      repeatMode,
      toggleRepeatMode,
      isAutoplayEnabled,
      autoplayAddedIds,
      toggleAutoplay,
    }),
    [
      currentTrack,
      isPlaying,
      duration,
      isLoadingAudio,
      playbackError,
      volume,
      playTrack,
      togglePlayPause,
      seekTo,
      playNext,
      playPrevious,
      addToQueue,
      removeFromQueue,
      replaceTrackInSession,
      jumpToQueueIndex,
      clearQueue,
      queue,
      queueIndex,
      repeatMode,
      toggleRepeatMode,
      isAutoplayEnabled,
      autoplayAddedIds,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      <ProgressContext.Provider value={progressValue}>
        <PlayerErrorBoundary onRecoverableError={() => resetPlaybackToIdle({ purgeSession: true })}>
          {children}
        </PlayerErrorBoundary>
        {toast ? <ToastMessage key={toast.id} message={toast.message} /> : null}
      </ProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}

export function useProgress(): ProgressContextValue {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a PlayerProvider');
  }
  return context;
}