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
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  if (typeof millis !== "number" || !Number.isFinite(millis) || millis < 0) return "-:--";
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}:${remainingMinutes < 10 ? "0" : ""}${remainingMinutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  }
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
    volume,
    setVolume,
    queue,
    queueIndex,
    jumpToQueueIndex,
    removeFromQueue,
    clearQueue,
    repeatMode,
    toggleRepeatMode,
  } = usePlayer();

  const { likedSongs, toggleLike } = useLibrary();

  const isLiked = Boolean(
    currentTrack && likedSongs.some((t: any) => t.id === currentTrack.id)
  );

  const artworkUri = currentTrack?.artwork || (currentTrack as any)?.coverUrl;

  const [isShuffle, setIsShuffle] = React.useState(false);
  const [isScrubbing, setIsScrubbing] = React.useState(false);
  const [scrubRatio, setScrubRatio] = React.useState(0);
  const barWidthRef = React.useRef(0);
  const scrubRatioRef = React.useRef(0);
  const scrubbingRef = React.useRef(false);
  const durationRef = React.useRef(duration);
  durationRef.current = duration;

  const progressRatio = duration > 0 ? Math.max(0, Math.min(1, playbackPosition / duration)) : 0;
  const showProgressRatio = isScrubbing ? Math.max(0, Math.min(1, scrubRatio)) : progressRatio;
  const shownPositionMs = isScrubbing ? scrubRatio * (duration || 0) : playbackPosition;

  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [queueOpen, setQueueOpen] = React.useState(false);
  const insets = useSafeAreaInsets();
  const [muted, setMuted] = React.useState(false);
  const volumeBarWidthRef = React.useRef(0);
  const mutedRef = React.useRef(false);
  const lastVolumeRef = React.useRef(volume > 0 ? volume : 0.5);

  const syncMuted = (next: boolean) => {
    mutedRef.current = next;
    setMuted(next);
  };

  const applyVolumeFromTouch = (locationX: number) => {
    const width = volumeBarWidthRef.current > 0 ? volumeBarWidthRef.current : SCREEN_WIDTH * 0.8;
    const next = Math.max(0, Math.min(1, locationX / width));
    setVolume(next);
    if (next > 0 && mutedRef.current) {
      syncMuted(false);
    }
  };

  const volumePanResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => applyVolumeFromTouch(e.nativeEvent.locationX),
      onPanResponderMove: (e) => applyVolumeFromTouch(e.nativeEvent.locationX),
    })
  ).current;

  const handleMuteToggle = () => {
    if (mutedRef.current) {
      setVolume(lastVolumeRef.current);
      syncMuted(false);
    } else {
      lastVolumeRef.current = volume > 0 ? volume : 0.5;
      setVolume(0);
      syncMuted(true);
    }
  };

  const handleMaxVolume = () => {
    setVolume(1);
    syncMuted(false);
  };

  const handleVolumeLayout = (e: LayoutChangeEvent) => {
    volumeBarWidthRef.current = e.nativeEvent.layout.width;
  };

  const volumePct = Math.round(volume * 100);
  const effectivelyMuted = muted || volume === 0;

  const ratioFromTouch = (e: GestureResponderEvent): number => {
    const width = barWidthRef.current > 0 ? barWidthRef.current : SCREEN_WIDTH * 0.86;
    return Math.max(0, Math.min(1, e.nativeEvent.locationX / width));
  };

  const commitScrub = (apply: boolean) => {
    if (!scrubbingRef.current) {
      return;
    }
    scrubbingRef.current = false;
    setIsScrubbing(false);
    const ratio = scrubRatioRef.current;
    if (apply && seekTo && durationRef.current > 0) {
      seekTo(ratio * durationRef.current).catch(() => undefined);
    }
  };

  const scrubPanResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const ratio = ratioFromTouch(e);
        scrubRatioRef.current = ratio;
        scrubbingRef.current = true;
        setIsScrubbing(true);
        setScrubRatio(ratio);
      },
      onPanResponderMove: (e) => {
        const ratio = ratioFromTouch(e);
        scrubRatioRef.current = ratio;
        setScrubRatio(ratio);
      },
      onPanResponderRelease: () => commitScrub(true),
      onPanResponderTerminate: () => commitScrub(false),
    })
  ).current;

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
            onPress={() => setOptionsOpen(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={Color.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setQueueOpen(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="list" size={24} color={Color.textPrimary} />
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
          <View
            style={styles.progressBarBackground}
            {...scrubPanResponder.panHandlers}
            onLayout={(e) => {
              barWidthRef.current = e.nativeEvent.layout.width;
            }}
          >
            <View style={[styles.progressBarFill, { width: `${showProgressRatio * 100}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(shownPositionMs)}</Text>
            <Text style={styles.timeText}>{formatTime(duration > 0 ? duration : Number.POSITIVE_INFINITY)}</Text>
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
                onPress={() => playNext()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-forward" size={30} color={Color.textPrimary} />
              </TouchableOpacity>
            </View>

          <TouchableOpacity
            onPress={toggleRepeatMode}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.repeatWrap}>
              <Ionicons
                name="repeat"
                size={22}
                color={repeatMode === "off" ? "#8E8A9A" : Color.accent}
              />
              {repeatMode === "all" ? <View style={styles.repeatActiveDot} /> : null}
              {repeatMode === "one" ? (
                  <View style={styles.repeatOneBadge}>
                    <Text style={styles.repeatOneText}>1</Text>
                  </View>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <Modal
        transparent
        visible={optionsOpen}
        animationType="slide"
        onRequestClose={() => setOptionsOpen(false)}
      >
        <View style={styles.optionsRoot}>
          <Pressable style={styles.optionsBackdrop} onPress={() => setOptionsOpen(false)} />
          <View style={styles.optionsSheet}>
            <View style={styles.optionsGrab} />
            {currentTrack ? (
              <View style={styles.optionsTrackRow}>
                <Image
                  source={{ uri: artworkUri || undefined }}
                  style={styles.optionsArt}
                  contentFit="cover"
                />
                <View style={styles.optionsTrackMeta}>
                  <Text style={styles.optionsTrackTitle} numberOfLines={1}>
                    {currentTrack.title}
                  </Text>
                  <Text style={styles.optionsTrackArtist} numberOfLines={1}>
                    {currentTrack.artist}
                  </Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.optionsSectionLabel}>Volume</Text>
            <View style={styles.volumeRow}>
              <TouchableOpacity
                onPress={handleMuteToggle}
                hitSlop={10}
                style={styles.volumeSideBtn}
              >
                <Ionicons
                  name={effectivelyMuted ? "volume-mute" : "volume-low"}
                  size={24}
                  color={Color.textPrimary}
                />
              </TouchableOpacity>
              <View
                style={styles.volumeTouchArea}
                onLayout={handleVolumeLayout}
                {...volumePanResponder.panHandlers}
              >
                <View style={styles.volumeTrack} pointerEvents="none" />
                <View
                  style={[styles.volumeFill, { width: `${volumePct}%` }]}
                  pointerEvents="none"
                />
              </View>
              <TouchableOpacity
                onPress={handleMaxVolume}
                hitSlop={10}
                style={styles.volumeSideBtn}
              >
                <Ionicons name="volume-high" size={24} color={Color.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.volumePct}>{volumePct}%</Text>
            <TouchableOpacity
              style={styles.optionsDoneBtn}
              onPress={() => setOptionsOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.optionsDoneLabel}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={queueOpen}
        animationType="slide"
        onRequestClose={() => setQueueOpen(false)}
      >
        <View style={styles.optionsRoot}>
          <Pressable style={styles.optionsBackdrop} onPress={() => setQueueOpen(false)} />
          <View style={[styles.queueSheet, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.optionsGrab} />

            <Text style={styles.optionsSectionLabel}>Now Playing</Text>
            {currentTrack ? (
              <View style={styles.queueNowPlayingRow}>
                <Image
                  source={{ uri: artworkUri || undefined }}
                  style={styles.queueNowArt}
                  contentFit="cover"
                />
                <View style={styles.queueRowMeta}>
                  <Text style={styles.queueNowTitle} numberOfLines={1}>
                    {currentTrack.title}
                  </Text>
                  <Text style={styles.queueRowArtist} numberOfLines={1}>
                    {currentTrack.artist}
                  </Text>
                </View>
                <View style={styles.queuePlayingBadge}>
                  <Ionicons name="volume-high" size={12} color={Color.accent} />
                  <Text style={styles.queuePlayingText}>Playing</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.queueSectionHeader}>
              <Text style={styles.optionsSectionLabel}>Up Next</Text>
              {queue && queue.length > queueIndex + 1 ? (
                <TouchableOpacity
                  onPress={() => clearQueue()}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.queueClear}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {queue && queue.length > queueIndex + 1 ? (
              <ScrollView
                style={styles.queueList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.queueListContent}
              >
                {queue.slice(queueIndex + 1).map((item, offset) => {
                  const itemIndex = queueIndex + 1 + offset;
                  const rowArt = item.artwork || (item as any)?.coverUrl;
                  const rowDuration = (item as any)?.duration;
                  return (
                    <TouchableOpacity
                      key={`${item.id}-${itemIndex}`}
                      style={styles.queueRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        jumpToQueueIndex(itemIndex);
                        setQueueOpen(false);
                      }}
                    >
                      {rowArt ? (
                        <Image source={{ uri: rowArt }} style={styles.queueRowArt} contentFit="cover" />
                      ) : (
                        <View style={[styles.queueRowArt, styles.queueArtFallback]}>
                          <Ionicons name="musical-notes" size={18} color="rgba(255,255,255,0.35)" />
                        </View>
                      )}
                      <View style={styles.queueRowMeta}>
                        <Text style={styles.queueRowTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={styles.queueRowArtist} numberOfLines={1}>
                          {item.artist}
                        </Text>
                      </View>
                      {rowDuration ? (
                        <Text style={styles.queueDuration}>{formatTime(Number(rowDuration) * 1000)}</Text>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => removeFromQueue(itemIndex)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.queueRemoveBtn}
                      >
                        <Ionicons name="close" size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.queueEmpty}>
                <Ionicons name="list" size={28} color="rgba(255,255,255,0.2)" />
                <Text style={styles.queueEmptyText}>No tracks in queue</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.queueDoneBtn}
              onPress={() => setQueueOpen(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.queueDoneLabel}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    backgroundColor: Color.background,
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
    paddingTop: 25,
    paddingBottom: 0,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  artworkWrapper: {
    width: "88%",
    aspectRatio: 1,
    alignSelf: "center",
    marginTop: 60,
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
    backgroundColor: "#16171B",
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
    marginTop: 50,
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
    marginVertical: 30,
  },
  progressBarBackground: {
    height: 7,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Color.accent,
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
    marginTop: -10,
    marginBottom: 36,
  },
  controlsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 34,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatActiveDot: {
    position: "absolute",
    bottom: -3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Color.accent,
  },
  repeatOneBadge: {
    position: "absolute",
    top: -3,
    right: -4,
    minWidth: 10,
    height: 10,
    borderRadius: 5,
    paddingHorizontal: 1.5,
    backgroundColor: Color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatOneText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "700",
    lineHeight: 10,
  },
  optionsRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  optionsBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  optionsSheet: {
    backgroundColor: "#16171B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 34,
  },
  optionsGrab: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 14,
  },
  optionsTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  optionsArt: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#23252B",
  },
  optionsTrackMeta: {
    flex: 1,
    marginLeft: 14,
  },
  optionsTrackTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: Color.textPrimary,
  },
  optionsTrackArtist: {
    fontSize: 13,
    color: "#A1A1AA",
    fontWeight: "500",
    marginTop: 3,
  },
  optionsSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  volumeSideBtn: {
    padding: 6,
  },
  volumeTouchArea: {
    flex: 1,
    height: 32,
    justifyContent: "center",
  },
  volumeTrack: {
    position: "absolute",
    top: 13,
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  volumeFill: {
    position: "absolute",
    top: 13,
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: Color.accent,
  },
  volumePct: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "600",
    alignSelf: "flex-end",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  optionsDoneBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: Color.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  optionsDoneLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  queueSheet: {
    backgroundColor: "#16171B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 10,
    maxHeight: "80%",
  },
  queueNowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#23252B",
    borderRadius: 12,
    padding: 10,
    marginBottom: 18,
  },
  queueNowArt: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#1D1F24",
  },
  queueRowMeta: {
    flex: 1,
    marginLeft: 12,
  },
  queueNowTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: Color.textPrimary,
  },
  queueRowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  queueRowArtist: {
    fontSize: 13,
    color: "#A1A1AA",
    marginTop: 3,
  },
  queuePlayingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(144,102,254,0.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  queuePlayingText: {
    fontSize: 11,
    fontWeight: "700",
    color: Color.accent,
  },
  queueSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  queueClear: {
    fontSize: 13,
    fontWeight: "600",
    color: Color.accent,
  },
  queueList: {
    flexGrow: 0,
    maxHeight: 320,
  },
  queueListContent: {
    paddingBottom: 4,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  queueRowArt: {
    width: 46,
    height: 46,
    borderRadius: 6,
  },
  queueArtFallback: {
    backgroundColor: "#23252B",
    alignItems: "center",
    justifyContent: "center",
  },
  queueDuration: {
    fontSize: 12,
    color: "#9CA3AF",
    marginRight: 12,
    fontVariant: ["tabular-nums"],
  },
  queueRemoveBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  queueEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 8,
  },
  queueEmptyText: {
    fontSize: 14,
    color: "#A1A1AA",
  },
  queueDoneBtn: {
    height: 46,
    borderRadius: 23,
    backgroundColor: Color.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  queueDoneLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

export default Screen4;