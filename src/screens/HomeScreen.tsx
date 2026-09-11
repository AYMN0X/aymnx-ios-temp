import * as React from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import { useTrackActions } from "../context/TrackActionsContext";
import { useAuth } from "../context/AuthContext";
import { searchITunes } from "../services/musicApi";
import type { Track } from "../services/musicApi";
import { Border, Color } from "../theme/GlobalStyles";
import { PlaylistDetailScreen } from "./PlaylistDetailScreen";

interface PlaylistView {
  title: string;
  subtitle: string;
  tracks: Track[];
  coverColor: string;
}

const SEARCH_DEBOUNCE_MS = 300;
const TRACK_LIMIT = 25;

const FALLBACK_PLAYLIST_GRADIENTS: [string, string][] = [
  ["#6A1B9A", "#311B92"],
  ["#2B4B7A", "#0E7C7B"],
  ["#8D67AB", "#503750"],
  ["#D84000", "#E13300"],
  ["#1A237E", "#6A1B9A"],
];

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
  liked,
  onToggleLike,
  onMore,
}: {
  track: Track;
  active: boolean;
  onPress: () => void;
  liked: boolean;
  onToggleLike: () => void;
  onMore?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.trackRow} activeOpacity={0.7} onPress={onPress}>
      {track.artwork ? (
        <Image source={{ uri: track.artwork }} style={styles.trackArtwork} />
      ) : (
        <View style={[styles.trackArtwork, styles.trackArtworkFallback]} />
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
      <TouchableOpacity onPress={onToggleLike} hitSlop={8} style={styles.rowQuickAdd}>
        <Ionicons
          name={liked ? 'checkmark-circle' : 'add-circle-outline'}
          size={20}
          color={liked ? Color.accent : Color.tabInactive}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onMore} hitSlop={8} style={styles.rowQuickAdd}>
        <Ionicons name="ellipsis-horizontal" size={20} color={Color.tabInactive} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function PlaylistCard({
  title,
  subtitle,
  coverUrl,
  colors,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  coverUrl?: string;
  colors: [string, string];
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.playlistCard} onPress={onPress} activeOpacity={0.8}>
      {coverUrl ? (
        <Image source={{ uri: coverUrl }} style={styles.playlistCardCover} resizeMode="cover" />
      ) : (
        <LinearGradient colors={colors} style={styles.playlistCardCover}>
          {icon ?? null}
        </LinearGradient>
      )}
      <Text style={styles.playlistCardTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.playlistCardSubtitle} numberOfLines={1}>
        {subtitle}
      </Text>
    </TouchableOpacity>
  );
}

