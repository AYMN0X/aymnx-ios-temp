import { StatusBar } from 'expo-status-bar';
import {
  Activity,
  Heart,
  Home,
  Library,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  SkipBack,
  SkipForward,
  TrendingUp,
  Volume2,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#121212',
  card: '#282828',
  cardHover: '#3E3E3E',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
  chipInactive: '#282828',
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const FILTERS = ['All', 'Music', 'Podcasts'];

const QUICK_ACCESS = [
  { title: 'Liked Songs', icon: Heart },
  { title: 'Daily Mix 1', icon: Radio },
  { title: 'Your Episodes', icon: Mic2 },
  { title: 'Discover Weekly', icon: TrendingUp },
];

const carouselData = (prefix, count) => {
  const colors = ['#8D67AB', '#E13300', '#27856A', '#503750', '#D84000', '#C39687', '#7358FF'];
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: `${prefix} ${i + 1}`,
    subtitle: 'Playlist · Spotify',
    color: colors[i % colors.length],
  }));
};

const PLAYLISTS = carouselData('Chill Vibes', 8);
const ALBUMS = carouselData('Album', 8);
const PODCASTS = carouselData('Podcast', 8);

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Card({ item }) {
  return (
    <Pressable style={styles.card}>
      <View style={[styles.cardArtwork, { backgroundColor: item.color }]} />
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.cardSubtitle} numberOfLines={2}>
        {item.subtitle}
      </Text>
    </Pressable>
  );
}

function HorizontalRow({ title, data }) {
  return (
    <View style={styles.rowSection}>
      <SectionTitle title={title} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
      >
        {data.map((item) => (
          <Card key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

function FilterChips({ active, onChange }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {FILTERS.map((filter) => {
        const selected = active === filter;
        return (
          <Pressable
            key={filter}
            onPress={() => onChange(filter)}
            style={[styles.chip, selected && styles.chipActive]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{filter}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function MiniPlayer() {
  return (
    <View style={styles.miniPlayer}>
      <View style={styles.miniPlayerArtwork} />
      <View style={styles.miniPlayerInfo}>
        <Text style={styles.miniPlayerTitle} numberOfLines={1}>
          Lost in the White
        </Text>
        <Text style={styles.miniPlayerArtist} numberOfLines={1}>
          Chromatic Flow
        </Text>
      </View>
      <View style={styles.miniPlayerControls}>
        <Pressable>
          <SkipBack size={20} color={COLORS.white} />
        </Pressable>
        <Pressable style={styles.miniPlayerPlay}>
          <Play size={20} color="#121212" fill="#121212" />
        </Pressable>
        <Pressable>
          <SkipForward size={20} color={COLORS.white} />
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [quickAccess] = useState(QUICK_ACCESS);
  const { height } = useWindowDimensions();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.container}>
          <FlatList
            data={quickAccess}
            keyExtractor={(item) => item.title}
            numColumns={2}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View>
                <View style={styles.header}>
                  <Text style={styles.greeting}>{greeting()}</Text>
                  <Pressable style={styles.userAvatar}>
                    <Text style={styles.avatarLetter}>S</Text>
                  </Pressable>
                </View>
                <FilterChips active={activeFilter} onChange={setActiveFilter} />
                <SectionTitle title="Your quick picks" />
              </View>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.quickCard}>
                <View style={styles.quickIconWrap}>
                  <item.icon size={18} color={COLORS.white} strokeWidth={2} />
                </View>
                <Text style={styles.quickTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
            )}
            ListFooterComponent={
              <View>
                <HorizontalRow title="Made for you" data={PLAYLISTS} />
                <HorizontalRow title="Popular albums" data={ALBUMS} />
                <HorizontalRow title="Podcasts to try" data={PODCASTS} />
                <View style={styles.bottomSpacer} />
              </View>
            }
          />
          <MiniPlayer />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  greeting: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  avatarLetter: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  chipRow: {
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.chipInactive,
  },
  chipActive: {
    backgroundColor: COLORS.white,
  },
  chipText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#121212',
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  gridRow: {
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  quickCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 8,
  },
  quickIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  rowSection: {
    marginTop: 20,
  },
  rowContent: {
    paddingRight: 16,
    gap: 14,
  },
  card: {
    width: 140,
  },
  cardArtwork: {
    width: 140,
    height: 140,
    borderRadius: 8,
    marginBottom: 8,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
  },
  miniPlayerArtwork: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: '#7358FF',
  },
  miniPlayerInfo: {
    flex: 1,
  },
  miniPlayerTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  miniPlayerArtist: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  miniPlayerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  miniPlayerPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSpacer: {
    height: 40,
  },
});
