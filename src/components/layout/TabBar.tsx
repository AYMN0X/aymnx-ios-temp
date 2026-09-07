import type { ComponentType } from 'react';
import { Home, Library, Search, User } from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, TYPE } from '../../theme/appTheme';

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
        styles.tabBar,
        { height: 49 + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const Icon = tab.icon;
        return (
          <Pressable
            key={tab.key}
            style={styles.tabItem}
            onPress={() => onChange(tab.key, isActive)}
          >
            <Icon size={24} color={isActive ? COLORS.accent : COLORS.textSecondary} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    backgroundColor: '#121212',
    borderTopWidth: 0.5,
    borderTopColor: '#282828',
    zIndex: 1000,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabLabel: {
    ...TYPE.micro,
    marginTop: 4,
  },
  tabLabelActive: {
    color: COLORS.accent,
  },
});