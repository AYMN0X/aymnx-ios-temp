const NETWORK_PROBE_URL = 'https://www.gstatic.com/generate_204';
const PROBE_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 5000;

let lastKnown: boolean | null = null;
let lastCheckedAt = 0;

export async function isNetworkAvailable(maxWaitMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
  const now = Date.now();
  if (lastKnown !== null && now - lastCheckedAt < CACHE_TTL_MS) {
    return lastKnown;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), maxWaitMs);
  let available = false;
  try {
    const response = await fetch(NETWORK_PROBE_URL, { signal: controller.signal });
    available = response.status >= 200 && response.status < 500;
  } catch {
    available = false;
  } finally {
    clearTimeout(timer);
  }
  lastKnown = available;
  lastCheckedAt = Date.now();
  return available;
}

export function invalidateNetworkCache(): void {
  lastKnown = null;
  lastCheckedAt = 0;
}