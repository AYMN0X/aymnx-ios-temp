import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ArrowDown } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Color, Border } from "../theme/GlobalStyles";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { useDownloads } from "../context/DownloadContext";
import { useTrackActions } from "../context/TrackActionsContext";
import { getThumbnailArtworkUrl, resolveArtworkForTrack } from "../services/musicApi";
import type { Track } from "../services/musicApi";

interface PlaylistDetailScreenProps {
  title?: string;
  subtitle?: string;
  tracks?: Track[];
  coverColor?: string;
  coverImage?: string;
  isLikedPlaylist?: boolean;
  playlistId?: string;
  dragOffset?: Animated.Value;
  onBack: () => void;
}

const PRESET_COVERS = [
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
  "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400&q=80",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=80",
];

const EDGE_HIT_WIDTH = 28;
const POP_THRESHOLD = 80;
const FLING_DISTANCE = 40;
const FLING_VELOCITY = 0.65;
const WINDOW_WIDTH = Dimensions.get("window").width;

const clampDrag = (value: number) => Math.min(Math.max(value, 0), WINDOW_WIDTH);

export const PlaylistDetailScreen: React.FC<PlaylistDetailScreenProps> = ({
  title,
  tracks,
  coverColor,
  coverImage,
  isLikedPlaylist,
  playlistId,
  dragOffset,
  onBack,
}) => {
  const { playTrack, currentTrack } = usePlayer();
  const { openTrack } = useTrackActions();
  const {
    likedSongs,
    likedMeta,
    toggleLike,
    playlists,
    removePlaylist,
    updatePlaylistDetails,
    replaceTrack,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
    reorderLikedSongs,
    updateLikedMeta,
  } = useLibrary();
  const { downloadedIds, isDownloaded, isBatchDownloading, batchProgress, downloadAll, deleteDownload } =
    useDownloads();

  const livePlaylist = playlistId ? playlists.find((playlist) => playlist.id === playlistId) : undefined;

  const displayTracks = isLikedPlaylist
    ? likedSongs
    : livePlaylist
    ? livePlaylist.tracks
    : (tracks ?? []);
  const rawTitle = isLikedPlaylist
    ? likedMeta.name
    : livePlaylist?.name ?? title;
  const displayTitle =
    rawTitle && rawTitle.trim().length > 0
      ? rawTitle
      : isLikedPlaylist
      ? "Liked Songs"
      : "Playlist";

  const coverBackground = isLikedPlaylist ? Color.accent : (coverColor ?? Color.accent);
  const effectiveCover = isLikedPlaylist
    ? likedMeta.coverUrl
    : livePlaylist?.coverUrl ?? coverImage;

  const playlistCoverUrls = React.useMemo(() => {
    const values = [effectiveCover, livePlaylist?.coverUrl, coverImage];
    return new Set(
      values.filter((value): value is string => typeof value === "string" && value.length > 0)
    );
  }, [coverImage, effectiveCover, livePlaylist?.coverUrl]);

  const isPlaylistCoverArtwork = React.useCallback(
    (artwork?: string) => {
      if (!artwork || playlistCoverUrls.size === 0) {
        return false;
      }
      const normalized = getThumbnailArtworkUrl(artwork);
      let dirty = false;
      playlistCoverUrls.forEach((url) => {
        if (url === artwork || getThumbnailArtworkUrl(url) === normalized) {
          dirty = true;
        }
      });
      return dirty;
    },
    [playlistCoverUrls]
  );

  const resolvedArtwork = React.useRef<Record<string, string>>({});
  const artworkAttempts = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const pending: Track[] = [];
      for (const track of displayTracks) {
        if (pending.length >= 8) {
          break;
        }
        if (resolvedArtwork.current[track.id]) {
          continue;
        }
        const needsArtwork = !track.artwork || isPlaylistCoverArtwork(track.artwork);
        if (!needsArtwork) {
          continue;
        }
        if (artworkAttempts.current.has(track.id)) {
          continue;
        }
        artworkAttempts.current.add(track.id);
        pending.push(track);
      }
      for (const track of pending) {
        const artwork = await resolveArtworkForTrack(track);
        if (cancelled) {
          return;
        }
        if (!artwork) {
          continue;
        }
        resolvedArtwork.current[track.id] = artwork;
        await replaceTrack(track.id, { ...track, artwork });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [displayTracks, isPlaylistCoverArtwork, replaceTrack]);

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetView, setSheetView] = React.useState<"options" | "details">("options");
  const [isEditing, setIsEditing] = React.useState(false);
  const [detailsName, setDetailsName] = React.useState("");
  const [detailsDescription, setDetailsDescription] = React.useState("");
  const [detailsCover, setDetailsCover] = React.useState("");

  const canEdit = !!livePlaylist || isLikedPlaylist;

  const dragValue = dragOffset ?? React.useRef(new Animated.Value(0)).current;

  const animateClose = (onDone?: () => void) => {
    Animated.timing(dragValue, {
      toValue: WINDOW_WIDTH,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (onDone) {
        onDone();
      }
    });
  };

  const swipeBackResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
        if (Platform.OS !== "ios") {
          return false;
        }
        return (
          gestureState.x0 <= EDGE_HIT_WIDTH &&
          gestureState.dx > 12 &&
          gestureState.dx > Math.abs(gestureState.dy)
        );
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (gestureState.dx > 0) {
          dragValue.setValue(clampDrag(gestureState.dx));
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const shouldPop =
          gestureState.dx > POP_THRESHOLD ||
          (gestureState.dx > FLING_DISTANCE && gestureState.vx > FLING_VELOCITY);
        if (shouldPop) {
          Animated.timing(dragValue, {
            toValue: WINDOW_WIDTH,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => onBack());
        } else {
          Animated.spring(dragValue, {
            toValue: 0,
            stiffness: 320,
            damping: 34,
            mass: 1,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        Animated.spring(dragValue, {
          toValue: 0,
          stiffness: 320,
          damping: 34,
          mass: 1,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const pendingForDownload = displayTracks.filter((track) => !downloadedIds.has(track.id));
  const allDownloaded = displayTracks.length > 0 && pendingForDownload.length === 0;
  const isDownloading = isBatchDownloading && batchProgress !== null;

  const playlistMetaText = React.useMemo(() => {
    const songCount = displayTracks.length;
    const songsLabel = `${songCount} ${songCount === 1 ? "song" : "songs"}`;
    const totalSeconds = displayTracks.reduce(
      (total, track) => total + (typeof track.duration === "number" && track.duration > 0 ? track.duration : 0),
      0
    );
    if (totalSeconds <= 0) {
      return songsLabel;
    }
    const totalMinutes = Math.round(totalSeconds / 60);
    if (totalMinutes < 60) {
      return `${songsLabel} • ${totalMinutes} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const durationText = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    return `${songsLabel} • ${durationText}`;
  }, [displayTracks]);

  const handleDownload = () => {
    if (isBatchDownloading || pendingForDownload.length === 0) {
      return;
    }
    downloadAll(pendingForDownload);
  };

  const handleDownloadToggle = async (enabled: boolean) => {
    if (isBatchDownloading) {
      return;
    }
    if (enabled) {
      if (pendingForDownload.length > 0) {
        await downloadAll(pendingForDownload);
      }
      return;
    }
    const downloaded = displayTracks.filter((track) => isDownloaded(track.id));
    await Promise.all(downloaded.map((track) => deleteDownload(track.id)));
  };

  const downloadButtonLabel = isDownloading
    ? `Downloading ${batchProgress.downloaded}/${batchProgress.total}`
    : allDownloaded
    ? "Downloaded"
    : pendingForDownload.length === displayTracks.length
    ? "Download"
    : `Download ${pendingForDownload.length} remaining`;

  const handleDownloadButton = () => {
    if (isDownloading) {
      return;
    }
    if (!allDownloaded) {
      handleDownloadToggle(true);
      return;
    }
    Alert.alert(
      "Remove downloads?",
      `This deletes the offline files for all ${displayTracks.length} songs.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => handleDownloadToggle(false) },
      ]
    );
  };

  const openOptionsSheet = () => {
    setSheetView("options");
    setSheetOpen(true);
  };

  const openDetails = () => {
    setDetailsName(isLikedPlaylist ? likedMeta.name || "Liked Songs" : livePlaylist?.name ?? displayTitle);
    setDetailsDescription(
      isLikedPlaylist ? likedMeta.description ?? "" : livePlaylist?.description ?? ""
    );
    setDetailsCover(
      isLikedPlaylist
        ? likedMeta.coverUrl ?? ""
        : livePlaylist?.coverUrl ?? coverImage ?? ""
    );
    setSheetView("details");
  };

  const pickCoverImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setDetailsCover(result.assets[0].uri);
    }
  };

  const saveDetails = async () => {
    const trimmed = detailsName.trim();
    if (!trimmed) {
      return;
    }
    if (isLikedPlaylist) {
      await updateLikedMeta({
        name: trimmed,
        description: detailsDescription.trim(),
        coverUrl: detailsCover || undefined,
      });
    } else if (playlistId) {
      await updatePlaylistDetails(playlistId, trimmed, detailsDescription.trim(), detailsCover || undefined);
    } else {
      return;
    }
    setSheetView("options");
  };

  const moveTrack = (index: number, delta: number) => {
    const toIndex = index + delta;
    if (isLikedPlaylist) {
      reorderLikedSongs(index, toIndex);
      return;
    }
    if (!playlistId) {
      return;
    }
    reorderPlaylistTracks(playlistId, index, toIndex);
  };

  const removeTrack = (track: Track) => {
    if (isLikedPlaylist) {
      toggleLike(track);
      return;
    }
    if (!playlistId) {
      return;
    }
    removeTrackFromPlaylist(playlistId, track.id);
  };

  const handleDeletePlaylist = () => {
    if (!playlistId) {
      return;
    }
    setSheetOpen(false);
    setSheetView("options");
    Alert.alert(
      "Delete playlist?",
      `"${displayTitle}" will be permanently removed from your library.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removePlaylist(playlistId);
            animateClose(() => onBack());
          },
        },
      ]
    );
  };

  return (
    <Animated.View
      style={[
        styles.popRoot,
        {
          transform: [
            { translateX: dragValue },
            {
              scaleX: dragValue.interpolate({
                inputRange: [0, WINDOW_WIDTH],
                outputRange: [1, 0.96],
                extrapolate: "clamp",
              }),
            },
          ],
        },
      ]}
      {...swipeBackResponder.panHandlers}
    >
      <LinearGradient
        colors={["#0f1413", "#0f1413", "#0e1111"]}
        locations={[0, 0.35, 1]}
        style={styles.container}
      >
      <StatusBar barStyle="light-content" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 150 }]}
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView style={styles.safeTop}>
          <View style={styles.topNav}>
            <TouchableOpacity
              onPress={() => animateClose(() => onBack())}
              style={styles.iconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={26} color={Color.textPrimary} />
            </TouchableOpacity>
            {isEditing ? (
              <TouchableOpacity
                onPress={() => setIsEditing(false)}
                style={styles.doneButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.topNavRight}>
                {livePlaylist ? (
                  <TouchableOpacity
                    onPress={openOptionsSheet}
                    style={styles.topNavButton}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={22} color={Color.textPrimary} />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </View>
        </SafeAreaView>

        <View style={styles.titleBlock}>
          <Text style={styles.playlistTitle} numberOfLines={2}>
            {displayTitle}
          </Text>
          <Text style={styles.playlistMeta}>{playlistMetaText}</Text>
        </View>

        <View style={styles.downloadRow}>
          <Pressable
            onPress={handleDownloadButton}
            disabled={isDownloading}
            hitSlop={8}
            style={({ pressed }) => [
              styles.downloadButton,
              allDownloaded && styles.downloadButtonDone,
              pressed && styles.downloadButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={downloadButtonLabel}
            accessibilityState={{ selected: allDownloaded, disabled: isDownloading }}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ArrowDown
                size={16}
                color={allDownloaded ? "#101313" : "#A7A7A7"}
                strokeWidth={3}
              />
            )}
          </Pressable>
        </View>

        <View style={styles.trackList}>
          {displayTracks.length === 0 ? (
            <Text style={styles.emptyText}>No songs yet</Text>
          ) : (
            displayTracks.map((track, index) => {
              const isCurrent = !isEditing && currentTrack?.id === track.id;
              const ownArtwork = isPlaylistCoverArtwork(track.artwork) ? "" : track.artwork;
              const trackArtwork = getThumbnailArtworkUrl(
                resolvedArtwork.current[track.id] || ownArtwork
              );
              return (
                <View key={track.id} style={[styles.trackRow, isCurrent && styles.trackRowActive]}>
                  <TouchableOpacity
                    style={styles.trackRowMain}
                    onPress={() => playTrack(track, displayTracks)}
                    disabled={isEditing}
                    activeOpacity={0.7}
                  >
                    {trackArtwork ? (
                      <Image source={{ uri: trackArtwork }} style={styles.trackArtwork} />
                    ) : (
                      <View style={[styles.trackArtwork, styles.trackArtworkFallback]} />
                    )}
                    {isCurrent ? (
                      <Ionicons name="volume-high" size={18} color="#FFFFFF" style={styles.speakerIcon} />
                    ) : null}
                    <View style={styles.trackDetails}>
                      <Text
                        style={[styles.trackTitle, isCurrent && styles.trackTitleCurrent]}
                        numberOfLines={1}
                      >
                        {track.title}
                      </Text>
                      <View style={styles.trackArtistRow}>
                        {isDownloaded(track.id) ? (
                          <Ionicons
                            name="arrow-down-circle"
                            size={12}
                            color="#FFFFFF"
                            style={styles.trackDownloadIcon}
                          />
                        ) : null}
                        <Text
                          style={[styles.trackArtist, isCurrent && styles.trackArtistCurrent]}
                          numberOfLines={1}
                        >
                          {track.artist}
                          {track.album ? ` • ${track.album}` : ""}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                  {isEditing ? (
                    <View style={styles.editControls}>
                      <TouchableOpacity
                        onPress={() => moveTrack(index, -1)}
                        disabled={index === 0}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="chevron-up"
                          size={20}
                          color={index === 0 ? Color.textSecondary : Color.textPrimary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveTrack(index, 1)}
                        disabled={index === displayTracks.length - 1}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={index === displayTracks.length - 1 ? Color.textSecondary : Color.textPrimary}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeTrack(track)} hitSlop={6}>
                        <Ionicons name="trash-outline" size={20} color="#E05A47" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => openTrack(track, playlistId)} hitSlop={10} style={styles.moreButton}>
                      <Ionicons
                        name="ellipsis-horizontal"
                        size={20}
                        color={isCurrent ? "#A0A0A0" : "#707070"}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable
            style={styles.sheetBackdrop}
            onPress={() => {
              setSheetView("options");
              setSheetOpen(false);
            }}
          />
          <View style={styles.sheet}>
            <View style={styles.dragBar} />
            {sheetView === "options" ? (
              <>
                <View style={styles.sheetHeader}>
                  {effectiveCover && effectiveCover.length > 0 ? (
                    <Image source={{ uri: effectiveCover }} style={styles.sheetArtwork} />
                  ) : (
                    <View style={[styles.sheetArtwork, { backgroundColor: coverBackground }]} />
                  )}
                  <View style={styles.sheetHeaderText}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                      {displayTitle}
                    </Text>
                    <Text style={styles.sheetSubtitle}>{isLikedPlaylist ? displayTitle : "Public playlist"}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.sheetAction, (isDownloading || allDownloaded) && styles.sheetActionDisabled]}
                  onPress={handleDownload}
                  disabled={isDownloading || allDownloaded}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={allDownloaded ? "checkmark-circle" : isDownloading ? "refresh" : "download-outline"}
                    size={22}
                    color={allDownloaded ? Color.accent : Color.textPrimary}
                  />
                  <View style={styles.sheetActionBody}>
                    <Text style={styles.sheetActionLabel}>
                      {isDownloading
                        ? `Downloading ${batchProgress.downloaded}/${batchProgress.total}...`
                        : allDownloaded
                        ? "Downloaded"
                        : pendingForDownload.length === displayTracks.length
                        ? "Download"
                        : `Download ${pendingForDownload.length} remaining`}
                    </Text>
                    {isDownloading ? (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { flex: batchProgress.downloaded }]} />
                        <View style={{ flex: Math.max(batchProgress.total - batchProgress.downloaded, 0) }} />
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>

                {canEdit ? (
                  <>
                    <TouchableOpacity
                      style={styles.sheetAction}
                      onPress={() => {
                        setSheetOpen(false);
                        setSheetView("options");
                        setIsEditing(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="list-outline" size={22} color={Color.textPrimary} />
                      <Text style={styles.sheetActionLabel}>Edit playlist</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sheetAction} onPress={openDetails} activeOpacity={0.7}>
                      <Ionicons name="information-circle-outline" size={22} color={Color.textPrimary} />
                      <Text style={styles.sheetActionLabel}>Name & details</Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                {!!livePlaylist ? (
                  <TouchableOpacity style={styles.sheetAction} onPress={handleDeletePlaylist} activeOpacity={0.7}>
                    <Ionicons name="trash-outline" size={22} color="#E05A47" />
                    <Text style={[styles.sheetActionLabel, styles.sheetActionLabelDelete]}>Delete playlist</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <>
                <ScrollView
                  style={styles.detailsScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.detailsTitle}>Name & details</Text>
                  <View style={styles.detailsTopRow}>
                    <Pressable style={styles.detailsArtworkWrap} onPress={pickCoverImage} hitSlop={8}>
                      {detailsCover && detailsCover.length > 0 ? (
                        <Image source={{ uri: detailsCover }} style={styles.detailsArtwork} />
                      ) : (
                        <View style={[styles.detailsArtwork, { backgroundColor: coverBackground }]} />
                      )}
                      <View style={styles.detailsPencilBadge}>
                        <Ionicons name="pencil" size={13} color="#111216" />
                      </View>
                    </Pressable>
                    <View style={styles.detailsFields}>
                      <View style={styles.detailsField}>
                        <Text style={styles.detailsLabel}>Playlist name</Text>
                        <TextInput
                          style={styles.detailsInput}
                          value={detailsName}
                          onChangeText={setDetailsName}
                          placeholder="Playlist name"
                          placeholderTextColor={Color.textSecondary}
                          autoFocus
                          returnKeyType="done"
                        />
                      </View>
                      <View style={styles.detailsField}>
                        <Text style={styles.detailsLabel}>Description</Text>
                        <TextInput
                          style={[styles.detailsInput, styles.detailsInputMultiline]}
                          value={detailsDescription}
                          onChangeText={setDetailsDescription}
                          placeholder="Add description"
                          placeholderTextColor={Color.textSecondary}
                          multiline
                        />
                      </View>
                    </View>
                  </View>
                  <View style={styles.detailsCoverSection}>
                    <Text style={styles.detailsLabel}>Cover</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.detailsPresetRow}
                    >
                      {PRESET_COVERS.map((uri) => (
                        <TouchableOpacity key={uri} onPress={() => setDetailsCover(uri)} activeOpacity={0.8}>
                          <Image
                            source={{ uri }}
                            style={[styles.detailsPresetCover, detailsCover === uri && styles.detailsPresetActive]}
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <TextInput
                      style={styles.detailsInput}
                      value={detailsCover}
                      onChangeText={setDetailsCover}
                      placeholder="Paste an image URL"
                      placeholderTextColor={Color.textSecondary}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </ScrollView>
                <View style={styles.detailsActions}>
                  <TouchableOpacity onPress={() => setSheetView("options")} hitSlop={8}>
                    <Text style={styles.detailsCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveDetails} disabled={!detailsName.trim()} hitSlop={8}>
                    <Text style={[styles.detailsSave, !detailsName.trim() && styles.detailsSaveDisabled]}>
                      Save
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      </LinearGradient>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.edgeShadow,
          {
            opacity: dragValue.interpolate({
              inputRange: [0, WINDOW_WIDTH * 0.5],
              outputRange: [0, 1],
              extrapolate: "clamp",
            }),
          },
        ]}
      >
        <View style={styles.edgeShadowFill} />
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  popRoot: {
    flex: 1,
    width: "100%",
    backgroundColor: Color.background,
  },
  container: {
    flex: 1,
    backgroundColor: Color.background,
  },
  edgeShadow: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 28,
    zIndex: 20,
  },
  edgeShadowFill: {
    flex: 1,
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  safeTop: {
    zIndex: 10,
  },
  topNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  topNavRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topNavButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  iconButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  doneButton: {
    backgroundColor: Color.accent,
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  playlistTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  playlistMeta: {
    fontSize: 13,
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.6)",
    marginTop: 4,
  },
  downloadRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  downloadButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2.8,
    borderColor: "#A7A7A7",
    alignItems: "center",
    justifyContent: "center",
  },
  downloadButtonDone: {
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
  },
  downloadButtonPressed: {
    opacity: 0.7,
  },
  scrollView: {
    flex: 1,
    backgroundColor: Color.background,
  },
  scrollContent: {
    backgroundColor: Color.background,
    paddingTop: 12,
    minHeight: "100%",
  },
  trackList: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 4,
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
    paddingVertical: 10,
  },
  trackRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  trackRowActive: {
    backgroundColor: "rgba(28, 32, 32, 0.9)",
    borderRadius: 14,
    padding: 12,
  },
  speakerIcon: {
    marginRight: 12,
  },
  editControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trackDetails: {
    flex: 1,
    justifyContent: "center",
  },
  trackArtwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
    marginRight: 12,
    backgroundColor: Color.card,
  },
  trackArtworkFallback: {
    backgroundColor: Color.background,
    borderWidth: 1,
    borderColor: Color.border,
  },
  trackTitle: {
    fontSize: 14.5,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  trackTitleCurrent: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  trackArtistRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },
  trackDownloadIcon: {
    marginRight: 5,
  },
  trackArtist: {
    fontSize: 12.5,
    color: "rgba(255, 255, 255, 0.6)",
    flexShrink: 1,
  },
  trackArtistCurrent: {
    color: "rgba(255, 255, 255, 0.6)",
  },
  moreButton: {
    padding: 6,
    marginRight: 4,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "transparent",
  },
  sheet: {
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: "#23252B",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  dragBar: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 6,
  },
  sheetArtwork: {
    width: 40,
    height: 40,
    borderRadius: Border.sm,
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Color.textPrimary,
  },
  sheetSubtitle: {
    fontSize: 12,
    color: Color.textSecondary,
    marginTop: 2,
  },
  sheetAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
  },
  sheetActionDisabled: {
    opacity: 0.6,
  },
  sheetActionBody: {
    flex: 1,
  },
  sheetActionLabel: {
    fontSize: 15,
    color: Color.textPrimary,
  },
  sheetActionLabelDelete: {
    color: "#E05A47",
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#23252B",
    flexDirection: "row",
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    backgroundColor: Color.accent,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Color.textPrimary,
    marginBottom: 14,
  },
  detailsScroll: {
    maxHeight: 430,
  },
  detailsTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  detailsArtworkWrap: {
    width: 96,
    height: 96,
    position: "relative",
  },
  detailsArtwork: {
    width: 96,
    height: 96,
    borderRadius: Border.sm,
  },
  detailsPencilBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  detailsFields: {
    flex: 1,
  },
  detailsCoverSection: {
    marginTop: 2,
    gap: 10,
  },
  detailsPresetRow: {
    gap: 10,
    paddingRight: 8,
  },
  detailsPresetCover: {
    width: 64,
    height: 64,
    borderRadius: Border.sm,
  },
  detailsPresetActive: {
    borderWidth: 2,
    borderColor: Color.accent,
  },
  detailsField: {
    marginBottom: 14,
  },
  detailsLabel: {
    fontSize: 12,
    color: Color.textSecondary,
    marginBottom: 6,
  },
  detailsInput: {
    backgroundColor: "#1E1F22",
    borderRadius: Border.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Color.textPrimary,
    fontSize: 15,
  },
  detailsInputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  detailsActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  detailsCancel: {
    fontSize: 15,
    color: Color.textSecondary,
    fontWeight: "600",
  },
  detailsSave: {
    fontSize: 15,
    color: Color.accent,
    fontWeight: "700",
  },
  detailsSaveDisabled: {
    opacity: 0.4,
  },
});

export default PlaylistDetailScreen;