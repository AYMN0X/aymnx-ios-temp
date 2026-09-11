import Feather from '@expo/vector-icons/Feather';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Activity } from 'lucide-react-native';
import { useLibrary } from '../context/LibraryContext';
import { usePlayer } from '../context/PlayerContext';
import { useTrackActions } from '../context/TrackActionsContext';
import { checkLanServer, fetchLanTracks, downloadLanTracks } from '../services/lanLibrary';
import { importSpotifyPlaylist } from '../services/spotifyImportService';
import { LAN_STREAM_DEFAULT_HOST } from '../utils/streamCache';
import { COLORS } from '../theme/appTheme';
import type { Track } from '../services/musicApi';

interface ImportScreenProps {
  onOpenImportedPlaylist: (id: string) => void;
}

interface ImportResult {
  id: string;
  name: string;
  coverUrl: string;
  count: number;
}

export function ImportScreen({ onOpenImportedPlaylist }: ImportScreenProps) {
  const { createImportedPlaylist } = useLibrary();
  const { playTrack } = usePlayer();
  const { showToast } = useTrackActions();

  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const [lanStatus, setLanStatus] = useState<'idle' | 'checking' | 'connected' | 'offline'>('idle');
  const [lanTracks, setLanTracks] = useState<Track[]>([]);
  const [lanScanning, setLanScanning] = useState(false);
  const [lanImported, setLanImported] = useState(false);
  const [lanError, setLanError] = useState('');
  const [lanSaving, setLanSaving] = useState(false);
  const [lanSaveProgress, setLanSaveProgress] = useState('');

  const handleImport = async () => {
    if (!link.trim() || importing) {
      return;
    }
    setImporting(true);
    setProgress('Fetching playlist metadata...');
    setError('');
    setResult(null);
    try {
      const { promise } = importSpotifyPlaylist(link, (current, total, currentTitle) => {
        setProgress(
          currentTitle
            ? `Importing track ${current} of ${total}: ${currentTitle}...`
            : `Importing track ${current} of ${total}...`
        );
      });
      const playlist = await promise;
      const created = await createImportedPlaylist(
        playlist.title,
        playlist.artwork,
        playlist.tracks
      );
      if (created) {
        setResult({
          id: created.id,
          name: created.name,
          coverUrl: created.coverUrl || '',
          count: created.tracks.length,
        });
      } else {
        setError('Could not save the imported playlist.');
      }
    } catch (e) {
      setError((e as Error).message || 'Import failed. Please check the link.');
    } finally {
      setImporting(false);
      setProgress('');
    }
  };

  const scanLan = useCallback(async () => {
    if (lanScanning) {
      return;
    }
    setLanScanning(true);
    setLanStatus('checking');
    setLanError('');
    try {
      const status = await checkLanServer();
      if (!status.connected) {
        setLanStatus('offline');
        setLanTracks([]);
        return;
      }
      const tracks = await fetchLanTracks();
      setLanTracks(tracks);
      setLanStatus(tracks.length > 0 ? 'connected' : 'offline');
    } catch (e) {
      setLanError((e as Error).message || 'Could not scan for local files.');
      setLanStatus('offline');
    } finally {
      setLanScanning(false);
    }
  }, [lanScanning]);

  useEffect(() => {
    scanLan();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveLanTracks = async () => {
    if (lanImported || lanTracks.length === 0 || lanSaving) {
      return;
    }
    setLanSaving(true);
    setLanError('');
    try {
      const downloaded = await downloadLanTracks(lanTracks, (done, total) => {
        setLanSaveProgress(`Downloading ${done} of ${total}...`);
      });
      const created = await createImportedPlaylist(
        'Music on My PC',
        lanTracks.find((t) => !!t.artwork)?.artwork ?? '',
        downloaded
      );
      if (created) {
        setLanImported(true);
        onOpenImportedPlaylist(created.id);
      } else {
        setLanError('Could not save your local files.');
      }
    } catch (e) {
      setLanError((e as Error).message || 'Could not save your local files.');
    } finally {
      setLanSaving(false);
      setLanSaveProgress('');
    }
  };

  const lanStatusLabel =
    lanStatus === 'checking' || lanScanning
      ? 'Scanning...'
      : lanStatus === 'connected'
      ? `${lanTracks.length} track${lanTracks.length === 1 ? '' : 's'} found`
      : lanStatus === 'offline'
      ? 'Server unreachable'
      : '';

  return (
    <ScrollView
      style={styles.importScroll}
      contentContainerStyle={styles.importContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View>
        <View style={styles.lanSection}>
          <View style={styles.lanHeader}>
            <View style={styles.lanTitleRow}>
              <Text style={styles.lanTitle}>Local Files</Text>
              <Text style={styles.lanHost}>{LAN_STREAM_DEFAULT_HOST}</Text>
            </View>
            <Pressable
              onPress={scanLan}
              disabled={lanScanning}
              hitSlop={10}
              style={styles.lanRefreshBtn}
            >
              <Text style={styles.lanRefreshText}>{lanScanning ? '...' : 'Refresh'}</Text>
            </Pressable>
          </View>

          {lanStatusLabel ? (
            <Text
              style={[
                styles.lanStatus,
                lanStatus === 'connected' && styles.lanStatusConnected,
                lanStatus === 'offline' && styles.lanStatusOffline,
              ]}
            >
              {lanStatusLabel}
            </Text>
          ) : null}
          {lanError ? <Text style={styles.lanError}>{lanError}</Text> : null}

          {lanStatus === 'checking' && lanScanning ? (
            <ActivityIndicator color={COLORS.accent} style={{ marginTop: 14 }} />
          ) : null}

          {lanTracks.length > 0 && (
            <>
              <ScrollView
                style={styles.lanTrackList}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {lanTracks.slice(0, 30).map((track, idx) => (
                  <Pressable
                    key={track.id}
                    style={styles.lanTrackRow}
                    onPress={() => playTrack(track, lanTracks)}
                    disabled={lanScanning}
                  >
                    {track.artwork ? (
                      <Image source={{ uri: track.artwork }} style={styles.lanTrackArt} />
                    ) : (
                      <View style={[styles.lanTrackArt, styles.lanTrackArtFallback]} />
                    )}
                    <View style={styles.lanTrackMeta}>
                      <Text style={styles.lanTrackTitle} numberOfLines={1}>
                        {track.title}
                      </Text>
                      <Text style={styles.lanTrackArtist} numberOfLines={1}>
                        {track.artist}
                      </Text>
                    </View>
                    <Text style={styles.lanTrackIdx}>{idx + 1}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={[
                  styles.lanSaveBtn,
                  (lanImported || lanSaving) && styles.lanSaveBtnDone,
                ]}
                onPress={saveLanTracks}
                disabled={lanImported || lanSaving || lanScanning}
              >
                <Text style={styles.lanSaveBtnLabel}>
                  {lanImported
                    ? 'Saved to Your Library'
                    : lanSaving
                    ? lanSaveProgress || 'Downloading...'
                    : `Save all ${lanTracks.length} tracks`}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.lanDivider} />

        <Text style={styles.importTitle}>Import Spotify Playlist</Text>
        <TextInput
          style={styles.importInput}
          value={link}
          onChangeText={setLink}
          placeholder="Paste Spotify Playlist Link here..."
          placeholderTextColor="#777777"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleImport}
        />
        <Pressable
          style={[styles.importButton, (!link.trim() || importing) && styles.importButtonDisabled]}
          onPress={handleImport}
          disabled={!link.trim() || importing}
        >
          {importing ? (
            <Activity size={18} color="#FFFFFF" />
          ) : (
            <Feather name="download" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.importButtonLabel}>{importing ? 'Importing...' : 'Import'}</Text>
        </Pressable>
        {progress ? <Text style={styles.importProgress}>{progress}</Text> : null}
        {error ? <Text style={styles.importError}>{error}</Text> : null}
        <Text style={styles.importHint}>
          Paste any Spotify playlist link (e.g. open.spotify.com/playlist/...). We will fetch the
          playlist, match each track to a playable stream, and save it to Your Library.
        </Text>
        {result ? (
          <View style={styles.importSuccess}>
            <View style={styles.importSuccessRow}>
              {result.coverUrl ? (
                <Image source={{ uri: result.coverUrl }} style={styles.importSuccessArt} />
              ) : (
                <View style={[styles.importSuccessArt, styles.importSuccessArtFallback]} />
              )}
              <View style={styles.importSuccessMeta}>
                <Text style={styles.importSuccessName} numberOfLines={2}>
                  {result.name}
                </Text>
                <Text style={styles.importSuccessCount}>
                  {result.count === 1 ? '1 track' : `${result.count} tracks`}
                </Text>
              </View>
            </View>
            <Pressable style={styles.importOpenBtn} onPress={() => onOpenImportedPlaylist(result.id)}>
              <Text style={styles.importOpenLabel}>Open Playlist</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  importScroll: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  importContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  lanSection: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  lanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lanTitleRow: {
    flexShrink: 1,
  },
  lanTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  lanHost: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  lanRefreshBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  lanRefreshText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  lanStatus: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  lanStatusConnected: {
    color: COLORS.accent,
  },
  lanStatusOffline: {
    color: '#F15E6C',
  },
  lanError: {
    color: '#F15E6C',
    fontSize: 13,
    marginTop: 8,
  },
  lanTrackList: {
    maxHeight: 280,
    marginTop: 12,
  },
  lanTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  lanTrackArt: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: COLORS.cardPress,
  },
  lanTrackArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lanTrackMeta: {
    flex: 1,
    marginLeft: 10,
  },
  lanTrackTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  lanTrackArtist: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  lanTrackIdx: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  lanSaveBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 14,
  },
  lanSaveBtnDone: {
    opacity: 0.6,
  },
  lanSaveBtnLabel: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  lanDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 20,
  },
  importTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  importInput: {
    height: 50,
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  importButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  importProgress: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
  },
  importError: {
    color: '#F15E6C',
    fontSize: 13,
    marginTop: 14,
  },
  importHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  importSuccess: {
    backgroundColor: COLORS.elevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  importSuccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  importSuccessArt: {
    width: 64,
    height: 64,
    borderRadius: 4,
  },
  importSuccessArtFallback: {
    backgroundColor: COLORS.cardPress,
  },
  importSuccessMeta: {
    flex: 1,
    marginLeft: 12,
  },
  importSuccessName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  importSuccessCount: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  importOpenBtn: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  importOpenLabel: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
});