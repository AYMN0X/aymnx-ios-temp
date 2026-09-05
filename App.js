import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  Activity,
  ArrowUpDown,
  Cast,
  ChevronDown,
  ChevronLeft,
  Download,
  Heart,
  Home,
  Library,
  ListMusic,
  MoreHorizontal,
  Pause,
  Pin,
  Play,
  Plus,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { DownloadProvider, useDownloads } from './src/context/DownloadContext';
import { LibraryProvider, useLibrary } from './src/context/LibraryContext';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';
import { fetchPopularHits, fetchTrendingNow, searchITunes } from './src/services/musicApi';
import { importSpotifyPlaylist } from './src/services/spotifyImportService';

const COLORS = {
  background: '#121212',
  elevated: '#242424',
  card: '#282828',
  cardPress: '#3E3E3E',
  pill: '#2A2A2A',
  green: '#1ED760',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
  textSubdued: '#6A6A6A',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  xxxxl: 56,
};

const TYPE = {
  display: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  sectionTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  cardTile: { fontSize: 13, fontWeight: '700', lineHeight: 16 },
  body: { fontSize: 11, fontWeight: '400', color: '#B3B3B3' },
  micro: { fontSize: 10, fontWeight: '400', color: '#B3B3B3' },
};

const LIKED_GRADIENT = ['#450AF5', '#8E8EE5'];
const HERO_GRADIENT = ['#D84000', '#503750'];

const FILTERS = ['All', 'Music', 'Podcasts'];

const LIBRARY_FILTERS = ['Playlists', 'Podcasts', 'Albums', 'Downloaded'];

const LIKED_FILTERS = ['Aggressive', 'Pop', 'Gaming', 'Calm', 'Beats', 'Funk'];

const SEARCH_CATEGORIES = [
  { key: 'podcasts', title: 'Podcasts', color: '#E13300' },
  { key: 'made-for-you', title: 'Made For You', color: '#1E3264' },
  { key: 'charts', title: 'Charts', color: '#8D67AB' },
  { key: 'new-releases', title: 'New Releases', color: '#E8115B' },
  { key: 'discover', title: 'Discover', color: '#8C1932' },
  { key: 'concerts', title: 'Concerts', color: '#1E3264' },
  { key: 'pop', title: 'Pop', color: '#148A08' },
  { key: 'hip-hop', title: 'Hip-Hop', color: '#BC5900' },
  { key: 'rock', title: 'Rock', color: '#E91429' },
  { key: 'dance', title: 'Dance / Electronic', color: '#D84000' },
];

const LIBRARY_ROWS = [
  { key: 'chill', title: 'Chill Vibes', color: '#1E3264', subtitle: 'Playlist • SA' },
  { key: 'road', title: 'Road Trip', color: '#E13300', subtitle: 'Playlist • SA', downloaded: true },
  { key: 'workout', title: 'Workout', color: '#4E4E4E', subtitle: 'Playlist • SA', pinned: true },
  {
    key: 'throwback',
    title: 'Throwback',
    color: '#148A08',
    subtitle: 'Playlist • SA',
    downloaded: true,
  },
  { key: 'study', title: 'Study Session', color: '#8D67AB', subtitle: 'Playlist • SA' },
];

const quickTrack = (id, title, artist, album, artwork) => ({
  id,
  title,
  artist,
  album,
  artwork,
  previewUrl: '',
});

const QUICK_PICKS = [
  { key: 'liked', title: 'Liked Songs' },
  {
    key: 'blinding',
    track: quickTrack(
      'quick-blinding-lights',
      'Blinding Lights',
      'The Weeknd',
      'After Hours',
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/6f/bc/e6/6fbce6c4-c38c-72d8-4fd0-66cfff32f679/20UMGIM12176.rgb.jpg/600x600bb.jpg'
    ),
  },
  {
    key: 'levitating',
    track: quickTrack(
      'quick-levitating',
      'Levitating',
      'Dua Lipa',
      'Future Nostalgia',
      'https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/600x600bb.jpg'
    ),
  },
  {
    key: 'heat-waves',
    track: quickTrack(
      'quick-heat-waves',
      'Heat Waves',
      'Glass Animals',
      'Dreamland',
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/da/8b/77/da8b7731-6f4f-eacf-5e74-8b23389eefa1/20UMGIM03371.rgb.jpg/600x600bb.jpg'
    ),
  },
  {
    key: 'believer',
    track: quickTrack(
      'quick-believer',
      'Believer',
      'Imagine Dragons',
      'Evolve',
      'https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/11/7a/b8/117ab805-6811-8929-18b9-0fad7baf0c25/17UMGIM98210.rgb.jpg/600x600bb.jpg'
    ),
  },
  {
    key: 'shivers',
    track: quickTrack(
      'quick-shivers',
      'Shivers',
      'Ed Sheeran',
      '=',
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/c5/d8/c6/c5d8c675-63e3-6632-33db-2401eabe574d/190296491412.jpg/600x600bb.jpg'
    ),
  },
  {
    key: 'uptown-funk',
    track: quickTrack(
      'quick-uptown-funk',
      'Uptown Funk',
      'Mark Ronson',
      'Uptown Special',
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/7e/30/c5/7e30c572-aa47-5f7b-c6fd-42d50cd2c56d/886444959797.jpg/600x600bb.jpg'
    ),
  },
  {
    key: 'watermelon-sugar',
    track: quickTrack(
      'quick-watermelon-sugar',
      'Watermelon Sugar',
      'Harry Styles',
      'Fine Line',
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/2b/c4/c9/2bc4c9d4-3bc6-ab13-3f71-df0b89b173de/886448022213.jpg/600x600bb.jpg'
    ),
  },
];

const SPOTLIGHT_TARGET = quickTrack(
  'spotlight-paparazzi',
  'Paparazzi',
  'Lady Gaga',
  'Paparazzi - Single',
  'https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/69/3b/50/693b50e2-ad6c-452e-4d5a-2ba2780ef5b5/612891078893.jpg/600x600bb.jpg'
);

const carouselData = (prefix, count) => {
  const colors = ['#8D67AB', '#E13300', '#27856A', '#503750', '#D84000', '#C39687', '#7358FF'];
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    title: `${prefix} ${i + 1}`,
    subtitle: 'Playlist · Spotify',
    color: colors[i % colors.length],
  }));
};

const JUMP_BACK_IN = carouselData('Jump back in', 8);

const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'library', label: 'Your Library', icon: Library },
  { key: 'create', label: 'AYMNX', icon: User },
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

function TrackCard({ track, onPress }) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {track.artwork ? (
        <Image source={{ uri: track.artwork }} style={styles.cardArtwork} />
      ) : (
        <View style={[styles.cardArtwork, { backgroundColor: '#503750' }]} />
      )}
      <Text style={styles.cardTitle} numberOfLines={1}>
        {track.title}
      </Text>
      <Text style={styles.cardSubtitle} numberOfLines={1}>
        {track.artist}
      </Text>
    </Pressable>
  );
}

