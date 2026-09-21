import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Pause, Play, SkipForward } from 'lucide-react-native';
import { memo, useCallback, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, TAB_BAR_BOTTOM_GAP } from './layout/TabBar';
import { usePlayer, useProgress } from '../context/PlayerContext';

interface MiniPlayerDockProps {
  onOpen: () => void;
}

const DOCK_HEIGHT = 64;
const DOCK_HORIZONTAL_MARGIN = 12;
const DOCK_BOTTOM_GAP = 8;
const ARTWORK_SIZE = 44;
const BUTTON_SIZE = 36;

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
  const { currentTrack, isPlaying, playbackError, togglePlayPause, playNext } = usePlayer();

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

  const handleNext = useCallback(() => {
    tapHaptic();
    playNext();
  }, [tapHaptic, playNext]);

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
        <View style={styles.base} />
        <BlurView
          intensity={75}
          tint="systemUltraThinMaterialDark"
          style={StyleSheet.absoluteFill}
        />
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
                <Text style={styles.title} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                <Text style={styles.artist} numberOfLines={1}>
                  {playbackError || currentTrack.artist}
                </Text>
              </View>
            </Animated.View>
          </Pressable>

          <View style={styles.controls}>
            <Pressable
              onPress={handlePlayPause}
              hitSlop={12}
              style={styles.playButton}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause size={20} color="#FFFFFF" fill="#FFFFFF" />
              ) : (
                <Play size={20} color="#FFFFFF" fill="#FFFFFF" style={styles.playIcon} />
              )}
            </Pressable>
            <Pressable
              onPress={handleNext}
              hitSlop={12}
              style={styles.nextButton}
              accessibilityRole="button"
              accessibilityLabel="Next track"
            >
              <SkipForward size={22} color="#FFFFFF" fill="#FFFFFF" />
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
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  base: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18, 19, 23, 0.78)',
  },
  dockRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
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
    backgroundColor: '#23252B',
  },
  artworkFallback: {
    backgroundColor: '#23252B',
  },
  meta: {
    flex: 1,
    marginLeft: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  artist: {
    color: '#949BA4',
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  playButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: '#E94B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    marginLeft: 1,
  },
  nextButton: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E94B35',
  },
});