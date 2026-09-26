import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, RefObject } from 'react';
import { BlurView } from 'expo-blur';
import { Home } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TAB_BAR_HEIGHT = 49;
export const TAB_BAR_BOTTOM_GAP = 12;

const LABEL_ACTIVE = '#FFFFFF';
const LABEL_INACTIVE = 'rgba(255, 255, 255, 0.55)';
const TAB_ICON_SIZE = 21;
const TRACK_BORDER_WIDTH = 0.5;
const INDICATOR_VERTICAL_INSET = 3;
const INDICATOR_TOP = INDICATOR_VERTICAL_INSET;
const INDICATOR_HEIGHT =
  TAB_BAR_HEIGHT - TRACK_BORDER_WIDTH * 2 - INDICATOR_VERTICAL_INSET * 2;
const INDICATOR_RADIUS = INDICATOR_HEIGHT / 2;
const INDICATOR_HORIZONTAL_INSET = 6;

const ACTIVE_INDEX: Record<string, number> = {
  home: 0,
  library: 1,
  profile: 2,
};

const LIBRARY_STROKE_WIDTH = 1.7;

// Both variants stroke at the same weight so the filled glyph's outer edge lands
// exactly on the base outline's outer edge; a thinner filled stroke would let the
// semi-transparent base fringe leak around the perimeter inside the mask.
const LibraryIcon = ({
  color,
  size = TAB_ICON_SIZE,
  filled = true,
}: {
  color: string;
  size?: number;
  filled?: boolean;
}) => (
  <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <Rect
      fill={filled ? color : 'none'}
      height="16"
      rx="1.6"
      stroke={color}
      strokeWidth={LIBRARY_STROKE_WIDTH}
      width="3.2"
      x="4"
      y="4"
    />
    <Rect
      fill={filled ? color : 'none'}
      height="16"
      rx="1.6"
      stroke={color}
      strokeWidth={LIBRARY_STROKE_WIDTH}
      width="3.2"
      x="10.4"
      y="4"
    />
    <Rect
      fill={filled ? color : 'none'}
      height="15.5"
      rx="1.6"
      stroke={color}
      strokeWidth={LIBRARY_STROKE_WIDTH}
      transform="rotate(18 17 4.5)"
      width="3.2"
      x="17"
      y="4.5"
    />
  </Svg>
);

interface GlyphProps {
  color: string;
  size?: number;
}

const HomeOutline = (props: GlyphProps) => <Home {...props} strokeWidth={1.8} />;
const HomeFilled = (props: GlyphProps) => (
  <Home {...props} fill={props.color} strokeWidth={1.4} />
);
// Both Account glyphs share one closed torso path so the outline and the solid
// fill register 1:1 inside the sliding mask. Baseline sits at y=23, close to
// the label; the head is lifted to y=6.5 to keep the silhouette balanced.
const ACCOUNT_TORSO_PATH = 'M19 22.5v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2z';
const ACCOUNT_HEAD_CY = 7.5;
const ACCOUNT_STROKE_WIDTH = 1.8;

const UserOutline = ({ color, size = TAB_ICON_SIZE }: GlyphProps) => (
  <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <Circle cx="12" cy={ACCOUNT_HEAD_CY} r="4" stroke={color} strokeWidth={ACCOUNT_STROKE_WIDTH} />
    <Path
      d={ACCOUNT_TORSO_PATH}
      stroke={color}
      strokeLinejoin="round"
      strokeWidth={ACCOUNT_STROKE_WIDTH}
    />
  </Svg>
);
const UserFilled = ({ color, size = TAB_ICON_SIZE }: GlyphProps) => (
  <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <Circle
      cx="12"
      cy={ACCOUNT_HEAD_CY}
      fill={color}
      r="4"
      stroke={color}
      strokeWidth={ACCOUNT_STROKE_WIDTH}
    />
    <Path
      d={ACCOUNT_TORSO_PATH}
      fill={color}
      stroke={color}
      strokeLinejoin="round"
      strokeWidth={ACCOUNT_STROKE_WIDTH}
    />
  </Svg>
);
const LibraryOutline = (props: GlyphProps) => <LibraryIcon {...props} filled={false} />;
const LibraryFilled = (props: GlyphProps) => <LibraryIcon {...props} filled />;

interface TabConfig {
  key: string;
  label: string;
  OutlineGlyph: ComponentType<GlyphProps>;
  FilledGlyph: ComponentType<GlyphProps>;
}

