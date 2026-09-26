import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ListMusic, ListPlus, RefreshCw, Trash2 } from 'lucide-react-native';
import { useDownloads } from '../../context/DownloadContext';
import type { Track } from '../../services/musicApi';
import { TrackArtwork } from '../TrackArtwork';
import { COLORS } from '../../theme/appTheme';

interface TrackActionsSheetProps {
  track: Track;
  onClose: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onReplace: () => void;
  destructiveAction?: (() => void) | null;
  destructiveLabel?: string;
}

export function TrackActionsSheet({
  track,
  onClose,
  onPlayNext,
  onAddToQueue,
  onReplace,
  destructiveAction,
  destructiveLabel = 'Remove',
}: TrackActionsSheetProps) {
  const insets = useSafeAreaInsets();
  const { isDownloaded, downloadTrack, deleteDownload, downloadingIds } = useDownloads();
  const downloaded = isDownloaded(track.id);
  const isDownloading = downloadingIds.has(track.id);

  const handleDownloadToggle = async () => {
    onClose();
    try {
      if (downloaded) {
        await deleteDownload(track.id);
      } else {
        await downloadTrack(track);
      }
    } catch (error) {
      console.warn('[downloads] Track menu download action failed.', error);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.pill} />
          <View style={styles.preview}>
            <TrackArtwork track={track} size={40} borderRadius={6} style={styles.artwork} />
            <View style={styles.previewText}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {track.title}
              </Text>
              <Text style={styles.previewArtist} numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <Pressable style={styles.item} onPress={onPlayNext}>
            <ListPlus size={20} color={COLORS.tabInactive} />
            <Text style={styles.itemLabel}>Play Next</Text>
          </Pressable>
          <Pressable style={styles.item} onPress={onAddToQueue}>
            <ListMusic size={20} color={COLORS.tabInactive} />
            <Text style={styles.itemLabel}>Add to Queue</Text>
          </Pressable>
          <Pressable style={styles.item} onPress={onReplace}>
            <RefreshCw size={18} color={COLORS.tabInactive} />
            <Text style={styles.itemLabel}>Replace Track...</Text>
          </Pressable>
          <Pressable
            style={styles.item}
            onPress={handleDownloadToggle}
            disabled={isDownloading}
          >
            <Ionicons
              name={downloaded ? 'trash-outline' : 'arrow-down-circle-outline'}
              size={20}
              color={COLORS.tabInactive}
            />
            <Text style={styles.itemLabel}>
              {isDownloading
                ? 'Downloading...'
                : downloaded
                ? 'Remove Download'
                : 'Download'}
            </Text>
          </Pressable>
          {destructiveAction ? (
            <>
              <View style={styles.divider} />
              <Pressable style={styles.item} onPress={destructiveAction}>
                <Trash2 size={18} color={COLORS.accent} />
                <Text style={[styles.itemLabel, styles.destructiveLabel]}>
                  {destructiveLabel}
                </Text>
              </Pressable>
            </>
          ) : null}
          <Pressable style={styles.item} onPress={onClose}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'transparent',
  },
  sheet: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#23252B',
    paddingHorizontal: 20,
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
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  artwork: {
    flexShrink: 0,
  },
  previewText: {
    flex: 1,
    gap: 3,
  },
  previewTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  previewArtist: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    color: COLORS.textPrimary,
  },
  destructiveLabel: {
    color: COLORS.accent,
  },
  cancelLabel: {
    fontSize: 15,
    color: COLORS.textSecondary,
    alignSelf: 'center',
    width: '100%',
    textAlign: 'center',
  },
});