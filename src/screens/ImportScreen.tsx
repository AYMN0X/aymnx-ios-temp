import Feather from '@expo/vector-icons/Feather';
import { useState } from 'react';
import {
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
import { importSpotifyPlaylist } from '../services/spotifyImportService';
import { COLORS } from '../theme/appTheme';

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

  return (
    <ScrollView
      style={styles.importScroll}
      contentContainerStyle={styles.importContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View>
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