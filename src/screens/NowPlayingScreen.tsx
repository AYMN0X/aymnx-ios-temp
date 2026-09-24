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
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import type { ImpactFeedbackStyle } from "expo-haptics";
import { Color } from "../theme/GlobalStyles";
import { getHighResArtworkUrl } from "../services/musicApi";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { useAuth } from "../context/AuthContext";
import NowPlayingScrubber, { formatTime } from "../components/player/NowPlayingScrubber";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const SCRUB_DISMISS_DISTANCE = 140;
const SCRUB_DISMISS_VELOCITY = 1.2;

const COLORS = {
  bgTop: "#0E1414",
  bgMid: "#0e1414",
  bgBottom: "#0d1111",
  textPrimary: "#FFFFFF",
  textSecondary: "#A0A0A0",
  textMuted: "#707070",
  accent: "#FFFFFF",
  dockInactive: "#A0A0A0",
};

interface NowPlayingScreenProps {
  onClose: () => void;
}

export const NowPlayingScreen: React.FC<NowPlayingScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
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

  const isLiked = Boolean(
    currentTrack && likedSongs.some((t: any) => t.id === currentTrack.id)
  );

  const artworkUri = getHighResArtworkUrl(
    currentTrack?.artwork || (currentTrack as any)?.coverUrl
  );

  const contextLabel =
    (currentTrack?.album || "").trim().toUpperCase() || "NOW PLAYING";

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
    const width =
      volumeBarWidthRef.current > 0 ? volumeBarWidthRef.current : SCREEN_WIDTH * 0.3;
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
      <LinearGradient
        colors={[COLORS.bgTop, COLORS.bgMid, COLORS.bgBottom]}
        locations={[0, 0.45, 1]}
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
              style={styles.headerSide}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close player"
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.headerMicro}>RECENTLY PLAYED</Text>
              <Text style={styles.headerContext} numberOfLines={1}>
                {contextLabel}
              </Text>
            </View>

            <View style={styles.headerSide}>
              {user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={`avatar-${user.id}`}
                  transition={200}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>
                    {(user?.name || "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.heroTopSpacer} />

          <View style={styles.artworkWrap}>
            <View style={styles.artworkShadow}>
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
          </View>

          <View style={styles.trackInfoRow}>
            {currentTrack ? (
              <TouchableOpacity
                onPress={() => toggleLike(currentTrack)}
                style={styles.sideAction}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={isLiked ? "Unlike" : "Like"}
              >
                <Ionicons
                  name="heart-outline"
                  size={22}
                  color={isLiked ? COLORS.accent : COLORS.textMuted}
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.sideAction} />
            )}

            <View style={styles.titleColumn}>
              <Text style={styles.trackTitle} numberOfLines={1}>
                {currentTrack?.title || "No track playing"}
              </Text>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {currentTrack?.artist || "Unknown Artist"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={animateDismiss}
              style={styles.sideAction}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close player"
            >
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <NowPlayingScrubber />

          <View style={styles.dockSpacer} />

          <View style={styles.dockWrap}>
            <View style={styles.dockCard}>
              <TouchableOpacity
                onPress={() => setIsShuffle((v) => !v)}
                style={styles.deckSideBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Toggle shuffle"
              >
                <Ionicons
                  name="shuffle"
                  size={18}
                  color={isShuffle ? COLORS.accent : COLORS.dockInactive}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePrevious}
                style={styles.deckSideBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Previous track"
              >
                <Ionicons name="play-skip-back" size={24} color={COLORS.dockInactive} />
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
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? "Pause" : "Play"}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={20}
                    color="#FFFFFF"
                    style={{ marginLeft: isPlaying ? 0 : 2 }}
                  />
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                onPress={handleNext}
                style={styles.deckSideBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Next track"
              >
                <Ionicons name="play-skip-forward" size={24} color={COLORS.dockInactive} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setQueueOpen(true)}
                style={styles.deckSideBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="More options"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.dockInactive} />
              </TouchableOpacity>
            </View>
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

            <View style={styles.queueNowPlayingHeader}>
              <Text style={styles.optionsSectionLabel}>Now Playing</Text>
              <TouchableOpacity
                onPress={toggleRepeatMode}
                style={styles.queueRepeatRow}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Toggle repeat"
              >
                <Ionicons
                  name="repeat"
                  size={16}
                  color={repeatMode === "off" ? "#8E8E8E" : Color.accent}
                />
                <Text
                  style={[
                    styles.queueRepeatText,
                    repeatMode !== "off" && styles.queueRepeatTextActive,
                  ]}
                >
                  {repeatMode === "off" ? "Repeat Off" : repeatMode === "all" ? "Repeat All" : "Repeat One"}
                </Text>
              </TouchableOpacity>
            </View>

            {currentTrack ? (
              <View style={styles.queueNowPlayingRow}>
                <Image
                  source={{ uri: artworkUri || undefined }}
                  style={styles.queueNowArt}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={artworkUri ?? "queue-now"}
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

            <View style={styles.volumeRow}>
              <TouchableOpacity
                onPress={handleMuteToggle}
                hitSlop={10}
                style={styles.volumeSideBtn}
                accessibilityRole="button"
                accessibilityLabel={effectivelyMuted ? "Unmute" : "Mute"}
              >
                <Ionicons
                  name={effectivelyMuted ? "volume-mute" : "volume-low"}
                  size={18}
                  color={COLORS.textSecondary}
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
                accessibilityRole="button"
                accessibilityLabel="Max volume"
              >
                <Ionicons name="volume-high" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

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
                        <Text style={styles.queueDuration}>
                          {formatTime(Number(rowDuration) * 1000)}
                        </Text>
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
    backgroundColor: COLORS.bgBottom,
    overflow: "hidden",
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
    paddingTop: 16,
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
  headerSide: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerMicro: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.8,
    color: "#A0A0A0",
  },
  headerContext: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#FFFFFF",
    marginTop: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: "hidden",
  },
  avatarFallback: {
    backgroundColor: "#1F2423",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  artworkWrap: {
    width: "100%",
    paddingHorizontal: 28,
    marginTop: 8,
    alignItems: "center",
  },
  artworkShadow: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 16,
  },
  artwork: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    overflow: "hidden",
  },
  artworkFallback: {
    backgroundColor: "#171B1B",
    alignItems: "center",
    justifyContent: "center",
  },
  trackInfoRow: {
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginTop: 30,
  },
  sideAction: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  titleColumn: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
  },
  trackTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  trackArtist: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  heroTopSpacer: {
    flex: 1,
    minHeight: 0,
  },
  dockSpacer: {
    flex: 1,
    minHeight: 28,
    maxHeight: 36,
  },
  dockWrap: {
    width: "100%",
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  dockCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(24, 28, 28, 0.85)",
    borderRadius: 36,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  deckSideBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#121414",
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "#0E1414",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 24,
    paddingTop: 10,
    maxHeight: "80%",
  },
  queueNowPlayingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  queueRepeatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  queueRepeatText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8E8E8E",
  },
  queueRepeatTextActive: {
    color: Color.accent,
  },
  queueNowPlayingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2120",
    borderRadius: 12,
    padding: 10,
  },
  queueNowArt: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "#171B1B",
  },
  queueRowMeta: {
    flex: 1,
    marginLeft: 12,
  },
  queueNowTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.textPrimary,
  },
  queueRowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
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
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  queuePlayingText: {
    fontSize: 11,
    fontWeight: "700",
    color: Color.accent,
  },
  volumeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 16,
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
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  volumeFill: {
    position: "absolute",
    top: 19,
    left: 0,
    height: 5,
    borderRadius: 3,
    backgroundColor: Color.accent,
  },
  queueSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
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
    backgroundColor: "#1A2120",
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