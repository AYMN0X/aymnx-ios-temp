import * as React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { Color, Border } from "../theme/GlobalStyles";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 64, 340);

interface Screen4Props {
  onClose: () => void;
}

const formatTime = (millis: number): string => {
  if (!millis || isNaN(millis)) return "0:00";
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

export const Screen4: React.FC<Screen4Props> = ({ onClose }) => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    playNext,
    playPrevious,
    playbackPosition,
    duration,
    seekTo,
  } = usePlayer();

  const { likedSongs, toggleLike } = useLibrary();

  const isLiked = Boolean(
    currentTrack && likedSongs.some((t: any) => t.id === currentTrack.id)
  );

  const progress = duration > 0 ? playbackPosition / duration : 0;

  const artworkUri = currentTrack?.artwork || (currentTrack as any)?.coverUrl;

  const handleSeekPress = (e: GestureResponderEvent) => {
    const touchX = e.nativeEvent.locationX;
    const barWidth = SCREEN_WIDTH - 48;
    const seekPercentage = Math.max(0, Math.min(1, touchX / barWidth));
    if (duration > 0 && seekTo) {
      seekTo(seekPercentage * duration);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.iconButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-down" size={28} color={Color.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Now Playing</Text>
        <TouchableOpacity
          style={styles.iconButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={Color.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.artworkWrapper}>
        {artworkUri ? (
          <Image
            source={{ uri: artworkUri }}
            style={styles.artwork}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Ionicons name="musical-notes" size={72} color="rgba(255,255,255,0.3)" />
          </View>
        )}
      </View>

      <View style={styles.trackInfoSection}>
        <View style={styles.titleColumn}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {currentTrack?.title || "No track playing"}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {currentTrack?.artist || "Unknown Artist"}
          </Text>
        </View>
        {currentTrack && (
          <TouchableOpacity
            onPress={() => toggleLike(currentTrack)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={26}
              color={isLiked ? Color.accent : Color.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.progressContainer}>
        <TouchableOpacity
          style={styles.progressBarBackground}
          activeOpacity={1}
          onPress={handleSeekPress}
        >
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
        </TouchableOpacity>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(playbackPosition)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={playPrevious}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="play-skip-back" size={28} color={Color.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playButton}
          onPress={togglePlayPause}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={30}
            color="#FFFFFF"
            style={{ marginLeft: isPlaying ? 0 : 3 }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={playNext}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="play-skip-forward" size={28} color={Color.textPrimary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Color.background,
    justifyContent: "space-between",
    paddingBottom: 28,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    height: 48,
  },
  headerTitle: {
    color: Color.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  artworkWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 18,
  },
  artwork: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 16,
  },
  artworkFallback: {
    backgroundColor: "#1F162B",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfoSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  titleColumn: {
    flex: 1,
    marginRight: 16,
    gap: 4,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  trackArtist: {
    fontSize: 15,
    color: Color.textSecondary,
    fontWeight: "500",
  },
  progressContainer: {
    paddingHorizontal: 24,
    gap: 8,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: Border.sm || 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Color.accent,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeText: {
    fontSize: 11,
    color: Color.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 40,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Screen4;