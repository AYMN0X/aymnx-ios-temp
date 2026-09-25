import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpDown, Heart } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useDownloads } from '../context/DownloadContext';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useTrackActions } from '../context/TrackActionsContext';
import type { Track } from '../services/musicApi';
import { COLORS, TYPE } from '../theme/appTheme';
import { PlaylistDetailScreen } from './PlaylistDetailScreen';

const LIKED_GRADIENT: readonly [string, string] = ['#450AF5', '#8E8EE5'];

const SCREEN_WIDTH = Dimensions.get('window').width;

type LibraryDetail =
  | { type: 'liked' }
  | { type: 'playlist'; id: string; title: string };

interface LibraryScreenProps {
  onOpenAccount: () => void;
  initialDetail?: { type: 'playlist'; id: string } | null;
  onDetailConsumed?: () => void;
}

interface LibraryItem {
  type: 'liked' | 'playlist';
  key: string;
  title?: string;
  subtitle?: string;
  coverUrl?: string;
  playlistId?: string;
  tracks?: Track[];
}

export function LibraryScreen({ onOpenAccount, initialDetail, onDetailConsumed }: LibraryScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    likedSongs,
    likedMeta,
    playlists,
    createPlaylist,
    toggleLike,
    isLiked,
  } = useLibrary();
  const { playTrack, currentTrack } = usePlayer();
  const { openTrack } = useTrackActions();
  const { downloadedTracks } = useDownloads();
  const { user } = useAuth();
  const userInitial = (user?.name || user?.username || 'S').charAt(0).toUpperCase();
  const [detail, setDetail] = useState<LibraryDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const downloadedIds = useMemo(
    () => new Set(downloadedTracks.map((track) => track.id)),
    [downloadedTracks]
  );

  const downloadedLikedCount = useMemo(() => {
    return likedSongs.reduce((count, track) => (downloadedIds.has(track.id) ? count + 1 : count), 0);
  }, [likedSongs, downloadedIds]);

  const isPlaylistDownloaded = useCallback(
    (tracks: Track[] | undefined) =>
      !!tracks && tracks.length > 0 && tracks.every((track) => downloadedIds.has(track.id)),
    [downloadedIds]
  );

  const likedAllDownloaded = likedSongs.length > 0 && downloadedLikedCount === likedSongs.length;

  const selectedPlaylist =
    detail && detail.type === 'playlist'
      ? playlists.find((playlist: { id: string }) => playlist.id === detail.id)
      : null;

  const backToRoot = () => {
    setDetail(null);
    setCreating(false);
    setName('');
  };

  const dragOffset = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  const openDetail = useCallback(
    (next: LibraryDetail) => {
      dragOffset.setValue(SCREEN_WIDTH);
      setDetail(next);
      Animated.spring(dragOffset, {
        toValue: 0,
        damping: 28,
        stiffness: 280,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    },
    [dragOffset]
  );

  useEffect(() => {
    if (initialDetail && initialDetail.type === 'playlist' && !detail) {
      const playlist = playlists.find((item: { id: string }) => item.id === initialDetail.id);
      if (playlist) {
        openDetail({ type: 'playlist', id: playlist.id, title: playlist.name });
        if (onDetailConsumed) {
          onDetailConsumed();
        }
      }
    }
  }, [initialDetail, playlists, detail, onDetailConsumed, openDetail]);

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await createPlaylist(trimmed);
    setName('');
    setCreating(false);
  };

  const libraryItems: LibraryItem[] = [
    {
      type: 'liked',
      key: 'liked',
      title: likedMeta.name || 'Liked Songs',
      subtitle: `Playlist • ${likedSongs.length} songs`,
      coverUrl: likedMeta.coverUrl,
      tracks: likedSongs,
    },
    ...playlists.map((item: { id: string; name: string; tracks: Track[]; coverUrl?: string }) => ({
      type: 'playlist' as const,
      key: item.id,
      title: item.name,
      subtitle: `Playlist • ${item.tracks.length} songs`,
      playlistId: item.id,
      coverUrl: item.coverUrl,
      tracks: item.tracks,
    })),
  ];

  const selectedTracks = selectedPlaylist ? selectedPlaylist.tracks : [];

  const libraryTranslateX = useMemo(
    () =>
      dragOffset.interpolate({
        inputRange: [0, SCREEN_WIDTH],
        outputRange: [-SCREEN_WIDTH * 0.25, 0],
        extrapolate: 'clamp',
      }),
    [dragOffset]
  );
  const libraryScale = useMemo(
    () =>
      dragOffset.interpolate({
        inputRange: [0, SCREEN_WIDTH],
        outputRange: [0.97, 1.0],
        extrapolate: 'clamp',
      }),
    [dragOffset]
  );

  return (
    <View style={styles.libraryScreen}>
      <Animated.View
        style={[
          styles.libraryBody,
          detail
            ? {
                transform: [{ translateX: libraryTranslateX }, { scale: libraryScale }],
              }
            : null,
        ]}
      >
      <View style={styles.libraryHeader}>
        <Pressable style={styles.libraryAvatar} onPress={onOpenAccount}>
          <Text style={styles.libraryAvatarLetter}>{userInitial}</Text>
        </Pressable>
        <Text style={styles.libraryTitle}>Your Library</Text>
        <View style={styles.libraryHeaderActions}>
          <Pressable style={styles.libraryHeaderBtn} hitSlop={8}>
            <Ionicons name="search" size={22} color={COLORS.white} />
          </Pressable>
          <Pressable
            style={styles.libraryHeaderBtn}
            onPress={() => setCreating((v) => !v)}
            hitSlop={8}
          >
            <Ionicons name="add" size={26} color={COLORS.white} />
          </Pressable>
        </View>
      </View>
      <View style={styles.libraryToolbar}>
        <Pressable style={styles.libraryToolbarLeft} hitSlop={8}>
          <ArrowUpDown size={16} color={COLORS.white} />
          <Text style={styles.libraryToolbarText}>Recents</Text>
        </Pressable>
        <Pressable
          onPress={() => setViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
          hitSlop={8}
        >
          <Ionicons
            name={viewMode === 'list' ? 'grid-outline' : 'list'}
            size={22}
            color={COLORS.white}
          />
        </Pressable>
      </View>
      {creating ? (
        <View style={styles.libraryCreateRow}>
          <TextInput
            style={styles.libraryCreateInput}
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={COLORS.textSecondary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitCreate}
          />
          <Pressable
            style={[styles.libraryCreateBtn, !name.trim() && styles.disabled]}
            onPress={submitCreate}
            disabled={!name.trim()}
          >
            <Text style={styles.libraryCreateLabel}>Create</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={libraryItems}
        keyExtractor={(item) => item.key}
        contentContainerStyle={[styles.libraryList, { paddingBottom: insets.bottom + 110 }]}
        ListEmptyComponent={<Text style={styles.libraryEmpty}>No songs yet</Text>}
        renderItem={({ item }) => {
          if (item.type === 'liked') {
            return (
              <Pressable style={styles.libRow} onPress={() => openDetail({ type: 'liked' })}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.libCover} />
                ) : (
                  <LinearGradient
                    colors={LIKED_GRADIENT}
                    style={styles.libCover}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Heart size={20} color={COLORS.white} fill={COLORS.white} />
                  </LinearGradient>
                )}
                <View style={styles.libRowInfo}>
                  <Text style={styles.libRowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={styles.libRowSubtitleRow}>
                    {likedAllDownloaded && (
                      <Ionicons
                        name="arrow-down-circle"
                        size={13}
                        color="#FFFFFF"
                        style={styles.libRowSubtitleIcon}
                      />
                    )}
                    <Text style={styles.libRowSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }
          return (
            <Pressable
              style={styles.libRow}
              onPress={() =>
                openDetail({ type: 'playlist', id: item.playlistId!, title: item.title! })
              }
            >
              <View style={[styles.libCover, { backgroundColor: COLORS.card }]}>
                {item.coverUrl ? (
                  <Image source={{ uri: item.coverUrl }} style={styles.libCover} />
                ) : null}
              </View>
              <View style={styles.libRowInfo}>
                <Text style={styles.libRowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.libRowSubtitleRow}>
                  {isPlaylistDownloaded(item.tracks) && (
                    <Ionicons
                      name="arrow-down-circle"
                      size={13}
                      color="#FFFFFF"
                      style={styles.libRowSubtitleIcon}
                    />
                  )}
                  <Text style={styles.libRowSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      </Animated.View>
      {detail ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {detail.type === 'liked' ? (
            <PlaylistDetailScreen
              key="liked"
              isLikedPlaylist
              onBack={backToRoot}
              dragOffset={dragOffset}
            />
          ) : (
            <PlaylistDetailScreen
              key={detail.id}
              title={selectedPlaylist ? selectedPlaylist.name : 'Playlist'}
              subtitle={
                selectedTracks.length === 1 ? '1 song' : `${selectedTracks.length} songs`
              }
              tracks={selectedTracks}
              coverImage={selectedPlaylist?.coverUrl}
              playlistId={detail.id}
              onBack={backToRoot}
              dragOffset={dragOffset}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  libraryScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 8,
    paddingBottom: 8,
  },
  libraryBody: {
    flex: 1,
    width: '100%',
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  libraryAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryAvatarLetter: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: 'bold',
  },
  libraryTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    flex: 1,
  },
  libraryHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  libraryHeaderBtn: {
    padding: 4,
  },
  libraryToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  libraryToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  libraryToolbarText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  libRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    gap: 12,
    paddingHorizontal: 16,
  },
  libCover: {
    width: 44,
    height: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  libRowInfo: {
    flex: 1,
  },
  libRowTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  libRowSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  libRowSubtitleIcon: {
    marginRight: 0,
  },
  libRowSubtitle: {
    ...TYPE.body,
  },
  libraryList: {
  },
  libraryCreateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  libraryCreateInput: {
    flex: 1,
    backgroundColor: COLORS.card,
    color: COLORS.textPrimary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  libraryCreateBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  libraryCreateLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  libraryEmpty: {
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});