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
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
// Reanimated is aliased because `Animated` in this file is React Native's, still
// used for the play-button pulse and the volume bar. Both must coexist.
import AnimatedReanimated, {
  Easing as ReanimatedEasing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import type { ImpactFeedbackStyle } from "expo-haptics";
import { Color } from "../theme/GlobalStyles";
import { getHighResArtworkUrl } from "../services/musicApi";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { TrackArtwork } from "../components/TrackArtwork";
import { useTrackArtwork } from "../hooks/useTrackArtwork";
import NowPlayingScrubber, { formatTime } from "../components/player/NowPlayingScrubber";
import LyricsView from "../components/player/LyricsView";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Pull-to-dismiss tuning, matched to the feel of a native Apple Music / Spotify
// sheet rather than a free-floating drag.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
// How far the card shrinks and how much its top corners round while dragging.
// Both are cosmetic, so they stay subtle enough to read as depth rather than as
// a second, competing animation.
const DISMISS_MIN_SCALE = 0.92;
const DISMISS_CORNER_RADIUS = 32;
// Upward drags cannot move the sheet (it is already at the top), so they are
// damped to this fraction of finger travel. Without it the card would appear to
// stick to a ceiling; with 1.0 the user could drag it off-screen upward.
const RUBBER_BAND_FACTOR = 0.35;
// Drag distance at which the cosmetic effects are fully applied.
const DISMISS_PROGRESS_DISTANCE = 220;
// A tap must not be mistaken for the start of a drag, and a horizontal drag must
// never be claimed — that is the scrubber and the volume bar.
const PAN_ACTIVE_OFFSET_Y = 10;
const PAN_FAIL_OFFSET_X = 24;
// Crisp, slightly under-damped return. Shared by every snap-back path so the
// sheet always settles identically no matter how the gesture ended.
const DISMISS_SNAP_SPRING = { damping: 20, stiffness: 200, mass: 0.6 };

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

// Ambient scrim: deliberately light through the middle so the art stays vivid,
// with a heavier wash only at the very bottom where the scrubber, track info and
// transport dock need contrast, plus a light touch at the top for the header.
const AMBIENT_SCRIM_COLORS = [
  "rgba(0, 0, 0, 0.20)",
  "rgba(0, 0, 0, 0.08)",
  "rgba(0, 0, 0, 0.10)",
  "rgba(0, 0, 0, 0.52)",
] as const;
const AMBIENT_SCRIM_LOCATIONS = [0, 0.3, 0.6, 1] as const;

interface NowPlayingScreenProps {
  onClose: () => void;
}

interface HeaderOptionsButtonProps {
  onPress: () => void;
}

// Single source for the top-right options control so the artwork and lyrics
// headers cannot drift apart again.
const HeaderOptionsButton: React.FC<HeaderOptionsButtonProps> = ({ onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    style={styles.headerSide}
    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    accessibilityRole="button"
    accessibilityLabel="More options"
  >
    <Ionicons name="ellipsis-horizontal" size={22} color={COLORS.textPrimary} />
  </TouchableOpacity>
);

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

  const isLiked = Boolean(
    currentTrack && likedSongs.some((t: any) => t.id === currentTrack.id)
  );

  // Falls back to the downloaded copy so a track whose remote cover has expired
  // (or was never resolved) still shows art in this hero while offline.
  const currentArtwork = useTrackArtwork(currentTrack);
  const artworkUri = getHighResArtworkUrl(
    currentArtwork.uri || (currentTrack as any)?.coverUrl
  ) || currentArtwork.localUri;

  const contextLabel =
    (currentTrack?.album || "").trim().toUpperCase() || "NOW PLAYING";

  const [showLyrics, setShowLyrics] = React.useState(false);

  // Returning to artwork when the track changes avoids carrying the previous
  // song's lyrics view over to the next one.
  React.useEffect(() => {
    setShowLyrics(false);
  }, [currentTrack?.id]);

  // Single source of truth for the sheet's position. Everything visual — the
  // translate, scale, corner rounding and dim — is derived from this one value,
  // so the finger, the release animation and the programmatic dismiss can never
  // disagree about where the sheet is.
  const dragY = useSharedValue(SCREEN_HEIGHT);
  // Shared rather than a React ref because the gesture callbacks are worklets and
  // cannot read refs. It is the single authority for "a dismiss is already
  // running", consulted by onStart, onEnd and onFinalize alike.
  const isDismissing = useSharedValue(false);
  // Guards the JS side, so a button press landing during a gesture-driven
  // dismiss cannot fire onClose a second time.
  const dismissingRef = React.useRef(false);
  const playScale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    // Enter from below. Opacity is derived from dragY rather than animated
    // separately, so the fade and the slide are inherently in sync.
    isDismissing.value = false;
    dragY.value = SCREEN_HEIGHT;
    dragY.value = withTiming(0, {
      duration: 320,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
    return () => {
      dismissingRef.current = false;
    };
  }, [dragY, isDismissing]);

  const haptic = React.useCallback((style: ImpactFeedbackStyle) => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(style).catch(() => {});
    }
  }, []);

  const completeDismiss = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const beginDismiss = React.useCallback(() => {
    dismissingRef.current = true;
  }, []);

  const animateDismiss = React.useCallback(() => {
    if (dismissingRef.current) {
      return;
    }
    dismissingRef.current = true;
    isDismissing.value = true;
    dragY.value = withTiming(
      SCREEN_HEIGHT,
      { duration: 280, easing: ReanimatedEasing.in(ReanimatedEasing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(completeDismiss)();
        }
      }
    );
  }, [dragY, isDismissing, completeDismiss]);

  // Interactive dismissal. The gesture is intentionally inert while the lyrics
  // view is open: that view owns a vertical ScrollView, and a bidirectional pan
  // wrapping it would win the gesture race after 10px and make lyrics
  // unscrollable. In lyrics mode the header chevron and the scrim tap dismiss
  // instead, so nothing becomes unreachable.
  const dismissPan = React.useMemo(
    () =>
      Gesture.Pan()
        .enabled(!showLyrics)
        .activeOffsetY([-PAN_ACTIVE_OFFSET_Y, PAN_ACTIVE_OFFSET_Y])
        // Any real horizontal travel fails the gesture outright, which is what
        // keeps the scrubber and the volume bar responsive: they are horizontal
        // drag targets and never lose the touch to a vertical sheet drag.
        .failOffsetX([-PAN_FAIL_OFFSET_X, PAN_FAIL_OFFSET_X])
        .onStart(() => {
          // Grabbing a sheet that is already animating away must not cancel the
          // dismiss, so the in-flight animation is only interrupted when the
          // sheet is genuinely at rest or mid-drag.
          if (isDismissing.value) {
            return;
          }
          // Otherwise stop any snap-back so the finger takes over mid-animation
          // instead of fighting it.
          cancelAnimation(dragY);
        })
        .onUpdate((event) => {
          if (isDismissing.value) {
            return;
          }
          const raw = event.translationY;
          dragY.value = raw < 0 ? raw * RUBBER_BAND_FACTOR : raw;
        })
        .onEnd((event) => {
          if (isDismissing.value) {
            return;
          }
          const shouldDismiss =
            dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
          if (shouldDismiss) {
            isDismissing.value = true;
            runOnJS(beginDismiss)();
            dragY.value = withTiming(
              SCREEN_HEIGHT,
              { duration: 280, easing: ReanimatedEasing.in(ReanimatedEasing.cubic) },
              (finished) => {
                if (finished) {
                  runOnJS(completeDismiss)();
                }
              }
            );
          } else {
            dragY.value = withSpring(0, DISMISS_SNAP_SPRING);
          }
        })
        .onFinalize(() => {
          // onFinalize runs immediately after onEnd, so it must not undo a
          // dismiss that onEnd just started — a fast flick has a small distance
          // but a high velocity, and springing here would cancel it. Any other
          // early exit (system stole the touch) springs back, including from the
          // negative rubber-banded position.
          if (isDismissing.value || dragY.value === 0) {
            return;
          }
          dragY.value = withSpring(0, DISMISS_SNAP_SPRING);
        }),
    [dragY, isDismissing, showLyrics, beginDismiss, completeDismiss]
  );

  const sheetMotionStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      dragY.value,
      [0, DISMISS_PROGRESS_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateY: dragY.value },
        {
          scale: interpolate(
            progress,
            [0, 1],
            [1, DISMISS_MIN_SCALE],
            Extrapolation.CLAMP
          ),
        },
      ],
      borderTopLeftRadius: interpolate(
        progress,
        [0, 1],
        [0, DISMISS_CORNER_RADIUS],
        Extrapolation.CLAMP
      ),
      borderTopRightRadius: interpolate(
        progress,
        [0, 1],
        [0, DISMISS_CORNER_RADIUS],
        Extrapolation.CLAMP
      ),
      // Materialises only while the card is moving. At rest this is fully
      // transparent, which is exactly the previous appearance: the sheet sits
      // directly on the ambient backdrop. Once it moves it needs a fill of its
      // own, otherwise the rounded corners and the scale would be invisible
      // against a backdrop that is already the same colour.
      backgroundColor: interpolateColor(
        progress,
        [0, 1],
        ["rgba(13, 17, 17, 0)", "rgba(13, 17, 17, 0.96)"]
      ),
      // Fades the card as it is pulled away, and doubles as the enter/exit fade:
      // at rest it is fully opaque, off-screen it is fully transparent.
      opacity: interpolate(
        dragY.value,
        [0, 90, SCREEN_HEIGHT],
        [1, 0.94, 0],
        Extrapolation.CLAMP
      ),
    };
  });

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

  const handleToggleLyrics = () => {
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setShowLyrics((v) => !v);
  };

  return (
    <View style={styles.screenRoot}>
      <LinearGradient
        colors={[COLORS.bgTop, COLORS.bgMid, COLORS.bgBottom]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Apple Music style ambient backdrop. These layers sit outside the sheet
          so they stay put while the sheet is dragged, and are pointer-events
          transparent so the swipe gesture and every control still receive
          touches. Order matters: opaque base gradient, then the translucent
          artwork, then the blur, then the scrim. */}
      {artworkUri ? (
        <Image
          source={{ uri: artworkUri }}
          style={styles.ambientArt}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={700}
          pointerEvents="none"
        />
      ) : null}

      <BlurView
        tint="dark"
        intensity={Platform.OS === "ios" ? 55 : 70}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <LinearGradient
        colors={AMBIENT_SCRIM_COLORS}
        locations={AMBIENT_SCRIM_LOCATIONS}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <GestureDetector gesture={dismissPan}>
        <AnimatedReanimated.View style={[styles.sheet, sheetMotionStyle]}>
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="light-content" />

          {showLyrics ? (
            <View style={styles.header}>
              {/* The lyrics header has no other way out: the artwork header's
                  back chevron lives in the else branch, and the track info row's
                  right slot now holds the lyrics toggle. Without this, lyrics
                  mode is only dismissible by the swipe-down gesture. */}
              <TouchableOpacity
                onPress={animateDismiss}
                style={styles.headerSide}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close player"
              >
                <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
              </TouchableOpacity>

              <View style={styles.lyricsHeaderLead}>
                {artworkUri ? (
                  <Image
                    source={{ uri: artworkUri }}
                    style={styles.lyricsHeaderArt}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`lyrics-${artworkUri}`}
                    transition={150}
                  />
                ) : (
                  <View style={[styles.lyricsHeaderArt, styles.artworkFallback]}>
                    <Ionicons name="musical-notes" size={18} color="rgba(255,255,255,0.35)" />
                  </View>
                )}
                <View style={styles.lyricsHeaderMeta}>
                  <Text style={styles.lyricsHeaderTitle} numberOfLines={1}>
                    {currentTrack?.title || "No track playing"}
                  </Text>
                  <Text style={styles.lyricsHeaderArtist} numberOfLines={1}>
                    {currentTrack?.artist || "Unknown Artist"}
                  </Text>
                </View>
              </View>

              <HeaderOptionsButton onPress={() => setQueueOpen(true)} />
            </View>
          ) : (
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

              <HeaderOptionsButton onPress={() => setQueueOpen(true)} />
            </View>
          )}

          <View style={[styles.heroTopSpacer, showLyrics && styles.heroSpacerCollapsed]} />

          {showLyrics ? (
            <LyricsView track={currentTrack} />
          ) : (
            <View style={styles.artworkStage}>
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
            </View>
          )}

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
              {showLyrics ? null : (
                <>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {currentTrack?.title || "No track playing"}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {currentTrack?.artist || "Unknown Artist"}
                  </Text>
                </>
              )}
            </View>

            <TouchableOpacity
              onPress={handleToggleLyrics}
              style={styles.sideAction}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityState={{ selected: showLyrics }}
              accessibilityLabel={showLyrics ? "Hide lyrics" : "Show lyrics"}
            >
              <Ionicons
                name={showLyrics ? "chatbubble-ellipses" : "chatbubble-ellipses-outline"}
                size={22}
                color={showLyrics ? COLORS.accent : "rgba(255, 255, 255, 0.8)"}
              />
            </TouchableOpacity>
          </View>

          <NowPlayingScrubber />

          <View style={styles.dockWrap}>
            <View style={styles.dockRow}>
              <TouchableOpacity
                onPress={handlePrevious}
                style={styles.deckSideBtn}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel="Previous track"
              >
                <Ionicons name="play-back" size={32} color={COLORS.textPrimary} />
              </TouchableOpacity>

              <Animated.View style={{ transform: [{ scale: playScale }] }}>
                <TouchableOpacity
                  onPress={handlePlayPause}
                  activeOpacity={0.9}
                  hitSlop={16}
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
                    size={48}
                    color={COLORS.textPrimary}
                    // The play triangle's centroid sits left of its box, so nudge
                    // it to look optically centred next to the pause bars.
                    style={{ marginLeft: isPlaying ? 0 : 5 }}
                  />
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity
                onPress={handleNext}
                style={styles.deckSideBtn}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityLabel="Next track"
              >
                <Ionicons name="play-forward" size={32} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
        </AnimatedReanimated.View>
      </GestureDetector>

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
                <TrackArtwork
                  track={currentTrack}
                  size={52}
                  borderRadius={8}
                  variant="highRes"
                  style={styles.queueNowArt}
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
                      <TrackArtwork
                        track={item}
                        size={46}
                        borderRadius={6}
                        variant="highRes"
                        style={styles.queueRowArt}
                      />
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
  ambientArt: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Near-opaque so the artwork's own colour and saturation carry the
    // background, with the blur doing the softening rather than darkening.
    opacity: 0.9,
    // Oversized so the blur cannot sample past the image edge and fade out,
    // and so centre highlights spread across the whole viewport.
    transform: [{ scale: 1.4 }],
  },
  sheet: {
    flex: 1,
    width: "100%",
    // Clipping only. The card's fill is animated in from fully transparent as
    // the drag progresses (see sheetMotionStyle), so the resting appearance is
    // unchanged while a moving card has a real edge to reveal.
    overflow: "hidden",
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
      artworkStage: {
        // Not flexible: the artwork keeps its natural square size and the gaps
        // between the blocks below carry the layout.
        flex: 0,
        alignItems: "center",
      },
      artworkWrap: {
        width: "100%",
        paddingHorizontal: 28,
        marginTop: 12,
        // Artwork -> track info.
        marginBottom: 36,
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
    // Even distribution: the artwork sits 36pt above, the scrubber 10pt below.
    // React Native margins add rather than collapse, so these are intentionally
    // additive and neither element double-contributes a shared gap.
    marginTop: 24,
    marginBottom: 10,
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
    // Fixed, not flexible: the artwork stage below is the single element that
    // absorbs leftover height, which keeps the transport anchored low without
    // letting the header gap drift open on tall screens.
    flex: 0,
    height: 24,
  },
  heroSpacerCollapsed: {
    flex: 0,
    height: 4,
    minHeight: 4,
  },
  lyricsHeaderLead: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 8,
  },
  lyricsHeaderArt: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  lyricsHeaderMeta: {
    flex: 1,
  },
  lyricsHeaderTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  lyricsHeaderArtist: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 2,
  },
  dockWrap: {
    width: "100%",
    paddingHorizontal: 16,
    marginBottom: 0,
  },
  dockRow: {
    flexDirection: "row",
    // Bare transport floating over the ambient artwork: no card, no fill.
    alignItems: "center",
    justifyContent: "center",
    gap: 48,
    // Scrubber -> transport, and clearance above the home indicator / bottom
    // edge. The old dockSpacer was removed so this is the single source of the
    // top gap and the two cannot stack.
    marginTop: 36,
    marginBottom: 48,
  },
  deckSideBtn: {
    width: 44,
    height: 44,
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
    flexShrink: 0,
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