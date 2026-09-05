import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import {
  Activity,
  Cast,
  ChevronDown,
  ChevronLeft,
  Heart,
  Home,
  Library,
  ListMusic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
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
import { LibraryProvider, useLibrary } from './src/context/LibraryContext';
import { PlayerProvider, usePlayer } from './src/context/PlayerContext';
import { fetchPopularHits, fetchTrendingNow, searchITunes } from './src/services/musicApi';

const COLORS = {
  background: '#121212',
  elevated: '#242424',
  card: '#282828',
  cardPress: '#333333',
  pill: '#2A2A2A',
  green: '#1ED760',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#B3B3B3',
};

const LIKED_GRADIENT = ['#450AF5', '#8E8EE5'];
const HERO_GRADIENT = ['#D84000', '#503750'];

const FILTERS = ['All', 'Music', 'Podcasts'];

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
  { key: 'create', label: 'Create', icon: Plus },
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
          <Pressable style={styles.heroAdd} hitSlop={8} onPress={() => toggleLike(SPOTLIGHT_TARGET)}>
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

function HomeScreen({ activeFilter, onFilterChange, onOpenLibrary }) {
  const { playTrack } = usePlayer();
  const { likedSongs } = useLibrary();

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
      data={QUICK_PICKS}
      keyExtractor={(item) => item.key}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <Pressable style={styles.userAvatar}>
            <Text style={styles.avatarLetter}>S</Text>
          </Pressable>
          <FilterChips
            active={activeFilter}
            onChange={onFilterChange}
            style={styles.chipsScroll}
          />
        </View>
      }
      renderItem={({ item }) => (
        <QuickPickTile item={item} onPress={() => handleQuickPress(item)} />
      )}
      ListFooterComponent={
        <View>
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
  const [modalTrack, setModalTrack] = useState(null);
  const debounceRef = useRef(null);
  const { playTrack } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();

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
        <Search size={16} color="#121212" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleChange}
          placeholder="What do you want to play?"
          placeholderTextColor="#7a7a7a"
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
        ListHeaderComponent={query.trim() !== '' ? <SectionTitle title="Top result" /> : null}
        ListEmptyComponent={
          !searching && !error && query.trim() !== '' ? (
            <Text style={styles.searchEmpty}>No results found. Try a different search.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            liked={isLiked(item.id)}
            onPlay={() => playTrack(item, results)}
            onToggleLike={() => toggleLike(item)}
            onMore={() => setModalTrack(item)}
          />
        )}
      />
      <AddToPlaylistModal
        track={modalTrack}
        visible={!!modalTrack}
        onClose={() => setModalTrack(null)}
      />
    </View>
  );
}

