import * as React from 'react';
import {
  Dimensions,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePlayer, useProgress } from '../../context/PlayerContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const formatTime = (millis: number): string => {
  if (typeof millis !== 'number' || !Number.isFinite(millis) || millis < 0) return '-:--';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${remainingMinutes < 10 ? '0' : ''}${remainingMinutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MIN_BARS = 32;
const MAX_BARS = 60;
const DEFAULT_BARS = 48;
const BAR_MIN_HEIGHT = 8;
const BAR_MAX_HEIGHT = 28;

const buildBarHeights = (seedKey: string, count: number): number[] => {
  let seed = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    seed ^= seedKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const sample = () =>
    BAR_MIN_HEIGHT + Math.round(rand() * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT));

  const half = Math.floor(count / 2);
  const left: number[] = [];
  for (let i = 0; i < half; i += 1) {
    left.push(sample());
  }

  const heights: number[] = [];
  for (let i = 0; i < half; i += 1) {
    heights.push(left[i]);
  }
  if (count % 2 === 1) {
    heights.push(sample());
  }
  for (let i = half - 1; i >= 0; i -= 1) {
    heights.push(left[i]);
  }
  return heights;
};

const scrubHaptic = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
};

const NowPlayingScrubber: React.FC = () => {
  const { positionMs, durationMs } = useProgress();
  const { seekTo, currentTrack } = usePlayer();

  const [barCount, setBarCount] = React.useState(DEFAULT_BARS);

  const barHeights = React.useMemo(
    () => buildBarHeights(currentTrack?.id ?? 'default', barCount),
    [currentTrack?.id, barCount]
  );

  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const [scrubRatio, setScrubRatio] = React.useState(0);
  const waveWidthRef = React.useRef(0);
  const scrubRatioRef = React.useRef(0);
  const scrubbingRef = React.useRef(false);
  const durationRef = React.useRef(durationMs);
  durationRef.current = durationMs;

  const progressRatio =
    durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0;
  const showProgressRatio = isScrubbing
    ? Math.max(0, Math.min(1, scrubRatio))
    : progressRatio;
  const shownPositionMs = isScrubbing ? scrubRatio * (durationMs || 0) : positionMs;

  const ratioFromTouch = (e: GestureResponderEvent): number => {
    const width = waveWidthRef.current > 0 ? waveWidthRef.current : SCREEN_WIDTH * 0.6;
    return Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
  };

  const commitScrub = (apply: boolean) => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubbingRef.current = false;
    setIsScrubbing(false);
    const ratio = scrubRatioRef.current;
    if (apply && seekTo && durationRef.current > 0) {
      seekTo(ratio * durationRef.current).catch(() => undefined);
    }
  };

  const scrubPanResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        scrubHaptic();
        const ratio = ratioFromTouch(e);
        scrubRatioRef.current = ratio;
        scrubbingRef.current = true;
        setIsScrubbing(true);
        setScrubRatio(ratio);
      },
      onPanResponderMove: (e) => {
        const ratio = ratioFromTouch(e);
        scrubRatioRef.current = ratio;
        setScrubRatio(ratio);
      },
      onPanResponderRelease: () => {
        scrubHaptic();
        commitScrub(true);
      },
      onPanResponderTerminate: () => commitScrub(false),
    })
  ).current;

  const handleWaveLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    waveWidthRef.current = width;
    const count = Math.max(
      MIN_BARS,
      Math.min(MAX_BARS, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)))
    );
    setBarCount((prev) => (prev === count ? prev : count));
  };

  return (
    <View style={styles.progressContainer}>
      <Text style={styles.timeText}>{formatTime(shownPositionMs)}</Text>

      <View
        style={styles.waveform}
        hitSlop={{ top: 12, bottom: 12 }}
        onLayout={handleWaveLayout}
        {...scrubPanResponder.panHandlers}
      >
        <View style={styles.barsRow}>
          {barHeights.map((height, index) => {
            const active = index / barHeights.length <= showProgressRatio;
            return (
              <View
                key={index}
                style={[
                  styles.bar,
                  { height },
                  active ? styles.barActive : styles.barInactive,
                ]}
              />
            );
          })}
        </View>
      </View>

      <Text style={[styles.timeText, styles.timeTextRight]}>{formatTime(durationMs)}</Text>
    </View>
  );
};

export default React.memo(NowPlayingScrubber);

const styles = StyleSheet.create({
  progressContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  waveform: {
    flex: 1,
    marginHorizontal: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
  barActive: {
    backgroundColor: '#75AA78',
  },
  barInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  timeText: {
    fontSize: 11,
    color: '#6C7770',
    minWidth: 34,
    fontVariant: ['tabular-nums'],
  },
  timeTextRight: {
    textAlign: 'right',
  },
});