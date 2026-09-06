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
import { Color } from "../theme/GlobalStyles";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

  const [isShuffle, setIsShuffle] = React.useState(false);
  const [isRepeat, setIsRepeat] = React.useState(false);
  const [barWidth, setBarWidth] = React.useState(0);

  const handleSeekPress = (e: GestureResponderEvent) => {
    const touchX = e.nativeEvent.locationX;
    const width = barWidth > 0 ? barWidth : SCREEN_WIDTH * 0.86;
    const seekPercentage = Math.max(0, Math.min(1, touchX / width));
    if (duration > 0 && seekTo) {
      seekTo(seekPercentage * duration);
    }
  };

  return (
    <View style={styles.screenRoot}>
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
                size={24}
                color={isLiked ? "#8A22EB" : "#FFFFFF"}
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.progressContainer}>
          <TouchableOpacity
            style={styles.progressBarBackground}
            activeOpacity={1}
            onPress={handleSeekPress}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
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
            onPress={() => setIsShuffle((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="shuffle"
              size={22}
              color={isShuffle ? "#8A22EB" : Color.textSecondary}
            />
          </TouchableOpacity>

          <View style={styles.controlsCluster}>
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

          <TouchableOpacity
            onPress={() => setIsRepeat((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="repeat"
              size={22}
              color={isRepeat ? "#8A22EB" : Color.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
    alignItems: "center",
  },
  container: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 44,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  artworkWrapper: {
    width: "84%",
    aspectRatio: 1,
    alignSelf: "center",
    borderRadius: 16,
    overflow: "hidden",
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkFallback: {
    backgroundColor: "#1F162B",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfoSection: {
    width: "88%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
  },
  titleColumn: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  trackArtist: {
    fontSize: 14,
    color: "#A7A7A7",
    fontWeight: "500",
    marginTop: 4,
  },
  progressContainer: {
    width: "88%",
    alignSelf: "center",
    marginTop: 22,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: "#A7A7A7",
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    width: "88%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
  },
  controlsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#8A22EB",
    alignItems: "center",
    justifyContent: "center",
  },
});

export default Screen4;