function TrackCarousel({ title, fetchTracks }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { playTrack } = usePlayer();

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const list = await fetchTracks();
        if (active) {
          setTracks(list);
        }
      } catch (e) {
        if (active) {
          setError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchTracks]);

  return (
    <View style={styles.rowSection}>
      <SectionTitle title={title} />
      {loading ? (
        <Activity size={16} color={COLORS.white} style={styles.rowLoading} />
      ) : error || tracks.length === 0 ? (
        <Text style={styles.rowError}>Couldn't load this section right now.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rowContent}
        >
          {tracks.map((track) => (
            <TrackCard key={track.id} track={track} onPress={() => playTrack(track, tracks)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function FilterChips({ active, onChange, style }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
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

function QuickPickTile({ item, onPress }) {
  if (item.key === 'liked') {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.quickTile}
        onPress={onPress}
      >
        <LinearGradient
          colors={LIKED_GRADIENT}
          style={styles.quickArtwork}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
>
          <Heart size={26} color={COLORS.white} fill={COLORS.white} />
        </LinearGradient>
        <View style={styles.quickTextWrap}>
          <Text style={styles.quickTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.7} style={styles.quickTile} onPress={onPress}>
      <Image source={{ uri: item.track.artwork }} style={styles.quickArtwork} />
      <View style={styles.quickTextWrap}>
        <Text style={styles.quickTitle} numberOfLines={2}>
          {item.track.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function HeroSpotlight() {
  const { playTrack } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const liked = isLiked(SPOTLIGHT_TARGET.id);

  return (
    <View style={styles.heroSection}>
      <View style={styles.heroHeader}>
        <View style={styles.heroAvatar}>
          <Text style={styles.heroAvatarLetter}>L</Text>
        </View>
        <View style={styles.heroHeaderText}>
          <Text style={styles.heroKicker}>New release from</Text>
          <Text style={styles.heroArtist} numberOfLines={1}>
            {SPOTLIGHT_TARGET.artist}
          </Text>
        </View>
      </View>
      <View style={styles.heroCard}>
        <LinearGradient
          colors={HERO_GRADIENT}
          style={styles.heroArtwork}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Image source={{ uri: SPOTLIGHT_TARGET.artwork }} style={styles.heroArtwork} />
        </LinearGradient>
        <View style={styles.heroMeta}>
          <Text style={styles.heroSublabel}>Single</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {SPOTLIGHT_TARGET.title}
          </Text>
          <Text style={styles.heroArtistName} numberOfLines={1}>
            {SPOTLIGHT_TARGET.artist}
          </Text>
        </View>
        <View style={styles.heroActions}>
          <Pressable style={styles.heroMore} hitSlop={8}>
            <MoreHorizontal size={22} color={COLORS.textSecondary} />
          </Pressable>
          <Pressable
            style={styles.heroAdd}
            hitSlop={8}
            onPress={() => toggleLike(SPOTLIGHT_TARGET)}
          >
            {liked ? (
              <Heart size={20} color={COLORS.green} fill={COLORS.green} />
            ) : (
              <Plus size={20} color={COLORS.white} />
            )}
          </Pressable>
          <Pressable style={styles.heroPlay} onPress={() => playTrack(SPOTLIGHT_TARGET)}>
            <Play size={20} color="#000000" fill="#000000" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function HomeScreen({ activeFilter, onFilterChange, onOpenLibrary, onOpenAccount }) {
  const { playTrack } = usePlayer();
  const { likedSongs } = useLibrary();
  const { user } = useAuth();
  const userInitial = (user?.name || user?.username || 'S').charAt(0).toUpperCase();

  const handleQuickPress = (item) => {
    if (item.key === 'liked') {
      if (likedSongs.length > 0) {
        playTrack(likedSongs[0], likedSongs);
      } else {
        onOpenLibrary();
      }
      return;
    }
    playTrack(item.track);
  };

  return (
    <FlatList
      data={[]}
      keyExtractor={() => 'sections'}
      contentContainerStyle={styles.listContent}
      style={styles.homeList}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <Pressable style={styles.userAvatar} onPress={onOpenAccount}>
            <Text style={styles.avatarLetter}>{userInitial}</Text>
          </Pressable>
          <FilterChips
            active={activeFilter}
            onChange={onFilterChange}
            style={styles.chipsScroll}
          />
        </View>
      }
      ListEmptyComponent={
        <View>
          <View style={styles.quickGrid}>
            {QUICK_PICKS.map((item) => (
              <QuickPickTile key={item.key} item={item} onPress={() => handleQuickPress(item)} />
            ))}
          </View>
          <HeroSpotlight />
          <TrackCarousel title="Trending Now" fetchTracks={fetchTrendingNow} />
          <TrackCarousel title="Popular Hits" fetchTracks={fetchPopularHits} />
          <HorizontalRow title="Jump back in" data={JUMP_BACK_IN} />
          <View style={styles.bottomSpacer} />
        </View>
      }
    />
  );
}

function TrackRow({ track, liked, onPlay, onToggleLike, onMore, onRemove }) {
  return (
    <View style={styles.trackRow}>
      <Pressable style={styles.trackRowMain} onPress={onPlay}>
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
      </Pressable>
      <Pressable onPress={onToggleLike} hitSlop={8} style={styles.trackAction}>
        <Heart size={18} color={COLORS.white} fill={liked ? COLORS.white : 'transparent'} />
      </Pressable>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={styles.trackAction}>
          <MoreHorizontal size={18} color={COLORS.textSecondary} />
        </Pressable>
      ) : onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.trackAction}>
          <X size={18} color={COLORS.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function AddToPlaylistModal({ track, visible, onClose }) {
  const { playlists, createPlaylist, addToPlaylist } = useLibrary();
  const [name, setName] = useState('');

  useEffect(() => {
    if (!visible) {
      setName('');
    }
  }, [visible]);

  const saveTo = async (playlistId) => {
    if (!track) {
      return;
    }
    await addToPlaylist(playlistId, track);
    onClose();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await createPlaylist(trimmed);
    setName('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.atpBackdrop} onPress={onClose}>
        <Pressable style={styles.atpCard} onPress={() => {}}>
          <Text style={styles.atpTitle} numberOfLines={1}>
            {track ? `Save "${track.title}"` : 'Add to playlist'}
          </Text>
          <View style={styles.atpCreate}>
            <TextInput
              style={styles.atpInput}
              value={name}
              onChangeText={setName}
              placeholder="New playlist name"
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <Pressable
              style={[styles.atpCreateBtn, !name.trim() && styles.disabled]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text style={styles.atpCreateLabel}>Create</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.atpList} bounces={false}>
            {playlists.length === 0 ? (
              <Text style={styles.atpEmpty}>No playlists yet</Text>
            ) : (
              playlists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  style={styles.atpRow}
                  onPress={() => saveTo(playlist.id)}
                >
                  <ListMusic size={18} color={COLORS.white} />
                  <Text style={styles.atpRowLabel} numberOfLines={1}>
                    {playlist.name}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [sheetTrack, setSheetTrack] = useState(null);
  const [playlistTrack, setPlaylistTrack] = useState(null);
  const debounceRef = useRef(null);
  const { playTrack } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const { isDownloaded, toggleDownload } = useDownloads();

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

  const searchingNow = query.trim() !== '';

  return (
    <View style={styles.searchContainer}>
      <View style={styles.searchHeader}>
        <Text style={styles.searchTitle}>Search</Text>
        <Pressable style={styles.searchCamera} hitSlop={8}>
          <Feather name="camera" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.searchPill}>
        <Ionicons name="search" size={22} color="#121212" />
        <TextInput
          style={styles.searchPillInput}
          value={query}
          onChangeText={handleChange}
          placeholder="What do you want to play?"
          placeholderTextColor="#535353"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => runSearch(query)}
        />
      </View>
      {searchingNow ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.searchResults}
          ListHeaderComponent={
            searching ? (
              <Activity size={16} color={COLORS.white} style={styles.searchLoading} />
            ) : null
          }
          ListEmptyComponent={
            error ? (
              <Text style={styles.searchError}>{error}</Text>
            ) : !searching ? (
              <Text style={styles.searchEmpty}>No results found. Try a different search.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              liked={isLiked(item.id)}
              onPlay={() => playTrack(item, results)}
              onToggleLike={() => toggleLike(item)}
              onMore={() => setSheetTrack(item)}
            />
          )}
        />
      ) : (
        <ScrollView
          style={styles.searchBrowse}
          contentContainerStyle={styles.searchBrowseContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.browseTitle}>Browse all</Text>
          <View style={styles.browseGrid}>
            {SEARCH_CATEGORIES.map((cat) => (
              <View key={cat.key} style={[styles.browseCard, { backgroundColor: cat.color }]}>
                <Text style={styles.browseCardTitle} numberOfLines={2}>
                  {cat.title}
                </Text>
                <View style={styles.browseArt} />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
      <TrackOptionsSheet
        track={sheetTrack}
        visible={!!sheetTrack}
        onClose={() => setSheetTrack(null)}
        downloaded={!!sheetTrack && isDownloaded(sheetTrack.id)}
        onToggleDownload={() => {
          if (sheetTrack) {
            toggleDownload(sheetTrack);
          }
          setSheetTrack(null);
        }}
        onAddToPlaylist={() => {
          setPlaylistTrack(sheetTrack);
          setSheetTrack(null);
        }}
        onRemove={() => {
          if (sheetTrack) {
            toggleLike(sheetTrack);
          }
          setSheetTrack(null);
        }}
        onQueue={() => {
          if (sheetTrack) {
            playTrack(sheetTrack, results);
          }
          setSheetTrack(null);
        }}
      />
      <AddToPlaylistModal
        track={playlistTrack}
        visible={!!playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />
    </View>
  );
}

function TrackOptionsSheet({
  track,
  visible,
  onClose,
  onAddToPlaylist,
  onRemove,
  onQueue,
  downloaded,
  onToggleDownload,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.tosBackdrop} onPress={onClose}>
        <Pressable style={styles.tosSheet} onPress={() => {}}>
          <View style={styles.tosPill} />
          {track ? (
            <View style={styles.tosPreview}>
              {track.artwork ? (
                <Image source={{ uri: track.artwork }} style={styles.tosArtwork} />
              ) : (
                <View style={[styles.tosArtwork, styles.tosArtworkFallback]} />
              )}
              <View style={styles.tosPreviewText}>
                <Text style={styles.tosPreviewTitle} numberOfLines={1}>
                  {track.title}
                </Text>
                <Text style={styles.tosPreviewArtist} numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
            </View>
          ) : null}
          <View style={styles.tosDivider} />
          <Pressable style={styles.tosItem} onPress={onClose}>
            <Feather name="share" size={20} color="#B3B3B3" />
            <Text style={styles.tosItemLabel}>Share</Text>
          </Pressable>
          <Pressable style={styles.tosItem} onPress={onAddToPlaylist}>
            <Feather name="plus-circle" size={20} color="#B3B3B3" />
            <Text style={styles.tosItemLabel}>Add to playlist</Text>
          </Pressable>
          <Pressable style={styles.tosItem} onPress={onToggleDownload}>
            {downloaded ? (
              <MaterialCommunityIcons name="download-off" size={20} color="#1ED760" />
            ) : (
              <Feather name="download" size={20} color="#B3B3B3" />
            )}
            <Text style={styles.tosItemLabel}>{downloaded ? 'Remove download' : 'Download'}</Text>
          </Pressable>
          <Pressable style={styles.tosItem} onPress={onClose}>
            <Feather name="x-circle" size={20} color="#B3B3B3" />
            <Text style={styles.tosItemLabel}>Exclude track from your taste profile</Text>
          </Pressable>
          <Pressable style={styles.tosItem} onPress={onRemove}>
            <Feather name="minus-circle" size={20} color="#B3B3B3" />
            <Text style={styles.tosItemLabel}>Remove from this playlist</Text>
          </Pressable>
          <Pressable style={styles.tosItem} onPress={onQueue}>
            <MaterialIcons name="queue-music" size={20} color="#B3B3B3" />
            <Text style={styles.tosItemLabel}>Add to Queue</Text>
          </Pressable>
          <Pressable style={styles.tosItem} onPress={onClose}>
            <Ionicons name="radio-outline" size={20} color="#B3B3B3" />
            <Text style={styles.tosItemLabel}>Go to radio</Text>
          </Pressable>
          <Pressable style={styles.tosItem} onPress={onClose}>
            <Ionicons name="disc-outline" size={20} color="#B3B3B3" />
            <Text style={styles.tosItemLabel}>Go to album</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LikedSongsScreen({ onBack }) {
  const { likedSongs, toggleLike } = useLibrary();
  const { playTrack, isPlaying, currentTrack, togglePlayPause } = usePlayer();
  const {
    isDownloaded,
    downloadingIds,
    toggleDownload,
    downloadAll,
    isBatchDownloading,
    batchProgress,
  } = useDownloads();
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState(null);
  const [sheetTrack, setSheetTrack] = useState(null);
  const [playlistTrack, setPlaylistTrack] = useState(null);

  const q = query.trim().toLowerCase();
  const tracks = q
    ? likedSongs.filter(
        (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
      )
    : likedSongs;

  const nowPlayingLiked =
    isPlaying && currentTrack && likedSongs.some((t) => t.id === currentTrack.id);

  const allDownloaded =
    likedSongs.length > 0 && likedSongs.every((t) => isDownloaded(t.id));

  const handlePrimary = () => {
    if (nowPlayingLiked) {
      togglePlayPause();
    } else if (likedSongs.length > 0) {
      playTrack(likedSongs[0], likedSongs);
    }
  };

  const handleDownloadAll = () => {
    if (isBatchDownloading) {
      return;
    }
    downloadAll(likedSongs);
  };

  const renderRow = ({ item }) => {
    const active = !!currentTrack && currentTrack.id === item.id && isPlaying;
    return (
      <View style={styles.lgRow}>
        <Pressable style={styles.lgRowMain} onPress={() => playTrack(item, likedSongs)}>
          {item.artwork ? (
            <Image source={{ uri: item.artwork }} style={styles.lgRowArtwork} />
          ) : (
            <View style={[styles.lgRowArtwork, styles.lgRowArtworkFallback]} />
          )}
          <View style={styles.lgRowInfo}>
            <Text style={[styles.lgRowTitle, active && styles.lgRowTitleActive]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.lgRowArtist} numberOfLines={1}>
              {item.artist} • {item.album}
            </Text>
          </View>
        </Pressable>
        <Pressable style={styles.lgRowMore} onPress={() => setSheetTrack(item)} hitSlop={10}>
          {isDownloaded(item.id) ? (
            <Download size={16} color={COLORS.green} style={styles.lgRowDownloaded} />
          ) : null}
          <Feather name="more-horizontal" size={20} color="#B3B3B3" />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.lgRoot}>
      <LinearGradient
        pointerEvents="none"
        colors={['#2E3A75', '#121212']}
        locations={[0, 0.55]}
        style={styles.lgGradient}
      />
      <View style={styles.lgNavRow}>
        <Pressable style={styles.lgBack} onPress={onBack} hitSlop={12}>
          <ChevronLeft size={26} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.lgSearchRow}>
        <View style={styles.lgSearchBox}>
          <Search size={16} color="rgba(255,255,255,0.7)" />
          <TextInput
            style={styles.lgSearchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Find in Liked Songs"
            placeholderTextColor="rgba(255,255,255,0.7)"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <Pressable style={styles.lgSortBtn}>
          <MaterialIcons name="sort" size={18} color="#FFFFFF" />
          <Text style={styles.lgSortLabel}>Sort</Text>
        </Pressable>
      </View>
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        style={styles.lgList}
        contentContainerStyle={styles.lgListContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text style={styles.lgTitle}>Liked Songs</Text>
            <Text style={styles.lgCount}>
              {likedSongs.length === 1 ? '1 song' : `${likedSongs.length} songs`}
            </Text>
            <View style={styles.lgActionRow}>
              <Pressable
                style={[styles.lgDownload, allDownloaded && styles.lgDownloadDone]}
                onPress={handleDownloadAll}
                hitSlop={8}
              >
                {isBatchDownloading ? (
                  <Activity size={18} color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={allDownloaded ? 'download' : 'download-outline'}
                    size={24}
                    color={allDownloaded ? '#FFFFFF' : '#B3B3B3'}
                  />
                )}
              </Pressable>
              <View style={styles.lgActionRight}>
                <Pressable style={styles.lgShuffle} hitSlop={8}>
                  <Shuffle size={22} color="#1ED760" />
                </Pressable>
                <Pressable style={styles.lgPlayPrimary} onPress={handlePrimary}>
                  {nowPlayingLiked ? (
                    <Pause size={24} color="#000000" fill="#000000" />
                  ) : (
                    <Play size={24} color="#000000" fill="#000000" style={styles.lgPlayToken} />
                  )}
                </Pressable>
              </View>
            </View>
            {isBatchDownloading && batchProgress ? (
              <Text style={styles.lgDownloadProgress} numberOfLines={1}>
                Downloading {batchProgress.downloaded} of {batchProgress.total} songs...
              </Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.lgChipsScroll}
              contentContainerStyle={styles.lgChipsContent}
            >
              {LIKED_FILTERS.map((f) => {
                const selected = chip === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setChip(selected ? null : f)}
                    style={[styles.lgChip, selected && styles.lgChipActive]}
                  >
                    <Text style={[styles.lgChipText, selected && styles.lgChipTextActive]}>{f}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.lgAddRow}>
              <View style={styles.lgAddIcon}>
                <Plus size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.lgAddLabel}>Add songs</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.lgEmpty}>
            {q ? 'No matches found.' : 'No liked songs yet'}
          </Text>
        }
        renderItem={renderRow}
      />
      <TrackOptionsSheet
        track={sheetTrack}
        visible={!!sheetTrack}
        onClose={() => setSheetTrack(null)}
        downloaded={!!sheetTrack && isDownloaded(sheetTrack.id)}
        onToggleDownload={() => {
          if (sheetTrack) {
            toggleDownload(sheetTrack);
          }
          setSheetTrack(null);
        }}
        onAddToPlaylist={() => {
          setPlaylistTrack(sheetTrack);
          setSheetTrack(null);
        }}
        onRemove={() => {
          if (sheetTrack) {
            toggleLike(sheetTrack);
          }
          setSheetTrack(null);
        }}
        onQueue={() => {
          if (sheetTrack) {
            playTrack(sheetTrack, likedSongs);
          }
          setSheetTrack(null);
        }}
      />
      <AddToPlaylistModal
        track={playlistTrack}
        visible={!!playlistTrack}
        onClose={() => setPlaylistTrack(null)}
      />
    </View>
  );
}

function LibraryScreen({ onOpenAccount, initialDetail, onDetailConsumed }) {
  const {
    likedSongs,
    playlists,
    createPlaylist,
    removePlaylist,
    toggleLike,
    isLiked,
    removeTrackFromPlaylist,
  } = useLibrary();
  const { playTrack } = usePlayer();
  const { downloadedTracks, deleteDownload } = useDownloads();
  const { user } = useAuth();
  const userInitial = (user?.name || user?.username || 'S').charAt(0).toUpperCase();
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('Playlists');
  const [viewMode, setViewMode] = useState('list');

  const selectedPlaylist =
    detail && detail.type === 'playlist'
      ? playlists.find((playlist) => playlist.id === detail.id)
      : null;

  const backToRoot = () => {
    setDetail(null);
    setCreating(false);
    setName('');
  };

  useEffect(() => {
    if (initialDetail && initialDetail.type === 'playlist' && !detail) {
      const playlist = playlists.find((item) => item.id === initialDetail.id);
      if (playlist) {
        setDetail({ type: 'playlist', id: playlist.id, title: playlist.name });
        if (onDetailConsumed) {
          onDetailConsumed();
        }
      }
    }
  }, [initialDetail, playlists, detail, onDetailConsumed]);

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await createPlaylist(trimmed);
    setName('');
    setCreating(false);
  };

  if (detail) {
    if (detail.type === 'liked') {
      return <LikedSongsScreen onBack={backToRoot} />;
    }
    const tracks = selectedPlaylist ? selectedPlaylist.tracks : [];
    return (
      <View style={styles.libraryScreen}>
        <View style={styles.libraryHeader}>
          <Pressable onPress={backToRoot} hitSlop={10}>
            <ChevronLeft size={24} color={COLORS.white} />
          </Pressable>
          <Text style={styles.libraryTitle} numberOfLines={1}>
            {detail.type === 'liked' ? 'Liked Songs' : detail.name}
          </Text>
          {detail.type === 'playlist' && selectedPlaylist ? (
            <Pressable onPress={() => removePlaylist(detail.id)} hitSlop={10}>
              <Trash2 size={20} color={COLORS.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        {selectedPlaylist && selectedPlaylist.coverUrl ? (
          <Image source={{ uri: selectedPlaylist.coverUrl }} style={styles.libDetailCover} />
        ) : null}
        <Text style={styles.librarySubtitle}>
          {tracks.length === 1 ? '1 song' : `${tracks.length} songs`}
        </Text>
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.libraryList}
          ListEmptyComponent={<Text style={styles.libraryEmpty}>No songs yet</Text>}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              liked={isLiked(item.id)}
              onPlay={() => playTrack(item, tracks)}
              onToggleLike={() => toggleLike(item)}
              onRemove={
                detail.type === 'playlist'
                  ? () => removeTrackFromPlaylist(detail.id, item.id)
                  : null
              }
            />
          )}
        />
      </View>
    );
  }

  const libraryItems = [
    { type: 'liked', key: 'liked', title: 'Liked Songs', subtitle: `Playlist • ${likedSongs.length} songs` },
    ...LIBRARY_ROWS.map((item) => ({
      type: 'static',
      key: item.key,
      title: item.title,
      subtitle: item.subtitle,
      color: item.color,
      pinned: item.pinned,
      downloaded: item.downloaded,
    })),
    ...playlists.map((item) => ({
      type: 'playlist',
      key: item.id,
      title: item.name,
      subtitle: `Playlist • ${item.tracks.length} songs`,
      playlistId: item.id,
      coverUrl: item.coverUrl,
    })),
  ];

  const filteredItems = libraryFilter === 'Downloaded'
    ? downloadedTracks.map((track) => ({
        type: 'downloaded',
        key: `downloaded-${track.id}`,
        track,
      }))
    : libraryFilter === 'Playlists'
    ? libraryItems
    : libraryItems.filter((i) => i.type === 'liked');

  return (
    <View style={styles.libraryScreen}>
      <View style={styles.libraryHeader}>
        <Pressable style={styles.libraryAvatar} onPress={onOpenAccount}>
          <Text style={styles.libraryAvatarLetter}>{userInitial}</Text>
        </Pressable>
        <Text style={styles.libraryTitle}>Your Library</Text>
        <View style={styles.libraryHeaderActions}>
          <Pressable style={styles.libraryHeaderBtn} hitSlop={8}>
            <Ionicons name="search" size={22} color={COLORS.white} />
          </Pressable>
          <Pressable
            style={styles.libraryHeaderBtn}
            onPress={() => setCreating((v) => !v)}
            hitSlop={8}
          >
            <Ionicons name="add" size={26} color={COLORS.white} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.libraryPillsScroll}
        contentContainerStyle={styles.libraryPillsContent}
      >
        {LIBRARY_FILTERS.map((f) => {
          const selected = libraryFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setLibraryFilter(f)}
              style={[styles.libraryPill, selected && styles.libraryPillActive]}
            >
              <Text style={[styles.libraryPillText, selected && styles.libraryPillTextActive]}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.libraryToolbar}>
        <Pressable style={styles.libraryToolbarLeft} hitSlop={8}>
          <ArrowUpDown size={16} color={COLORS.white} />
          <Text style={styles.libraryToolbarText}>Recents</Text>
        </Pressable>
        <Pressable
          onPress={() => setViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
          hitSlop={8}
        >
          <Ionicons
            name={viewMode === 'list' ? 'grid-outline' : 'list'}
            size={22}
            color={COLORS.white}
          />
        </Pressable>
      </View>
      {creating ? (
        <View style={styles.libraryCreateRow}>
          <TextInput
            style={styles.libraryCreateInput}
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={COLORS.textSecondary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitCreate}
          />
          <Pressable
            style={[styles.libraryCreateBtn, !name.trim() && styles.disabled]}
            onPress={submitCreate}
            disabled={!name.trim()}
          >
            <Text style={styles.libraryCreateLabel}>Create</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.libraryList}
        ListEmptyComponent={
          libraryFilter === 'Playlists' ? (
            <Text style={styles.libraryEmpty}>No songs yet</Text>
          ) : libraryFilter === 'Downloaded' ? (
            <Text style={styles.libraryEmpty}>Nothing downloaded yet.</Text>
          ) : (
            <Text style={styles.libraryEmpty}>Nothing here yet.</Text>
          )
        }
        renderItem={({ item }) => {
          if (item.type === 'liked') {
            return (
              <Pressable style={styles.libRow} onPress={() => setDetail({ type: 'liked' })}>
                <LinearGradient
                  colors={LIKED_GRADIENT}
                  style={styles.libCover}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Heart size={20} color={COLORS.white} fill={COLORS.white} />
                </LinearGradient>
                <View style={styles.libRowInfo}>
                  <Text style={styles.libRowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.libRowSubtitleRow}>
                    <Download size={12} color={COLORS.green} />
                    <Text style={styles.libRowSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }
          if (item.type === 'downloaded') {
            return (
              <TrackRow
                track={item.track}
                liked={isLiked(item.track.id)}
                onPlay={() => playTrack(item.track, downloadedTracks)}
                onToggleLike={() => toggleLike(item.track)}
                onRemove={() => deleteDownload(item.track.id)}
              />
            );
          }
          if (item.type === 'static') {
            return (
              <View style={styles.libRow}>
                <View style={[styles.libCover, { backgroundColor: item.color }]} />
                <View style={styles.libRowInfo}>
                  <Text style={styles.libRowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.libRowSubtitleRow}>
                    {item.pinned ? <Pin size={12} color={COLORS.green} /> : null}
                    {item.downloaded ? <Download size={12} color={COLORS.green} /> : null}
                    <Text style={styles.libRowSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
              </View>
            );
          }
          return (
<Pressable
                style={styles.libRow}
                onPress={() => setDetail({ type: 'playlist', id: item.playlistId, title: item.title })}
              >
                <View style={[styles.libCover, { backgroundColor: COLORS.card }]}>
                  {item.coverUrl ? (
                    <Image source={{ uri: item.coverUrl }} style={styles.libCover} />
                  ) : null}
                </View>
                <View style={styles.libRowInfo}>
                <Text style={styles.libRowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.libRowSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function ImportScreen({ onOpenImportedPlaylist }) {
  const { createImportedPlaylist } = useLibrary();
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!link.trim() || importing) {
      return;
    }
    setImporting(true);
    setProgress('Fetching playlist metadata...');
    setError('');
    setResult(null);
    try {
      const { promise } = importSpotifyPlaylist(link, (current, total, currentTitle) => {
        setProgress(
          currentTitle
            ? `Importing track ${current} of ${total}: ${currentTitle}...`
            : `Importing track ${current} of ${total}...`
        );
      });
      const playlist = await promise;
      const created = await createImportedPlaylist(
        playlist.title,
        playlist.artwork,
        playlist.tracks
      );
      if (created) {
        setResult({
          id: created.id,
          name: created.name,
          coverUrl: created.coverUrl || '',
          count: created.tracks.length,
        });
      } else {
        setError('Could not save the imported playlist.');
      }
    } catch (e) {
      setError(e.message || 'Import failed. Please check the link.');
    } finally {
      setImporting(false);
      setProgress('');
    }
  };

  return (
    <View style={styles.importContainer}>
      <Text style={styles.importTitle}>Import Spotify Playlist</Text>
      <TextInput
        style={styles.importInput}
        value={link}
        onChangeText={setLink}
        placeholder="Paste Spotify Playlist Link here..."
        placeholderTextColor="#777777"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={handleImport}
      />
      <Pressable
        style={[styles.importButton, (!link.trim() || importing) && styles.importButtonDisabled]}
        onPress={handleImport}
        disabled={!link.trim() || importing}
      >
        {importing ? (
          <Activity size={18} color="#000000" />
        ) : (
          <Feather name="download" size={20} color="#000000" />
        )}
        <Text style={styles.importButtonLabel}>{importing ? 'Importing...' : 'Import'}</Text>
      </Pressable>
      {progress ? <Text style={styles.importProgress}>{progress}</Text> : null}
      {error ? <Text style={styles.importError}>{error}</Text> : null}
      <Text style={styles.importHint}>
        Paste any Spotify playlist link (e.g. open.spotify.com/playlist/...). We will fetch the
        playlist, match each track to a playable stream, and save it to Your Library.
      </Text>
      {result ? (
        <View style={styles.importSuccess}>
          <View style={styles.importSuccessRow}>
            {result.coverUrl ? (
              <Image source={{ uri: result.coverUrl }} style={styles.importSuccessArt} />
            ) : (
              <View style={[styles.importSuccessArt, styles.importSuccessArtFallback]} />
            )}
            <View style={styles.importSuccessMeta}>
              <Text style={styles.importSuccessName} numberOfLines={2}>
                {result.name}
              </Text>
              <Text style={styles.importSuccessCount}>
                {result.count === 1 ? '1 track' : `${result.count} tracks`}
              </Text>
            </View>
          </View>
          <Pressable style={styles.importOpenBtn} onPress={() => onOpenImportedPlaylist(result.id)}>
            <Text style={styles.importOpenLabel}>Open Playlist</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Scrubber({ position, duration, onSeek, large }) {
  const [width, setWidth] = useState(0);
  const progress = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;
  const trackStyle = large ? styles.scrubTrackLarge : styles.scrubTrack;
  const fillStyle = large ? styles.scrubFillLarge : styles.scrubFill;
  const wrapStyle = large ? styles.scrubWrapLarge : undefined;
  const rightLabel = large
    ? `-${formatMillis(Math.max(duration - position, 0))}`
    : formatMillis(duration);

  return (
    <View style={wrapStyle}>
      <Pressable
        style={trackStyle}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onPress={(event) => {
          if (width > 0 && onSeek) {
            const ratio = Math.min(Math.max(event.nativeEvent.locationX / width, 0), 1);
            onSeek(ratio * duration);
          }
        }}
      >
        <View style={[fillStyle, { width: `${progress * 100}%` }]} />
      </Pressable>
      <View style={styles.scrubLabels}>
        <Text style={styles.scrubTime}>{formatMillis(position)}</Text>
        <Text style={styles.scrubTime}>{rightLabel}</Text>
      </View>
    </View>
  );
}

function MiniPlayer({ onOpen }) {
  const {
    currentTrack,
    isPlaying,
    playbackPosition,
    duration,
    playbackError,
    togglePlayPause,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const progress = duration > 0 ? Math.min(Math.max(playbackPosition / duration, 0), 1) : 0;

  if (!currentTrack) {
    return null;
  }

  return (
    <View style={styles.miniPlayer}>
      <Pressable style={styles.miniPlayerMain} onPress={onOpen}>
        {currentTrack.artwork ? (
          <Image source={{ uri: currentTrack.artwork }} style={styles.miniPlayerArtwork} />
        ) : (
          <View style={[styles.miniPlayerArtwork, styles.miniPlayerArtworkFallback]} />
        )}
        <View style={styles.miniPlayerInfo}>
          <Text style={styles.miniPlayerTitle} numberOfLines={1}>
            {currentTrack.title}
          </Text>
          <Text style={styles.miniPlayerArtist} numberOfLines={1}>
            {playbackError || currentTrack.artist}
          </Text>
        </View>
      </Pressable>
      <View style={styles.miniPlayerActions}>
        <Cast size={20} color={COLORS.green} />
        <Pressable onPress={() => toggleLike(currentTrack)} hitSlop={8}>
          <Heart
            size={18}
            color={COLORS.white}
            fill={isLiked(currentTrack.id) ? COLORS.white : 'transparent'}
          />
        </Pressable>
        <Pressable
          style={styles.miniPlayerPlay}
          onPress={togglePlayPause}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isPlaying ? (
            <Pause size={22} color="#FFFFFF" fill="#FFFFFF" />
          ) : (
            <Play size={22} color="#FFFFFF" fill="#FFFFFF" />
          )}
        </Pressable>
      </View>
      <View style={styles.miniProgressTrack}>
        <View style={[styles.miniProgressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function NowPlayingModal({ visible, onClose }) {
  const {
    currentTrack,
    isPlaying,
    playbackPosition,
    duration,
    playbackError,
    togglePlayPause,
    seekTo,
    playNext,
    playPrevious,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const artSize = Math.min(width - 80, 340);
  const [queueOpen, setQueueOpen] = useState(false);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.npRoot,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.npHandleRow}>
          <Pressable style={styles.npCloseBtn} onPress={onClose} hitSlop={12}>
            <ChevronDown size={28} color={COLORS.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.npDragHandle}>
          <View style={styles.npDragPill} />
        </View>
        {currentTrack ? (
          <View style={styles.npBody}>
            <View style={styles.npArtworkWrap}>
              {currentTrack.artwork ? (
                <Image
                  source={{ uri: currentTrack.artwork }}
                  style={[styles.npArtwork, { width: artSize, height: artSize }]}
                />
              ) : (
                <View
                  style={[
                    styles.npArtwork,
                    styles.npArtworkFallback,
                    { width: artSize, height: artSize },
                  ]}
                />
              )}
            </View>
            <View style={styles.npMeta}>
              <View style={styles.npMetaText}>
                <Text style={styles.npTitle} numberOfLines={1}>
                  {currentTrack.title}
                </Text>
                <Text style={styles.npArtist} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
                {playbackError ? (
                  <Text style={styles.npError} numberOfLines={1}>
                    {playbackError}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => toggleLike(currentTrack)} hitSlop={10}>
                <Heart
                  size={26}
                  color={COLORS.textPrimary}
                  fill={isLiked(currentTrack.id) ? COLORS.textPrimary : 'transparent'}
                />
              </Pressable>
            </View>
            <Scrubber position={playbackPosition} duration={duration} onSeek={seekTo} large />
            <View style={styles.npControls}>
              <Pressable onPress={playPrevious} hitSlop={10}>
                <Ionicons name="play-skip-back" size={36} color="#FFFFFF" />
              </Pressable>
              <Pressable
                style={styles.npPlay}
                onPress={togglePlayPause}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {isPlaying ? (
                  <Ionicons name="pause" size={64} color="#FFFFFF" />
                ) : (
                  <Ionicons name="play" size={64} color="#FFFFFF" style={styles.npPlayToken} />
                )}
              </Pressable>
              <Pressable onPress={playNext} hitSlop={10}>
                <Ionicons name="play-skip-forward" size={36} color="#FFFFFF" />
              </Pressable>
            </View>
            <View style={styles.npVolumeRow}>
              <Ionicons name="volume-low" size={18} color="#FFFFFF" />
              <View style={styles.npVolumeTrack}>
                <View style={[styles.npVolumeFill, { width: '55%' }]} />
              </View>
              <Ionicons name="volume-high" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.npDock}>
              <Pressable hitSlop={12}>
                <Ionicons name="chatbox-ellipses" size={24} color="#FFFFFF" />
              </Pressable>
              <Pressable hitSlop={12}>
                <MaterialCommunityIcons name="airplay" size={24} color="#FFFFFF" />
              </Pressable>
              <Pressable hitSlop={12} onPress={() => setQueueOpen(true)}>
                <Ionicons name="list" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.npEmpty}>
            <Text style={styles.npEmptyText}>Nothing is playing</Text>
          </View>
        )}
        <QueueModal visible={queueOpen} onClose={() => setQueueOpen(false)} />
      </View>
    </Modal>
  );
}

function QueueModal({ visible, onClose }) {
  const {
    currentTrack,
    queue,
    queueIndex,
    isAutoplayEnabled,
    toggleAutoplay,
    autoplayAddedIds,
  } = usePlayer();
  const insets = useSafeAreaInsets();
  const upNext = queue.slice(queueIndex >= 0 ? queueIndex + 1 : 0);

  const renderTrack = ({ item }) => (
    <View style={styles.queueRow}>
      {item.artwork ? (
        <Image source={{ uri: item.artwork }} style={styles.queueArt} />
      ) : (
        <View style={[styles.queueArt, styles.queueArtFallback]} />
      )}
      <View style={styles.queueRowInfo}>
        <Text style={styles.queueRowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.queueRowMeta}>
          <Text style={styles.queueRowArtist} numberOfLines={1}>
            {item.artist}
          </Text>
          {autoplayAddedIds.has(item.id) ? (
            <View style={styles.autoplayPill}>
              <Text style={styles.autoplayPillLabel}>Autoplay recommendation</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.queueRoot,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.queueHeader}>
          <Pressable style={styles.npCloseBtn} onPress={onClose} hitSlop={12}>
            <X size={26} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.queueTitle}>Queue</Text>
        </View>
        <FlatList
          data={upNext}
          keyExtractor={(item, index) => `${item.id}_${index}`}
          renderItem={renderTrack}
          contentContainerStyle={styles.queueListContent}
          ListHeaderComponent={
            <View>
              <Text style={styles.queueSectionLabel}>Now Playing</Text>
              {currentTrack ? (
                <View style={styles.queueRow}>
                  {currentTrack.artwork ? (
                    <Image source={{ uri: currentTrack.artwork }} style={styles.queueArt} />
                  ) : (
                    <View style={[styles.queueArt, styles.queueArtFallback]} />
                  )}
                  <View style={styles.queueRowInfo}>
                    <Text style={styles.queueRowTitleNow} numberOfLines={1}>
                      {currentTrack.title}
                    </Text>
                    <Text style={styles.queueRowArtist} numberOfLines={1}>
                      {currentTrack.artist}
                    </Text>
                  </View>
                  <Ionicons name="volume-high" size={18} color={COLORS.green} />
                </View>
              ) : null}
              <Text style={styles.queueSectionLabel}>Next in queue</Text>
              {upNext.length === 0 ? (
                <Text style={styles.queueEmpty}>
                  {currentTrack
                    ? 'No more songs in the queue. Autoplay will keep the music going when the queue ends.'
                    : 'Nothing is queued.'}
                </Text>
              ) : null}
            </View>
          }
        />
        <View style={styles.autoplayToggleRow}>
          <View style={styles.autoplayToggleInfo}>
            <Text style={styles.autoplayToggleTitle}>Autoplay</Text>
            <Text style={styles.autoplayToggleSubtitle}>
              Keep the music going when your queue ends
            </Text>
          </View>
          <Switch
            value={isAutoplayEnabled}
            onValueChange={toggleAutoplay}
            trackColor={{ false: '#535353', true: COLORS.green }}
            thumbColor={isAutoplayEnabled ? COLORS.white : '#B3B3B3'}
          />
        </View>
      </View>
    </Modal>
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
            <Icon size={24} color={isActive ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await login(username);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.loginRoot}>
      <MaterialCommunityIcons
        name="spotify"
        size={88}
        color="#1ED760"
        style={styles.loginLogo}
      />
      <Text style={styles.loginTitle}>{"Millions of songs.\nFree on Spotify."}</Text>
      <TextInput
        style={styles.loginInput}
        value={username}
        onChangeText={setUsername}
        placeholder="Username or Email"
        placeholderTextColor="#777777"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={handleLogin}
      />
      <Pressable
        style={[styles.loginButton, !username.trim() && styles.disabled]}
        onPress={handleLogin}
        disabled={!username.trim() || submitting}
      >
        <Text style={styles.loginButtonLabel}>{submitting ? 'Logging in\u2026' : 'Log In'}</Text>
      </Pressable>
      <Pressable style={styles.loginGuest} onPress={() => login('Guest')} hitSlop={8}>
        <Text style={styles.loginGuestLabel}>Continue as Guest</Text>
      </Pressable>
    </View>
  );
}

function AccountSheet({ visible, onClose }) {
  const { user, logout } = useAuth();
  const userInitial = (user?.name || user?.username || '?').charAt(0).toUpperCase();

  const handleLogout = () => {
    onClose();
    logout();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.acctBackdrop} onPress={onClose}>
        <Pressable style={styles.acctSheet} onPress={() => {}}>
          <View style={styles.tosPill} />
          <View style={styles.acctProfile}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.acctAvatar} />
            ) : (
              <View style={[styles.acctAvatar, styles.acctAvatarFallback]}>
                <Text style={styles.acctAvatarLetter}>{userInitial}</Text>
              </View>
            )}
            <View style={styles.acctMeta}>
              <Text style={styles.acctName} numberOfLines={1}>
                {user?.name}
              </Text>
              <Text style={styles.acctUsername} numberOfLines={1}>
                @{user?.username}
              </Text>
            </View>
          </View>
          <Pressable style={styles.acctLogoutBtn} onPress={handleLogout}>
            <Feather name="log-out" size={20} color="#B3B3B3" />
            <Text style={styles.acctLogoutLabel}>Log out</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AppShell() {
  const [activeTab, setActiveTab] = useState('home');
  const [activeFilter, setActiveFilter] = useState('All');
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pendingPlaylistId, setPendingPlaylistId] = useState(null);

  const openImportedPlaylist = (id) => {
    setPendingPlaylistId(id);
    setActiveTab('library');
  };

  return (
    <View style={styles.container}>
      <View style={styles.screenContent}>
        {activeTab === 'home' ? (
          <HomeScreen
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onOpenLibrary={() => setActiveTab('library')}
            onOpenAccount={() => setAccountOpen(true)}
          />
        ) : activeTab === 'search' ? (
          <SearchScreen />
        ) : activeTab === 'create' ? (
          <ImportScreen onOpenImportedPlaylist={openImportedPlaylist} />
        ) : (
          <LibraryScreen
            onOpenAccount={() => setAccountOpen(true)}
            initialDetail={
              pendingPlaylistId ? { type: 'playlist', id: pendingPlaylistId } : null
            }
            onDetailConsumed={() => setPendingPlaylistId(null)}
          />
        )}
      </View>
      <MiniPlayer onOpen={() => setNowPlayingOpen(true)} />
      <TabBar active={activeTab} onChange={setActiveTab} />
      <NowPlayingModal visible={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
    </View>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <DownloadProvider>
      <PlayerProvider>
        <LibraryProvider>
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <StatusBar style="light" />
            {isAuthenticated ? <AppShell /> : <LoginScreen />}
          </SafeAreaView>
        </LibraryProvider>
      </PlayerProvider>
    </DownloadProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
safeArea: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: COLORS.background,
  },
  screenContent: {
    flex: 1,
    width: '100%',
  },
  homeList: {
    flex: 1,
    width: '100%',
  },
  listContent: {
    width: '100%',
    paddingTop: 12,
  },
header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
    marginBottom: 16,
  },
  chipsScroll: {
    flex: 1,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cardPress,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarLetter: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  chipRow: {
    paddingVertical: 0,
  },
  chip: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: COLORS.pill,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: COLORS.green,
  },
  chipText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#000000',
    fontWeight: '600',
  },
  sectionTitle: {
    ...TYPE.sectionTitle,
    color: COLORS.textPrimary,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  quickGrid: {
    width: '100%',
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  quickTile: {
    width: '48.5%',
    height: 56,
    backgroundColor: COLORS.card,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8,
  },
  quickArtwork: {
    width: 56,
    height: 56,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTextWrap: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  quickTitle: {
    ...TYPE.cardTile,
    color: '#FFFFFF',
  },
  heroSection: {
    marginTop: 24,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.cardPress,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarLetter: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  heroHeaderText: {
    flex: 1,
  },
  heroKicker: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  heroArtist: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 1,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: '#242424',
    borderRadius: 8,
    overflow: 'hidden',
    height: 140,
    paddingRight: 16,
    marginBottom: 24,
  },
  heroArtwork: {
    width: 140,
    height: 140,
  },
  heroMeta: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  heroSublabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  heroTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  heroArtistName: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  heroActions: {
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 16,
  },
  heroMore: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPlay: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowSection: {
    marginTop: 20,
  },
  rowLoading: {
    marginVertical: 24,
    alignSelf: 'center',
  },
  rowError: {
    color: COLORS.textSecondary,
    marginVertical: 16,
    textAlign: 'center',
  },
  rowContent: {
    paddingLeft: 16,
    paddingRight: 16,
    gap: 16,
  },
  card: {
    width: 152,
  },
  cardArtwork: {
    width: 152,
    height: 152,
    borderRadius: 4,
    marginBottom: 8,
  },
  cardTitle: {
    ...TYPE.cardTile,
    color: COLORS.textPrimary,
  },
  cardSubtitle: {
    ...TYPE.body,
    marginTop: 2,
  },
  bottomSpacer: {
    height: 24,
  },
disabled: {
    opacity: 0.5,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  trackRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    ...TYPE.body,
    marginTop: 1,
  },
  trackAction: {
    marginLeft: 12,
  },
  atpBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  atpCard: {
    backgroundColor: COLORS.elevated,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  atpTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  atpCreate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  atpInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    color: COLORS.textPrimary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  atpCreateBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  atpCreateLabel: {
    color: '#121212',
    fontWeight: '600',
  },
  atpList: {
    marginTop: 4,
  },
  atpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  atpRowLabel: {
    color: COLORS.textPrimary,
    fontSize: 14,
    flex: 1,
  },
  atpEmpty: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 12,
  },
  searchContainer: {
    flex: 1,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  searchTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
  },
  searchCamera: {
    padding: 4,
  },
  searchPill: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
  },
  searchPillInput: {
    flex: 1,
    color: '#121212',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
    paddingVertical: 0,
  },
  searchLoading: {
    alignSelf: 'center',
    marginVertical: 16,
  },
  searchError: {
    color: '#F15E6C',
    marginTop: 24,
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
  searchBrowse: {
    flex: 1,
  },
  searchBrowseContent: {
    paddingBottom: 24,
  },
  browseTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  browseGrid: {
    width: '100%',
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
    columnGap: 12,
  },
  browseCard: {
    width: '48%',
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    padding: 12,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  browseCardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    maxWidth: '70%',
  },
  browseArt: {
    position: 'absolute',
    bottom: -6,
    right: -12,
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    transform: [{ rotate: '25deg' }],
    elevation: 4,
  },
  libraryScreen: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 8,
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  libraryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cardPress,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryAvatarLetter: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  libraryTitle: {
    ...TYPE.display,
    color: COLORS.textPrimary,
    flex: 1,
  },
  libraryHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  libraryHeaderBtn: {
    padding: 4,
  },
  libraryPillsScroll: {
    flexGrow: 0,
    marginBottom: 12,
  },
  libraryPillsContent: {
    paddingHorizontal: 16,
  },
  libraryPill: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#282828',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryPillActive: {
    backgroundColor: '#FFFFFF',
  },
  libraryPillText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  libraryPillTextActive: {
    color: '#000000',
  },
  libraryToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  libraryToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  libraryToolbarText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  libRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    gap: 12,
    paddingHorizontal: 16,
  },
  libCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  libRowInfo: {
    flex: 1,
  },
  libRowTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  libRowSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  libRowSubtitle: {
    ...TYPE.body,
  },
  librarySubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 8,
  },
  libraryList: {
    paddingBottom: 24,
  },
  libraryCreateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  libraryCreateInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    color: COLORS.textPrimary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  libraryCreateBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  libraryCreateLabel: {
    color: '#121212',
    fontWeight: '600',
  },
  libraryEmpty: {
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  importContainer: {
    flex: 1,
    padding: 16,
    paddingTop: 8,
  },
  importTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  importInput: {
    height: 50,
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  importButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1ED760',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonLabel: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  importProgress: {
    color: '#1ED760',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
  },
  importError: {
    color: '#F15E6C',
    fontSize: 13,
    marginTop: 14,
  },
  importHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  importSuccess: {
    backgroundColor: '#282828',
    borderRadius: 8,
    padding: 16,
    marginTop: 24,
  },
  importSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  importSuccessArt: {
    width: 64,
    height: 64,
    borderRadius: 4,
  },
  importSuccessArtFallback: {
    backgroundColor: COLORS.cardPress,
  },
  importSuccessMeta: {
    flex: 1,
    marginLeft: 12,
  },
  importSuccessName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  importSuccessCount: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  importOpenBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  importOpenLabel: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  libDetailCover: {
    width: 120,
    height: 120,
    borderRadius: 8,
    alignSelf: 'center',
    marginBottom: 14,
    backgroundColor: COLORS.card,
  },
  loginRoot: {
    flex: 1,
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loginLogo: {
    marginBottom: 28,
  },
  loginTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 36,
  },
  loginInput: {
    width: '100%',
    height: 50,
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  loginButton: {
    width: '100%',
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1ED760',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  loginButtonLabel: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  loginGuest: {
    marginTop: 24,
    padding: 8,
  },
  loginGuestLabel: {
    color: '#B3B3B3',
    fontSize: 14,
    fontWeight: '600',
  },
  acctBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  acctSheet: {
    backgroundColor: '#282828',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  acctProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  acctAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  acctAvatarFallback: {
    backgroundColor: '#1ED760',
  },
  acctAvatarLetter: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '700',
  },
  acctMeta: {
    flex: 1,
    marginLeft: 14,
  },
  acctName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  acctUsername: {
    color: '#B3B3B3',
    fontSize: 13,
    marginTop: 2,
  },
  acctLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  acctLogoutLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 16,
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
  scrubWrapLarge: {
    width: '100%',
    marginTop: 28,
  },
  scrubTrackLarge: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4d4d4d',
    overflow: 'hidden',
  },
  scrubFillLarge: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.white,
  },
  scrubLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  scrubTime: {
    ...TYPE.micro,
  },
  miniPlayer: {
    position: 'absolute',
    bottom: 58,
    left: 8,
    right: 8,
    height: 56,
    backgroundColor: '#282828',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
    elevation: 10,
  },
  miniPlayerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniPlayerArtwork: {
    width: 42,
    height: 42,
    borderRadius: 4,
  },
  miniPlayerArtworkFallback: {
    backgroundColor: '#7358FF',
  },
  miniPlayerInfo: {
    flex: 1,
    paddingLeft: 8,
  },
  miniPlayerTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  miniPlayerArtist: {
    ...TYPE.body,
    marginTop: 1,
  },
  miniPlayerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingRight: 12,
  },
  miniPlayerPlay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    width: '100%',
    backgroundColor: '#565656',
    borderRadius: 1,
  },
  miniProgressFill: {
    height: 2,
    backgroundColor: COLORS.green,
    borderRadius: 1,
  },
  npRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  npHandleRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  npCloseBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 4,
  },
  npDragHandle: {
    marginTop: 8,
    alignItems: 'center',
  },
  npDragPill: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  npBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  npArtworkWrap: {
    marginTop: 24,
    elevation: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  npArtwork: {
    borderRadius: 12,
    backgroundColor: COLORS.card,
  },
  npArtworkFallback: {
    backgroundColor: '#503750',
  },
  npMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    width: '100%',
    gap: 16,
  },
  npMetaText: {
    flex: 1,
  },
  npTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  npArtist: {
    color: '#A0A0A0',
    fontSize: 16,
    marginTop: 4,
  },
  npError: {
    color: '#F15E6C',
    fontSize: 14,
    marginTop: 6,
  },
  npControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
    marginTop: 32,
    width: '100%',
  },
  npPlay: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  npPlayToken: {
    marginLeft: 6,
  },
  npVolumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginTop: 24,
  },
  npVolumeTrack: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#4d4d4d',
    overflow: 'hidden',
  },
  npVolumeFill: {
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  npDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 'auto',
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
  npEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  npEmptyText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  queueRoot: {
    flex: 1,
    backgroundColor: '#121212',
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  queueTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 4,
  },
  queueListContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  queueSectionLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 8,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  queueArt: {
    width: 52,
    height: 52,
    borderRadius: 4,
    backgroundColor: COLORS.card,
  },
  queueArtFallback: {
    backgroundColor: COLORS.cardPress,
  },
  queueRowInfo: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },
  queueRowTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  queueRowTitleNow: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  queueRowArtist: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  queueRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  autoplayPill: {
    backgroundColor: COLORS.cardPress,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  autoplayPillLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  queueEmpty: {
    color: COLORS.textSubdued,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 8,
  },
  autoplayToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  autoplayToggleInfo: {
    flex: 1,
    paddingRight: 16,
  },
  autoplayToggleTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  autoplayToggleSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  tosBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  tosSheet: {
    backgroundColor: '#282828',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  tosPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  tosPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tosArtwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: COLORS.card,
  },
  tosArtworkFallback: {
    backgroundColor: '#7358FF',
  },
  tosPreviewText: {
    flex: 1,
    marginLeft: 12,
  },
  tosPreviewTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  tosPreviewArtist: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  tosDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 4,
  },
  tosItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  tosItemLabel: {
    color: COLORS.textPrimary,
    fontSize: 15,
    marginLeft: 16,
    flex: 1,
  },
  lgRoot: {
    flex: 1,
    backgroundColor: '#121212',
  },
  lgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
  },
  lgNavRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  lgBack: {
    padding: 8,
  },
  lgSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  lgSearchBox: {
    flex: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginRight: 8,
  },
  lgSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    marginLeft: 8,
    paddingVertical: 0,
  },
  lgSortBtn: {
    height: 36,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  lgSortLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  lgList: {
    flex: 1,
  },
  lgListContent: {
    paddingBottom: 32,
  },
  lgTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  lgCount: {
    color: '#B3B3B3',
    fontSize: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  lgActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  lgDownload: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#B3B3B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lgDownloadDone: {
    borderColor: '#1ED760',
    backgroundColor: '#1ED760',
  },
  lgDownloadProgress: {
    color: '#B3B3B3',
    fontSize: 12,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  lgActionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lgShuffle: {
    marginRight: 16,
    padding: 4,
  },
  lgPlayPrimary: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1ED760',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lgPlayToken: {
    marginLeft: 2,
  },
  lgChipsScroll: {
    flexGrow: 0,
    marginBottom: 16,
  },
  lgChipsContent: {
    paddingHorizontal: 16,
  },
  lgChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#282828',
    marginRight: 8,
    justifyContent: 'center',
  },
  lgChipActive: {
    backgroundColor: '#FFFFFF',
  },
  lgChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  lgChipTextActive: {
    color: '#000000',
  },
  lgAddRow: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lgAddIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#282828',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lgAddLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
  },
  lgRow: {
    height: 60,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lgRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  lgRowArtwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: COLORS.card,
  },
  lgRowArtworkFallback: {
    backgroundColor: '#7358FF',
  },
  lgRowInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  lgRowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  lgRowTitleActive: {
    color: '#1ED760',
  },
  lgRowArtist: {
    color: '#B3B3B3',
    fontSize: 12,
    marginTop: 2,
  },
  lgRowMore: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  lgRowDownloaded: {
    marginRight: 12,
  },
  lgEmpty: {
    color: '#B3B3B3',
    marginTop: 24,
    textAlign: 'center',
  },
  tabBar: {
    width: '100%',
    height: 56,
    backgroundColor: '#121212',
    borderTopWidth: 0,
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
    color: COLORS.textPrimary,
  },
});