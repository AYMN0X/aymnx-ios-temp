import { useCallback, useEffect, useRef, useState } from 'react';
import { Track, searchTrackArtwork } from '../services/musicApi';
import { isNetworkAvailable } from '../utils/network';
import { useDownloads } from '../context/DownloadContext';
import { useLibrary } from '../context/LibraryContext';

// In-flight guard on the storage write-back. The same track is usually mounted
// in several places at once (playlist row, queue row, mini dock, Now Playing
// hero), and each would otherwise trigger its own full storage rewrite plus
// Firestore sync. This only de-duplicates *concurrent* attempts: once a write
// lands, the track's artwork is populated and `persist` stops on its own, while
// a failed write is still allowed to be retried.
const persistInFlight = new Set<string>();

export interface TrackArtworkState {
  /** Best remote URL known for this track: the stored one, or a resolved one. */
  uri: string;
  /** On-disk cover for a downloaded track, for offline rendering. */
  localUri: string;
  title: string;
  artist: string;
  /**
   * Called when the track's URL is present but failed to load, so a broken link
   * gets one attempt at repair. Fire-and-forget; the repaired URL arrives as an
   * updated `uri`.
   */
  onArtworkError: () => void;
}

/**
 * Supplies artwork for one track, and repairs the track's artwork in place when
 * it is missing.
 *
 * Resolution is deliberately narrow. It only fills in a track that has *no*
 * artwork at all. Artwork that is present but wrong (a playlist cover copied onto
 * a track, say) needs the playlist's own cover list as context, so that case
 * stays with PlaylistDetailScreen's resolution pass. Keeping one writer per
 * situation stops the two from fighting over the same field.
 */
export function useTrackArtwork(track: Track | null | undefined): TrackArtworkState {
  const { getLocalArtworkUri } = useDownloads();
  const { replaceTrack } = useLibrary();
  // Tagged with the track it belongs to. List rows are recycled, so a plain
  // string would otherwise render the previous track's cover for one frame
  // before the reset effect caught up.
  const [resolution, setResolution] = useState({ trackId: '', url: '' });

  // Read through a ref so the callback identities survive parent re-renders and
  // do not defeat memoization on long lists.
  const trackRef = useRef(track);
  trackRef.current = track;
  const replaceTrackRef = useRef(replaceTrack);
  replaceTrackRef.current = replaceTrack;

  const trackId = track?.id ?? '';
  const hasStoredArtwork = !!track?.artwork;
  const localUri = (trackId && getLocalArtworkUri(trackId)) || '';
  // Only trust a resolution that belongs to the track currently in this row.
  const resolved = resolution.trackId === trackId ? resolution.url : '';

  const persist = useCallback((url: string) => {
    const current = trackRef.current;
    if (!current || !url) {
      return;
    }
    // Never clobber artwork that is already recorded. A failure-driven lookup
    // must not overwrite a URL that may still be correct.
    if (current.artwork) {
      return;
    }
    if (persistInFlight.has(current.id)) {
      return;
    }
    persistInFlight.add(current.id);
    void replaceTrackRef.current(current.id, { ...current, artwork: url })
      .catch((error) => console.warn('[artwork] Failed to persist artwork.', error))
      .finally(() => persistInFlight.delete(current.id));
  }, []);

  // The provider lookup itself is cached and deduplicated in musicApi, so several
  // mounted surfaces asking for the same track cost one pair of requests. This
  // callback is stable, and re-checks the track after every await so a lookup
  // that lands after the row was recycled cannot tag the wrong track.
  const runLookup = useCallback(async (): Promise<string> => {
    const current = trackRef.current;
    if (!current) {
      return '';
    }
    const id = current.id;
    if (!(await isNetworkAvailable())) {
      return '';
    }
    const found = await searchTrackArtwork(current.title, current.artist);
    if (!found || trackRef.current?.id !== id) {
      return found;
    }
    setResolution({ trackId: id, url: found });
    persist(found);
    return found;
  }, [persist]);

  // Missing artwork only. Deliberately not triggered for a URL that merely
  // failed, because a transient CDN error should not rewrite the track.
  useEffect(() => {
    if (hasStoredArtwork || resolved || localUri) {
      return;
    }
    void runLookup();
  }, [hasStoredArtwork, resolved, localUri, runLookup]);

  const onArtworkError = useCallback(() => {
    if (localUri || resolved) {
      return;
    }
    // Fire-and-forget: the repaired URL arrives as a new `uri`, which re-renders
    // the caller. An offline failure is a no-op inside the lookup, and the
    // thumbnail keeps showing its placeholder meanwhile.
    void runLookup();
  }, [localUri, resolved, runLookup]);

  return {
    // A resolved URL takes precedence over the stored one, because it is only
    // ever set when the stored one was absent or failed to load.
    uri: resolved || track?.artwork || '',
    localUri,
    title: track?.title ?? '',
    artist: track?.artist ?? '',
    onArtworkError,
  };
}
