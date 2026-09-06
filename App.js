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
  Download,
  Heart,
  Home,
  Library,
  ListMusic,
  MoreHorizontal,
  Pause,
  Play,
  Search,
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
  Text,
  TextInput,
  TouchableOpacity,
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
import { AmbientBackground } from './src/components/AmbientBackground';
import { Screen1 } from './src/screens/Screen1';
import { Screen2 } from './src/screens/Screen2';
import { Screen3 } from './src/screens/Screen3';
import { Screen4 } from './src/screens/Screen4';
import { searchITunes } from './src/services/musicApi';
import { importSpotifyPlaylist } from './src/services/spotifyImportService';
import { getHasSeenOnboarding, setHasSeenOnboarding } from './src/services/storage';

const COLORS = {
  background: '#121212',
  elevated: '#242424',
  card: '#282828',
  cardPress: '#3E3E3E',
  pill: '#2A2A2A',
  green: '#1ED760',
  accent: '#781ECF',
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
  body: { fontSize: 11, fontWeight: '400', color: '#B3B3B3' },
  micro: { fontSize: 10, fontWeight: '400', color: '#B3B3B3' },
};

const LIKED_GRADIENT = ['#450AF5', '#8E8EE5'];

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

const TABS = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'library', label: 'Your Library', icon: Library },
  { key: 'create', label: 'AYMNX', icon: User },
];

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

function LibraryScreen({ onOpenAccount, initialDetail, onDetailConsumed }) {
  const {
    likedSongs,
    playlists,
    createPlaylist,
    toggleLike,
    isLiked,
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
      return <Screen3 isLikedPlaylist onBack={backToRoot} />;
    }
    const tracks = selectedPlaylist ? selectedPlaylist.tracks : [];
    return (
      <Screen3
        title={selectedPlaylist ? selectedPlaylist.name : 'Playlist'}
        subtitle={tracks.length === 1 ? '1 song' : `${tracks.length} songs`}
        tracks={tracks}
        coverImage={selectedPlaylist?.coverUrl}
        playlistId={detail.id}
        onBack={backToRoot}
      />
    );
  }

  const libraryItems = [
    { type: 'liked', key: 'liked', title: 'Liked Songs', subtitle: `Playlist • ${likedSongs.length} songs` },
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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <AmbientBackground style={styles.ambientLayer} />
      <Screen4 onClose={onClose} />
    </Modal>
  );
}

