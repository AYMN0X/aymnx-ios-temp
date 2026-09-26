import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import * as downloads from '../services/downloadService';
import { DownloadedTrack } from '../services/downloadService';
import { Track } from '../services/musicApi';
import * as storage from '../services/storage';
import { approximateBytes, bootLog, bootLogOnce } from '../services/bootLog';
import { useAuth } from './AuthContext';

interface BatchProgress {
  downloaded: number;
  total: number;
  failed: number;
}

interface DownloadContextValue {
  downloadedTracks: DownloadedTrack[];
  downloadedIds: Set<string>;
  downloadingIds: Set<string>;
  isBatchDownloading: boolean;
  batchProgress: BatchProgress | null;
  isDownloaded: (trackId: string) => boolean;
  /**
   * Local artwork file for a downloaded track, or undefined when there is no
   * usable on-disk cover. Artwork surfaces pass this into ArtworkThumbnail so a
   * downloaded track renders its saved cover instead of an empty box when the
   * remote URL is unreachable or absent.
   */
  getLocalArtworkUri: (trackId: string) => string | undefined;
  downloadTrack: (track: Track) => Promise<void>;
  deleteDownload: (trackId: string) => Promise<void>;
  /**
   * Deletes the audio, artwork, and sidecar for each id, then drops them from
   * the registry. Used when a playlist is deleted and its tracks are no longer
   * referenced anywhere: their files would otherwise linger on disk and be
   * re-adopted as "already downloaded" if the playlist were ever re-imported.
   *
   * Ids with no download are skipped. Returns how many were actually purged.
   */
  purgeDownloads: (trackIds: string[]) => Promise<number>;
  downloadAll: (
    tracks: Track[],
    onProgress?: (progress: { done: number; total: number; failed: number }) => void
  ) => Promise<void>;
  toggleDownload: (track: Track) => Promise<void>;
  /**
   * Returns the reconciled registry, or null when it did not run (no user, a
   * batch in flight, or a failure). Callers must not treat null as "empty".
   */
  syncDownloadedFilesWithStorage: (reason?: 'launch' | 'foreground') => Promise<DownloadedTrack[] | null>;
}

