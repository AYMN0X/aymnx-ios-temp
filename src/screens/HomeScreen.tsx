import * as React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useLibrary } from "../context/LibraryContext";
import { usePlayer } from "../context/PlayerContext";
import type { Track } from "../services/musicApi";
import { COLORS } from "../theme/appTheme";

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

  const displayName = (user?.name || user?.username || "Ayman")
    .toUpperCase()
    .trim();
  const tracks = likedSongs.length > 0 ? likedSongs : DEFAULT_LIKED;

  const handlePlay = (track: Track) => {
    playTrack(track, tracks);
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

  return (
    <View style={styles.container}>
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 150 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={renderCard}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.appBar}>
              <View style={styles.backButton}>
                <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
              </View>
              <Pressable onPress={onOpenAccount} hitSlop={12} style={styles.avatar}>
                {user?.avatarUrl ? (
                  <Image
                    source={{ uri: user.avatarUrl }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.avatarLetter}>
                    {(user?.name || user?.username || "A").charAt(0).toUpperCase()}
                  </Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.welcome} numberOfLines={1}>
              WELCOME, {displayName}
            </Text>
            <Text style={styles.sectionTitle}>Recently Played</Text>
          </View>
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
  columnWrapper: {
    gap: 16,
  },
  header: {
    width: "100%",
    paddingBottom: 4,
  },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
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
  },
  avatarLetter: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  welcome: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: "#828B84",
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.3,
    color: "#75AA78",
    marginTop: 4,
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
    color: "#F0F3F1",
    marginTop: 8,
  },
  cardTitleActive: {
    color: "#75AA78",
  },
  cardSubtitle: {
    fontSize: 11,
    color: "#828B84",
    marginTop: 2,
  },
});

export default HomeScreen;