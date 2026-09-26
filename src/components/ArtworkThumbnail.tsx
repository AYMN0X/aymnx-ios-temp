import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getHighResArtworkUrl, getThumbnailArtworkUrl } from '../services/musicApi';

// Placeholder palette. 7% white reads as a slightly lifted surface against the
// #101313/#171B1B backgrounds without competing with real cover art, and the
// 30% white note is deliberately faint so a grid of empty rows looks calm
// rather than broken.
const PLACEHOLDER_BG = 'rgba(255, 255, 255, 0.07)';
const PLACEHOLDER_ICON = 'rgba(255, 255, 255, 0.3)';

export interface ArtworkThumbnailProps {
  /** Remote source URL. Null/empty falls through to `localUri`, then lookup. */
  uri?: string | null;
  /**
   * On-disk artwork for a downloaded track. Preferred over the placeholder (and
   * over re-resolving) so a downloaded track still shows its cover with no
   * network. Normally `localArtworkUri` from the downloads registry.
   */
  localUri?: string | null;
  /**
   * Invoked when `uri` is present but fails to load, so the owner can attempt to
   * repair the URL. See `useTrackArtwork`.
   */
  onArtworkError?: () => void;
  size: number;
  borderRadius?: number;
  /**
   * Provider-specific size hint. iTunes returns one fixed URL per track, so this
   * rewrites the size token in the path. Ignored for local files, which are
   * already the exact bytes we want.
   */
  variant?: 'raw' | 'thumbnail' | 'highRes';
  /** Icon size; defaults to ~45% of `size` so it scales with the box. */
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Rendered on top of the artwork (e.g. a play-button overlay). */
  children?: React.ReactNode;
}

/**
 * Artwork with a themed placeholder for anything that cannot be shown.
 *
 * Every track row used to hand-roll this: an `{artwork ? <Image/> : <View/>}`
 * pair with an empty box for the fallback. That produced a blank dark square
 * whenever a track had no art URL, and worse, whenever a URL existed but failed
 * to load — nothing watched for that, so a dead CDN link rendered as an empty
 * box forever.
 *
 * This component is presentational only: it picks the best available source and
 * reports failures upward. Lookup, repair, and persistence live in
 * `useTrackArtwork`, so there is exactly one place that talks to the network.
 *
 * Resolution order:
 *   1. `uri`    — remote URL, the normal case
 *   2. localUri — downloaded track; works with no network at all
 *   3. placeholder
 *
 * A failed remote falls through to the local copy, so an offline track shows its
 * saved cover rather than a blank box.
 */
function ArtworkThumbnailComponent({
  uri,
  localUri,
  onArtworkError,
  size,
  borderRadius = 6,
  variant = 'raw',
  iconSize,
  style,
  accessibilityLabel,
  children,
}: ArtworkThumbnailProps) {
  const [failed, setFailed] = useState(false);

  // List rows get recycled: a row that failed on one track can be handed a
  // different track's URL. Without resetting here the row would stay blank even
  // though it now has a perfectly good URL.
  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const remoteFailed = !!uri && failed;
  const showRemote = !!uri && !remoteFailed;
  const showLocal = !showRemote && !!localUri;

  const box: StyleProp<ViewStyle> = [
    styles.box,
    { width: size, height: size, borderRadius },
    style,
  ];

  // Provider lookups return one fixed URL per track, so the size token in the
  // path is rewritten per surface. Lookups resolve at 500x500, which is wasteful
  // for a 40px row but correct for the Now Playing hero. Only remote URLs are
  // rewritten; a local file is already final.
  const rawSource = showRemote ? uri : showLocal ? localUri : '';
  const source =
    rawSource && /^https?:/i.test(rawSource)
      ? variant === 'thumbnail'
        ? getThumbnailArtworkUrl(rawSource)
        : variant === 'highRes'
          ? getHighResArtworkUrl(rawSource)
          : rawSource
      : rawSource;

  if (!source) {
    return (
      <View
        style={[box, styles.placeholder]}
        accessible={!!accessibilityLabel}
        accessibilityRole={accessibilityLabel ? 'image' : undefined}
        accessibilityLabel={accessibilityLabel}
      >
        <Ionicons
          name="musical-notes"
          size={iconSize ?? Math.round(size * 0.45)}
          color={PLACEHOLDER_ICON}
        />
        {children}
      </View>
    );
  }

  return (
    <View
      style={box}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <Image
        source={{ uri: source }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={source}
        onError={() => {
          // Prefer the local copy silently; only ask the owner to go looking for
          // a new URL when there is nothing else to show.
          if (!localUri) {
            onArtworkError?.();
          }
          setFailed(true);
        }}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    backgroundColor: PLACEHOLDER_BG,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const ArtworkThumbnail = React.memo(ArtworkThumbnailComponent);