const DownloadContext = createContext<DownloadContextValue | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  bootLogOnce('DownloadProvider mounted');
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [downloadedTracks, setDownloadedTracks] = useState<DownloadedTrack[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  // Mirrors of state that the reconcile logic must read without being re-created
  // on every render, so the AppState subscription stays stable. Assigned during
  // render to match the existing durationRef pattern in NowPlayingScrubber.
  const isBatchDownloadingRef = useRef(false);
  isBatchDownloadingRef.current = isBatchDownloading;
  const reconcileInFlight = useRef(false);

  /**
   * Cross-checks the storage registry against the filesystem and repairs it in
   * both directions.
   *
   * Forward (storage -> disk): records whose audio file is missing, undersized
   * or corrupt are pruned and rewritten, so a track whose file was removed behind
   * the app's back stops showing a downloaded badge.
   *
   * Reverse (disk -> storage): an orphaned file yields only a sanitized id, but
   * every completed download also writes a `<id>.meta.json` sidecar, so the full
   * Track metadata is recoverable and the track is re-adopted. Files with no
   * usable sidecar cannot be re-adopted (there is no metadata to render) and are
   * reported instead of being guessed at.
   *
   * Bails out while a batch is running: batch storage records are written only
   * once after the loop, so reconciling mid-batch would read a pre-batch registry
   * and wipe the per-track state that the loop has already published.
   */
  const syncDownloadedFilesWithStorage = useCallback(
    async (reason: 'launch' | 'foreground' = 'launch'): Promise<DownloadedTrack[] | null> => {
      if (!userId) {
        setDownloadedTracks([]);
        return null;
      }
      if (isBatchDownloadingRef.current) {
        bootLog('downloads reconcile skipped (batch in flight)');
        return null;
      }
      if (reconcileInFlight.current) {
        return null;
      }
      reconcileInFlight.current = true;
      try {
        const stored = await storage.getDownloadedTracks(userId);
        const present = await downloads.filterExistingDownloads(stored);
        const orphans = await downloads.findOrphanedDownloadIds(present);
        // The journal also resolves orphans, because it is the only record of
        // the transfer that was still in flight when the app was terminated.
        const queued = (await downloads.readPendingBatch()) ?? [];

        // Re-adopt: an orphaned audio file plus recoverable metadata is a
        // complete DownloadedTrack, so the record can be restored without the
        // user re-downloading. Validated by filterExistingDownloads so a
        // truncated file is never resurrected.
        const adopted: DownloadedTrack[] = [];
        const unrecoverable: string[] = [];
        for (const prefix of orphans) {
          const candidate = await downloads.resolveOrphanTrack(prefix, queued);
          if (!candidate) {
            unrecoverable.push(prefix);
            continue;
          }
          const [verified] = await downloads.filterExistingDownloads([candidate]);
          if (verified) {
            adopted.push(verified);
          } else {
            unrecoverable.push(prefix);
          }
        }

        const merged = [...present, ...adopted];
        if (merged.length !== stored.length) {
          await storage.writeDownloadedTracks(userId, merged);
        }
        setDownloadedTracks(merged);
        bootLog(`downloads reconciled (${reason})`, {
          before: stored.length,
          after: merged.length,
          pruned: stored.length - present.length,
          readopted: adopted.length,
          kb: Math.round(approximateBytes(merged) / 1024),
          orphanFiles: orphans.length,
          unrecoverable: unrecoverable.length,
          sample: unrecoverable.slice(0, 3),
        });
        return merged;
      } catch (error) {
        console.warn('[downloads] Reconcile failed.', error);
        return null;
      } finally {
        reconcileInFlight.current = false;
      }
    },
    [userId]
  );

  const downloadedIds = useMemo(
    () => new Set(downloadedTracks.map((track) => track.id)),
    [downloadedTracks]
  );

  const isDownloaded = useCallback(
    (trackId: string) => downloadedIds.has(trackId),
    [downloadedIds]
  );

  // Artwork rows are memoized and can number in the hundreds (playlist + queue +
  // search results all render the same tracks), so this is kept in a ref behind a
  // stable callback. The map itself is memoized so it is only rebuilt when the
  // registry actually changes, while the ref stays current for reads made during
  // render.
  const localArtworkById = useMemo(
    () =>
      new Map(
        downloadedTracks
          .filter((item) => item.localArtworkUri)
          .map((item) => [item.id, item.localArtworkUri])
      ),
    [downloadedTracks]
  );
  const localArtworkByIdRef = useRef(localArtworkById);
  localArtworkByIdRef.current = localArtworkById;

  const getLocalArtworkUri = useCallback(
    (trackId: string) => localArtworkByIdRef.current.get(trackId),
    []
  );

  const downloadTrack = useCallback(
    async (track: Track) => {
      if (!userId || downloadedIds.has(track.id) || downloadingIds.has(track.id)) {
        return;
      }
      setDownloadingIds((current) => new Set(current).add(track.id));
      try {
        const downloaded = await downloads.downloadTrack(track);
        try {
          const current = await storage.getDownloadedTracks(userId);
          const next = current.some((item) => item.id === downloaded.id)
            ? current
            : [...current, downloaded];
          await storage.writeDownloadedTracks(userId, next);
          setDownloadedTracks(next);
        } catch (error) {
          console.warn('[downloads] Failed to persist download metadata.', error);
        }
      } finally {
        setDownloadingIds((current) => {
          const next = new Set(current);
          next.delete(track.id);
          return next;
        });
      }
    },
    [userId, downloadedIds, downloadingIds]
  );

  const deleteDownload = useCallback(
    async (trackId: string) => {
      if (!userId) {
        return;
      }
      await downloads.deleteTrackFiles(trackId);
      // Also drop it from any pending queue. deleteTrackFiles removes the sidecar
      // too, so leaving the id journaled would let the next resume re-download a
      // track the user just deleted.
      const queued = await downloads.readPendingBatch();
      if (queued) {
        await downloads.writePendingBatch(queued.filter((item) => item.id !== trackId));
      }
      try {
        const current = await storage.getDownloadedTracks(userId);
        const next = current.filter((item) => item.id !== trackId);
        await storage.writeDownloadedTracks(userId, next);
        setDownloadedTracks(next);
      } catch (error) {
        console.warn('[downloads] Failed to persist download removal.', error);
      }
    },
    [userId]
  );

  const purgeDownloads = useCallback(
    async (trackIds: string[]) => {
      if (!userId || trackIds.length === 0) {
        return 0;
      }
      // Only touch ids that are genuinely registered as downloaded. Skipping the
      // rest avoids a pointless directory scan per track for a playlist that was
      // never downloaded in the first place.
      const targets = trackIds.filter((id) => downloadedIds.has(id));
      if (targets.length === 0) {
        return 0;
      }
      // Sequential rather than parallel: each delete rewrites the whole
      // downloads registry, so concurrent calls would race on the same list and
      // the last writer would resurrect the others' entries. Failures are
      // isolated per track so one undeletable file cannot leave the rest of the
      // playlist's downloads orphaned on disk.
      let purged = 0;
      for (const trackId of targets) {
        try {
          await deleteDownload(trackId);
          purged += 1;
        } catch (error) {
          console.warn('[downloads] Failed to purge download.', trackId, error);
        }
      }
      return purged;
    },
    [userId, downloadedIds, deleteDownload]
  );

  const downloadAll = useCallback(
    async (
      tracks: Track[],
      onProgress?: (progress: { done: number; total: number; failed: number }) => void
    ) => {
      if (!userId || isBatchDownloading || tracks.length === 0) {
        return;
      }
      setIsBatchDownloading(true);
      setBatchProgress({ downloaded: 0, total: tracks.length, failed: 0 });
      let done = 0;
      let failed = 0;
      const metas: DownloadedTrack[] = [];
      // Journal the queue up front, then leave it alone. If iOS terminates the
      // app mid-batch this file is the only record of what was still owed, and
      // the next launch resumes from it. It deliberately keeps already-settled
      // tracks: the reconcile that runs before the resume re-adopts their
      // sidecars, and the resume then filters them out. Rewriting the journal per
      // track would be O(N^2) bytes of IO to save work the sidecars already do.
      await downloads.writePendingBatch(tracks);
      for (const track of tracks) {
        // This loop calls the service directly, so it bypasses the context
        // downloadTrack wrapper that normally maintains `downloadingIds`. Without
        // this the set stays empty for the whole batch and every row/sheet reads
        // "not downloading". Mirrors the wrapper's add/remove pair, and lives in
        // a `finally` so a rejected download cannot leak a stuck in-flight id.
        setDownloadingIds((current) => new Set(current).add(track.id));
        try {
          const meta = await downloads.downloadTrack(track);
          metas.push(meta);
          done += 1;
          // Commit each finished track to React state the moment its file lands,
          // so per-row downloaded indicators light up one by one while the rest
          // are still in flight. Uses the functional form so concurrent updates
          // can't clobber each other or go stale against `downloadedTracks`.
          //
          // Storage is deliberately still written only once after the loop:
          // writeDownloadedTracks -> updateUserData re-serializes the ENTIRE
          // user blob (liked songs + playlists + downloads), so committing per
          // track would mean N full-blob rewrites for an N-track playlist.
          setDownloadedTracks((prev) =>
            prev.some((item) => item.id === meta.id) ? prev : [...prev, meta]
          );
        } catch (error) {
          console.warn('[downloads] Failed to download track:', track.title, error);
          failed += 1;
        } finally {
          setDownloadingIds((current) => {
            const next = new Set(current);
            next.delete(track.id);
            return next;
          });
        }
        setBatchProgress({ downloaded: done, total: tracks.length, failed });
        if (onProgress) {
          onProgress({ done, total: tracks.length, failed });
        }
      }
      try {
        const current = await storage.getDownloadedTracks(userId);
        const merged = [
          ...current.filter((item) => !metas.some((meta) => meta.id === item.id)),
          ...metas,
        ];
        await storage.writeDownloadedTracks(userId, merged);
        setDownloadedTracks(merged);
      } catch (error) {
        console.warn('[downloads] Failed to persist batch download metadata.', error);
      }
      await downloads.clearPendingBatch();
      setIsBatchDownloading(false);
    },
    [userId, isBatchDownloading]
  );

  const toggleDownload = useCallback(
    async (track: Track) => {
      if (downloadedIds.has(track.id)) {
        await deleteDownload(track.id);
      } else {
        await downloadTrack(track);
      }
    },
    [downloadedIds, deleteDownload, downloadTrack]
  );

  /**
   * Reconciles, then resumes any batch that iOS interrupted by terminating the
   * app.
   *
   * Sequencing is load-bearing. The resume filters the journal against the
   * registry the reconcile produced, and it uses that RETURN VALUE rather than
   * `downloadedIds` state: the reconcile's `setDownloadedTracks` has not
   * re-rendered yet at this point, so reading state here would miss every track
   * just re-adopted and re-download files the reconcile had already recovered.
   */
  const reconcileAndResume = useCallback(
    async (reason: 'launch' | 'foreground') => {
      const reconciled = await syncDownloadedFilesWithStorage(reason);
      // null means the reconcile did not complete. Resuming on a stale registry
      // would re-download files that are already on disk, so wait for the next
      // trigger instead.
      if (!reconciled || isBatchDownloadingRef.current) {
        return;
      }
      const queued = await downloads.readPendingBatch();
      if (!queued) {
        return;
      }
      const onDisk = new Set(reconciled.map((track) => track.id));
      const pending = queued.filter((track) => !onDisk.has(track.id));
      if (pending.length === 0) {
        await downloads.clearPendingBatch();
        return;
      }
      bootLog('downloads resuming interrupted batch', {
        reason,
        queued: queued.length,
        pending: pending.length,
      });
      await downloadAll(pending);
    },
    [downloadAll, syncDownloadedFilesWithStorage]
  );

  useEffect(() => {
    if (!userId) {
      setDownloadedTracks([]);
      return;
    }
    void reconcileAndResume('launch');
  }, [userId, reconcileAndResume]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void reconcileAndResume('foreground');
      }
    });
    return () => {
      subscription.remove();
    };
  }, [userId, reconcileAndResume]);

  const value = useMemo<DownloadContextValue>(
    () => ({
      downloadedTracks,
      downloadedIds,
      downloadingIds,
      isBatchDownloading,
      batchProgress,
      isDownloaded,
      getLocalArtworkUri,
      downloadTrack,
      deleteDownload,
      purgeDownloads,
      downloadAll,
      toggleDownload,
      syncDownloadedFilesWithStorage,
    }),
    [
      downloadedTracks,
      downloadedIds,
      downloadingIds,
      isBatchDownloading,
      batchProgress,
      isDownloaded,
      getLocalArtworkUri,
      downloadTrack,
      deleteDownload,
      purgeDownloads,
      downloadAll,
      toggleDownload,
      syncDownloadedFilesWithStorage,
    ]
  );

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownloads(): DownloadContextValue {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
}