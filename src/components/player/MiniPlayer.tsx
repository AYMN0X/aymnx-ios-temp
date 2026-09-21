import { Pause, Play } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayer, useProgress } from '../../context/PlayerContext';
import { COLORS } from '../../theme/appTheme';
import { TAB_BAR_BOTTOM_GAP, TAB_BAR_HEIGHT } from '../layout/TabBar';

const BUTTON_SIZE = 40;
const RING_STROKE = 3;
const RING_RADIUS = (BUTTON_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_CENTER = BUTTON_SIZE / 2;

interface MiniPlayerProps {
  onOpen: () => void;
}

export function MiniPlayer({ onOpen }: MiniPlayerProps) {
  const insets = useSafeAreaInsets();
  const { currentTrack, isPlaying, togglePlayPause } = usePlayer();
  const { positionMs, durationMs } = useProgress();
  const progress = durationMs > 0 ? Math.min(Math.max(positionMs / durationMs, 0), 1) : 0;

  if (!currentTrack) {
    return null;
  }

  return (
    <View
      style={[
        styles.miniPlayer,
        { bottom: Math.max(insets.bottom, TAB_BAR_BOTTOM_GAP) + TAB_BAR_HEIGHT + 8 },
      ]}
    >
      <Pressable style={styles.main} onPress={onOpen}>
        {currentTrack.artwork ? (
          <Image source={{ uri: currentTrack.artwork }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]} />
        )}
        <View style={styles.info}>
          <Text style={styles.nowPlaying}>Now Playing</Text>
          <Text style={styles.title} numberOfLines={1}>
            {currentTrack.title}
          </Text>
        </View>
      </Pressable>
      <View style={styles.playWrap}>
        <Svg width={BUTTON_SIZE} height={BUTTON_SIZE} style={styles.playRing}>
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            stroke={COLORS.green}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
          />
        </Svg>
        <Pressable
          style={({ pressed }) => [styles.playButton, pressed && styles.playPressed]}
          onPress={togglePlayPause}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={20} color={COLORS.white} fill={COLORS.white} />
          ) : (
            <Play size={20} color={COLORS.white} fill={COLORS.white} style={styles.playIcon} />
          )}
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  miniPlayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 60,
    backgroundColor: '#181C1C',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    overflow: 'hidden',
    zIndex: 999,
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.card,
  },
  artworkFallback: {
    backgroundColor: COLORS.cardPress,
  },
  info: {
    flex: 1,
    paddingLeft: 10,
    gap: 2,
  },
  nowPlaying: {
    color: '#828B84',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  title: {
    color: '#F0F3F1',
    fontSize: 13,
    fontWeight: '600',
  },
  playWrap: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  playRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPressed: {
    opacity: 0.7,
  },
  playIcon: {
    marginLeft: 1.5,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 1,
  },
  progressFill: {
    height: 2,
    backgroundColor: COLORS.green,
    borderRadius: 1,
  },
});