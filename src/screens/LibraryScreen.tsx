import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpDown, Download, Heart } from 'lucide-react-native';
import { TrackRow } from '../components/TrackRow';
import { useAuth } from '../context/AuthContext';
import { useDownloads } from '../context/DownloadContext';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useTrackActions } from '../context/TrackActionsContext';
import type { Track } from '../services/musicApi';
import { COLORS, TYPE } from '../theme/appTheme';
import { Screen3 } from './Screen3';

const LIKED_GRADIENT: readonly [string, string] = ['#450AF5', '#8E8EE5'];

const LIBRARY_FILTERS = ['Playlists', 'Podcasts', 'Albums', 'Downloaded'];

type LibraryDetail =
  | { type: 'liked' }
  | { type: 'playlist'; id: string; title: string };

interface LibraryScreenProps {
  onOpenAccount: () => void;
  initialDetail?: { type: 'playlist'; id: string } | null;
  onDetailConsumed?: () => void;
}

interface LibraryItem {
  type: 'liked' | 'playlist' | 'downloaded';
  key: string;
  title?: string;
  subtitle?: string;
  coverUrl?: string;
  playlistId?: string;
  track?: Track;
}

export function LibraryScreen({ onOpenAccount, initialDetail, onDetailConsumed }: LibraryScreenProps) {
  const {
    likedSongs,
    likedMeta,
    playlists,
    createPlaylist,
    toggleLike,
    isLiked,
  } = useLibrary();
  const { playTrack } = usePlayer();
  const { openTrack } = useTrackActions();
  const { downloadedTracks, deleteDownload } = useDownloads();
  const { user } = useAuth();
  const userInitial = (user?.name || user?.username || 'S').charAt(0).toUpperCase();
  const [detail, setDetail] = useState<LibraryDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [libraryFilter, setLibraryFilter] = useState('Playlists');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const selectedPlaylist =
    detail && detail.type === 'playlist'
      ? playlists.find((playlist: { id: string }) => playlist.id === detail.id)
      : null;

  const backToRoot = () => {
    setDetail(null);
    setCreating(false);
    setName('');
  };

  useEffect(() => {
    if (initialDetail && initialDetail.type === 'playlist' && !detail) {
      const playlist = playlists.find((item: { id: string }) => item.id === initialDetail.id);
      if (playlist) {
        setDetail({ type: 'playlist', id: playlist.id, title: playlist.name });
        if (onDetailConsumed) {
          onDetailConsumed();
        }
      }
    }
  }, [initialDetail, playlists, detail, onDetailConsumed]);

  const submitCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    await createPlaylist(trimmed);
    setName('');
    setCreating(false);
  };

  if (detail) {
    if (detail.type === 'liked') {
      return <Screen3 isLikedPlaylist onBack={backToRoot} />;
    }
    const tracks = selectedPlaylist ? selectedPlaylist.tracks : [];
    return (
      <Screen3
        title={selectedPlaylist ? selectedPlaylist.name : 'Playlist'}
        subtitle={tracks.length === 1 ? '1 song' : `${tracks.length} songs`}
        tracks={tracks}
        coverImage={selectedPlaylist?.coverUrl}
        playlistId={detail.id}
        onBack={backToRoot}
      />
    );
  }

  const libraryItems: LibraryItem[] = [
    {
      type: 'liked',
      key: 'liked',
      title: likedMeta.name || 'Liked Songs',
      subtitle: `Playlist • ${likedSongs.length} songs`,
      coverUrl: likedMeta.coverUrl,
    },
    ...playlists.map((item: { id: string; name: string; tracks: Track[]; coverUrl?: string }) => ({
      type: 'playlist' as const,
      key: item.id,
      title: item.name,
      subtitle: `Playlist • ${item.tracks.length} songs`,
      playlistId: item.id,
      coverUrl: item.coverUrl,
    })),
  ];

  const filteredItems: LibraryItem[] =
    libraryFilter === 'Downloaded'
      ? downloadedTracks.map((track: Track) => ({
          type: 'downloaded',
          key: `downloaded-${track.id}`,
          track,
        }))
      : libraryFilter === 'Playlists'
      ? libraryItems
      : libraryItems.filter((i) => i.type === 'liked');

  return (
    <View style={styles.libraryScreen}>
      <View style={styles.libraryHeader}>
        <Pressable style={styles.libraryAvatar} onPress={onOpenAccount}>
          <Text style={styles.libraryAvatarLetter}>{userInitial}</Text>
        </Pressable>
        <Text style={styles.libraryTitle}>Library</Text>
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.libraryPillsScroll}
        contentContainerStyle={styles.libraryPillsContent}
      >
        {LIBRARY_FILTERS.map((f) => {
          const selected = libraryFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setLibraryFilter(f)}
              style={[styles.libraryPill, selected && styles.libraryPillActive]}
            >
              <Text style={[styles.libraryPillText, selected && styles.libraryPillTextActive]}>
                {f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
        data={filteredItems}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.libraryList}
        ListEmptyComponent={
          libraryFilter === 'Playlists' ? (
            <Text style={styles.libraryEmpty}>No songs yet</Text>
          ) : libraryFilter === 'Downloaded' ? (
            <Text style={styles.libraryEmpty}>Nothing downloaded yet.</Text>
          ) : (
            <Text style={styles.libraryEmpty}>Nothing here yet.</Text>
          )
        }
        renderItem={({ item }) => {
          if (item.type === 'liked') {
            return (
              <Pressable style={styles.libRow} onPress={() => setDetail({ type: 'liked' })}>
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
                    <Download size={12} color={COLORS.green} />
                    <Text style={styles.libRowSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }
          if (item.type === 'downloaded') {
            return (
              <TrackRow
                track={item.track!}
                liked={isLiked(item.track!.id)}
                onPlay={() => item.track && playTrack(item.track, downloadedTracks)}
                onToggleLike={() => item.track && toggleLike(item.track)}
                onMore={() => item.track && openTrack(item.track)}
                onRemove={() => item.track && deleteDownload(item.track.id)}
              />
            );
          }
          return (
            <Pressable
              style={styles.libRow}
              onPress={() =>
                setDetail({ type: 'playlist', id: item.playlistId!, title: item.title! })
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
                <Text style={styles.libRowSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  libraryScreen: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: 12,
    paddingBottom: 8,
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  libraryAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cardPress,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryAvatarLetter: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  libraryTitle: {
    ...TYPE.display,
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
  libraryPillsScroll: {
    flexGrow: 0,
    marginBottom: 12,
  },
  libraryPillsContent: {
    paddingHorizontal: 16,
  },
  libraryPill: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: COLORS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryPillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  libraryPillText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  libraryPillTextActive: {
    color: '#FFFFFF',
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
    height: 64,
    gap: 12,
    paddingHorizontal: 16,
  },
  libCover: {
    width: 48,
    height: 48,
    borderRadius: 8,
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
  libRowSubtitle: {
    ...TYPE.body,
  },
  libraryList: {
    paddingBottom: 90,
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
    backgroundColor: COLORS.white,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  libraryCreateLabel: {
    color: '#121212',
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