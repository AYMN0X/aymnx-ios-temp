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
                color={isLiked ? Color.accent : "#FFFFFF"}
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
              color={isShuffle ? Color.accent : "#D4D4D8"}
            />
            </TouchableOpacity>

            <View style={styles.controlsCluster}>
              <TouchableOpacity
                onPress={playPrevious}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-back" size={30} color={Color.textPrimary} />
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
                <Ionicons name="play-skip-forward" size={30} color={Color.textPrimary} />
              </TouchableOpacity>
            </View>

          <TouchableOpacity
            onPress={() => setIsRepeat((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="repeat"
              size={22}
              color={isRepeat ? Color.accent : "#D4D4D8"}
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
    justifyContent: "flex-start",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  artworkWrapper: {
    width: "86%",
    aspectRatio: 1,
    alignSelf: "center",
    marginTop: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  artwork: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  artworkFallback: {
    backgroundColor: "#1F162B",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfoSection: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginTop: 22,
  },
  titleColumn: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: Color.textPrimary,
  },
  trackArtist: {
    fontSize: 15,
    color: "#A1A1AA",
    fontWeight: "500",
    marginTop: 4,
  },
  progressContainer: {
    width: "100%",
    alignSelf: "center",
    paddingHorizontal: 24,
    marginVertical: 18,
  },
  progressBarBackground: {
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#A855F7",
    borderRadius: 3,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  timeText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontVariant: ["tabular-nums"],
  },
  controlsRow: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 36,
  },
  controlsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
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