import * as React from "react";
import {
  Image,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Color, Border } from "../theme/GlobalStyles";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import type { Track } from "../services/musicApi";

interface Screen3Props {
  title?: string;
  subtitle?: string;
  tracks?: Track[];
  coverColor?: string;
  coverImage?: string;
  isLikedPlaylist?: boolean;
  onBack: () => void;
}

const FALLBACK_COLORS = [
  "#6A1B9A",
  "#311B92",
  "#E13300",
  "#2B4B7A",
  "#0E7C7B",
  "#8D67AB",
  "#503750",
  "#D84000",
];

export const Screen3: React.FC<Screen3Props> = ({
  title,
  subtitle,
  tracks,
  coverColor,
  coverImage,
  isLikedPlaylist,
  onBack,
}) => {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const { likedSongs, isLiked, toggleLike } = useLibrary();

  const displayTracks = isLikedPlaylist ? likedSongs : (tracks ?? []);
  const displayTitle = isLikedPlaylist ? "Liked Songs" : (title ?? "Playlist");
  const displaySubtitle =
    subtitle || `${displayTracks.length} ${displayTracks.length === 1 ? "song" : "songs"}`;
  const coverBackground = isLikedPlaylist ? "#450AF5" : (coverColor ?? Color.accent);

  const artworkFor = (track: Track) =>
    (track as Track & { albumArt?: string }).albumArt || track.artwork;

  const handlePlayAll = () => {
    if (displayTracks.length > 0) {
      playTrack(displayTracks[0], displayTracks);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.heroContainer, { backgroundColor: coverBackground }]}>
        {coverImage && coverImage.length > 0 ? (
          <ImageBackground
            source={{ uri: coverImage }}
            style={styles.heroImageCover}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.heroGradient, { backgroundColor: coverBackground, opacity: 0.45 }]} />
        )}
        <SafeAreaView style={styles.safeTop}>
          <View style={styles.topNav}>
            <TouchableOpacity onPress={onBack} style={styles.iconButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={26} color={Color.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="ellipsis-horizontal" size={22} color={Color.textPrimary} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.playlistMetaRow}>
          <View style={styles.metaInfo}>
            <Text style={styles.playlistTitle}>{displayTitle}</Text>
            <Text style={styles.playlistSubtitle}>{displaySubtitle}</Text>
          </View>

          <View style={styles.metaActions}>
            <TouchableOpacity onPress={handlePlayAll} style={styles.playButton} activeOpacity={0.8}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#FFFFFF" style={{ marginLeft: isPlaying ? 0 : 2 }} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.trackList}>
          {displayTracks.length === 0 ? (
            <Text style={styles.emptyText}>No songs yet</Text>
          ) : (
            displayTracks.map((track, index) => {
              const artwork = artworkFor(track);
              const isCurrent = currentTrack?.id === track.id;
              const liked = isLiked(track.id);
              return (
                <TouchableOpacity
                  key={track.id}
                  style={[styles.trackRow, isCurrent && styles.trackRowActive]}
                  onPress={() => playTrack(track, displayTracks)}
                  activeOpacity={0.7}
                >
                  {artwork ? (
                    <Image source={{ uri: artwork }} style={styles.trackArtwork} />
                  ) : (
                    <View style={[styles.trackArtwork, { backgroundColor: FALLBACK_COLORS[index % FALLBACK_COLORS.length] }]} />
                  )}
                  <View style={styles.trackDetails}>
                    <Text
                      style={[styles.trackTitle, isCurrent && styles.trackTitleCurrent]}
                      numberOfLines={1}
                    >
                      {track.title}
                    </Text>
                    <Text style={[styles.trackArtist, isCurrent && styles.trackArtistCurrent]} numberOfLines={1}>
                      {track.artist}
                      {track.album ? ` • ${track.album}` : ""}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleLike(track)} hitSlop={10} style={styles.likeButton}>
                    <Ionicons
                      name={liked ? "heart" : "heart-outline"}
                      size={20}
                      color={liked ? Color.accent : Color.textSecondary}
                    />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Color.background,
  },
  safeTop: {
    zIndex: 10,
  },
  heroContainer: {
    height: 220,
    justifyContent: "flex-start",
    position: "relative",
  },
  heroImageCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroGradient: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
    marginTop: -20,
  },
  scrollContent: {
    backgroundColor: Color.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 24,
    minHeight: "100%",
  },
  playlistMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaInfo: {
    gap: 4,
  },
  playlistTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  playlistSubtitle: {
    fontSize: 13,
    color: Color.textSecondary,
    fontWeight: "500",
  },
  metaActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Color.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  trackList: {
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Color.textSecondary,
    textAlign: "center",
    marginTop: 24,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 14,
  },
  trackRowActive: {
    opacity: 0.9,
  },
  trackArtwork: {
    width: 46,
    height: 46,
    borderRadius: Border.sm,
  },
  trackDetails: {
    flex: 1,
    gap: 3,
  },
  trackTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  trackTitleCurrent: {
    color: Color.accent,
  },
  trackArtist: {
    fontSize: 12,
    color: Color.textSecondary,
  },
  trackArtistCurrent: {
    color: Color.accent,
  },
  likeButton: {
    padding: 6,
  },
});

export default Screen3;