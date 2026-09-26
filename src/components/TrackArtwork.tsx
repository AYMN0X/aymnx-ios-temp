import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Track } from '../services/musicApi';
import { useTrackArtwork } from '../hooks/useTrackArtwork';
import { ArtworkThumbnail } from './ArtworkThumbnail';

export interface TrackArtworkProps {
  track: Track | null | undefined;
  /**
   * Replaces the remote URL while still using the track for local-art lookup and
   * repair. PlaylistDetailScreen uses this to mask a playlist cover that is
   * still recorded on the track while its own resolution pass fixes it.
   */
  uriOverride?: string;
  size: number;
  borderRadius?: number;
  variant?: 'raw' | 'thumbnail' | 'highRes';
  iconSize?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Rendered over the artwork, e.g. a play-button overlay. */
  children?: React.ReactNode;
}

/**
 * Track artwork bound to a real Track.
 *
 * This exists so artwork resolution is wired in exactly one place. Every
 * artwork surface in the app needs the same three things — the remote URL, the
 * offline copy for a downloaded track, and a handler to persist a cover that
 * turns out to be missing — and threading those through six components
 * individually is how they drift apart in the first place.
 */
export const TrackArtwork = React.memo(function TrackArtwork({
  track,
  uriOverride,
  size,
  borderRadius,
  variant,
  iconSize,
  style,
  accessibilityLabel,
  children,
}: TrackArtworkProps) {
  const artwork = useTrackArtwork(track);

  return (
    <ArtworkThumbnail
      uri={uriOverride === undefined ? artwork.uri : uriOverride}
      localUri={artwork.localUri}
      onArtworkError={artwork.onArtworkError}
      size={size}
      borderRadius={borderRadius}
      variant={variant}
      iconSize={iconSize}
      style={style}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </ArtworkThumbnail>
  );
});
