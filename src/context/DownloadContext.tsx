import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
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
  downloadTrack: (track: Track) => Promise<void>;
  deleteDownload: (trackId: string) => Promise<void>;
  downloadAll: (
    tracks: Track[],
    onProgress?: (progress: { done: number; total: number; failed: number }) => void
  ) => Promise<void>;
  toggleDownload: (track: Track) => Promise<void>;
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

  useEffect(() => {
    let active = true;
    if (!userId) {
      setDownloadedTracks([]);
      return;
    }
    bootLog('downloads hydration start');
    (async () => {
      try {
        const tracks = await storage.getDownloadedTracks(userId);
        const present = await downloads.filterExistingDownloads(tracks);
        if (active) {
          setDownloadedTracks(present);
          bootLog('downloads hydrated', {
            count: present.length,
            pruned: tracks.length - present.length,
            kb: Math.round(approximateBytes(present) / 1024),
          });
        }
        if (present.length !== tracks.length) {
          await storage.writeDownloadedTracks(userId, present);
        }
      } catch (error) {
        console.warn('[downloads] Failed to load downloaded tracks.', error);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const downloadedIds = useMemo(
    () => new Set(downloadedTracks.map((track) => track.id)),
    [downloadedTracks]
  );

  const isDownloaded = useCallback(
    (trackId: string) => downloadedIds.has(trackId),
    [downloadedIds]
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
      for (const track of tracks) {
        try {
          const meta = await downloads.downloadTrack(track);
          metas.push(meta);
          done += 1;
        } catch (error) {
          console.warn('[downloads] Failed to download track:', track.title, error);
          failed += 1;
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

  const value = useMemo<DownloadContextValue>(
    () => ({
      downloadedTracks,
      downloadedIds,
      downloadingIds,
      isBatchDownloading,
      batchProgress,
      isDownloaded,
      downloadTrack,
      deleteDownload,
      downloadAll,
      toggleDownload,
    }),
    [
      downloadedTracks,
      downloadedIds,
      downloadingIds,
      isBatchDownloading,
      batchProgress,
      isDownloaded,
      downloadTrack,
      deleteDownload,
      downloadAll,
      toggleDownload,
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