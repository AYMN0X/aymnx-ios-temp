import { StatusBar } from 'expo-status-bar';
import {
  Activity,
  Heart,
  Home,
  Library,
  Mic2,
  Pause,
  Play,
  Radio,
  Search,
  TrendingUp,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';
import { searchITunes } from './src/services/musicApi';

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

const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'library', label: 'Your Library', icon: Library },
];

function formatMillis(ms) {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

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

function HomeScreen({ activeFilter, onFilterChange }) {
  return (
    <FlatList
      data={QUICK_ACCESS}
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
          <FilterChips active={activeFilter} onChange={onFilterChange} />
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
  );
}

function TrackRow({ track, onPlay }) {
  return (
    <Pressable style={styles.trackRow} onPress={onPlay}>
      {track.artwork ? (
        <Image source={{ uri: track.artwork }} style={styles.trackArtwork} />
      ) : (
        <View style={styles.trackArtwork} />
      )}
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.trackArtist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      <View style={styles.trackPlay}>
        <Play size={16} color="#121212" fill="#121212" />
      </View>
    </Pressable>
  );
}

function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const { playTrack } = usePlayer();

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const runSearch = async (term) => {
    if (!term.trim()) {
      setResults([]);
      setError('');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const tracks = await searchITunes(term);
      setResults(tracks);
    } catch (e) {
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (text) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 450);
  };

  return (
    <View style={styles.searchContainer}>
      <View style={styles.searchBox}>
        <Search size={16} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleChange}
          placeholder="What do you want to play?"
          placeholderTextColor={COLORS.textSecondary}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
        />
      </View>
      {searching && <Activity size={16} color={COLORS.white} style={styles.searchLoading} />}
      {error ? <Text style={styles.searchError}>{error}</Text> : null}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.searchResults}
        ListHeaderComponent={
          query.trim() !== '' ? <SectionTitle title="Top result" /> : null
        }
        ListEmptyComponent={
          !searching && !error && query.trim() !== '' ? (
            <Text style={styles.searchEmpty}>No results found. Try a different search.</Text>
          ) : null
        }
        renderItem={({ item }) => <TrackRow track={item} onPlay={() => playTrack(item)} />}
      />
    </View>
  );
}

function LibraryScreen() {
  return (
    <View style={styles.libraryScreen}>
      <Text style={styles.libraryTitle}>Your Library</Text>
      <Text style={styles.libraryEmpty}>
        Liked songs and saved music will live here.
      </Text>
    </View>
  );
}

function MiniScrubber({ position, duration, onSeek }) {
  const [width, setWidth] = useState(0);
  const progress = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;

  return (
    <View>
      <Pressable
        style={styles.scrubTrack}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onPress={(event) => {
          if (width > 0 && onSeek) {
            const ratio = Math.min(Math.max(event.nativeEvent.locationX / width, 0), 1);
            onSeek(ratio * duration);
          }
        }}
      >
        <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
      </Pressable>
      <View style={styles.scrubLabels}>
        <Text style={styles.scrubTime}>{formatMillis(position)}</Text>
        <Text style={styles.scrubTime}>{formatMillis(duration)}</Text>
      </View>
    </View>
  );
}

function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    playbackPosition,
    duration,
    isLoadingAudio,
    togglePlayPause,
    seekTo,
  } = usePlayer();

  return (
    <View style={styles.miniPlayer}>
      {currentTrack && currentTrack.artwork ? (
        <Image source={{ uri: currentTrack.artwork }} style={styles.miniPlayerArtwork} />
      ) : (
        <View style={styles.miniPlayerArtwork} />
      )}
      <View style={styles.miniPlayerInfo}>
        <Text style={styles.miniPlayerTitle} numberOfLines={1}>
          {currentTrack ? currentTrack.title : 'Nothing playing'}
        </Text>
        {currentTrack ? (
          <View style={styles.miniPlayerContent}>
            <Text style={styles.miniPlayerArtist} numberOfLines={1}>
              {currentTrack.artist}
            </Text>
            <MiniScrubber
              position={playbackPosition}
              duration={duration}
              onSeek={seekTo}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.miniPlayerControls}>
        <Pressable
          style={styles.miniPlayerPlay}
          onPress={togglePlayPause}
          disabled={!currentTrack || isLoadingAudio}
        >
          {!currentTrack ? null : isLoadingAudio ? (
            <Activity size={18} color="#121212" />
          ) : isPlaying ? (
            <Pause size={18} color="#121212" fill="#121212" />
          ) : (
            <Play size={18} color="#121212" fill="#121212" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

function TabBar({ active, onChange }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const Icon = tab.icon;
        return (
          <Pressable key={tab.key} style={styles.tabItem} onPress={() => onChange(tab.key)}>
            <Icon size={22} color={isActive ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AppShell() {
  const [activeTab, setActiveTab] = useState('home');
  const [activeFilter, setActiveFilter] = useState('All');

  return (
    <View style={styles.container}>
      <View style={styles.screenContent}>
        {activeTab === 'home' ? (
          <HomeScreen activeFilter={activeFilter} onFilterChange={setActiveFilter} />
        ) : activeTab === 'search' ? (
          <SearchScreen />
        ) : (
          <LibraryScreen />
        )}
      </View>
      <MiniPlayer />
      <TabBar active={activeTab} onChange={setActiveTab} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PlayerProvider>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <StatusBar style="light" />
          <AppShell />
        </SafeAreaView>
      </PlayerProvider>
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
  screenContent: {
    flex: 1,
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
  searchContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#121212',
    fontSize: 15,
    paddingVertical: 8,
  },
  searchLoading: {
    marginTop: 16,
    alignSelf: 'center',
  },
  searchError: {
    color: '#F15E6C',
    marginTop: 16,
    textAlign: 'center',
  },
  searchEmpty: {
    color: COLORS.textSecondary,
    marginTop: 24,
    textAlign: 'center',
  },
  searchResults: {
    paddingBottom: 24,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  trackArtwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: COLORS.card,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  trackArtist: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  trackPlay: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryScreen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  libraryTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  libraryEmpty: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  miniPlayerContent: {
    marginTop: 2,
  },
  miniPlayerTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  miniPlayerArtist: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  miniPlayerControls: {
    justifyContent: 'center',
  },
  miniPlayerPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4d4d4d',
    marginTop: 8,
    overflow: 'hidden',
  },
  scrubFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.white,
  },
  scrubLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scrubTime: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    paddingTop: 8,
    paddingBottom: 2,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.textPrimary,
  },
  bottomSpacer: {
    height: 24,
  },
});