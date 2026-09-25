import * as React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  Extrapolate,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { usePlayer, useProgress } from '../../context/PlayerContext';
import {
  findActiveLineIndex,
  getLyrics,
  type LyricLine,
  type LyricsResult,
} from '../../services/lyrics';
import type { Track } from '../../types/music';

// Depth-of-field ramp keyed on distance from the active line.
const DEPTH_INPUT = [0, 1, 2, 3];
const DEPTH_OPACITY = [1, 0.62, 0.32, 0.12];
const DEPTH_SCALE = [1.04, 1, 0.98, 0.96];
// React Native has no per-Text blur filter, so defocus is faked with a
// background-coloured text shadow whose radius grows with distance. On the dark
// player background this reads as a genuine blur and dissolves far lines away.
const DEPTH_BLUR = [0, 1.5, 3.5, 7];
const DEPTH_COLOR = ['#FFFFFF', '#F1F5F4', '#C4CECC', '#8B9493'];
const DEPTH_SHADOW = 'rgba(11, 16, 16, 0.95)';
// Rows this close to the focus animate their vertical spacing; the rest keep a
// constant margin so the transition does not relayout the whole list.
const SPACING_FOCUS_RANGE = 2;
const ACTIVE_MARGIN = 20;
const BASE_MARGIN = 10;
// Used before the first line starts, so the list stays legible while idle.
const UNFOCUSED_OPACITY = 0.45;
const UNSYNCED_OPACITY = 0.6;
const UNSYNCED_COLOR = 'rgba(255, 255, 255, 0.6)';
const LINE_SPACING = 26;
// After a manual drag, hold auto-scroll off long enough to let the user read.
const USER_SCROLL_PAUSE_MS = 2600;
const DEPTH_TRANSITION = { duration: 260, easing: Easing.out(Easing.quad) } as const;

const tapHaptic = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
};

interface LyricRowProps {
  line: LyricLine;
  index: number;
  focus: SharedValue<number>;
  synced: boolean;
  onPressLine: (line: LyricLine) => void;
  onMeasure: (index: number, y: number, height: number) => void;
}

const LyricRow = React.memo(
  ({ line, index, focus, synced, onPressLine, onMeasure }: LyricRowProps) => {
    const animatedStyle = useAnimatedStyle(() => {
      // Every branch returns the full property set, otherwise a prop left out of
      // one branch keeps its stale animated value when the state changes.
      if (!synced) {
        return {
          marginVertical: BASE_MARGIN,
          opacity: UNSYNCED_OPACITY,
          color: UNSYNCED_COLOR,
          textShadowRadius: 0,
          transform: [{ scale: 1 }],
        };
      }
      const focusIndex = focus.value;
      if (focusIndex < 0) {
        return {
          marginVertical: BASE_MARGIN,
          opacity: UNFOCUSED_OPACITY,
          color: UNSYNCED_COLOR,
          textShadowRadius: 0,
          transform: [{ scale: 1 }],
        };
      }
      const delta = Math.abs(index - focusIndex);
      const nearFocus = delta <= SPACING_FOCUS_RANGE;
      return {
        marginVertical: withTiming(
          nearFocus && delta === 0 ? ACTIVE_MARGIN : BASE_MARGIN,
          DEPTH_TRANSITION
        ),
        opacity: withTiming(
          interpolate(delta, DEPTH_INPUT, DEPTH_OPACITY, Extrapolate.CLAMP),
          DEPTH_TRANSITION
        ),
        color: withTiming(interpolateColor(delta, DEPTH_INPUT, DEPTH_COLOR), DEPTH_TRANSITION),
        textShadowRadius: withTiming(
          interpolate(delta, DEPTH_INPUT, DEPTH_BLUR, Extrapolate.CLAMP),
          DEPTH_TRANSITION
        ),
        transform: [
          {
            scale: withTiming(
              interpolate(delta, DEPTH_INPUT, DEPTH_SCALE, Extrapolate.CLAMP),
              DEPTH_TRANSITION
            ),
          },
        ],
      };
    });

    return (
      <Pressable
        onPress={() => onPressLine(line)}
        disabled={!synced}
        accessibilityRole={synced ? 'button' : 'text'}
        accessibilityLabel={line.text}
        onLayout={(event) =>
          onMeasure(index, event.nativeEvent.layout.y, event.nativeEvent.layout.height)
        }
      >
        <Animated.Text style={[styles.line, animatedStyle]}>{line.text}</Animated.Text>
      </Pressable>
    );
  }
);

LyricRow.displayName = 'LyricRow';

interface LyricsViewProps {
  track: Track | null;
}

