import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { useTrackActions } from "../context/TrackActionsContext";
import { useAuth } from "../context/AuthContext";
import { searchSoundCloudTracks } from "../services/musicApi";
import type { Track } from "../services/musicApi";
import { Color } from "../theme/GlobalStyles";
import { TrackRow } from "../components/TrackRow";
import { SoundCloudResultRow } from "../components/SoundCloudResultRow";

const SEARCH_DEBOUNCE_MS = 300;
const TRACK_LIMIT = 25;

const DEFAULT_LIKED: Track[] = [
  {
    id: "quick-blinding-lights",
    title: "Blinding Lights",
    artist: "The Weeknd",
    album: "After Hours",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/6f/bc/e6/6fbce6c4-c38c-72d8-4fd0-66cfff32f679/20UMGIM12176.rgb.jpg/600x600bb.jpg",
    previewUrl: "",
  },
  {
    id: "quick-levitating",
    title: "Levitating",
    artist: "Dua Lipa",
    album: "Future Nostalgia",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Music116/v4/6c/11/d6/6c11d681-aa3a-d59e-4c2e-f77e181026ab/190295092665.jpg/600x600bb.jpg",
    previewUrl: "",
  },
  {
    id: "quick-heat-waves",
    title: "Heat Waves",
    artist: "Glass Animals",
    album: "Dreamland",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/da/8b/77/da8b7731-6f4f-eacf-5e74-8b23389eefa1/20UMGIM03371.rgb.jpg/600x600bb.jpg",
    previewUrl: "",
  },
  {
    id: "quick-believer",
    title: "Believer",
    artist: "Imagine Dragons",
    album: "Evolve",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Music126/v4/11/7a/b8/117ab805-6811-8929-18b9-0fad7baf0c25/17UMGIM98210.rgb.jpg/600x600bb.jpg",
    previewUrl: "",
  },
  {
    id: "quick-shivers",
    title: "Shivers",
    artist: "Ed Sheeran",
    album: "=",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/c5/d8/c6/c5d8c675-63e3-6632-33db-2401eabe574d/190296491412.jpg/600x600bb.jpg",
    previewUrl: "",
  },
  {
    id: "quick-uptown-funk",
    title: "Uptown Funk",
    artist: "Mark Ronson",
    album: "Uptown Special",
    artwork:
      "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/7e/30/c5/7e30c572-aa47-5f7b-c6fd-42d50cd2c56d/886444959797.jpg/600x600bb.jpg",
    previewUrl: "",
  },
];

