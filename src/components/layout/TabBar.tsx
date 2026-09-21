import type { ComponentType } from 'react';
import { Home, Library, Search, User } from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
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
  { key: 'search', label: 'Search', icon: Search },
  { key: 'library', label: 'Library', icon: Library },
  { key: 'create', label: 'AYMNX', icon: User },
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
        <BlurView intensity={75} tint="systemUltraThinMaterialDark" style={styles.blur} />
        <View style={styles.tint} />
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
              {isActive ? (
                <View style={styles.activePill}>
                  <Icon size={24} color="#FFFFFF" strokeWidth={2.4} />
                </View>
              ) : (
                <Icon size={24} color={COLORS.tabInactive} strokeWidth={2} />
              )}
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
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'transparent',
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
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  blur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
  },
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 30,
    backgroundColor: 'rgba(18, 19, 23, 0.78)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemPressed: {
    opacity: 0.7,
  },
  activePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
});