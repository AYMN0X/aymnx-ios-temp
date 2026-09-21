import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MoreHorizontal, X } from 'lucide-react-native';
import { getThumbnailArtworkUrl, Track } from '../services/musicApi';
import { COLORS } from '../theme/appTheme';

interface TrackRowProps {
  track: Track;
  liked: boolean;
  active?: boolean;
  onPlay: () => void;
  onToggleLike: () => void;
  onMore?: () => void;
  onRemove?: () => void;
}

export function TrackRow({
  track,
  liked,
  active,
  onPlay,
  onToggleLike,
  onMore,
  onRemove,
}: TrackRowProps) {
  return (
    <View style={[styles.trackRow, active && styles.trackRowActive]}>
      {active ? <View style={styles.playingIndicator} /> : null}
      <Pressable style={({ pressed }) => [styles.trackRowMain, pressed && styles.trackRowPressed]} onPress={onPlay}>
        {track.artwork ? (
          <Image
            source={{ uri: getThumbnailArtworkUrl(track.artwork), width: 40, height: 40 }}
            style={styles.trackArtwork}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={track.id}
            transition={150}
          />
        ) : (
          <View style={[styles.trackArtwork, styles.trackArtworkFallback]} />
        )}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={onToggleLike} hitSlop={10} style={styles.trackAction}>
        <Ionicons
          name={liked ? 'checkmark-circle' : 'add-circle-outline'}
          size={20}
          color={liked ? COLORS.accent : COLORS.tabInactive}
        />
      </Pressable>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={10} style={styles.trackAction}>
          <MoreHorizontal size={18} color={COLORS.tabInactive} />
        </Pressable>
      ) : null}
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={10} style={styles.trackAction}>
          <X size={18} color={COLORS.tabInactive} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 16,
    position: 'relative',
  },
  trackRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  playingIndicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  trackRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
  },
  trackRowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  trackArtwork: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: COLORS.card,
  },
  trackArtworkFallback: {
    backgroundColor: COLORS.cardPress,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  trackArtist: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
  },
  trackAction: {
    padding: 6,
    marginLeft: 8,
  },
});