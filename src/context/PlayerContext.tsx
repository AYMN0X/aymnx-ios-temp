import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { resolveStream, Track } from '../services/musicApi';

interface PlayerContextValue {
  currentTrack: Track | null;
  isPlaying: boolean;
  playbackPosition: number;
  duration: number;
  isLoadingAudio: boolean;
  playTrack: (track: Track) => Promise<void>;
  togglePlayPause: () => void;
  seekTo: (millis: number) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

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

  const playTrack = async (track: Track) => {
    setCurrentTrack(track);
    setIsLoadingAudio(true);
    try {
      const { url } = await resolveStream(track);
      player.replace(url);
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist,
        albumTitle: track.album,
        artworkUrl: track.artwork,
      });
      player.play();
    } catch (error) {
      console.warn('Failed to start playback', error);
      setIsLoadingAudio(false);
    }
  };

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