const LyricsView: React.FC<LyricsViewProps> = ({ track }) => {
  const { positionMs } = useProgress();
  const { seekTo } = usePlayer();

  const [result, setResult] = React.useState<LyricsResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Single source of truth for the focused line. Styling reads it on the UI
  // thread, so advancing a line never re-renders the rows.
  const focusIndex = useSharedValue(-1);

  const scrollRef = React.useRef<ScrollView>(null);
  const lineLayouts = React.useRef<Record<number, { y: number; height: number }>>({});
  const userScrollingUntil = React.useRef(0);
  const isDragging = React.useRef(false);
  const lastScrolledIndex = React.useRef(-1);

  const trackId = track?.id ?? '';
  // Must be memoised: a fresh `[]` every render would retrigger the active-line
  // effect below on every render while there are no lyrics.
  const lines = React.useMemo(() => result?.lines ?? [], [result]);
  const synced = result?.synced ?? false;

  React.useEffect(() => {
    let cancelled = false;
    lineLayouts.current = {};
    lastScrolledIndex.current = -1;
    focusIndex.value = -1;

    if (!trackId) {
      setResult(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    getLyrics({
      id: trackId,
      title: track?.title,
      artist: track?.artist,
      album: track?.album,
      duration: track?.duration,
    })
      .then((next) => {
        if (!cancelled) {
          setResult(next);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [trackId, track?.title, track?.artist, track?.album, track?.duration, focusIndex]);

  // Binary search the active line. Position updates several times a second, so
  // this must stay O(log n) rather than scanning the whole list.
  React.useEffect(() => {
    focusIndex.value = synced && lines.length > 0 ? findActiveLineIndex(lines, positionMs) : -1;
  }, [synced, lines, positionMs, focusIndex]);

  const scrollToLine = React.useCallback((index: number, animated: boolean) => {
    const layout = lineLayouts.current[index];
    if (!layout) {
      return;
    }
    scrollRef.current?.scrollTo({
      y: Math.max(0, layout.y - layout.height),
      animated,
    });
  }, []);

  const pendingScrollTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  const handleActiveChange = React.useCallback(
    (index: number) => {
      if (!synced || index < 0 || index === lastScrolledIndex.current) {
        return;
      }
      lastScrolledIndex.current = index;
      if (Date.now() < userScrollingUntil.current) {
        return;
      }
      // Defer so the newly focused row has been measured and re-spaced.
      const timer = setTimeout(() => scrollToLine(index, true), 90);
      pendingScrollTimers.current.push(timer);
    },
    [synced, scrollToLine]
  );

  React.useEffect(
    () => () => {
      pendingScrollTimers.current.forEach(clearTimeout);
      pendingScrollTimers.current = [];
    },
    []
  );

  useAnimatedReaction(
    () => focusIndex.value,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(handleActiveChange)(current);
      }
    },
    [handleActiveChange]
  );

  const handleLinePress = React.useCallback(
    (line: LyricLine) => {
      // Plain lyrics carry no timing, so there is nothing to seek to.
      if (!synced) {
        return;
      }
      tapHaptic();
      lastScrolledIndex.current = -1;
      seekTo(line.timeMs).catch(() => undefined);
    },
    [seekTo, synced]
  );

  const handleMeasure = React.useCallback((index: number, y: number, height: number) => {
    lineLayouts.current[index] = { y, height };
  }, []);

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color="rgba(255,255,255,0.5)" />
          <Text style={styles.statusText}>Loading lyrics</Text>
        </View>
      );
    }
    if (!trackId) {
      return (
        <View style={styles.centered}>
          <Ionicons name="musical-note-outline" size={26} color="rgba(255,255,255,0.22)" />
          <Text style={styles.statusText}>Nothing playing</Text>
        </View>
      );
    }
    if (result?.reason === 'offline') {
      return (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={26} color="rgba(255,255,255,0.22)" />
          <Text style={styles.statusText}>Lyrics need a connection</Text>
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <Ionicons name="text-outline" size={26} color="rgba(255,255,255,0.22)" />
        <Text style={styles.statusText}>No lyrics found</Text>
      </View>
    );
  };

  if (!loading && lines.length === 0) {
    return <View style={styles.container}>{renderEmpty()}</View>;
  }

  return (
    <View style={styles.container}>
      {!synced && lines.length > 0 ? (
        <View style={styles.unsyncedBanner}>
          <Ionicons name="information-circle-outline" size={13} color="rgba(255,255,255,0.5)" />
          <Text style={styles.unsyncedText}>Plain lyrics, not time-synced</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScrollBeginDrag={() => {
          isDragging.current = true;
        }}
        onScrollEndDrag={() => {
          isDragging.current = false;
          userScrollingUntil.current = Date.now() + USER_SCROLL_PAUSE_MS;
        }}
        onMomentumScrollEnd={() => {
          if (isDragging.current) {
            userScrollingUntil.current = Date.now() + USER_SCROLL_PAUSE_MS;
          }
        }}
      >
        {lines.map((line, index) => (
          <LyricRow
            key={`${line.timeMs}-${index}`}
            line={line}
            index={index}
            focus={focusIndex}
            synced={synced}
            onPressLine={handleLinePress}
            onMeasure={handleMeasure}
          />
        ))}
        <View style={styles.tailSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: LINE_SPACING,
  },
  line: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.5,
    // Base colour so a row is never left on the platform default (black) if the
    // animated style has not produced a colour yet.
    color: UNSYNCED_COLOR,
    textShadowColor: DEPTH_SHADOW,
    textShadowOffset: { width: 0, height: 0 },
  },
  tailSpacer: {
    height: 140,
  },
  unsyncedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 10,
  },
  unsyncedText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
  },
});

export default React.memo(LyricsView);
