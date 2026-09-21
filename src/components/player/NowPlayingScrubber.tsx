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
import { Color } from '../../theme/GlobalStyles';
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

const scrubHaptic = () => {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
};

const NowPlayingScrubber: React.FC = () => {
  const { positionMs, durationMs } = useProgress();
  const { seekTo } = usePlayer();

  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const [scrubRatio, setScrubRatio] = React.useState(0);
  const barWidthRef = React.useRef(0);
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

  const remainingMs =
    durationMs > 0 ? Math.max(0, durationMs - shownPositionMs) : Number.POSITIVE_INFINITY;

  const ratioFromTouch = (e: GestureResponderEvent): number => {
    const width = barWidthRef.current > 0 ? barWidthRef.current : SCREEN_WIDTH * 0.86;
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

  return (
    <View style={styles.progressContainer}>
      <View
        style={styles.progressTouchArea}
        hitSlop={{ top: 16, bottom: 16, left: 12, right: 12 }}
        {...scrubPanResponder.panHandlers}
        onLayout={(e: LayoutChangeEvent) => {
          barWidthRef.current = e.nativeEvent.layout.width;
        }}
      >
        <View style={styles.progressBarTrack}>
          <View style={[styles.progressBarFill, { width: `${showProgressRatio * 100}%` }]} />
        </View>
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(shownPositionMs)}</Text>
        <Text style={styles.timeText}>
          {Number.isFinite(remainingMs) ? `-${formatTime(remainingMs)}` : formatTime(durationMs)}
        </Text>
      </View>
    </View>
  );
};

export default React.memo(NowPlayingScrubber);

const styles = StyleSheet.create({
  progressContainer: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
    marginVertical: 24,
  },
  progressTouchArea: {
    width: '100%',
    height: 44,
    justifyContent: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Color.accent,
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  timeText: {
    fontSize: 12,
    color: Color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});