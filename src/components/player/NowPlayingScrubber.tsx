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
// Hard floor so a bar can never collapse into an invisible flat dot, and the
// peak height for a fully loud bar.
const BAR_MIN_HEIGHT = 4;
const BAR_MAX_HEIGHT = 28;
const WAVEFORM_HEIGHT = 44;

// mulberry32. Always yields [0, 1) and never depends on the sign of the state,
// unlike the previous `Math.imul`-seeded LCG.
const createRandom = (seedKey: string): (() => number) => {
  let seed = 2166136261 >>> 0;
  for (let i = 0; i < seedKey.length; i += 1) {
    seed ^= seedKey.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Unsigned by construction, so unlike the original seeded LCG it can never
// produce a negative state. Decorrelated from createRandom via a different
// basis so the fallback shape is independent of the main curve.
const hashString = (value: string): number => {
  let hash = 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash ^ value.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

const easeInOut = (t: number): number => t * t * (3 - 2 * t);

interface SectionArchetype {
  level: number;
  ramp: number;
  burst: number;
  dip: number;
}

const SECTION_ARCHETYPES: Record<string, SectionArchetype> = {
  intro: { level: 0.42, ramp: 0.35, burst: 0.12, dip: 0 },
  verse: { level: 0.6, ramp: 0.22, burst: 0.18, dip: 0.08 },
  build: { level: 0.52, ramp: 0.95, burst: 0.32, dip: 0 },
  chorus: { level: 0.94, ramp: 0.3, burst: 0.55, dip: 0.22 },
  breakdown: { level: 0.3, ramp: 0.1, burst: 0.06, dip: 0 },
  bridge: { level: 0.5, ramp: 0.15, burst: 0.1, dip: 0.05 },
  outro: { level: 0.4, ramp: -0.5, burst: 0.1, dip: 0 },
};

// Degenerate-seed guard. Still per-track (skewed peak + ripple phase), so even
// this path never renders as the same curve for every song.
const buildFallbackAmplitudes = (seedKey: string, count: number): number[] => {
  const hash = hashString(seedKey || 'default');
  const skew = 0.6 + (hash % 900) / 1000;
  const phase = ((hash >>> 9) % 1000) / 1000;
  const cycles = 2 + (hash % 3);
  const amplitudes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const body = Math.sin(Math.PI * Math.pow(t, skew)) * 0.78 + 0.22;
    const ripple = 0.82 + 0.18 * Math.sin(t * Math.PI * cycles + phase * Math.PI * 2);
    amplitudes.push(Math.max(0, body * ripple));
  }
  return amplitudes;
};

// Builds a per-track musical profile: an ordered run of sections (intro, verse,
// build, chorus, breakdown, outro) whose levels, build-up ramps, boundary
// transients and internal dropouts are all seeded from the track id. The result
// is intentionally NOT mirrored, so the loudest region lands in a different
// place for every track and no two songs share an envelope.
const buildBarAmplitudes = (seedKey: string, count: number): number[] => {
  if (count <= 0) {
    return [];
  }
  const rand = createRandom(seedKey || 'default');

  const interiorCount = 2 + Math.floor(rand() * 5);
  const pool = ['verse', 'build', 'chorus', 'breakdown', 'verse', 'chorus', 'build', 'bridge'];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const swap = Math.floor(rand() * (i + 1));
    const held = pool[i];
    pool[i] = pool[swap];
    pool[swap] = held;
  }
  const order = ['intro'];
  for (let i = 0; i < interiorCount; i += 1) {
    order.push(pool[i % pool.length]);
  }
  order.push('outro');

  const sections = order.map((type) => {
    const base = SECTION_ARCHETYPES[type];
    return {
      level: Math.max(0.08, base.level * (0.88 + rand() * 0.24)),
      ramp: base.ramp * (0.85 + rand() * 0.3),
      burst: base.burst * (0.7 + rand() * 0.6),
      dip: base.dip * (0.6 + rand() * 0.8),
      dipAt: 0.25 + rand() * 0.4,
    };
  });

  // Per-track mastering level and a skewed global taper, so the overall peak
  // position is off-centre rather than fixed at the midpoint.
  const master = 0.85 + rand() * 0.3;
  const skew = 0.7 + rand() * 0.7;

  const amplitudes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const scaled = t * sections.length;
    const index = Math.min(sections.length - 1, Math.floor(scaled));
    const section = sections[index];
    const progress = Math.min(1, Math.max(0, scaled - index));

    let energy = section.level * (1 + section.ramp * (easeInOut(progress) - 1));

    if (section.dip > 0) {
      const distance = (progress - section.dipAt) / 0.1;
      if (distance < 1) {
        const falloff = 1 - distance * distance;
        energy *= 1 - section.dip * falloff;
      }
    }
    if (progress < 0.12) {
      const decay = 1 - progress / 0.12;
      energy *= 1 + section.burst * decay * decay;
    }

    const taper = Math.sin(Math.PI * Math.pow(t, skew)) * 0.34 + 0.66;
    const detail = 0.78 + rand() * 0.44;
    amplitudes.push(Math.max(0, energy * taper * detail * master));
  }

  const peak = amplitudes.reduce((max, amp) => (amp > max ? amp : max), 0);
  if (!Number.isFinite(peak) || peak <= 0) {
    return buildFallbackAmplitudes(seedKey, count);
  }
  return amplitudes;
};

