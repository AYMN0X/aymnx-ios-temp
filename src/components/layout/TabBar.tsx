import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, RefObject } from 'react';
import { BlurView } from 'expo-blur';
import { Home, User } from 'lucide-react-native';
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
import Svg, { Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TAB_BAR_HEIGHT = 49;
export const TAB_BAR_BOTTOM_GAP = 12;

const LABEL_ACTIVE = '#FFFFFF';
const LABEL_INACTIVE = '#8E8E93';
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

const LibraryIcon = ({ color, size = TAB_ICON_SIZE }: { color: string; size?: number }) => (
  <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <Rect fill={color} height="16" rx="1.6" width="3.2" x="4" y="4" />
    <Rect fill={color} height="16" rx="1.6" width="3.2" x="10.4" y="4" />
    <Rect
      fill={color}
      height="15.5"
      rx="1.6"
      transform="rotate(18 17 4.5)"
      width="3.2"
      x="17"
      y="4.5"
    />
  </Svg>
);

interface TabConfig {
  key: string;
  label: string;
  icon: ComponentType<{ color: string; size?: number; strokeWidth?: number }>;
}

const TABS: TabConfig[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'library', label: 'Library', icon: LibraryIcon },
  { key: 'profile', label: 'Account', icon: User },
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
  const tabWidth = barWidth / TAB_KEYS.length;
  const indicatorWidth = Math.max(tabWidth - INDICATOR_HORIZONTAL_INSET, 0);
  const pillOffset = Math.max((tabWidth - indicatorWidth) / 2, 0);
  const minIndicatorX = pillOffset;
  const maxIndicatorX = Math.max(barWidth - indicatorWidth - pillOffset, pillOffset);

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
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { width: indicatorWidth }, indicatorAnimatedStyle]}
        />
        <View style={styles.tabs}>
          {TABS.map((tab) => {
            const isActive = active === tab.key;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.key}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
                style={({ pressed }) => [
                  styles.tabItem,
                  pressed && styles.tabItemPressed,
                ]}
                onPress={() => handleTabPress(tab.key)}
              >
                <Icon
                  size={TAB_ICON_SIZE}
                  color={isActive ? LABEL_ACTIVE : LABEL_INACTIVE}
                  strokeWidth={isActive ? 2.2 : 1.9}
                />
                <Text
                  style={[styles.tabLabel, isActive && styles.tabLabelActive]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
    zIndex: 0,
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
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: LABEL_INACTIVE,
  },
  tabLabelActive: {
    color: LABEL_ACTIVE,
  },
});