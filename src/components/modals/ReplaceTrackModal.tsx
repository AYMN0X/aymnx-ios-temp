import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadAudioSource } from '../../services/AudioService';
import type { LoadedAudio } from '../../services/AudioService';
import {
  getThumbnailArtworkUrl,
  resolveSoundCloudStream,
  searchSoundCloudTracks,
} from '../../services/musicApi';
import type { Track } from '../../services/musicApi';
import { usePlayer } from '../../context/PlayerContext';
import { COLORS } from '../../theme/appTheme';

const REPLACE_RESULT_LIMIT = 15;
const PREVIEW_SECONDS = 8;
const SEARCH_DEBOUNCE_MS = 300;
const PREVIEW_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';

function formatDuration(totalSeconds?: number): string {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '--:--';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface ReplaceTrackModalProps {
  track: Track | null;
  onClose: () => void;
  onSelect: (original: Track, replacement: Track) => Promise<void>;
}

export function ReplaceTrackModal({ track, onClose, onSelect }: ReplaceTrackModalProps) {
  const insets = useSafeAreaInsets();
  const { isPlaying, togglePlayPause } = usePlayer();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const searchSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSeqRef = useRef(0);
  const previewPlayerRef = useRef<LoadedAudio | null>(null);
  const isMainPlayingRef = useRef(isPlaying);
  const pausedForPreviewRef = useRef(false);

  useEffect(() => {
    isMainPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const runSearch = async (term: string) => {
    const trimmed = term.trim();
    const seq = ++searchSeqRef.current;
    if (!trimmed) {
      setResults([]);
      setSearchError(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    try {
      const tracks = await searchSoundCloudTracks(trimmed, REPLACE_RESULT_LIMIT);
      if (seq !== searchSeqRef.current) {
        return;
      }
      setResults(tracks.slice(0, REPLACE_RESULT_LIMIT));
    } catch (error) {
      console.warn('[replace] Search failed.', error);
      if (seq !== searchSeqRef.current) {
        return;
      }
      setResults([]);
      setSearchError(true);
    } finally {
      if (seq === searchSeqRef.current) {
        setSearching(false);
      }
    }
  };

  useEffect(() => {
    if (!track) {
      return;
    }
    const initial = `${track.title} ${track.artist}`.trim();
    setQuery(initial);
    setResults([]);
    setSearchError(false);
    setReplacingId(null);
    runSearch(initial);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      searchSeqRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  useEffect(() => {
    return () => {
      previewSeqRef.current += 1;
      const handle = previewPlayerRef.current;
      previewPlayerRef.current = null;
      if (handle) {
        handle.dispose();
      }
      if (pausedForPreviewRef.current) {
        pausedForPreviewRef.current = false;
        togglePlayPause();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopPreview = (resume = true) => {
    previewSeqRef.current += 1;
    const handle = previewPlayerRef.current;
    previewPlayerRef.current = null;
    setPreviewingId(null);
    if (handle) {
      handle.dispose();
    }
    if (pausedForPreviewRef.current) {
      pausedForPreviewRef.current = false;
      if (resume) {
        togglePlayPause();
      }
    }
  };

  const togglePreview = async (candidate: Track) => {
    if (replacingId) {
      return;
    }
    if (previewingId === candidate.id) {
      stopPreview();
      return;
    }
    const seq = ++previewSeqRef.current;
    const existing = previewPlayerRef.current;
    previewPlayerRef.current = null;
    if (existing) {
      existing.dispose();
    }
    if (!pausedForPreviewRef.current && isMainPlayingRef.current) {
      pausedForPreviewRef.current = true;
      togglePlayPause();
    }
    setPreviewingId(candidate.id);
    try {
      const result = await resolveSoundCloudStream(
        candidate.title,
        candidate.artist,
        candidate.permalink
      );
      if (seq !== previewSeqRef.current || !result?.url) {
        return;
      }
      const loaded = await loadAudioSource(
        { uri: result.url, contentType: result.mimeType, userAgent: PREVIEW_USER_AGENT },
        undefined
      );
      if (seq !== previewSeqRef.current) {
        loaded.dispose();
        return;
      }
      previewPlayerRef.current = loaded;
      loaded.player.addListener('playbackStatusUpdate', (status) => {
        if (
          previewPlayerRef.current === loaded &&
          status.currentTime != null &&
          status.currentTime >= PREVIEW_SECONDS
        ) {
          stopPreview();
        }
      });
      loaded.player.play();
    } catch (error) {
      console.warn('[replace] Preview failed.', error);
      if (seq === previewSeqRef.current) {
        setPreviewingId(null);
      }
    }
  };

  const handleReplace = async (candidate: Track) => {
    if (!track || replacingId) {
      return;
    }
    stopPreview(false);
    setReplacingId(candidate.id);
    await onSelect(track, candidate);
  };

  const handleClose = () => {
    stopPreview();
    onClose();
  };

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    searchSeqRef.current += 1;
    if (!text.trim()) {
      setResults([]);
      setSearchError(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    debounceRef.current = setTimeout(() => runSearch(text), SEARCH_DEBOUNCE_MS);
  };

  if (!track) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <View style={styles.pill} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Replace Track</Text>
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {track.title} — {track.artist}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.hint}>Pick a replacement, or tap a thumbnail to preview.</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={COLORS.placeholder} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search for a replacement..."
              placeholderTextColor={COLORS.placeholder}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={() => runSearch(query)}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => handleQueryChange('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={COLORS.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          {searching ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={COLORS.accent} />
            </View>
          ) : searchError ? (
            <View style={styles.centerBox}>
              <Pressable onPress={() => runSearch(query)}>
                <Text style={styles.errorText}>Search failed. Tap to retry.</Text>
              </Pressable>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyText}>No tracks found.</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              windowSize={5}
              initialNumToRender={8}
              maxToRenderPerBatch={6}
              removeClippedSubviews
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isPreviewing = previewingId === item.id;
                const isReplacing = replacingId === item.id;
                return (
                  <View style={styles.row}>
                    <Pressable
                      style={styles.artworkWrap}
                      onPress={() => togglePreview(item)}
                      disabled={!!replacingId}
                    >
                      {item.artwork ? (
                        <Image
                          source={{
                            uri: getThumbnailArtworkUrl(item.artwork),
                            width: 40,
                            height: 40,
                          }}
                          style={styles.artwork}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={item.id}
                          transition={150}
                        />
                      ) : (
                        <View style={[styles.artwork, styles.artworkFallback]} />
                      )}
                      <View
                        style={[
                          styles.artworkOverlay,
                          isPreviewing && styles.artworkOverlayActive,
                        ]}
                      >
                        {isPreviewing ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="play" size={15} color="#FFFFFF" />
                        )}
                      </View>
                    </Pressable>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <View style={styles.rowMeta}>
                        <Text style={styles.rowArtist} numberOfLines={1}>
                          {item.artist}
                        </Text>
                        <Text style={styles.rowDuration}>{formatDuration(item.duration)}</Text>
                      </View>
                    </View>
                    <Pressable
                      style={[styles.replaceButton, isReplacing && styles.replaceButtonDisabled]}
                      onPress={() => handleReplace(item)}
                      disabled={!!replacingId}
                    >
                      {isReplacing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.replaceLabel}>Replace</Text>
                      )}
                    </Pressable>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    width: '100%',
    alignSelf: 'stretch',
    maxHeight: '88%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  pill: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  closeButton: {
    padding: 4,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
    marginBottom: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    backgroundColor: COLORS.searchBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.accent,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  artworkWrap: {
    position: 'relative',
  },
  artwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: COLORS.card,
  },
  artworkFallback: {
    backgroundColor: COLORS.cardPress,
  },
  artworkOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkOverlayActive: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowArtist: {
    flexShrink: 1,
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  rowDuration: {
    fontSize: 11,
    color: COLORS.textSubdued,
  },
  replaceButton: {
    minWidth: 76,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  replaceButtonDisabled: {
    opacity: 0.6,
  },
  replaceLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});