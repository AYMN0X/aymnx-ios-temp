import * as React from "react";
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Color, Border } from "../theme/GlobalStyles";
import { usePlayer } from "../context/PlayerContext";
import type { Track } from "../services/musicApi";

interface PlaylistTrack extends Track {
  duration: string;
  color: string;
}

const PLAYLIST_TRACKS: PlaylistTrack[] = [
  { id: "1", title: "You right", artist: "Doja Cat, The Weeknd", album: "", artwork: "", previewUrl: "", duration: "3:58", color: "#E05A47" },
  { id: "2", title: "2 AM", artist: "Arizona Zervas", album: "", artwork: "", previewUrl: "", duration: "3:03", color: "#9C27B0" },
  { id: "3", title: "Baddest", artist: "2 Chainz, Chris Brown", album: "", artwork: "", previewUrl: "", duration: "3:51", color: "#3B82F6" },
  { id: "4", title: "True Love", artist: "Kanye West", album: "", artwork: "", previewUrl: "", duration: "4:52", color: "#F59E0B" },
  { id: "5", title: "Bye Bye", artist: "Marshmello, Juice WRLD", album: "", artwork: "", previewUrl: "", duration: "2:09", color: "#10B981" },
  { id: "6", title: "Hands on you", artist: "Austin George", album: "", artwork: "", previewUrl: "", duration: "3:56", color: "#EC4899" },
];

interface Screen3Props {
  onBack?: () => void;
}

export const Screen3: React.FC<Screen3Props> = ({ onBack }) => {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [isLiked, setIsLiked] = React.useState(false);

  const handlePlayAll = () => {
    if (PLAYLIST_TRACKS.length > 0) {
      playTrack(PLAYLIST_TRACKS[0], PLAYLIST_TRACKS);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.heroContainer}>
        <View style={styles.heroGradient} />
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
            <Text style={styles.playlistTitle}>R&B Playlist</Text>
            <Text style={styles.playlistSubtitle}>Chill your mind</Text>
          </View>

          <View style={styles.metaActions}>
            <TouchableOpacity onPress={() => setIsLiked(!isLiked)} style={styles.actionIcon}>
              <Ionicons
                name={isLiked ? "heart" : "heart-outline"}
                size={24}
                color={isLiked ? Color.accent : Color.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={handlePlayAll} style={styles.playButton} activeOpacity={0.8}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={22} color="#FFFFFF" style={{ marginLeft: isPlaying ? 0 : 2 }} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.trackList}>
          {PLAYLIST_TRACKS.map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <TouchableOpacity
                key={track.id}
                style={[styles.trackRow, isCurrent && styles.trackRowActive]}
                onPress={() => playTrack(track, PLAYLIST_TRACKS)}
                activeOpacity={0.7}
              >
                <View style={[styles.trackArtwork, { backgroundColor: track.color }]} />
                <View style={styles.trackDetails}>
                  <Text
                    style={[styles.trackTitle, isCurrent && { color: Color.accent }]}
                    numberOfLines={1}
                  >
                    {track.title}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                </View>
                <Text style={styles.trackDuration}>{track.duration}</Text>
              </TouchableOpacity>
            );
          })}
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
    backgroundColor: "#1F1235",
    justifyContent: "flex-start",
    position: "relative",
  },
  heroGradient: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#2E1065",
    opacity: 0.6,
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
  actionIcon: {
    padding: 6,
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
  trackArtist: {
    fontSize: 12,
    color: Color.textSecondary,
  },
  trackDuration: {
    fontSize: 12,
    color: Color.textSecondary,
    fontVariant: ["tabular-nums"],
  },
});

export default Screen3;