import { StatusBar } from 'expo-status-bar';
import {
  Activity,
  ChevronDown,
  ChevronLeft,
  Heart,
  Home,
  Library,
  ListMusic,
  Mic2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  SkipBack,
  SkipForward,
  Trash2,
  TrendingUp,
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
          <TrackCarousel title="Trending Now" fetchTracks={fetchTrendingNow} />
          <TrackCarousel title="Popular Hits" fetchTracks={fetchPopularHits} />
          <HorizontalRow title="Made for you" data={PLAYLISTS} />
          <HorizontalRow title="Popular albums" data={ALBUMS} />
          <HorizontalRow title="Podcasts to try" data={PODCASTS} />
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
  const { likedSongs, playlists, createPlaylist, removePlaylist, toggleLike, isLiked, removeTrackFromPlaylist } =
    useLibrary();
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
    const tracks = detail.type === 'liked' ? likedSongs : selectedPlaylist ? selectedPlaylist.tracks : [];
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
    isLoadingAudio,
    togglePlayPause,
    seekTo,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();

  return (
    <View style={styles.miniPlayer}>
      <Pressable
        style={styles.miniPlayerMain}
        onPress={currentTrack ? onOpen : null}
      >
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
            <>
              <Text style={styles.miniPlayerArtist} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
              <Scrubber position={playbackPosition} duration={duration} onSeek={seekTo} />
            </>
          ) : null}
        </View>
      </Pressable>
      {currentTrack ? (
        <Pressable
          style={styles.miniPlayerAction}
          onPress={() => toggleLike(currentTrack)}
          hitSlop={8}
        >
          <Heart
            size={18}
            color={COLORS.white}
            fill={isLiked(currentTrack.id) ? COLORS.white : 'transparent'}
          />
        </Pressable>
      ) : null}
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
  );
}

function NowPlayingModal({ visible, onClose }) {
  const {
    currentTrack,
    isPlaying,
    playbackPosition,
    duration,
    isLoadingAudio,
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
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <Pressable style={styles.npDismiss} onPress={onClose} hitSlop={12}>
          <ChevronDown size={26} color={COLORS.textPrimary} />
        </Pressable>
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
                <Text style={styles.npAlbum} numberOfLines={1}>
                  {currentTrack.album}
                </Text>
              </View>
              <Pressable onPress={() => toggleLike(currentTrack)} hitSlop={10}>
                <Heart
                  size={26}
                  color={COLORS.textPrimary}
                  fill={isLiked(currentTrack.id) ? COLORS.textPrimary : 'transparent'}
                />
              </Pressable>
            </View>
            <Scrubber
              position={playbackPosition}
              duration={duration}
              onSeek={seekTo}
              large
            />
            <View style={styles.npControls}>
              <Pressable onPress={playPrevious} hitSlop={10}>
                <SkipBack size={32} color={COLORS.textPrimary} fill={COLORS.textPrimary} />
              </Pressable>
              <Pressable style={styles.npPlay} onPress={togglePlayPause} disabled={isLoadingAudio}>
                {isLoadingAudio ? (
                  <Activity size={34} color="#121212" />
                ) : isPlaying ? (
                  <Pause size={34} color="#121212" fill="#121212" />
                ) : (
                  <Play size={34} color="#121212" fill="#121212" />
                )}
              </Pressable>
              <Pressable onPress={playNext} hitSlop={10}>
                <SkipForward size={32} color={COLORS.textPrimary} fill={COLORS.textPrimary} />
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
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);

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
    backgroundColor: '#1e1e1e',
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
  libraryScreen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
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
  disabled: {
    opacity: 0.5,
  },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
  },
  miniPlayerMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  },
  miniPlayerAction: {
    marginHorizontal: 2,
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
    fontSize: 10,
  },
  npRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  npDismiss: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  npArtworkWrap: {
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
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
    marginTop: 32,
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
  npAlbum: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  npControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
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