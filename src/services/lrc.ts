/**
 * Pure `.lrc` parsing and formatting. Deliberately free of React Native and
 * network imports so the parsing rules can be exercised directly in tests.
 */

export interface LyricLine {
  timeMs: number;
  text: string;
}

// `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss.xxx]`.
const LEADING_TIMESTAMP = /^\[(\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;
const METADATA_PATTERN = /^\[(ar|ti|al|au|by|offset|re|ve|length):(.*)\]$/i;

const fractionToMs = (raw: string | undefined): number => {
  const digits = raw ?? '0';
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round((value / 10 ** digits.length) * 1000);
};

const composeMs = (minutes: string, seconds: string, fraction: string | undefined): number =>
  Number.parseInt(minutes, 10) * 60_000 +
  Number.parseInt(seconds, 10) * 1000 +
  fractionToMs(fraction);

/**
 * Parses standard `.lrc` content into chronologically sorted lines. Ignores
 * metadata tags such as `[ar:...]`, honours `[offset:...]`, keeps every line
 * when several timestamps share one lyric (repeated choruses), and drops blank
 * lines and duplicate timestamps.
 */
export function parseSyncedLyrics(raw: string): LyricLine[] {
  if (!raw) {
    return [];
  }
  const collected: LyricLine[] = [];
  let offsetMs = 0;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const metadata = METADATA_PATTERN.exec(line);
    if (metadata) {
      if (metadata[1].toLowerCase() === 'offset') {
        const parsed = Number.parseInt(metadata[2], 10);
        if (Number.isFinite(parsed)) {
          offsetMs = parsed;
        }
      }
      continue;
    }

    // Peel off every leading timestamp so alternating repeats are preserved.
    const timestamps: number[] = [];
    let remainder = line;
    LEADING_TIMESTAMP.lastIndex = 0;
    let match = LEADING_TIMESTAMP.exec(remainder);
    while (match) {
      timestamps.push(composeMs(match[1], match[2], match[3]));
      remainder = remainder.slice(match[0].length).trim();
      LEADING_TIMESTAMP.lastIndex = 0;
      match = LEADING_TIMESTAMP.exec(remainder);
    }

    const text = remainder.trim();
    if (!text || timestamps.length === 0) {
      continue;
    }
    for (const timeMs of timestamps) {
      collected.push({ timeMs: Math.max(0, timeMs + offsetMs), text });
    }
  }

  collected.sort((a, b) => a.timeMs - b.timeMs);
  return collected.filter(
    (lineItem, index) => index === 0 || lineItem.timeMs !== collected[index - 1].timeMs
  );
}

/**
 * Plain lyrics carry no timing information. `timeMs` is reported as 0 because
 * callers must gate all seeking and highlighting on the `synced` flag.
 */
export function parsePlainLyrics(raw: string): LyricLine[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ timeMs: 0, text }));
}

export const toLrc = (lines: LyricLine[]): string =>
  lines
    .map(({ timeMs, text }) => {
      const totalSeconds = Math.floor(timeMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const hundredths = Math.floor((timeMs % 1000) / 10);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `[${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}] ${text}`;
    })
    .join('\n');

/**
 * Index of the last line at or before `positionMs`, or -1 before the first
 * line starts. `lines` must be sorted by `timeMs`.
 */
export function findActiveLineIndex(lines: LyricLine[], positionMs: number): number {
  if (lines.length === 0 || !Number.isFinite(positionMs)) {
    return -1;
  }
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].timeMs <= positionMs) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