const TABS: TabConfig[] = [
  { key: 'home', label: 'Home', OutlineGlyph: HomeOutline, FilledGlyph: HomeFilled },
  { key: 'library', label: 'Library', OutlineGlyph: LibraryOutline, FilledGlyph: LibraryFilled },
  { key: 'profile', label: 'Account', OutlineGlyph: UserOutline, FilledGlyph: UserFilled },
];

const TAB_KEYS = ['home', 'library', 'profile'] as const;

const BAR_SPRING = {
  mass: 0.7,
  damping: 18,
  stiffness: 340,
};

const TOUCH_SPRING = {
  damping: 15,
  stiffness: 220,
};

const DRAG_SPRING = {
  mass: 0.8,
  damping: 18,
  stiffness: 140,
};

const PRESS_SCALE_X = 1.12;
const PRESS_SCALE_Y = 1.3;
const DRAG_VELOCITY_DIVISOR = 1500;
const DRAG_MAX_ELONGATION = 0.25;
const TRAVEL_DURATION = 275;
const SCALE_SETTLE_DURATION = 180;

interface TabBarProps {
  active: string;
  blurTarget?: RefObject<View | null>;
  onChange: (tabKey: string, wasActive: boolean) => void;
}

function TabButton({
  tab,
  isActive,
  onPress,
}: {
  tab: TabConfig;
  isActive: boolean;
  onPress: () => void;
}) {
  const { label, OutlineGlyph } = tab;
  return (
    <Pressable
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
      onPress={onPress}
    >
      <View style={styles.glyph}>
        <OutlineGlyph color={LABEL_INACTIVE} size={TAB_ICON_SIZE} />
      </View>
      <Text style={styles.tabLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function MaskTab({ tab }: { tab: TabConfig }) {
  const { label, FilledGlyph } = tab;
  return (
    <View style={styles.tabItem}>
      <View style={styles.glyph}>
        <FilledGlyph color={LABEL_ACTIVE} size={TAB_ICON_SIZE} />
      </View>
      <Text style={styles.maskLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function TabBar({ active, blurTarget, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const pillScaleX = useSharedValue(1);
  const pillScaleY = useSharedValue(1);
  const barScale = useSharedValue(1);
  const didDrag = useSharedValue(false);
  const tapHandled = useSharedValue(false);
  const didFinalize = useSharedValue(false);
  // The wrapper has a border, so the flex box the tabs actually lay out in is the
  // content box. Everything below must measure against that, not the border box,
  // or the pill and mask row drift off the icons by the border width.
  const contentWidth = Math.max(barWidth - TRACK_BORDER_WIDTH * 2, 0);
  const tabWidth = contentWidth / TAB_KEYS.length;
  const indicatorWidth = Math.max(tabWidth - INDICATOR_HORIZONTAL_INSET, 0);
  const pillOffset = Math.max((tabWidth - indicatorWidth) / 2, 0);
  const minIndicatorX = pillOffset;
  const maxIndicatorX = Math.max(contentWidth - indicatorWidth - pillOffset, pillOffset);

  const indicatorAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: indicatorX.value },
      { scaleX: pillScaleX.value },
      { scaleY: pillScaleY.value },
    ],
  }));

  const barAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: barScale.value }],
  }));

  const maskRowAnimatedStyle = useAnimatedStyle(() => {
    const scaleXValue = pillScaleX.value;
    const scaleYValue = pillScaleY.value;
    // The pill scales about its own centre (indicatorWidth / 2) while maskRow
    // scales about contentWidth / 2. Those origins differ, so the inverse scale
    // needs an origin correction or the row slides as the pill stretches.
    // The two centres already coincide vertically, so Y only needs the inverse.
    const originShiftX = (contentWidth - indicatorWidth) / 2;
    return {
      transform: [
        {
          translateX:
            -indicatorX.value / scaleXValue - originShiftX * (1 - 1 / scaleXValue),
        },
        { scaleX: 1 / scaleXValue },
        { scaleY: 1 / scaleYValue },
      ],
    };
  }, [contentWidth, indicatorWidth]);

  useEffect(() => {
    const activeIndex = ACTIVE_INDEX[active] ?? 0;
    indicatorX.value = withTiming(activeIndex * tabWidth + pillOffset, {
      duration: TRAVEL_DURATION,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
    pillScaleX.value = withTiming(1, { duration: SCALE_SETTLE_DURATION });
    pillScaleY.value = withTiming(1, { duration: SCALE_SETTLE_DURATION });
  }, [active, indicatorX, pillOffset, pillScaleX, pillScaleY, tabWidth]);

  const handleTabPress = (tabKey: string) => {
    if (didDrag.value || didFinalize.value) {
      return;
    }
    tapHandled.value = true;
    const index = ACTIVE_INDEX[tabKey] ?? 0;
    indicatorX.value = withTiming(index * tabWidth + pillOffset, {
      duration: TRAVEL_DURATION,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
    pillScaleX.value = withTiming(1, { duration: SCALE_SETTLE_DURATION });
    pillScaleY.value = withTiming(1, { duration: SCALE_SETTLE_DURATION });
    onChange(tabKey, active === tabKey);
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((event) => {
          didDrag.value = false;
          tapHandled.value = false;
          didFinalize.value = false;
          barScale.value = withSpring(1.03, BAR_SPRING);
          pillScaleX.value = withSpring(PRESS_SCALE_X, TOUCH_SPRING);
          pillScaleY.value = withSpring(PRESS_SCALE_Y, TOUCH_SPRING);
          indicatorX.value = withSpring(
            Math.min(
              Math.max(event.x - indicatorWidth / 2, minIndicatorX),
              maxIndicatorX,
            ),
            DRAG_SPRING,
          );
        })
        .onUpdate((event) => {
          if (
            Math.abs(event.translationX) > 2 ||
            Math.abs(event.translationY) > 2
          ) {
            didDrag.value = true;
          }
          pillScaleX.value =
            PRESS_SCALE_X +
            Math.min(Math.abs(event.velocityX) / DRAG_VELOCITY_DIVISOR, DRAG_MAX_ELONGATION);
          indicatorX.value = withSpring(
            Math.min(
              Math.max(event.x - indicatorWidth / 2, minIndicatorX),
              maxIndicatorX,
            ),
            DRAG_SPRING,
          );
        })
        .onFinalize((event) => {
          didFinalize.value = true;
          barScale.value = withSpring(1, BAR_SPRING);
          pillScaleX.value = withTiming(1, { duration: SCALE_SETTLE_DURATION });
          pillScaleY.value = withTiming(1, { duration: SCALE_SETTLE_DURATION });
          const tabSlotWidth = barWidth / TAB_KEYS.length;
          if (tabSlotWidth > 0) {
            const targetIndex = Math.min(
              Math.max(Math.floor(event.x / tabSlotWidth), 0),
              TAB_KEYS.length - 1,
            );
            const targetKey = TAB_KEYS[targetIndex];
            indicatorX.value = withTiming(
              targetIndex * tabSlotWidth + pillOffset,
              {
                duration: TRAVEL_DURATION,
                easing: Easing.bezier(0.25, 1, 0.5, 1),
              },
            );
            if (!tapHandled.value && targetKey) {
              runOnJS(onChange)(targetKey, targetKey === active);
            }
          }
        }),
    [
      active,
      barScale,
      barWidth,
      didDrag,
      didFinalize,
      indicatorWidth,
      indicatorX,
      maxIndicatorX,
      minIndicatorX,
      onChange,
      pillOffset,
      pillScaleX,
      pillScaleY,
      tapHandled,
    ],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.wrapper,
          { bottom: insets.bottom > 0 ? insets.bottom : 12 },
          barAnimatedStyle,
        ]}
      >
        <View pointerEvents="none" style={styles.blurClip}>
          <BlurView
            blurMethod="dimezisBlurView"
            blurTarget={blurTarget}
            intensity={8}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            tint="dark"
          />
        </View>
        <View style={styles.tabs}>
          {TABS.map((tab) => (
            <TabButton
              key={tab.key}
              tab={tab}
              isActive={active === tab.key}
              onPress={() => handleTabPress(tab.key)}
            />
          ))}
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { width: indicatorWidth }, indicatorAnimatedStyle]}
        >
          <Animated.View style={[styles.maskRow, { width: contentWidth }, maskRowAnimatedStyle]}>
            {TABS.map((tab) => (
              <MaskTab key={tab.key} tab={tab} />
            ))}
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    marginHorizontal: 36,
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    backgroundColor: 'rgba(18, 18, 22, 0.65)',
    borderWidth: TRACK_BORDER_WIDTH,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    zIndex: 1000,
    elevation: 8,
  },
  blurClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: TAB_BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: INDICATOR_TOP,
    left: 0,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
    zIndex: 2,
  },
  maskRow: {
    position: 'absolute',
    top: -(INDICATOR_TOP + TRACK_BORDER_WIDTH),
    left: -TRACK_BORDER_WIDTH,
    height: TAB_BAR_HEIGHT - TRACK_BORDER_WIDTH * 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    zIndex: 1,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  glyph: {
    width: TAB_ICON_SIZE,
    height: TAB_ICON_SIZE,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: LABEL_INACTIVE,
  },
  maskLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: LABEL_ACTIVE,
  },
});