function LibraryRow({ icon: Icon, title, subtitle, onPress }) {
  return (
    <Pressable style={styles.libraryRow} onPress={onPress}>
      <View style={styles.libraryRowIcon}>
        <Icon size={18} color={COLORS.white} />
      </View>
      <View style={styles.libraryRowText}>
        <Text style={styles.libraryRowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.libraryRowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function LibraryScreen() {
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
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const selectedPlaylist =
    detail && detail.type === 'playlist'
      ? playlists.find((playlist) => playlist.id === detail.id)
      : null;

  const backToRoot = () => {
    setDetail(null);
    setCreating(false);
    setName('');
  };

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
    const tracks =
      detail.type === 'liked' ? likedSongs : selectedPlaylist ? selectedPlaylist.tracks : [];
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

  return (
    <View style={styles.libraryScreen}>
      <View style={styles.libraryHeader}>
        <Text style={[styles.libraryTitle, styles.libraryRootTitle]}>Your Library</Text>
        <Pressable
          style={styles.libraryAdd}
          onPress={() => setCreating((value) => !value)}
          hitSlop={10}
        >
          <Plus size={22} color={COLORS.white} />
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
        data={playlists}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.libraryList}
        ListHeaderComponent={
          <LibraryRow
            icon={Heart}
            title="Liked Songs"
            subtitle={
              likedSongs.length === 1 ? 'Playlist · 1 song' : `Playlist · ${likedSongs.length} songs`
            }
            onPress={() => setDetail({ type: 'liked' })}
          />
        }
        renderItem={({ item }) => (
          <LibraryRow
            icon={ListMusic}
            title={item.name}
            subtitle={
              item.tracks.length === 1
                ? 'Playlist · 1 song'
                : `Playlist · ${item.tracks.length} songs`
            }
            onPress={() => setDetail({ type: 'playlist', id: item.id, name: item.name })}
          />
        )}
      />
    </View>
  );
}

function CreateScreen() {
  const { createPlaylist, playlists } = useLibrary();
  const [created, setCreated] = useState(false);

  const handleCreate = async () => {
    await createPlaylist(`My Playlist #${playlists.length + 1}`);
    setCreated(true);
  };

  return (
    <View style={styles.createContainer}>
      <Pressable style={styles.createButton} onPress={handleCreate}>
        <Plus size={44} color="#121212" />
      </Pressable>
      <Text style={styles.createTitle}>Create a playlist</Text>
      <Text style={styles.createSubtitle}>Build your own collection of songs.</Text>
      {created ? <Text style={styles.createDone}>Created! Find it in Your Library.</Text> : null}
    </View>
  );
}

function Scrubber({ position, duration, onSeek, large }) {
  const [width, setWidth] = useState(0);
  const progress = duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0;
  const trackStyle = large ? styles.scrubTrackLarge : styles.scrubTrack;
  const fillStyle = large ? styles.scrubFillLarge : styles.scrubFill;
  const wrapStyle = large ? styles.scrubWrapLarge : undefined;

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
        <Text style={styles.scrubTime}>{formatMillis(duration)}</Text>
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
  const artSize = Math.min(width - 48, 380);

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
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <View style={styles.npTopBar}>
          <Pressable style={styles.npChevron} onPress={onClose} hitSlop={12}>
            <ChevronDown size={26} color={COLORS.textPrimary} />
          </Pressable>
          <Text style={styles.npContext}>PLAYING FROM PLAYLIST</Text>
        </View>
        {currentTrack ? (
          <>
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
              <Pressable hitSlop={10}>
                <Shuffle size={24} color={COLORS.textSecondary} />
              </Pressable>
              <Pressable onPress={playPrevious} hitSlop={10}>
                <SkipBack size={34} color={COLORS.textPrimary} fill={COLORS.textPrimary} />
              </Pressable>
              <Pressable
                style={styles.npPlay}
                onPress={togglePlayPause}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {isPlaying ? (
                  <Pause size={34} color="#000000" fill="#000000" />
                ) : (
                  <Play
                    size={34}
                    color="#000000"
                    fill="#000000"
                    style={styles.npPlayToken}
                  />
                )}
              </Pressable>
              <Pressable onPress={playNext} hitSlop={10}>
                <SkipForward size={34} color={COLORS.textPrimary} fill={COLORS.textPrimary} />
              </Pressable>
              <Pressable hitSlop={10}>
                <Repeat size={24} color={COLORS.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.npUtilities}>
              <Pressable hitSlop={10}>
                <Cast size={26} color={COLORS.textSecondary} />
              </Pressable>
              <Pressable hitSlop={10}>
                <ListMusic size={26} color={COLORS.textSecondary} />
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.npEmpty}>
            <Text style={styles.npEmptyText}>Nothing is playing</Text>
          </View>
        )}
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

function AppShell() {
  const [activeTab, setActiveTab] = useState('home');
  const [activeFilter, setActiveFilter] = useState('All');
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.screenContent}>
        {activeTab === 'home' ? (
          <HomeScreen
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            onOpenLibrary={() => setActiveTab('library')}
          />
        ) : activeTab === 'search' ? (
          <SearchScreen />
        ) : activeTab === 'create' ? (
          <CreateScreen />
        ) : (
          <LibraryScreen />
        )}
      </View>
      <MiniPlayer onOpen={() => setNowPlayingOpen(true)} />
      <TabBar active={activeTab} onChange={setActiveTab} />
      <NowPlayingModal visible={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <PlayerProvider>
        <LibraryProvider>
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <StatusBar style="light" />
            <AppShell />
          </SafeAreaView>
        </LibraryProvider>
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
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  gridRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  quickTile: {
    width: '48.5%',
    height: 56,
    backgroundColor: '#2A2A2A',
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
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
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
    height: 120,
  },
  heroArtwork: {
    width: 120,
    height: 120,
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
    paddingVertical: 12,
    paddingRight: 12,
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
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
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
    color: COLORS.textSecondary,
    fontSize: 12,
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
  libraryScreen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  libraryRootTitle: {
    flex: 1,
  },
  libraryTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
  },
  libraryAdd: {
    padding: 4,
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
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  libraryRowIcon: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryRowText: {
    flex: 1,
  },
  libraryRowTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  libraryRowSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 1,
  },
  libraryEmpty: {
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  createContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  createButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  createTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  createSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  createDone: {
    color: COLORS.green,
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
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
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  miniPlayer: {
    position: 'absolute',
    bottom: 60,
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
    color: COLORS.textSecondary,
    fontSize: 11,
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
  npTopBar: {
    alignItems: 'center',
    marginBottom: 8,
  },
  npChevron: {
    padding: 4,
  },
  npContext: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 4,
  },
  npArtworkWrap: {
    elevation: 6,
  },
  npArtwork: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: COLORS.card,
  },
  npArtworkFallback: {
    backgroundColor: '#503750',
  },
  npMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    width: '100%',
    gap: 16,
  },
  npMetaText: {
    flex: 1,
  },
  npTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  npArtist: {
    color: COLORS.textSecondary,
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
    justifyContent: 'space-between',
    marginTop: 36,
    width: '100%',
  },
  npPlay: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  npPlayToken: {
    marginLeft: 3,
  },
  npUtilities: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 'auto',
    paddingBottom: 8,
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    height: 56,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.textPrimary,
  },
});