export const HomeScreen: React.FC<{
  onCreatePlaylist?: () => void;
  onOpenAccount?: () => void;
}> = ({ onCreatePlaylist, onOpenAccount }) => {
  const insets = useSafeAreaInsets();
  const { playTrack, currentTrack } = usePlayer();
  const { likedSongs, isLiked, toggleLike } = useLibrary();
  const { openTrack } = useTrackActions();
  const { user } = useAuth();
  const userInitial = (user?.name || user?.username || "?").charAt(0).toUpperCase();

  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Track[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasSearchCompleted, setHasSearchCompleted] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = React.useRef(0);

  const isSearchingNow = searchQuery.trim().length > 0;

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const runSearch = React.useCallback(async (term: string) => {
    const trimmed = term.trim();
    const seq = ++searchSeqRef.current;
    if (!trimmed) {
      setSearchResults([]);
      setSearchError("");
      setHasSearchCompleted(false);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError("");
    try {
      const tracks = await searchSoundCloudTracks(trimmed, TRACK_LIMIT);
      if (seq !== searchSeqRef.current) {
        return;
      }
      setSearchResults(tracks.slice(0, TRACK_LIMIT));
      setHasSearchCompleted(true);
    } catch (error) {
      if (seq !== searchSeqRef.current) {
        return;
      }
      setSearchError("Search failed. Tap to retry.");
      setSearchResults([]);
      setHasSearchCompleted(true);
    } finally {
      if (seq === searchSeqRef.current) {
        setIsSearching(false);
      }
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    searchSeqRef.current += 1;
    if (!text.trim()) {
      setSearchResults([]);
      setSearchError("");
      setHasSearchCompleted(false);
      setIsSearching(false);
      return;
    }
    setSearchResults([]);
    setSearchError("");
    setHasSearchCompleted(false);
    setIsSearching(true);
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const handlePlayTrack = (track: Track) => {
    const queue = isSearchingNow ? searchResults : favouritesList;
    playTrack(track, queue.length > 0 ? queue : [track]);
  };

  const favouritesList = likedSongs.length > 0 ? likedSongs : DEFAULT_LIKED;

  const renderTracks = (tracks: Track[], onPlay: (track: Track) => void) =>
    tracks.map((track) => (
      <TrackRow
        key={track.id}
        track={track}
        active={currentTrack?.id === track.id}
        liked={isLiked(track.id)}
        onToggleLike={() => toggleLike(track)}
        onMore={() => openTrack(track)}
        onPlay={() => onPlay(track)}
      />
    ));

  const headerNode = (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity
          onPress={onOpenAccount}
          hitSlop={12}
          style={styles.profileAvatar}
        >
          <Text style={styles.profileAvatarLetter}>{userInitial}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Library</Text>
        <View style={styles.headerActions}>
          {onCreatePlaylist ? (
            <TouchableOpacity onPress={onCreatePlaylist} hitSlop={8} style={styles.headerBtn}>
              <Ionicons name="add" size={24} color={Color.textPrimary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={Color.placeholder} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search music..."
          placeholderTextColor={Color.placeholder}
          value={searchQuery}
          onChangeText={handleSearchChange}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => runSearch(searchQuery)}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {headerNode}
      {isSearchingNow ? (
        <FlatList
          style={styles.scrollView}
          data={searchResults}
          keyExtractor={(item) => item.id}
          windowSize={5}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 146 }]}
          ListHeaderComponent={
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Results for "{searchQuery.trim()}"</Text>
            </View>
          }
          ListEmptyComponent={
            isSearching ? (
              <ActivityIndicator color={Color.accent} style={styles.loading} />
            ) : searchError ? (
              <TouchableOpacity onPress={() => runSearch(searchQuery)}>
                <Text style={styles.errorText}>{searchError}</Text>
              </TouchableOpacity>
            ) : hasSearchCompleted ? (
              <Text style={styles.emptyText}>No results found. Try a different search.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <SoundCloudResultRow
              track={item}
              active={currentTrack?.id === item.id}
              onPlay={() => handlePlayTrack(item)}
            />
          )}
        />
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 146 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your favourites</Text>
            {likedSongs.length === 0 && (
              <Text style={styles.favouritesHint}>
                You haven't liked any songs yet — here are some picks to get you
                started.
              </Text>
            )}
          </View>
          <View style={styles.trackList}>
            {renderTracks(favouritesList, handlePlayTrack)}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
    backgroundColor: Color.background,
  },
  scrollView: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Color.background,
  },
  scrollContent: {
    width: "100%",
    alignSelf: "stretch",
    paddingTop: 8,
  },
  header: {
    gap: 4,
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: Color.background,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  profileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Color.card,
    borderWidth: 1,
    borderColor: Color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarLetter: {
    color: Color.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: Color.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerBtn: {
    padding: 4,
  },
  searchContainer: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    backgroundColor: Color.searchBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    color: Color.textPrimary,
    fontSize: 14,
    marginLeft: 6,
    paddingVertical: 0,
  },
  section: {
    gap: 10,
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  loading: {
    paddingVertical: 16,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: Color.accent,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    color: Color.textSecondary,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  favouritesHint: {
    fontSize: 13,
    color: Color.textSecondary,
    lineHeight: 18,
  },
  trackList: {
    gap: 0,
  },
});

export default HomeScreen;