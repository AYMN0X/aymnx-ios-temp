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
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Track } from '../services/musicApi';
import { useLibrary } from './LibraryContext';
import { usePlayer } from './PlayerContext';
import { TrackActionsSheet } from '../components/modals/TrackActionsSheet';
import { ReplaceTrackModal } from '../components/modals/ReplaceTrackModal';
import { Color } from '../theme/GlobalStyles';

interface TrackActionsValue {
  openTrack: (track: Track, playlistId?: string) => void;
  showToast: (message: string) => void;
}

const TrackActionsContext = createContext<TrackActionsValue | undefined>(undefined);

type SheetView = 'options' | 'replace';

export function TrackActionsProvider({ children }: { children: ReactNode }) {
  const { isLiked, toggleLike, removeTrackFromPlaylist, replaceTrack } = useLibrary();
  const { playTrack, playNext, addToQueue, currentTrack, replaceTrackInSession } = usePlayer();

  const insets = useSafeAreaInsets();

  const [track, setTrack] = useState<Track | null>(null);
  const [playlistId, setPlaylistId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<SheetView>('options');
  const [feedback, setFeedback] = useState<string | null>(null);

  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const feedbackTranslate = useRef(new Animated.Value(14)).current;
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    setTrack(null);
    setPlaylistId(undefined);
    setView('options');
  };

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) {
        clearTimeout(feedbackTimer.current);
      }
    };
  }, []);

  const openTrack = (next: Track, nextPlaylistId?: string) => {
    setTrack(next);
    setPlaylistId(nextPlaylistId);
    setView('options');
  };

  const showToast = useCallback(
    (message: string) => {
      if (feedbackTimer.current) {
        clearTimeout(feedbackTimer.current);
      }
      setFeedback(message);
      Animated.parallel([
        Animated.timing(feedbackOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(feedbackTranslate, {
          toValue: 0,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
      feedbackTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(feedbackOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(feedbackTranslate, {
            toValue: 14,
            duration: 220,
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]).start(() => setFeedback(null));
      }, 1600);
    },
    [feedbackOpacity, feedbackTranslate]
  );

  const playNextTrack = () => {
    if (track) {
      if (currentTrack) {
        playNext(track);
        showToast('Playing next');
      } else {
        playTrack(track, [track]);
        showToast('Now playing');
      }
    }
    close();
  };

  const addTrackToQueue = () => {
    if (track) {
      if (currentTrack) {
        addToQueue(track);
        showToast('Added to queue');
      } else {
        playTrack(track, [track]);
        showToast('Now playing');
      }
    }
    close();
  };

  const destructiveAction: (() => void) | null = useMemo(() => {
    if (!track) {
      return null;
    }
    if (isLiked(track.id)) {
      return () => {
        toggleLike(track);
        showToast('Removed from Liked Songs');
        close();
      };
    }
    if (playlistId) {
      return () => {
        removeTrackFromPlaylist(playlistId, track.id);
        showToast('Removed from playlist');
        close();
      };
    }
    return null;
  }, [track, playlistId, isLiked, toggleLike, removeTrackFromPlaylist, showToast]);

  const handleReplace = async (original: Track, replacement: Track) => {
    const replaced = { ...replacement, id: original.id };
    try {
      await replaceTrack(original.id, replaced);
    } catch (error) {
      console.warn('[track-actions] Replace failed.', error);
      showToast('Could not replace track');
      return;
    }
    close();
    showToast('Track replaced');
    await replaceTrackInSession(replaced).catch((error) =>
      console.warn('[track-actions] Could not update playback session.', error)
    );
  };

  const value = useMemo<TrackActionsValue>(() => ({ openTrack, showToast }), [openTrack, showToast]);

  return (
    <TrackActionsContext.Provider value={value}>
      {children}
      {track && view === 'options' ? (
        <TrackActionsSheet
          track={track}
          onClose={close}
          onPlayNext={playNextTrack}
          onAddToQueue={addTrackToQueue}
          onReplace={() => setView('replace')}
          destructiveAction={destructiveAction}
          destructiveLabel={
            track && isLiked(track.id)
              ? 'Unlike'
              : playlistId
              ? 'Remove from playlist'
              : 'Remove'
          }
        />
      ) : null}
      {track && view === 'replace' ? (
        <ReplaceTrackModal track={track} onClose={close} onSelect={handleReplace} />
      ) : null}
      {feedback ? (
        <View style={styles.toastOverlay} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.toast,
              {
                bottom: Math.max(insets.bottom, 12) + 58 + 8 + 64 + 12,
                opacity: feedbackOpacity,
                transform: [{ translateY: feedbackTranslate }],
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={18} color={Color.accent} />
            <Text style={styles.toastText}>{feedback}</Text>
          </Animated.View>
        </View>
      ) : null}
    </TrackActionsContext.Provider>
  );
}

export function useTrackActions(): TrackActionsValue {
  const context = useContext(TrackActionsContext);
  if (!context) {
    throw new Error('useTrackActions must be used within a TrackActionsProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  toastOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#191A20',
    borderWidth: 1,
    borderColor: '#23252B',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    elevation: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    color: Color.textPrimary,
  },
});