export const HomeScreen: React.FC<{
  onCreatePlaylist?: () => void;
  onOpenAccount?: () => void;
}> = ({ onCreatePlaylist, onOpenAccount }) => {
  const { playTrack, currentTrack } = usePlayer();
  const { likedSongs, playlists, isLiked, toggleLike } = useLibrary();
  const { openTrack } = useTrackActions();
  const { user } = useAuth();
  const userInitial = (user?.name || user?.username || "?").charAt(0).toUpperCase();

  const [playlistView, setPlaylistView] = React.useState<PlaylistView | null>(null);
  const [libraryView, setLibraryView] = React.useState<
    | { kind: "playlist"; id: string }
    | null
  >(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<Track[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const favouritesList = likedSongs.length > 0 ? likedSongs : DEFAULT_LIKED;

  const countLabel = (count: number) => `${count} ${count === 1 ? "song" : "songs"}`;

  const sortedHomePlaylists = [
    ...playlists.filter((p) => p.id !== "liked" && !p.isImported)
      .slice()
      .reverse(),
    ...playlists.filter((p) => p.isImported),
  ];

  const playlistCards: Array<{
    key: string;
    title: string;
    subtitle: string;
    coverUrl?: string;
    colors: [string, string];
    icon?: React.ReactNode;
    onPress: () => void;
  }> = sortedHomePlaylists.map((playlist, index) => ({
    key: playlist.id,
    title: playlist.name,
    subtitle: countLabel(playlist.tracks?.length ?? 0),
    coverUrl: playlist.coverUrl,
    colors: FALLBACK_PLAYLIST_GRADIENTS[index % FALLBACK_PLAYLIST_GRADIENTS.length],
    onPress: () => setLibraryView({ kind: "playlist", id: playlist.id }),
  }));

  const renderTracks = (tracks: Track[], onPlay: (track: Track) => void) =>
    tracks.map((track) => (
      <TrackListRow
        key={track.id}
        track={track}
        active={currentTrack?.id === track.id}
        liked={isLiked(track.id)}
        onToggleLike={() => toggleLike(track)}
        onMore={() => openTrack(track)}
        onPress={() => onPlay(track)}
      />
    ));

  if (playlistView) {
    return (
      <PlaylistDetailScreen
        title={playlistView.title}
        subtitle={playlistView.subtitle}
        tracks={playlistView.tracks}
        coverColor={playlistView.coverColor}
        onBack={() => setPlaylistView(null)}
      />
    );
  }

  if (libraryView) {
    return <PlaylistDetailScreen playlistId={libraryView.id} onBack={() => setLibraryView(null)} />;
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
            {onOpenAccount ? (
              <View style={styles.headerTop}>
                <TouchableOpacity
                  onPress={onOpenAccount}
                  hitSlop={12}
                  style={styles.profileAvatar}
                >
                  <Text style={styles.profileAvatarLetter}>{userInitial}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <Text style={styles.greetingTitle}>Welcome back!</Text>
            <Text style={styles.greetingSubtitle}>What do you feel like today?</Text>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={Color.placeholder} />
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

              <View style={[styles.section, styles.playlistsSection]}>
                <Text style={styles.sectionTitle}>Your playlists</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.playlistRail}
                >
                  {playlistCards.map((card) => (
                    <PlaylistCard
                      key={card.key}
                      title={card.title}
                      subtitle={card.subtitle}
                      coverUrl={card.coverUrl}
                      colors={card.colors}
                      icon={card.icon}
                      onPress={card.onPress}
                    />
                  ))}
                  {playlistCards.length === 0 ? (
                    <PlaylistCard
                      title="Create Playlist"
                      subtitle="Start your own mix"
                      colors={["#9066FE", "#5C39E8"]}
                      icon={<Ionicons name="add" size={28} color="#FFFFFF" />}
                      onPress={() => onCreatePlaylist?.()}
                    />
                  ) : null}
                </ScrollView>
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
    backgroundColor: Color.background,
  },
  safeArea: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 90,
  },
  header: {
    gap: 4,
    width: "100%",
    alignSelf: "stretch",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Color.surface,
    borderWidth: 1,
    borderColor: Color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarLetter: {
    color: Color.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  greetingTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Color.textPrimary,
    flexShrink: 1,
  },
  greetingSubtitle: {
    fontSize: 14,
    color: Color.textSecondary,
    fontWeight: "500",
  },
  searchContainer: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    backgroundColor: Color.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Color.inputBorder,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    color: Color.textPrimary,
    fontSize: 15,
    marginLeft: 8,
    paddingVertical: 0,
  },
  playlistRail: {
    gap: 12,
    paddingRight: 16,
  },
  playlistCard: {
    width: 140,
    gap: 6,
  },
  playlistCardCover: {
    width: 140,
    height: 140,
    borderRadius: Border.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.card,
  },
  playlistCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  playlistCardSubtitle: {
    fontSize: 12,
    color: Color.textSecondary,
  },
  section: {
    gap: 14,
    width: "100%",
    alignSelf: "stretch",
  },
  playlistsSection: {
    marginTop: 20,
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
    gap: 0,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Color.surface,
    borderRadius: 12,
    marginBottom: 8,
    padding: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  trackArtwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: Color.card,
  },
  trackArtworkFallback: {
    backgroundColor: Color.card,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  trackTitleActive: {
    color: Color.accent,
  },
  trackArtist: {
    fontSize: 13,
    color: Color.textSecondary,
  },
  trackArtistActive: {
    color: Color.accent,
  },
  playingDot: {
    fontSize: 10,
    color: Color.accent,
  },
  rowQuickAdd: {
    padding: 6,
  },
});

export default HomeScreen;