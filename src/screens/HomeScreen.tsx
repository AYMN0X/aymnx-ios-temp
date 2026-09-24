import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { searchSoundCloudTracks } from "../services/musicApi";
import type { Track } from "../services/musicApi";
import { SoundCloudResultRow } from "../components/SoundCloudResultRow";
import { COLORS } from "../theme/appTheme";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 25;

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
  const { likedSongs } = useLibrary();
  const { user } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const displayName = (user?.name || user?.username || "Ayman")
    .toUpperCase()
    .trim();
  const tracks = likedSongs.length > 0 ? likedSongs : DEFAULT_LIKED;
  const searchActive = query.trim().length >= MIN_QUERY_LENGTH;

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    const seq = ++searchSeqRef.current;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError("");
      setHasSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const found = await searchSoundCloudTracks(trimmed, SEARCH_LIMIT);
      if (seq !== searchSeqRef.current) {
        return;
      }
      setResults(found.slice(0, SEARCH_LIMIT));
      setHasSearched(true);
    } catch (e) {
      if (seq !== searchSeqRef.current) {
        return;
      }
      setError("Search failed. Please try again.");
      setResults([]);
      setHasSearched(true);
    } finally {
      if (seq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  };

  const handleSearchChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    searchSeqRef.current += 1;
    if (text.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError("");
      setHasSearched(false);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const handlePlay = (track: Track) => {
    playTrack(track, tracks);
  };

  const handlePlayResult = (track: Track) => {
    playTrack(track, results);
  };

  const renderCard = ({ item }: { item: Track }) => {
    const active = currentTrack?.id === item.id;
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => handlePlay(item)}
        accessibilityRole="button"
      >
        {item.artwork ? (
          <Image
            source={{ uri: item.artwork }}
            style={styles.artwork}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.id}
            transition={150}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Ionicons name="musical-note" size={28} color={COLORS.tabInactive} />
          </View>
        )}
        <Text
          style={[styles.cardTitle, active && styles.cardTitleActive]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {item.artist || item.album}
        </Text>
      </Pressable>
    );
  };

  const renderItem = ({ item }: { item: Track }) =>
    searchActive ? (
      <SoundCloudResultRow
        track={item}
        active={currentTrack?.id === item.id}
        onPlay={() => handlePlayResult(item)}
      />
    ) : (
      renderCard({ item })
    );

  return (
    <View style={styles.container}>
      <FlatList
        data={searchActive ? results : tracks}
        keyExtractor={(item) => item.id}
        numColumns={searchActive ? 1 : 2}
        columnWrapperStyle={searchActive ? undefined : styles.columnWrapper}
        contentContainerStyle={[
          styles.listContent,
          searchActive && styles.searchListContent,
          { paddingBottom: insets.bottom + 150 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={[styles.header, searchActive && styles.headerPadding]}>
            <View style={styles.headerRow}>
              <Text style={styles.welcome} numberOfLines={1}>
                WELCOME, {displayName}
              </Text>
              <Pressable onPress={onOpenAccount} hitSlop={12} style={styles.avatar}>
                {user?.avatarUrl ? (
                  <Image
                    source={{ uri: user.avatarUrl }}
                    style={styles.avatarImage}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.avatarLetter}>
                    {(user?.name || user?.username || "A").charAt(0).toUpperCase()}
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={18}
                color="#8E8E93"
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={handleSearchChange}
                placeholder="Search SoundCloud"
                placeholderTextColor="#8E8E93"
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
                onSubmitEditing={() => runSearch(query)}
              />
            </View>

            <Text style={styles.sectionTitle}>
              {searchActive ? "Search Results" : "Recently Played"}
            </Text>
          </View>
        }
        ListEmptyComponent={
          searchActive ? (
            searching ? (
              <ActivityIndicator
                size="small"
                color={COLORS.accent}
                style={styles.searchLoading}
              />
            ) : error ? (
              <Text style={styles.searchError}>{error}</Text>
            ) : hasSearched ? (
              <Text style={styles.searchEmpty}>
                Nothing found on SoundCloud. Try a different search.
              </Text>
            ) : null
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 16,
  },
  searchListContent: {
    paddingHorizontal: 0,
    gap: 0,
  },
  columnWrapper: {
    gap: 16,
  },
  header: {
    width: "100%",
    paddingBottom: 4,
  },
  headerPadding: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginLeft: 12,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarLetter: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  welcome: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1.2,
    color: "#A0A0A0",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 16,
    marginBottom: 20,
  },
  searchIcon: {
    marginLeft: 2,
  },
  searchInput: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 15,
    marginLeft: 8,
    paddingVertical: 0,
  },
  searchLoading: {
    alignSelf: "center",
    marginVertical: 16,
  },
  searchError: {
    color: "#F15E6C",
    marginTop: 24,
    textAlign: "center",
  },
  searchEmpty: {
    color: "#A0A0A0",
    marginTop: 24,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: "#FFFFFF",
    marginTop: 0,
    marginBottom: 20,
  },
  card: {
    flex: 1,
    borderRadius: 14,
  },
  cardPressed: {
    opacity: 0.85,
  },
  artwork: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: COLORS.card,
  },
  artworkFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 8,
  },
  cardTitleActive: {
    color: "#FFFFFF",
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#A0A0A0",
    marginTop: 2,
  },
});

export default HomeScreen;