import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Pause, Play } from 'lucide-react-native';
import { memo, useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, TAB_BAR_BOTTOM_GAP } from './layout/TabBar';
import { usePlayer, useProgress } from '../context/PlayerContext';
import { COLORS } from '../theme/appTheme';

interface MiniPlayerDockProps {
  onOpen: () => void;
}

const DOCK_HEIGHT = 60;
const DOCK_HORIZONTAL_MARGIN = 12;
const DOCK_BOTTOM_GAP = 8;
const ARTWORK_SIZE = 40;
const BUTTON_SIZE = 40;

const DockProgressBar: React.FC = memo(function DockProgressBar() {
  const { positionMs, durationMs } = useProgress();
  const progress = durationMs > 0 ? Math.min(Math.max(positionMs / durationMs, 0), 1) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
    </View>
  );
});

export function MiniPlayerDock({ onOpen }: MiniPlayerDockProps) {
  const insets = useSafeAreaInsets();
  const { currentTrack, isPlaying, togglePlayPause } = usePlayer();

  const hasTrack = Boolean(currentTrack);

  const entrance = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    if (!hasTrack) {
      return;
    }
    entrance.value = 0;
    entrance.value = withSpring(1, { damping: 18, stiffness: 140, mass: 0.9 });
  }, [entrance, hasTrack]);

  const dockAnimatedStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: (1 - entrance.value) * 28 },
      { scale: 0.96 + entrance.value * 0.04 },
    ],
  }));

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const tapHaptic = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    tapHaptic();
    togglePlayPause();
  }, [tapHaptic, togglePlayPause]);

  if (!currentTrack) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.dock,
        { bottom: Math.max(insets.bottom, TAB_BAR_BOTTOM_GAP) + TAB_BAR_HEIGHT + DOCK_BOTTOM_GAP },
        dockAnimatedStyle,
      ]}
    >
      <View style={styles.dockCard}>
        <View style={styles.dockRow}>
          <Pressable
            style={styles.openArea}
            onPress={onOpen}
            onPressIn={() => {
              pressScale.value = withSpring(0.98, { damping: 20, stiffness: 320 });
            }}
            onPressOut={() => {
              pressScale.value = withSpring(1, { damping: 20, stiffness: 320 });
            }}
            android_ripple={{ color: 'rgba(255, 255, 255, 0.04)' }}
          >
            <Animated.View style={[styles.openAreaInner, pressAnimatedStyle]}>
              {currentTrack.artwork ? (
                <Image
                  source={currentTrack.artwork}
                  style={styles.artwork}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={currentTrack.id}
                  transition={150}
                />
              ) : (
                <View style={[styles.artwork, styles.artworkFallback]} />
              )}
              <View style={styles.meta}>
                <Text style={styles.nowPlaying}>Now Playing</Text>
                <Text style={styles.title} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
              </View>
            </Animated.View>
          </Pressable>

          <View style={styles.controls}>
            <Pressable
              onPress={handlePlayPause}
              hitSlop={12}
              style={({ pressed }) => [styles.playButton, pressed && styles.playPressed]}
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
        </View>
        <DockProgressBar />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: DOCK_HORIZONTAL_MARGIN,
    right: DOCK_HORIZONTAL_MARGIN,
    height: DOCK_HEIGHT,
    zIndex: 999,
    elevation: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
  },
  dockCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#181C1C',
    overflow: 'hidden',
  },
  dockRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  openArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  openAreaInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 8,
    backgroundColor: COLORS.card,
  },
  artworkFallback: {
    backgroundColor: COLORS.cardPress,
  },
  meta: {
    flex: 1,
    marginLeft: 10,
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
  controls: {
    paddingLeft: 6,
  },
  playButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
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
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.green,
  },
});