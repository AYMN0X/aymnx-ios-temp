import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import type { Track } from '../services/musicApi';
import { importSpotifyPlaylist } from '../services/spotifyImportService';
import { resolveYouTubeTrack } from '../services/youtubeAudioService';
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
  const { createImportedPlaylist, isLiked, toggleLike } = useLibrary();
  const { playTrack } = usePlayer();
  const { showToast } = useTrackActions();

  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const [ytLink, setYtLink] = useState('');
  const [ytImporting, setYtImporting] = useState(false);
  const [ytError, setYtError] = useState('');
  const [ytResult, setYtResult] = useState<Track | null>(null);

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

  const handleYtImport = async () => {
    if (!ytLink.trim() || ytImporting) {
      return;
    }
    setYtImporting(true);
    setYtError('');
    setYtResult(null);
    try {
      const track = await resolveYouTubeTrack(ytLink);
      if (!isLiked(track.id)) {
        await toggleLike(track);
      }
      setYtResult(track);
      showToast(`Imported ${track.title} to Library`);
    } catch (e) {
      setYtError((e as Error).message || 'Import failed. Please check the YouTube link.');
    } finally {
      setYtImporting(false);
    }
  };

  const handleYtPlayNow = () => {
    if (ytResult) {
      playTrack(ytResult, [ytResult]);
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
            <Activity size={18} color="#000000" />
          ) : (
            <Feather name="download" size={20} color="#000000" />
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

      <View style={styles.separator} />

      <View>
        <Text style={styles.ytTitle}>Import YouTube Audio</Text>
        <Text style={styles.ytSubtitle}>
          Paste any YouTube link for edits, slowed/reverb, or unreleased tracks.
        </Text>
        <TextInput
          style={styles.importInput}
          value={ytLink}
          onChangeText={setYtLink}
          placeholder="https://youtu.be/... or youtube.com/watch?v=..."
          placeholderTextColor="#777777"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={handleYtImport}
        />
        <Pressable
          style={[styles.ytButton, (!ytLink.trim() || ytImporting) && styles.importButtonDisabled]}
          onPress={handleYtImport}
          disabled={!ytLink.trim() || ytImporting}
        >
          {ytImporting ? (
            <Activity size={18} color="#FFFFFF" />
          ) : (
            <Ionicons name="logo-youtube" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.ytButtonLabel}>{ytImporting ? 'Importing audio...' : 'Import Audio'}</Text>
        </Pressable>
        {ytError ? <Text style={styles.importError}>{ytError}</Text> : null}
        {ytResult ? (
          <View style={styles.importSuccess}>
            <View style={styles.importSuccessRow}>
              {ytResult.artwork ? (
                <Image source={{ uri: ytResult.artwork }} style={styles.importSuccessArt} />
              ) : (
                <View style={[styles.importSuccessArt, styles.importSuccessArtFallback]} />
              )}
              <View style={styles.importSuccessMeta}>
                <Text style={styles.importSuccessName} numberOfLines={2}>
                  {ytResult.title}
                </Text>
                <Text style={styles.importSuccessCount}>{ytResult.artist}</Text>
              </View>
            </View>
            <Pressable style={styles.ytPlayBtn} onPress={handleYtPlayNow}>
              <Ionicons name="play" size={16} color="#FFFFFF" />
              <Text style={styles.ytPlayLabel}>Play Now</Text>
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
    backgroundColor: '#282828',
    borderRadius: 8,
    paddingHorizontal: 16,
    color: COLORS.textPrimary,
    fontSize: 15,
  },
  importButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1ED760',
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
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
  },
  importProgress: {
    color: '#1ED760',
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
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 28,
  },
  ytTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 6,
  },
  ytSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  ytButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF0000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  ytButtonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  ytPlayBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 20,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  ytPlayLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  importSuccess: {
    backgroundColor: '#282828',
    borderRadius: 8,
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