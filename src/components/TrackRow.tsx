import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MoreHorizontal, X } from 'lucide-react-native';
import type { Track } from '../services/musicApi';
import { COLORS, TYPE } from '../theme/appTheme';

interface TrackRowProps {
  track: Track;
  liked: boolean;
  onPlay: () => void;
  onToggleLike: () => void;
  onMore?: () => void;
  onRemove?: () => void;
}

export function TrackRow({ track, liked, onPlay, onToggleLike, onMore, onRemove }: TrackRowProps) {
  return (
    <View style={styles.trackRow}>
      <Pressable style={({ pressed }) => [styles.trackRowMain, pressed && styles.trackRowPressed]} onPress={onPlay}>
        {track.artwork ? (
          <Image source={{ uri: track.artwork }} style={styles.trackArtwork} />
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
      <Pressable onPress={onToggleLike} hitSlop={8} style={styles.trackAction}>
        <Ionicons
          name={liked ? 'checkmark-circle' : 'add-circle-outline'}
          size={20}
          color={liked ? COLORS.accent : COLORS.tabInactive}
        />
      </Pressable>
      {onMore ? (
        <Pressable onPress={onMore} hitSlop={8} style={styles.trackAction}>
          <MoreHorizontal size={18} color={COLORS.tabInactive} />
        </Pressable>
      ) : null}
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} style={styles.trackAction}>
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
    backgroundColor: COLORS.elevated,
    borderRadius: 12,
    marginBottom: 8,
    padding: 10,
    paddingHorizontal: 12,
  },
  trackRowPressed: {
    backgroundColor: COLORS.cardPress,
  },
  trackRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
  },
  trackArtwork: {
    width: 44,
    height: 44,
    borderRadius: 8,
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
    fontSize: 15,
    fontWeight: '600',
  },
  trackArtist: {
    ...TYPE.body,
    fontSize: 13,
    marginTop: 2,
  },
  trackAction: {
    marginLeft: 12,
  },
});