import * as React from "react";
import {
  Image,
  ImageBackground,
  Modal,
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
import * as ImagePicker from "expo-image-picker";
import { Color, Border } from "../theme/GlobalStyles";
import { AmbientBackground } from "../components/AmbientBackground";
import { usePlayer } from "../context/PlayerContext";
import { useLibrary } from "../context/LibraryContext";
import { useDownloads } from "../context/DownloadContext";
import type { Track } from "../services/musicApi";

interface Screen3Props {
  title?: string;
  subtitle?: string;
  tracks?: Track[];
  coverColor?: string;
  coverImage?: string;
  isLikedPlaylist?: boolean;
  playlistId?: string;
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

const PRESET_COVERS = [
  "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
  "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
  "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=400&q=80",
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&q=80",
];

export const Screen3: React.FC<Screen3Props> = ({
  title,
  subtitle,
  tracks,
  coverColor,
  coverImage,
  isLikedPlaylist,
  playlistId,
  onBack,
}) => {
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const {
    likedSongs,
    isLiked,
    toggleLike,
    playlists,
    updatePlaylistDetails,
    removeTrackFromPlaylist,
    reorderPlaylistTracks,
  } = useLibrary();
  const { downloadedIds, isBatchDownloading, batchProgress, downloadAll } = useDownloads();

  const livePlaylist = playlistId ? playlists.find((playlist) => playlist.id === playlistId) : undefined;

  const displayTracks = isLikedPlaylist
    ? likedSongs
    : livePlaylist
    ? livePlaylist.tracks
    : (tracks ?? []);
  const displayTitle = isLikedPlaylist ? "Liked Songs" : (livePlaylist?.name ?? title ?? "Playlist");
  const displaySubtitle =
    subtitle || `${displayTracks.length} ${displayTracks.length === 1 ? "song" : "songs"}`;
  const coverBackground = isLikedPlaylist ? "#450AF5" : (coverColor ?? Color.accent);
  const effectiveCover = livePlaylist?.coverUrl ?? coverImage;

  const artworkFor = (track: Track) =>
    (track as Track & { albumArt?: string }).albumArt || track.artwork;

  const handlePlayAll = () => {
    if (displayTracks.length > 0) {
      playTrack(displayTracks[0], displayTracks);
    }
  };

  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [detailsName, setDetailsName] = React.useState("");
  const [detailsDescription, setDetailsDescription] = React.useState("");
  const [detailsCover, setDetailsCover] = React.useState("");

  const canEdit = !isLikedPlaylist && !!livePlaylist;

  const pendingForDownload = displayTracks.filter((track) => !downloadedIds.has(track.id));
  const allDownloaded = displayTracks.length > 0 && pendingForDownload.length === 0;
  const isDownloading = isBatchDownloading && batchProgress !== null;

  const handleDownload = () => {
    if (isBatchDownloading || pendingForDownload.length === 0) {
      return;
    }
    downloadAll(pendingForDownload);
  };

  const openDetails = () => {
    setDetailsName(livePlaylist?.name ?? displayTitle);
    setDetailsDescription(livePlaylist?.description ?? "");
    setDetailsCover(livePlaylist?.coverUrl ?? coverImage ?? "");
    setDetailsOpen(true);
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
    if (!playlistId || !trimmed) {
      return;
    }
    await updatePlaylistDetails(playlistId, trimmed, detailsDescription.trim(), detailsCover || undefined);
    setDetailsOpen(false);
  };

  const moveTrack = (index: number, delta: number) => {
    if (!playlistId) {
      return;
    }
    reorderPlaylistTracks(playlistId, index, index + delta);
  };

  const removeTrack = (trackId: string) => {
    if (!playlistId) {
      return;
    }
    removeTrackFromPlaylist(playlistId, trackId);
  };

  return (
    <AmbientBackground>
      <StatusBar barStyle="light-content" />

      <View style={[styles.heroContainer, { backgroundColor: coverBackground }]}>
        {effectiveCover && effectiveCover.length > 0 ? (
          <ImageBackground
            source={{ uri: effectiveCover }}
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
            <TouchableOpacity
              onPress={() => setSheetOpen(true)}
              style={styles.iconButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
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

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.dragBar} />
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
                <Text style={styles.sheetSubtitle}>{isLikedPlaylist ? "Liked Songs" : "Public playlist"}</Text>
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
                color={allDownloaded ? "#1DB954" : Color.textPrimary}
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
                  onPress={() => setEditOpen(true)}
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
          </View>
        </View>
      </Modal>

      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setEditOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.dragBar} />
            <View style={styles.editHeader}>
              <TouchableOpacity onPress={() => setEditOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={Color.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.editTitle}>Edit playlist</Text>
              <View style={styles.editHeaderSpacer} />
            </View>
            <ScrollView style={styles.editList} showsVerticalScrollIndicator={false}>
              {displayTracks.length === 0 ? (
                <Text style={styles.emptyText}>No songs yet</Text>
              ) : (
                displayTracks.map((track, index) => {
                  const artwork = artworkFor(track);
                  return (
                    <View key={track.id} style={styles.editRow}>
                      {artwork ? (
                        <Image source={{ uri: artwork }} style={styles.editArtwork} />
                      ) : (
                        <View style={[styles.editArtwork, { backgroundColor: FALLBACK_COLORS[index % FALLBACK_COLORS.length] }]} />
                      )}
                      <View style={styles.trackDetails}>
                        <Text style={styles.trackTitle} numberOfLines={1}>
                          {track.title}
                        </Text>
                        <Text style={styles.trackArtist} numberOfLines={1}>
                          {track.artist}
                        </Text>
                      </View>
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
                      <TouchableOpacity onPress={() => removeTrack(track.id)} hitSlop={6}>
                        <Ionicons name="trash-outline" size={20} color="#E05A47" />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={detailsOpen} transparent animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setDetailsOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.dragBar} />
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
                  <Ionicons name="pencil" size={13} color="#0F0817" />
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
              <TouchableOpacity onPress={() => setDetailsOpen(false)} hitSlop={8}>
                <Text style={styles.detailsCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveDetails} disabled={!detailsName.trim()} hitSlop={8}>
                <Text style={[styles.detailsSave, !detailsName.trim() && styles.detailsSaveDisabled]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </AmbientBackground>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
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
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheet: {
    backgroundColor: Color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  dragBar: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4A3E5C",
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
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#2A2237",
    flexDirection: "row",
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    backgroundColor: Color.accent,
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  editHeaderSpacer: {
    width: 24,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Color.textPrimary,
  },
  editList: {
    maxHeight: 380,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  editArtwork: {
    width: 40,
    height: 40,
    borderRadius: Border.sm,
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
    backgroundColor: "#161224",
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

export default Screen3;