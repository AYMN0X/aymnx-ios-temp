import * as React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import type { ImpactFeedbackStyle } from "expo-haptics";
import { Color } from "../theme/GlobalStyles";
import { getHighResArtworkUrl, getThumbnailArtworkUrl } from "../services/musicApi";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { useTrackActions } from "../context/TrackActionsContext";
import NowPlayingScrubber, { formatTime } from "../components/player/NowPlayingScrubber";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const ARTWORK_SIZE = SCREEN_WIDTH - 64;
const AMBIENT_DECODE = 144;
const SCRUB_DISMISS_DISTANCE = 140;
const SCRUB_DISMISS_VELOCITY = 1.2;

interface NowPlayingScreenProps {
  onClose: () => void;
}

export const NowPlayingScreen: React.FC<NowPlayingScreenProps> = ({ onClose }) => {
  const {
    currentTrack,
    isPlaying,
    togglePlayPause,
    playNext,
    playPrevious,
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
  const { openTrack } = useTrackActions();

  const isLiked = Boolean(
    currentTrack && likedSongs.some((t: any) => t.id === currentTrack.id)
  );

  const artworkUri = getHighResArtworkUrl(
    currentTrack?.artwork || (currentTrack as any)?.coverUrl
  );

  const ambientArtworkUri = getThumbnailArtworkUrl(
    currentTrack?.artwork || (currentTrack as any)?.coverUrl
  );

  const [isShuffle, setIsShuffle] = React.useState(false);

  const translateY = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetOpacity = React.useRef(new Animated.Value(1)).current;
  const playScale = React.useRef(new Animated.Value(1)).current;
  const dismissingRef = React.useRef(false);

  React.useEffect(() => {
    translateY.setValue(SCREEN_HEIGHT);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
    return () => {
      dismissingRef.current = false;
    };
  }, [translateY, sheetOpacity]);

  const haptic = React.useCallback((style: ImpactFeedbackStyle) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(style).catch(() => {});
    }
  }, []);

  const animateDismiss = React.useCallback(() => {
    if (dismissingRef.current) {
      return;
    }
    dismissingRef.current = true;
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 280,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [translateY, sheetOpacity, onClose]);

  const swipePanResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.3,
      onPanResponderMove: (_, g) => {
        if (!dismissingRef.current) {
          translateY.setValue(Math.max(0, g.dy));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (dismissingRef.current) {
          return;
        }
        if (g.dy > SCRUB_DISMISS_DISTANCE || g.vy > SCRUB_DISMISS_VELOCITY) {
          animateDismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 14,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (!dismissingRef.current) {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 14,
          }).start();
        }
      },
    })
  ).current;

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
    const width = volumeBarWidthRef.current > 0 ? volumeBarWidthRef.current : SCREEN_WIDTH * 0.3;
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

  const handlePlayPause = () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    togglePlayPause();
  };

  const handleNext = () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    playNext();
  };

  const handlePrevious = () => {
    haptic(Haptics.ImpactFeedbackStyle.Medium);
    playPrevious();
  };

  return (
    <View style={styles.screenRoot}>
      {ambientArtworkUri ? (
        <Image
          source={{ uri: ambientArtworkUri }}
          style={styles.ambientImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={`ambient-${ambientArtworkUri}`}
          transition={0}
          pointerEvents="none"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.baseBackground]} pointerEvents="none" />
      )}
      <BlurView intensity={85} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <LinearGradient
        colors={["rgba(17,18,22,0.85)", "rgba(17,18,22,0.95)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Animated.View
        style={[
          styles.sheet,
          {
            opacity: sheetOpacity,
            transform: [{ translateY }],
          },
        ]}
        {...swipePanResponder.panHandlers}
      >
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" />

          <View style={styles.header}>
            <TouchableOpacity
              onPress={animateDismiss}
              style={styles.iconButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="chevron-down" size={26} color={Color.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Now Playing</Text>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setQueueOpen(true)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="list" size={22} color={Color.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.artworkWrapper}>
            {artworkUri ? (
              <Image
                source={{ uri: artworkUri }}
                style={styles.artwork}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={artworkUri}
                transition={300}
              />
            ) : (
              <View style={[styles.artwork, styles.artworkFallback]}>
                <Ionicons name="musical-notes" size={84} color="rgba(255,255,255,0.3)" />
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
                  color={isLiked ? Color.accent : "#FFFFFF"}
                />
              </TouchableOpacity>
            )}
          </View>

          <NowPlayingScrubber />

          <View style={styles.controlsRow}>
            <TouchableOpacity
              onPress={() => setIsShuffle((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.sideControl}
            >
              <Ionicons
                name="shuffle"
                size={23}
                color={isShuffle ? Color.accent : "#949BA4"}
              />
            </TouchableOpacity>

            <View style={styles.controlsCluster}>
              <TouchableOpacity
                onPress={handlePrevious}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-back" size={32} color={Color.textPrimary} />
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: playScale }] }}>
                <TouchableOpacity
                  style={styles.playButton}
                  onPress={handlePlayPause}
                  activeOpacity={0.9}
                  onPressIn={() => {
                    Animated.spring(playScale, {
                      toValue: 1.08,
                      useNativeDriver: true,
                      friction: 6,
                    }).start();
                  }}
                  onPressOut={() => {
                    Animated.spring(playScale, {
                      toValue: 1,
                      useNativeDriver: true,
                      friction: 6,
                    }).start();
                  }}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={34}
                    color="#FFFFFF"
                    style={{ marginLeft: isPlaying ? 0 : 4 }}
                  />
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                onPress={handleNext}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="play-skip-forward" size={32} color={Color.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={toggleRepeatMode}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.sideControl}
            >
              <View style={styles.repeatWrap}>
                <Ionicons
                  name="repeat"
                  size={23}
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

          <View style={styles.auxRow}>
            <TouchableOpacity
              onPress={() => {
                if (currentTrack) {
                  openTrack(currentTrack);
                }
              }}
              style={styles.auxButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-horizontal" size={26} color={Color.textPrimary} />
            </TouchableOpacity>

            <View style={styles.volumeRow}>
              <TouchableOpacity
                onPress={handleMuteToggle}
                hitSlop={10}
                style={styles.volumeSideBtn}
              >
                <Ionicons
                  name={effectivelyMuted ? "volume-mute" : "volume-low"}
                  size={20}
                  color={Color.textPrimary}
                />
              </TouchableOpacity>
              <View
                style={styles.volumeTouchArea}
                onLayout={handleVolumeLayout}
                hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
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
                <Ionicons name="volume-high" size={20} color={Color.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setQueueOpen(true)}
              style={styles.auxButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.upNextLabel} numberOfLines={1}>
                Up Next
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>

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
                  cachePolicy="memory-disk"
                  recyclingKey={artworkUri ?? 'queue-now'}
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
                  const rowArt = getHighResArtworkUrl(
                    item.artwork || (item as any)?.coverUrl
                  );
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
                        <Image
                          source={{ uri: rowArt }}
                          style={styles.queueRowArt}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={item.id}
                        />
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
    backgroundColor: Color.background,
    overflow: "hidden",
  },
  baseBackground: {
    backgroundColor: Color.background,
  },
  ambientImage: {
    position: "absolute",
    left: (SCREEN_WIDTH - AMBIENT_DECODE) / 2,
    top: (SCREEN_HEIGHT - AMBIENT_DECODE) / 2,
    width: AMBIENT_DECODE,
    height: AMBIENT_DECODE,
    borderRadius: AMBIENT_DECODE / 2,
    transform: [
      { scaleX: SCREEN_WIDTH / AMBIENT_DECODE },
      { scaleY: SCREEN_HEIGHT / AMBIENT_DECODE },
    ],
  },
  sheet: {
    flex: 1,
    width: "100%",
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
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#949BA4",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  artworkWrapper: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    alignSelf: "center",
    marginTop: 36,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  artwork: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    overflow: "hidden",
  },
  artworkFallback: {
    backgroundColor: "#191A20",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfoSection: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 28,
    marginTop: 34,
  },
  titleColumn: {
    flex: 1,
    marginRight: 16,
  },
  trackTitle: {
    fontSize: 23,
    fontWeight: "bold",
    color: Color.textPrimary,
    letterSpacing: -0.3,
  },
  trackArtist: {
    fontSize: 15,
    color: "#949BA4",
    fontWeight: "500",
    marginTop: 4,
  },
  controlsRow: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  sideControl: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  controlsCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 30,
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatWrap: {
    width: 23,
    height: 23,
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
  auxRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    marginTop: 26,
    marginBottom: 10,
  },
  auxButton: {
    minWidth: 44,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  upNextLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  volumeRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
  },
  volumeSideBtn: {
    padding: 4,
  },
  volumeTouchArea: {
    flex: 1,
    height: 44,
    justifyContent: "center",
  },
  volumeTrack: {
    position: "absolute",
    top: 19,
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  volumeFill: {
    position: "absolute",
    top: 19,
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: Color.accent,
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
  optionsGrab: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "center",
    marginBottom: 14,
  },
  optionsSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  queueSheet: {
    backgroundColor: "#191A20",
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
    backgroundColor: "#1E1F22",
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

export default NowPlayingScreen;