import * as React from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { searchITunes } from "../services/musicApi";
import type { Track } from "../services/musicApi";
import { Border, Color } from "../theme/GlobalStyles";
import { Screen3 } from "./Screen3";

const CATEGORY_KEYS = ["Recent", "Top 50", "Chill", "R&B", "Festival"];

const CATEGORY_QUERIES: Record<string, string> = {
  Recent: "recent hits",
  "Top 50": "top hits",
  Chill: "chill",
  "R&B": "rnb",
  Festival: "festival music",
};

interface PlaylistDef {
  id: string;
  title: string;
  subtitle: string;
  gradient?: [string, string];
  color?: string;
  targetCategory?: string;
}

interface PlaylistView {
  title: string;
  subtitle: string;
  tracks: Track[];
  coverColor: string;
}

const CATEGORY_MIXES: Record<string, PlaylistDef[]> = {
  Recent: [
    {
      id: "rnb-playlist",
      title: "R&B Playlist",
      subtitle: "Chill your mind",
      gradient: ["#6A1B9A", "#311B92"],
      targetCategory: "R&B",
    },
    {
      id: "daily-mix-2",
      title: "Daily Mix 2",
      subtitle: "Made for you",
      color: "#2B4B7A",
    },
  ],
  "Top 50": [
    {
      id: "top50-global",
      title: "Top 50 Global",
      subtitle: "The biggest hits right now",
      color: "#E13300",
    },
    {
      id: "top50-viral",
      title: "Viral Hits",
      subtitle: "Blowing up this week",
      gradient: ["#8D67AB", "#503750"],
    },
  ],
  Chill: [
    {
      id: "chill-lounge",
      title: "Chill Lounge",
      subtitle: "Easy listening",
      gradient: ["#1A237E", "#311B92"],
    },
    {
      id: "chill-lofi",
      title: "Lofi Focus",
      subtitle: "Beats to study to",
      color: "#0E7C7B",
    },
  ],
  "R&B": [
    {
      id: "rnb-playlist",
      title: "R&B Playlist",
      subtitle: "Chill your mind",
      gradient: ["#6A1B9A", "#311B92"],
    },
    {
      id: "rnb-soulful",
      title: "Soulful Vibes",
      subtitle: "Smooth & sultry",
      color: "#503750",
    },
  ],
  Festival: [
    {
      id: "festival-bangers",
      title: "Festival Bangers",
      subtitle: "Main stage energy",
      gradient: ["#D84000", "#8D67AB"],
    },
    {
      id: "festival-anthems",
      title: "Dance Anthems",
      subtitle: "Turn up the volume",
      color: "#E13300",
    },
  ],
};

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

function TrackListRow({
  track,
  active,
  onPress,
}: {
  track: Track;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.trackRow} activeOpacity={0.7} onPress={onPress}>
      {track.artwork ? (
        <Image source={{ uri: track.artwork }} style={styles.trackArtwork} />
      ) : (
        <View style={styles.trackArtwork} />
      )}
      <View style={styles.trackInfo}>
        <Text
          style={[styles.trackTitle, active && styles.trackTitleActive]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text
          style={[styles.trackArtist, active && styles.trackArtistActive]}
          numberOfLines={1}
        >
          {track.artist}
        </Text>
      </View>
      {active && <Text style={styles.playingDot}>●</Text>}
    </TouchableOpacity>
  );
}

function FeaturedCard({ mix, onPress }: { mix: PlaylistDef; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.featuredCard} activeOpacity={0.8} onPress={onPress}>
      {mix.gradient ? (
        <LinearGradient colors={mix.gradient} style={styles.featuredCardFill} />
      ) : (
        <View style={[styles.featuredCardFill, { backgroundColor: mix.color }]} />
      )}
      <Text style={styles.cardTitle}>{mix.title}</Text>
      <Text style={styles.cardSubtitle}>{mix.subtitle}</Text>
    </TouchableOpacity>
  );
}

