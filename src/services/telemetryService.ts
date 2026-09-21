import { useEffect, useState } from 'react';

export interface TelemetrySnapshot {
  heapMb: string | null;
  allocMb: string | null;
  supported: boolean;
}

interface HermesStats {
  js_heap_size?: number;
  js_allocated_bytes?: number;
}

interface HermesInternalLike {
  getInstrumentedStats?: () => HermesStats;
}

const MEGABYTE = 1024 * 1024;

function getHermesStats(): HermesStats | null {
  const internal = (globalThis as unknown as {
    HermesInternal?: HermesInternalLike;
  }).HermesInternal;
  const getStats = internal?.getInstrumentedStats;
  if (typeof getStats !== 'function') {
    return null;
  }
  try {
    const stats = getStats();
    return stats && typeof stats === 'object' ? stats : null;
  } catch {
    return null;
  }
}

export function formatMb(bytes: number): string {
  return (bytes / MEGABYTE).toFixed(1);
}

export function readHermesStats(): TelemetrySnapshot {
  const stats = getHermesStats();
  if (!stats) {
    return { heapMb: null, allocMb: null, supported: false };
  }
  const heap = stats.js_heap_size;
  const alloc = stats.js_allocated_bytes;
  return {
    heapMb: typeof heap === 'number' && Number.isFinite(heap) ? formatMb(heap) : null,
    allocMb: typeof alloc === 'number' && Number.isFinite(alloc) ? formatMb(alloc) : null,
    supported: true,
  };
}

export function useTelemetry(intervalMs = 1000): TelemetrySnapshot {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(readHermesStats);

  useEffect(() => {
    const id = setInterval(() => setSnapshot(readHermesStats()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return snapshot;
}