import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Track } from '../services/musicApi';
import { useLibrary } from './LibraryContext';
import { usePlayer } from './PlayerContext';
import { Border, Color } from '../theme/GlobalStyles';

interface TrackActionsValue {
  openTrack: (track: Track) => void;
}

const TrackActionsContext = createContext<TrackActionsValue | undefined>(undefined);

type SheetView = 'options' | 'picker';

export function TrackActionsProvider({ children }: { children: ReactNode }) {
  const { playlists, isLiked, toggleLike, addToPlaylist, createPlaylist } = useLibrary();
  const { playTrack } = usePlayer();

  const [track, setTrack] = useState<Track | null>(null);
  const [view, setView] = useState<SheetView>('options');
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const close = () => {
    setTrack(null);
    setView('options');
    setFilter('');
    setCreating(false);
    setNewName('');
  };

  const openTrack = (next: Track) => {
    setTrack(next);
    setView('options');
    setFilter('');
    setCreating(false);
    setNewName('');
  };

  const toggleLiked = () => {
    if (track) {
      toggleLike(track);
    }
  };

  const addToQueue = () => {
    if (track) {
      playTrack(track, [track]);
    }
    close();
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    await createPlaylist(trimmed);
    setCreating(false);
    setNewName('');
  };

  const filteredPlaylists = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return playlists;
    }
    return playlists.filter((playlist) => playlist.name.toLowerCase().includes(q));
  }, [playlists, filter]);

  const value = useMemo<TrackActionsValue>(() => ({ openTrack }), []);

  return (
    <TrackActionsContext.Provider value={value}>
      {children}
      <Modal visible={!!track} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.pill} />
            {view === 'options' ? (
              <>
                {track ? (
                  <View style={styles.preview}>
                    {track.artwork ? (
                      <Image source={{ uri: track.artwork }} style={styles.artwork} />
                    ) : (
                      <View style={[styles.artwork, styles.artworkFallback]} />
                    )}
                    <View style={styles.previewText}>
                      <Text style={styles.previewTitle} numberOfLines={1}>
                        {track.title}
                      </Text>
                      <Text style={styles.previewArtist} numberOfLines={1}>
                        {track.artist}
                      </Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.divider} />
                <Pressable style={styles.item} onPress={toggleLiked}>
                  <Ionicons
                    name={track && isLiked(track.id) ? 'heart' : 'heart-outline'}
                    size={20}
                    color={track && isLiked(track.id) ? Color.accent : '#B3B3B3'}
                  />
                  <Text style={styles.itemLabel}>
                    {track && isLiked(track.id) ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                  </Text>
                </Pressable>
                <Pressable style={styles.item} onPress={() => setView('picker')}>
                  <Ionicons name="add-circle-outline" size={20} color="#B3B3B3" />
                  <Text style={styles.itemLabel}>Add to playlist</Text>
                </Pressable>
                <Pressable style={styles.item} onPress={addToQueue}>
                  <Ionicons name="list-outline" size={20} color="#B3B3B3" />
                  <Text style={styles.itemLabel}>Add to Queue</Text>
                </Pressable>
                <Pressable style={styles.item} onPress={close}>
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.pickerHeader}>
                  <Pressable onPress={() => setView('options')} hitSlop={8}>
                    <Text style={styles.pickerCancel}>Cancel</Text>
                  </Pressable>
                  <Text style={styles.pickerTitle}>Save in</Text>
                  <Pressable
                    onPress={() => setCreating((v) => !v)}
                    hitSlop={8}
                    disabled={creating}
                  >
                    <Text style={styles.pickerNew}>{creating ? 'Cancel' : 'New playlist'}</Text>
                  </Pressable>
                </View>
                <View style={styles.findBar}>
                  <Ionicons name="search" size={16} color={Color.textSecondary} />
                  <TextInput
                    style={styles.findInput}
                    value={filter}
                    onChangeText={setFilter}
                    placeholder="Find playlist"
                    placeholderTextColor={Color.textSecondary}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>
                {creating ? (
                  <View style={styles.createRow}>
                    <TextInput
                      style={styles.createInput}
                      value={newName}
                      onChangeText={setNewName}
                      placeholder="Playlist name"
                      placeholderTextColor={Color.textSecondary}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleCreate}
                    />
                    <Pressable
                      style={[styles.createBtn, !newName.trim() && styles.createBtnDisabled]}
                      onPress={handleCreate}
                      disabled={!newName.trim()}
                    >
                      <Text style={styles.createLabel}>Create</Text>
                    </Pressable>
                  </View>
                ) : null}
                <ScrollView
                  style={styles.pickerList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {filteredPlaylists.length === 0 ? (
                    <Text style={styles.emptyText}>No playlists found</Text>
                  ) : (
                    filteredPlaylists.map((playlist) => {
                      const added = track
                        ? playlist.tracks.some((item) => item.id === track.id)
                        : false;
                      return (
                        <View key={playlist.id} style={styles.playlistRow}>
                          {playlist.coverUrl ? (
                            <Image
                              source={{ uri: playlist.coverUrl }}
                              style={styles.rowCover}
                            />
                          ) : (
                            <View style={[styles.rowCover, styles.rowCoverFallback]} />
                          )}
                          <View style={styles.rowInfo}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {playlist.name}
                            </Text>
                            <Text style={styles.rowSubtitle}>
                              {playlist.tracks.length === 0
                                ? 'Empty'
                                : `${playlist.tracks.length} ${
                                    playlist.tracks.length === 1 ? 'song' : 'songs'
                                  }`}
                            </Text>
                          </View>
                          {added ? (
                            <Ionicons name="checkmark-circle" size={24} color={Color.accent} />
                          ) : (
                            <Pressable
                              onPress={() => {
                                if (track) {
                                  addToPlaylist(playlist.id, track);
                                }
                              }}
                              hitSlop={8}
                            >
                              <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
                            </Pressable>
                          )}
                        </View>
                      );
                    })
                  )}
                </ScrollView>
                <View style={styles.doneWrap}>
                  <Pressable style={styles.doneButton} onPress={close}>
                    <Text style={styles.doneLabel}>Done</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </TrackActionsContext.Provider>
  );
}

export function useTrackActions(): TrackActionsValue {
  const context = useContext(TrackActionsContext);
  if (!context) {
    throw new Error('useTrackActions must be used within a TrackActionsProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '80%',
  },
  pill: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: Border.sm,
  },
  artworkFallback: {
    backgroundColor: Color.card,
  },
  previewText: {
    flex: 1,
    gap: 3,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Color.textPrimary,
  },
  previewArtist: {
    fontSize: 12,
    color: Color.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  itemLabel: {
    fontSize: 15,
    color: Color.textPrimary,
  },
  cancelLabel: {
    fontSize: 15,
    color: Color.textSecondary,
    alignSelf: 'center',
    width: '100%',
    textAlign: 'center',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pickerCancel: {
    fontSize: 15,
    color: Color.textPrimary,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Color.textPrimary,
  },
  pickerNew: {
    fontSize: 15,
    fontWeight: '600',
    color: Color.accent,
  },
  findBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Border.sm,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  findInput: {
    flex: 1,
    color: Color.textPrimary,
    fontSize: 14,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  createInput: {
    flex: 1,
    backgroundColor: Color.card,
    color: Color.textPrimary,
    borderRadius: Border.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  createBtn: {
    backgroundColor: Color.textPrimary,
    borderRadius: Border.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createBtnDisabled: {
    opacity: 0.4,
  },
  createLabel: {
    color: '#121212',
    fontWeight: '600',
  },
  pickerList: {
    maxHeight: 360,
  },
  emptyText: {
    color: Color.textSecondary,
    textAlign: 'center',
    paddingVertical: 18,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowCover: {
    width: 44,
    height: 44,
    borderRadius: Border.sm,
  },
  rowCoverFallback: {
    backgroundColor: Color.card,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Color.textPrimary,
  },
  rowSubtitle: {
    fontSize: 12,
    color: Color.textSecondary,
  },
  doneWrap: {
    marginTop: 16,
  },
  doneButton: {
    backgroundColor: Color.accent,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});