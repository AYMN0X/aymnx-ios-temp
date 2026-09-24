import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer, AudioSource, AudioStatus } from 'expo-audio';

export const STREAM_TIMEOUT_MS = 5000;

/**
 * Deadline for the entire track startup pipeline (stream resolution + native
 * engine load). Resolution alone can legitimately take several seconds when the
 * free-source mirrors are slow, so this must be comfortably larger than
 * `STREAM_TIMEOUT_MS`. The strict `STREAM_TIMEOUT_MS` watchdog is reserved for
 * the native audio engine initializing/buffering without progress.
 */
export const RESOLUTION_TIMEOUT_MS = 15000;

export const STREAM_TIMEOUT_MESSAGE = 'STREAM_TIMEOUT';

export const MAX_CONSECUTIVE_STREAM_FAILURES = 3;

export function isStreamTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message === STREAM_TIMEOUT_MESSAGE;
}

export async function withStreamTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = STREAM_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(STREAM_TIMEOUT_MESSAGE)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function initializeAudioSession(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'duckOthers',
    shouldRouteThroughEarpiece: false,
  });
}

export interface SoundSource {
  uri: string;
  contentType?: string;
  userAgent?: string;
}

export interface LoadedAudio {
  player: AudioPlayer;
  dispose: () => void;
}

function toAudioSource(source: SoundSource): AudioSource {
  const nativeSource: { uri: string; headers?: Record<string, string> } = { uri: source.uri };
  if (source.userAgent) {
    nativeSource.headers = { 'User-Agent': source.userAgent };
  }
  return nativeSource;
}

export async function loadAudioSource(
  source: SoundSource,
  onStatus?: ((status: AudioStatus) => void) | null
): Promise<LoadedAudio> {
  const player = createAudioPlayer(toAudioSource(source), { updateInterval: 500 });
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  let loaded = false;
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (!loaded) {
      if (status.error) {
        rejectReady?.(new Error(status.error));
        return;
      }
      if (!status.isLoaded) {
        return;
      }
      loaded = true;
      resolveReady?.();
    }
    onStatus?.(status);
  });

  // Detaches the native status listener BEFORE releasing the player reference so
  // the JS-side subscription and the native player object are both freed (ARC/GC).
  const dispose = () => {
    try {
      player.pause();
    } catch (error) {
      console.warn('[audio] Could not pause released player.', error);
    }
    try {
      subscription.remove();
    } catch (error) {
      console.warn('[audio] Could not detach status listener.', error);
    }
    try {
      player.remove();
    } catch (error) {
      console.warn('[audio] Could not release audio player.', error);
    }
  };

  try {
    await withStreamTimeout(ready);
  } catch (error) {
    dispose();
    throw error;
  }
  return { player, dispose };
}