export const Screen2: React.FC = () => {
  const { playTrack, currentTrack } = usePlayer();
  const { likedSongs } = useLibrary();

  const [selectedCategory, setSelectedCategory] = React.useState("Recent");
  const [playlistView, setPlaylistView] = React.useState<PlaylistView | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Track[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryTracksRef = React.useRef<Record<string, Track[]>>({});
  const fetchingRef = React.useRef<Set<string>>(new Set());

  const loadCategory = React.useCallback(async (category: string): Promise<Track[]> => {
    const cached = categoryTracksRef.current[category];
    if (cached) {
      return cached;
    }
    if (fetchingRef.current.has(category)) {
      return [];
    }
    const query = CATEGORY_QUERIES[category] ?? category;
    fetchingRef.current.add(category);
    try {
      const tracks = await searchITunes(query, TRACK_LIMIT);
      categoryTracksRef.current = { ...categoryTracksRef.current, [category]: tracks };
      return tracks;
    } catch (error) {
      return [];
    } finally {
      fetchingRef.current.delete(category);
    }
  }, []);

  const isSearchingNow = searchQuery.trim().length > 0;

  React.useEffect(() => {
    loadCategory(selectedCategory).catch(() => {});
  }, [selectedCategory, loadCategory]);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const runSearch = React.useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchError("");
      return;
    }
    setIsSearching(true);
    setSearchError("");
    try {
      const tracks = await searchITunes(trimmed, TRACK_LIMIT);
      setSearchResults(tracks);
    } catch (error) {
      setSearchError("Search failed. Tap to retry.");
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  const handlePlayTrack = (track: Track) => {
    const queue = isSearchingNow ? searchResults : favouritesList;
    playTrack(track, queue.length > 0 ? queue : [track]);
  };

  const handlePlayMix = async (mix: PlaylistDef) => {
    const target = mix.targetCategory ?? selectedCategory;
    const tracks = await loadCategory(target);
    if (tracks.length === 0) {
      return;
    }
    setPlaylistView({
      title: mix.title,
      subtitle: mix.subtitle,
      tracks,
      coverColor: mix.color ?? mix.gradient?.[0] ?? Color.accent,
    });
  };

  const favouritesList = likedSongs.length > 0 ? likedSongs : DEFAULT_LIKED;

  const renderTracks = (tracks: Track[], onPlay: (track: Track) => void) =>
    tracks.map((track) => (
      <TrackListRow
        key={track.id}
        track={track}
        active={currentTrack?.id === track.id}
        onPress={() => onPlay(track)}
      />
    ));

  if (playlistView) {
    return (
      <Screen3
        title={playlistView.title}
        subtitle={playlistView.subtitle}
        tracks={playlistView.tracks}
        coverColor={playlistView.coverColor}
        onBack={() => setPlaylistView(null)}
      />
    );
  }

return (
    <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.greetingTitle}>Welcome back!</Text>
            <Text style={styles.greetingSubtitle}>What do you feel like today?</Text>

            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search song, playlist, artist..."
                placeholderTextColor={Color.textSecondary}
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => runSearch(searchQuery)}
              />
            </View>
          </View>

          {isSearchingNow ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Results for "{searchQuery.trim()}"</Text>
              {isSearching ? (
                <ActivityIndicator color={Color.accent} style={styles.loading} />
              ) : searchError ? (
                <TouchableOpacity onPress={() => runSearch(searchQuery)}>
                  <Text style={styles.errorText}>{searchError}</Text>
                </TouchableOpacity>
              ) : searchResults.length === 0 ? (
                <Text style={styles.emptyText}>
                  No results found. Try a different search.
                </Text>
              ) : (
                <View style={styles.trackList}>
                  {renderTracks(searchResults, handlePlayTrack)}
                </View>
              )}
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {CATEGORY_KEYS.map((category) => {
                  const isActive = selectedCategory === category;
                  return (
                    <TouchableOpacity
                      key={category}
                      onPress={() => setSelectedCategory(category)}
                      style={styles.categoryTab}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.categoryText, isActive && styles.categoryTextActive]}>
                        {category}
                      </Text>
                      {isActive && <View style={styles.activeIndicator} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.featuredGrid}>
                {(CATEGORY_MIXES[selectedCategory] ?? []).map((mix) => (
                  <FeaturedCard
                    key={mix.id}
                    mix={mix}
                    onPress={() => handlePlayMix(mix)}
                  />
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Your favourites</Text>
                {likedSongs.length === 0 && (
                  <Text style={styles.favouritesHint}>
                    You haven't liked any songs yet — here are some picks to get you
                    started.
                  </Text>
                )}
                <View style={styles.trackList}>
                  {renderTracks(favouritesList, handlePlayTrack)}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
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
    backgroundColor: "transparent",
  },
  safeArea: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
  },
  scrollView: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
  },
  scrollContent: {
    width: "100%",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
    gap: 24,
  },
  header: {
    gap: 6,
    width: "100%",
    alignSelf: "stretch",
  },
  greetingTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  greetingSubtitle: {
    fontSize: 13,
    color: Color.textSecondary,
    fontWeight: "500",
  },
  searchContainer: {
    marginTop: 12,
  },
  searchInput: {
    height: 42,
    backgroundColor: Color.surface,
    borderRadius: Border.sm,
    paddingHorizontal: 14,
    color: Color.textPrimary,
    fontSize: 13,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 20,
    paddingVertical: 4,
    width: "100%",
    alignSelf: "stretch",
  },
  categoryTab: {
    alignItems: "center",
  },
  categoryText: {
    fontSize: 13,
    fontWeight: "600",
    color: Color.textSecondary,
  },
  categoryTextActive: {
    color: Color.accent,
  },
  activeIndicator: {
    marginTop: 4,
    height: 2,
    width: "100%",
    backgroundColor: Color.accent,
    borderRadius: 1,
  },
  featuredGrid: {
    flexDirection: "row",
    gap: 12,
  },
  featuredCard: {
    flex: 1,
    height: 120,
    borderRadius: Border.md,
    padding: 14,
    justifyContent: "flex-end",
    overflow: "hidden",
    backgroundColor: Color.card,
  },
  featuredCardFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  cardSubtitle: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 2,
  },
  section: {
    gap: 14,
    width: "100%",
    alignSelf: "stretch",
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
  },
  emptyText: {
    fontSize: 13,
    color: Color.textSecondary,
    paddingVertical: 16,
  },
  favouritesHint: {
    fontSize: 13,
    color: Color.textSecondary,
    lineHeight: 18,
  },
  trackList: {
    gap: 10,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    padding: 10,
    borderRadius: Border.md,
    gap: 12,
  },
  trackArtwork: {
    width: 42,
    height: 42,
    borderRadius: Border.sm,
    backgroundColor: Color.card,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  trackTitleActive: {
    color: Color.accent,
  },
  trackArtist: {
    fontSize: 11,
    color: Color.textSecondary,
  },
  trackArtistActive: {
    color: Color.accent,
  },
  playingDot: {
    fontSize: 10,
    color: Color.accent,
  },
});

export default Screen2;