const normalizeBarHeights = (amplitudes: number[]): number[] => {
  const finite = amplitudes
    .filter((amp) => Number.isFinite(amp) && amp > 0)
    .sort((a, b) => a - b);
  if (finite.length === 0) {
    return amplitudes.map(() => BAR_MIN_HEIGHT);
  }
  // Reference a high percentile instead of the absolute peak. A single
  // transient spike would otherwise dominate the divisor and crush every other
  // bar down onto the minimum height, which reads as a flat line.
  const percentile = finite[Math.min(finite.length - 1, Math.floor(finite.length * 0.92))];
  const reference = percentile > 0 ? percentile : finite[finite.length - 1];
  return amplitudes.map((amp) => {
    const safeAmp = Number.isFinite(amp) && amp > 0 ? amp : 0;
    const scaled = reference > 0 ? (safeAmp / reference) * BAR_MAX_HEIGHT : BAR_MIN_HEIGHT;
    return Math.max(BAR_MIN_HEIGHT, Math.min(BAR_MAX_HEIGHT, Math.round(scaled)));
  });
};

const buildBarHeights = (seedKey: string, count: number): number[] =>
  normalizeBarHeights(buildBarAmplitudes(seedKey, count));

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

  // Guard the right-hand label independently of useProgress. track.duration is
  // in seconds; durationMs is already in millis. Anything still unusable falls
  // back to 0 so the label renders 0:00 rather than formatTime's '-:--'.
  const trackDurationMs = Number.isFinite(currentTrack?.duration)
    ? (currentTrack?.duration ?? 0) * 1000
    : 0;
  const safeDurationMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : trackDurationMs;

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

      <Text style={[styles.timeText, styles.timeTextRight]}>
        {formatTime(safeDurationMs)}
      </Text>
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
    // Small enough that the fixed-width timers on either side always fit.
    marginHorizontal: 8,
    height: WAVEFORM_HEIGHT,
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
    backgroundColor: '#FFFFFF',
  },
  barInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  timeText: {
    fontSize: 11,
    // Pin the line box so both labels centre identically on every platform
    // instead of tracking the platform's font ascent/descent.
    lineHeight: 14,
    textAlignVertical: 'center',
    // #707070 measured 3.51:1 against the dark ambient backdrop, under the
    // 4.5:1 WCAG AA floor for 11px text, which made this read as missing.
    // 0.65 white lands at ~8.3:1.
    color: 'rgba(255, 255, 255, 0.65)',
    minWidth: 40,
    // Never let the flexing waveform squeeze a timer out of the row.
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
  },
  timeTextRight: {
    minWidth: 44,
    flexShrink: 0,
    textAlign: 'right',
  },
});