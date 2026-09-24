import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Home, User } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../theme/appTheme';

export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_BOTTOM_GAP = 12;

const LABEL_ACTIVE = '#FFFFFF';
const LABEL_INACTIVE = '#8E8E93';
const PILL_PADDING = 2;

const ACTIVE_INDEX: Record<string, number> = {
  home: 0,
  library: 1,
  profile: 2,
};

const LibraryIcon = ({ color, size = 24 }: { color: string; size?: number }) => (
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

interface TabBarProps {
  active: string;
  onChange: (tabKey: string, wasActive: boolean) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const tabIndicator = useRef(new Animated.Value(ACTIVE_INDEX[active] ?? 0)).current;

  useEffect(() => {
    const index = ACTIVE_INDEX[active] ?? 0;
    Animated.spring(tabIndicator, {
      toValue: index,
      stiffness: 260,
      damping: 22,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [active, tabIndicator]);

  const contentWidth = Math.max(tabBarWidth - PILL_PADDING * 2, 0);
  const tabWidth = contentWidth / TABS.length;

  const translateX = tabIndicator.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [
      PILL_PADDING,
      PILL_PADDING + tabWidth,
      PILL_PADDING + tabWidth * 2,
    ],
  });

  return (
    <View
      style={[
        styles.shell,
        { bottom: Math.max(insets.bottom, TAB_BAR_BOTTOM_GAP) },
      ]}
    >
      <View
        style={styles.capsule}
        onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}
      >
        {tabBarWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.slidingPill, { width: tabWidth, transform: [{ translateX }] }]}
          />
        )}
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
              onPress={() => onChange(tab.key, isActive)}
            >
              <Icon
                size={24}
                color={isActive ? LABEL_ACTIVE : LABEL_INACTIVE}
                strokeWidth={isActive ? 2.4 : 2}
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
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignSelf: 'center',
    height: TAB_BAR_HEIGHT,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: '#171B1B',
    zIndex: 1000,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 30,
    overflow: 'hidden',
    position: 'relative',
  },
  slidingPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 0,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 2,
    zIndex: 1,
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: LABEL_INACTIVE,
  },
  tabLabelActive: {
    color: LABEL_ACTIVE,
  },
});