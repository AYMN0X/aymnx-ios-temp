import type { ComponentType } from 'react';
import { Bell, Heart, Home, Search, User } from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../theme/appTheme';

export const TAB_BAR_HEIGHT = 58;
export const TAB_BAR_BOTTOM_GAP = 12;

interface TabConfig {
  key: string;
  label: string;
  icon: ComponentType<LucideProps>;
}

const TABS: TabConfig[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'heart', label: 'Heart', icon: Heart },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'bell', label: 'Bell', icon: Bell },
  { key: 'profile', label: 'Profile', icon: User },
];

interface TabBarProps {
  active: string;
  onChange: (tabKey: string, wasActive: boolean) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.shell,
        { bottom: Math.max(insets.bottom, TAB_BAR_BOTTOM_GAP) },
      ]}
    >
      <View style={styles.capsule}>
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
              style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
              onPress={() => onChange(tab.key, isActive)}
            >
              <Icon
                size={24}
                color={isActive ? COLORS.white : COLORS.tabInactive}
                strokeWidth={isActive ? 2.4 : 2}
              />
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
    borderRadius: 29,
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
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: 29,
    overflow: 'hidden',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemPressed: {
    opacity: 0.7,
  },
});