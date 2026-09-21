import { useEffect, useState } from 'react';
import { bootLog } from './bootLog';
import { readNativeProcessMemoryMB } from '../../modules/native-process-memory';

export interface TelemetrySnapshot {
  processMb: string | null;
  heapMb: string | null;
  allocMb: string | null;
  supported: boolean;
}

interface HermesInternalLike {
  getInstrumentedStats?: () => Record<string, unknown>;
}

const MEGABYTE = 1024 * 1024;

/**
 * Ordered names historically/currently emitted by Hermes for the live JS heap
 * size (bytes). Modern Hermes reports "js_heapSize"; older builds used
 * "js_heap_size" / "Heap Size". Verified against Hermes `HermesInternal.cpp`
 * (hermesInternalGetInstrumentedStats).
 */
const HEAP_EXACT_KEYS = [
  'Heap Size',
  'js_heap_size',
  'js_heap_size_bytes',
  'heap_size',
  'total_heap_size',
  'js_heapSize',
  'heapSize',
  'js_heap',
  'heap',
];

const HEAP_HINTS = ['heapsize', 'heap_size', 'heap size', 'totalheap'];
const HEAP_HINT_EXCLUDES = ['unused', 'free', 'empty', 'available', 'external'];

/**
 * Ordered names for currently-allocated bytes. Prefers the live
 * "js_allocatedBytes" over the cumulative "js_totalAllocatedBytes" (which
 * grows forever and is not a memory snapshot).
 */
const ALLOC_EXACT_KEYS = [
  'Total Allocated',
  'js_allocated_bytes',
  'allocated_bytes',
  'js_num_allocated_bytes',
  'js_allocatedBytes',
  'allocatedBytes',
  'js_numAllocatedBytes',
  'numAllocatedBytes',
  'js_totalAllocatedBytes',
  'totalAllocatedBytes',
  'js_allocated',
  'allocated',
];

const ALLOC_HINTS = ['allocatedbytes', 'allocated_bytes', 'allocated bytes'];
const ALLOC_HINT_EXCLUDES = ['peak', 'total', 'cumulative', 'live', 'usedbefore', 'after'];

function asByteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getHermesStats(): Record<string, unknown> | null {
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

function pickFromStats(
  stats: Record<string, unknown>,
  exactKeys: string[],
  hints: string[],
  excludeHints: string[]
): number | null {
  for (const key of exactKeys) {
    const value = asByteNumber(stats[key]);
    if (value !== null) {
      return value;
    }
  }
  for (const hint of hints) {
    for (const key of Object.keys(stats)) {
      const lower = key.toLowerCase();
      if (!lower.includes(hint)) {
        continue;
      }
      if (excludeHints.some((exclude) => lower.includes(exclude))) {
        continue;
      }
      const value = asByteNumber(stats[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}

function pickFirstByteLike(stats: Record<string, unknown>): number | null {
  for (const value of Object.values(stats)) {
    const bytes = asByteNumber(value);
    if (bytes !== null && bytes >= 1024) {
      return bytes;
    }
  }
  for (const value of Object.values(stats)) {
    const bytes = asByteNumber(value);
    if (bytes !== null) {
      return bytes;
    }
  }
  return null;
}

function readPerformanceMemory(): number | null {
  const usedHeapSize = (globalThis as unknown as {
    performance?: { memory?: { usedJSHeapSize?: unknown } };
  }).performance?.memory?.usedJSHeapSize;
  return asByteNumber(usedHeapSize);
}

function readNativePerformanceNow(): number | null {
  const nativePerformanceNow = (globalThis as unknown as {
    nativePerformanceNow?: () => unknown;
  }).nativePerformanceNow;
  if (typeof nativePerformanceNow !== 'function') {
    return null;
  }
  try {
    return asByteNumber(nativePerformanceNow());
  } catch {
    return null;
  }
}

let rawStatsLogged = false;

function logRawStatsOnce(stats: Record<string, unknown>): void {
  if (rawStatsLogged) {
    return;
  }
  rawStatsLogged = true;
  bootLog('HermesInternal.getInstrumentedStats()', stats);
}

export function formatMb(bytes: number): string {
  return (bytes / MEGABYTE).toFixed(1);
}

export function readHermesStats(): TelemetrySnapshot {
  const stats = getHermesStats();

  if (stats) {
    logRawStatsOnce(stats);
  }

  let heap =
    stats !== null
      ? pickFromStats(stats, HEAP_EXACT_KEYS, HEAP_HINTS, HEAP_HINT_EXCLUDES)
      : null;
  let alloc =
    stats !== null
      ? pickFromStats(stats, ALLOC_EXACT_KEYS, ALLOC_HINTS, ALLOC_HINT_EXCLUDES)
      : null;

  if (heap === null && stats !== null) {
    heap = pickFirstByteLike(stats);
  }
  if (alloc === null && stats !== null) {
    alloc = pickFirstByteLike(stats);
  }

  const performanceMemory = readPerformanceMemory();
  const nativePerformanceNow = readNativePerformanceNow();
  if (heap === null) {
    heap = performanceMemory ?? nativePerformanceNow;
  }
  if (alloc === null) {
    alloc = performanceMemory;
  }

  const processMb = readNativeProcessMemoryMB();

  return {
    processMb: processMb !== null ? processMb.toFixed(1) : null,
    heapMb: heap !== null ? formatMb(heap) : null,
    allocMb: alloc !== null ? formatMb(alloc) : null,
    supported: stats !== null || heap !== null || alloc !== null || processMb !== null,
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