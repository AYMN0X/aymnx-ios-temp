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
  refreshDownloads: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextValue | undefined>(undefined);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [downloadedTracks, setDownloadedTracks] = useState<DownloadedTrack[]>([]);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  const downloadedIds = useMemo(
    () => new Set(downloadedTracks.map((track) => track.id)),
    [downloadedTracks]
  );

  const refreshDownloads = useCallback(async () => {
    const tracks = await downloads.getDownloadedTracks();
    setDownloadedTracks(tracks);
  }, []);

  useEffect(() => {
    refreshDownloads();
  }, [refreshDownloads]);

  const isDownloaded = useCallback(
    (trackId: string) => downloadedIds.has(trackId),
    [downloadedIds]
  );

  const downloadTrack = useCallback(
    async (track: Track) => {
      if (downloadedIds.has(track.id) || downloadingIds.has(track.id)) {
        return;
      }
      setDownloadingIds((current) => new Set(current).add(track.id));
      try {
        const downloaded = await downloads.downloadTrack(track);
        setDownloadedTracks((current) =>
          current.some((item) => item.id === track.id)
            ? current
            : [...current, downloaded]
        );
      } finally {
        setDownloadingIds((current) => {
          const next = new Set(current);
          next.delete(track.id);
          return next;
        });
      }
    },
    [downloadedIds, downloadingIds]
  );

  const deleteDownload = useCallback(async (trackId: string) => {
    await downloads.deleteDownloadedTrack(trackId);
    setDownloadedTracks((current) => current.filter((item) => item.id !== trackId));
  }, []);

  const downloadAll = useCallback(
    async (
      tracks: Track[],
      onProgress?: (progress: { done: number; total: number; failed: number }) => void
    ) => {
      if (isBatchDownloading || tracks.length === 0) {
        return;
      }
      setIsBatchDownloading(true);
      setBatchProgress({ downloaded: 0, total: tracks.length, failed: 0 });
      let done = 0;
      let failed = 0;
      for (const track of tracks) {
        try {
          await downloads.downloadTrack(track);
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
      await refreshDownloads();
      setIsBatchDownloading(false);
    },
    [isBatchDownloading, refreshDownloads]
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
      refreshDownloads,
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
      refreshDownloads,
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