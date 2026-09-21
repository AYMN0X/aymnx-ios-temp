declare const __DEV__: boolean;

const performanceNow = (): number => {
  const perf = (globalThis as { performance?: { now: () => number } }).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
};

const BOOT_START = performanceNow();

/** Dev-only boot timeline marker, measured from module load. */
export function bootLog(label: string, payload?: unknown): void {
  if (!__DEV__) {
    return;
  }
  const delta = Math.round(performanceNow() - BOOT_START);
  if (payload === undefined) {
    console.log(`[boot] +${delta}ms ${label}`);
  } else {
    console.log(`[boot] +${delta}ms ${label}`, payload);
  }
}

/** Guards repeatedly-logged labels (e.g. provider first-render marks). */
const loggedLabels = new Set<string>();

export function bootLogOnce(label: string, payload?: unknown): void {
  if (loggedLabels.has(label)) {
    return;
  }
  loggedLabels.add(label);
  bootLog(label, payload);
}

/** JSON-serialized size as a cheap JS-heap proxy for hydrated payloads. */
export function approximateBytes(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}