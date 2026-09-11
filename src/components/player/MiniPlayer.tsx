import { Cast, Heart, Pause, Play } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLibrary } from '../../context/LibraryContext';
import { usePlayer } from '../../context/PlayerContext';
import { COLORS, TYPE } from '../../theme/appTheme';

interface MiniPlayerProps {
  onOpen: () => void;
}

export function MiniPlayer({ onOpen }: MiniPlayerProps) {
  const insets = useSafeAreaInsets();
  const {
    currentTrack,
    isPlaying,
    playbackPosition,
    duration,
    playbackError,
    togglePlayPause,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const progress = duration > 0 ? Math.min(Math.max(playbackPosition / duration, 0), 1) : 0;

  if (!currentTrack) {
    return null;
  }

  return (
    <View
      style={[
        styles.miniPlayer,
        { bottom: (49 + insets.bottom) + 8 },
      ]}
    >
      <Pressable style={styles.miniPlayerMain} onPress={onOpen}>
        {currentTrack.artwork ? (
          <Image source={{ uri: currentTrack.artwork }} style={styles.miniPlayerArtwork} />
        ) : (
          <View style={[styles.miniPlayerArtwork, styles.miniPlayerArtworkFallback]} />
        )}
        <View style={styles.miniPlayerInfo}>
          <Text style={styles.miniPlayerTitle} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.miniPlayerArtist} numberOfLines={1}>
            {playbackError || currentTrack.artist}
          </Text>
        </View>
      </Pressable>
      <View style={styles.miniPlayerActions}>
        <Cast size={20} color={COLORS.textSecondary} />
        <Pressable onPress={() => toggleLike(currentTrack)} hitSlop={8}>
          <Heart
            size={18}
            color={isLiked(currentTrack.id) ? COLORS.accent : COLORS.textSecondary}
            fill={isLiked(currentTrack.id) ? COLORS.accent : 'transparent'}
          />
        </Pressable>
        <Pressable
          style={styles.miniPlayerPlay}
          onPress={togglePlayPause}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isPlaying ? (
            <Pause size={22} color="#FFFFFF" fill="#FFFFFF" />
          ) : (
            <Play size={22} color="#FFFFFF" fill="#FFFFFF" />
          )}
        </Pressable>
      </View>
      <View style={styles.miniProgressTrack}>
        <View style={[styles.miniProgressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  miniPlayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 56,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
    zIndex: 999,
    elevation: 10,
  },
  miniPlayerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniPlayerArtwork: {
    width: 42,
    height: 42,
    borderRadius: 8,
  },
  miniPlayerArtworkFallback: {
    backgroundColor: COLORS.cardPress,
  },
  miniPlayerInfo: {
    flex: 1,
    paddingLeft: 8,
  },
  miniPlayerTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  miniPlayerArtist: {
    ...TYPE.body,
    marginTop: 1,
  },
  miniPlayerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingRight: 12,
  },
  miniPlayerPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    width: '100%',
    backgroundColor: '#23252B',
    borderRadius: 1,
  },
  miniProgressFill: {
    height: 2,
    backgroundColor: COLORS.accent,
    borderRadius: 1,
  },
});