function TabBar({ active, onChange }) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 12);
  return (
    <View
      style={[
        styles.tabBar,
        { paddingBottom: bottomInset, height: 56 + bottomInset },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        const Icon = tab.icon;
        return (
          <Pressable key={tab.key} style={styles.tabItem} onPress={() => onChange(tab.key)}>
            <Icon size={24} color={isActive ? COLORS.accent : COLORS.textSecondary} />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LoginScreen() {
  const { login, signUp, loginGuest } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggleMode = () => {
    setIsSignUp((v) => !v);
    setErrorMsg('');
    setConfirmPassword('');
    setPassword('');
  };

  const handleSubmit = async () => {
    if (submitting || !identifier.trim()) {
      return;
    }
    if (isSignUp && !displayName.trim()) {
      setErrorMsg('Please enter a display name.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);
    try {
      const result = isSignUp
        ? await signUp(displayName, identifier, password)
        : await login(identifier, password);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fieldDisabled = !identifier.trim() || submitting || password.length === 0;
  const submitLabel = isSignUp ? 'Create Account' : 'Log In';

  return (
    <View style={styles.loginRoot}>
      <ScrollView
        style={styles.loginScroll}
        contentContainerStyle={styles.loginContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.loginTitle}>{"Millions of songs.\nFree on AYMNX."}</Text>

        {isSignUp && (
          <TextInput
            style={[styles.loginInput, styles.loginField]}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display Name"
            placeholderTextColor="#777777"
            autoCapitalize="words"
            autoCorrect={false}
          />
        )}

        <TextInput
          style={[styles.loginInput, styles.loginField]}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder="Username or Email"
          placeholderTextColor="#777777"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <View style={[styles.loginPasswordWrap, styles.loginField]}>
          <TextInput
            style={styles.loginPasswordInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#777777"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={styles.loginPasswordToggle}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#B3B3B3"
            />
          </Pressable>
        </View>

        {isSignUp && (
          <TextInput
            style={[styles.loginInput, styles.loginField]}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm Password"
            placeholderTextColor="#777777"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
          />
        )}

        {errorMsg ? <Text style={styles.loginError}>{errorMsg}</Text> : null}

        <Pressable
          style={[styles.loginButton, fieldDisabled && styles.disabled]}
          onPress={handleSubmit}
          disabled={fieldDisabled}
        >
          <Text style={styles.loginButtonLabel}>
            {submitting ? 'Please wait\u2026' : submitLabel}
          </Text>
        </Pressable>

        <Pressable style={styles.loginGuest} onPress={loginGuest} hitSlop={8}>
          <Text style={styles.loginGuestLabel}>Continue as Guest</Text>
        </Pressable>

        <Pressable style={styles.loginToggle} onPress={toggleMode} hitSlop={8}>
          <Text style={styles.loginToggleText}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          </Text>
          <Text style={styles.loginToggleLink}>{isSignUp ? 'Log in' : 'Sign up'}</Text>
        </Pressable>
      </ScrollView>
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
          <Screen2 />
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
      <View style={styles.bottomBarWrap} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(10, 5, 18, 0)', 'rgba(10, 5, 18, 0.75)', 'rgba(10, 5, 18, 0.98)']}
          locations={[0.0, 0.35, 1.0]}
          start={{ x: 0.5, y: 0.0 }}
          end={{ x: 0.5, y: 1.0 }}
          style={styles.bottomFade}
        />
        <MiniPlayer onOpen={() => setNowPlayingOpen(true)} />
        <TabBar active={activeTab} onChange={setActiveTab} />
      </View>
      <NowPlayingModal visible={nowPlayingOpen} onClose={() => setNowPlayingOpen(false)} />
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
    </View>
  );
}

function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const [onboardingSeen, setOnboardingSeen] = useState(null);

  useEffect(() => {
    let mounted = true;
    getHasSeenOnboarding()
      .then((seen) => {
        if (mounted) {
          setOnboardingSeen(seen);
        }
      })
      .catch((error) => console.warn('[app] Could not load onboarding flag.', error));
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.appRoot}>
      <AmbientBackground style={styles.ambientLayer} />
      {isLoading || onboardingSeen === null ? (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <StatusBar style="light" />
        </SafeAreaView>
      ) : !onboardingSeen ? (
        <View style={styles.onboardingRoot}>
          <StatusBar style="light" />
          <Screen1
            onContinue={() => {
              setOnboardingSeen(true);
              setHasSeenOnboarding(true).catch((error) =>
                console.warn('[app] Could not persist onboarding flag.', error)
              );
            }}
          />
        </View>
      ) : (
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
      )}
    </View>
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
  appRoot: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
  ambientLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
  onboardingRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
  screenContent: {
    flex: 1,
    width: '100%',
  },
  bottomBarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
    overflow: 'hidden',
  },
  bottomFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 18,
    pointerEvents: 'none',
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
    paddingBottom: 90,
  },
  searchBrowse: {
    flex: 1,
  },
  searchBrowseContent: {
    paddingBottom: 90,
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
    paddingTop: 12,
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
  libraryList: {
    paddingBottom: 90,
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
  loginRoot: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loginScroll: {
    flex: 1,
    width: '100%',
  },
  loginContent: {
    flexGrow: 1,
    width: '100%',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  loginTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 36,
  },
  loginField: {
    marginTop: 12,
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
  loginPasswordWrap: {
    width: '100%',
    position: 'relative',
  },
  loginPasswordInput: {
    width: '100%',
    height: 50,
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingRight: 44,
    color: '#FFFFFF',
    fontSize: 16,
  },
  loginPasswordToggle: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  loginError: {
    color: '#FF5252',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  loginButton: {
    width: '100%',
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonLabel: {
    color: '#FFFFFF',
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
  loginToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    padding: 8,
  },
  loginToggleText: {
    color: '#B3B3B3',
    fontSize: 14,
    fontWeight: '500',
  },
  loginToggleLink: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
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
  miniPlayer: {
    position: 'absolute',
    bottom: 64,
    left: 8,
    right: 8,
    height: 56,
    backgroundColor: '#282828',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'hidden',
    zIndex: 10,
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
    backgroundColor: COLORS.accent,
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
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 56,
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    zIndex: 10,
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