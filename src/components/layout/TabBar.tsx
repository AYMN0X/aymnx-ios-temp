import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, RefObject } from 'react';
import { BlurView } from 'expo-blur';
import { Home, User } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const TAB_BAR_HEIGHT = 50;
export const TAB_BAR_BOTTOM_GAP = 12;

const LABEL_ACTIVE = '#FFFFFF';
const LABEL_INACTIVE = '#8E8E93';
const TAB_ICON_SIZE = 21;
const INDICATOR_TOP = 5;
const INDICATOR_HEIGHT = 40;
const INDICATOR_RADIUS = 20;
const INDICATOR_HORIZONTAL_INSET = 20;

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

const HEAVY_SPRING = {
  mass: 1.6,
  damping: 24,
  stiffness: 110,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

const DRAG_SPRING = {
  mass: 0.8,
  damping: 18,
  stiffness: 140,
};

interface TabBarProps {
  active: string;
  blurTarget?: RefObject<View | null>;
  onChange: (tabKey: string, wasActive: boolean) => void;
}

export function TabBar({ active, blurTarget, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const dragScaleX = useSharedValue(1);
  const dragScaleY = useSharedValue(1);
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
      { scaleX: dragScaleX.value },
      { scaleY: dragScaleY.value },
    ],
  }));

  useEffect(() => {
    const activeIndex = ACTIVE_INDEX[active] ?? 0;
    indicatorX.value = withSpring(activeIndex * tabWidth + pillOffset, HEAVY_SPRING);
  }, [active, indicatorX, pillOffset, tabWidth]);

  const handleTabPress = (tabKey: string) => {
    if (didDrag.value || didFinalize.value) {
      return;
    }
    tapHandled.value = true;
    const index = ACTIVE_INDEX[tabKey] ?? 0;
    indicatorX.value = withSpring(index * tabWidth + pillOffset, HEAVY_SPRING);
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
          dragScaleX.value = withSpring(1.05, HEAVY_SPRING);
          dragScaleY.value = withSpring(0.96, HEAVY_SPRING);
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
          dragScaleX.value = withSpring(1, HEAVY_SPRING);
          dragScaleY.value = withSpring(1, HEAVY_SPRING);
          const tabSlotWidth = barWidth / TAB_KEYS.length;
          if (tabSlotWidth > 0) {
            const targetIndex = Math.min(
              Math.max(Math.floor(event.x / tabSlotWidth), 0),
              TAB_KEYS.length - 1,
            );
            const targetKey = TAB_KEYS[targetIndex];
            indicatorX.value = withSpring(
              targetIndex * tabSlotWidth + pillOffset,
              HEAVY_SPRING,
            );
            if (!tapHandled.value && targetKey) {
              runOnJS(onChange)(targetKey, targetKey === active);
            }
          }
        }),
    [
      active,
      barWidth,
      didDrag,
      didFinalize,
      dragScaleX,
      dragScaleY,
      indicatorWidth,
      indicatorX,
      maxIndicatorX,
      minIndicatorX,
      onChange,
      pillOffset,
      tapHandled,
    ],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.wrapper,
          { bottom: insets.bottom > 0 ? insets.bottom : 12 },
        ]}
      >
        <BlurView
          blurMethod="dimezisBlurView"
          blurTarget={blurTarget}
          intensity={28}
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          tint="systemUltraThinMaterialDark"
        />
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
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    marginHorizontal: 16,
    height: TAB_BAR_HEIGHT,
    borderRadius: 25,
    backgroundColor: 'rgba(20, 20, 24, 0.25)',
    borderTopWidth: 0.8,
    borderTopColor: 'rgba(255, 255, 255, 0.28)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255, 255, 255, 0.12)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    zIndex: 1000,
    elevation: 10,
  },
  indicator: {
    position: 'absolute',
    top: INDICATOR_TOP,
    left: 0,
    height: INDICATOR_HEIGHT,
    borderRadius: INDICATOR_RADIUS,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
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