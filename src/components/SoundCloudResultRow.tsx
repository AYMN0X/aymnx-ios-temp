import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getThumbnailArtworkUrl, Track } from '../services/musicApi';
import { COLORS } from '../theme/appTheme';

function formatDuration(totalSeconds?: number): string {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '--:--';
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface SoundCloudResultRowProps {
  track: Track;
  active?: boolean;
  onPlay: () => void;
}

export function SoundCloudResultRow({ track, active, onPlay }: SoundCloudResultRowProps) {
  return (
    <Pressable
      onPress={onPlay}
      style={({ pressed }) => [
        styles.row,
        active && styles.rowActive,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
    >
      {track.artwork ? (
        <Image
          source={{ uri: getThumbnailArtworkUrl(track.artwork), width: 40, height: 40 }}
          style={styles.artwork}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={track.id}
          transition={150}
        />
      ) : (
        <View style={[styles.artwork, styles.artworkFallback]} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>sc</Text>
          </View>
        </View>
      </View>
      <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingHorizontal: 16,
    gap: 12,
  },
  rowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
  info: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  artist: {
    flexShrink: 1,
    color: '#949BA4',
    fontSize: 11.5,
  },
  badge: {
    backgroundColor: '#232428',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    color: '#949BA4',
    fontSize: 9,
    fontWeight: '700',
  },
  duration: {
    color: '#949BA4',
    fontSize: 12,
    marginLeft: 8,
  },
});